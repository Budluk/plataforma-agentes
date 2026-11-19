import json
import pytest
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.sales import funnel
from agents.sales.funnel_agent import FunnelAgent, build_funnel_tools
from agents.sales.funnel_contracts import FunnelRequest
from core.llm_client import FakeLLM
from pipelines.funnel_pipeline import FunnelPipeline, FunnelRequestInvalid, parse_request

BASE = dict(product="Low ticket", ad_spend=500.0, visitors=2000, checkouts_started=200, front_sales=40,
            bump_sales=12, upsell_sales=4, front_price=19.9, bump_price=27.0, upsell_price=297.0,
            platform_fee_pct=10.0, tax_pct=6.0)


def j(**kw):
    d = dict(BASE)
    d.update(kw)
    return json.dumps({k: v for k, v in d.items() if v is not None})


def pipe(env, resp="{}"):
    return FunnelPipeline(FakeLLM(resp), env.memory, env.perms, env.logger, env.monitor)


# --- cálculo ---
CALC = dict(variable_cost_per_order=0.0, scale_roas=1.8, scale_step_pct=20.0, min_sales_for_decision=10,
            platform_fee_pct=10.0, tax_pct=6.0, bump_price=27.0, upsell_price=297.0, front_price=19.9)


def test_calc_healthy_funnel():
    r = funnel.analyze(ad_spend=500.0, visitors=2000, checkouts_started=200, front_sales=40,
                       bump_sales=12, upsell_sales=4, **CALC)
    assert r["revenue"] == 2308.0 and r["profit"] == 1438.72
    assert r["roas"] == 4.62 and r["breakeven_roas"] == 1.19 and r["cpa"] == 12.5
    assert r["rates"]["bump_pct"] == 30.0 and r["rates"]["upsell_pct"] == 10.0
    assert r["decision"] == "escalar" and r["suggested_budget_change_pct"] == 20.0


def test_calc_keep_cut_and_insufficient():
    keep = funnel.analyze(ad_spend=450.0, visitors=1500, checkouts_started=120, front_sales=30,
                          bump_sales=5, upsell_sales=0, **CALC)
    assert keep["decision"] == "manter" and keep["suggested_budget_change_pct"] == 0
    cut = funnel.analyze(ad_spend=800.0, visitors=1000, checkouts_started=60, front_sales=20,
                         bump_sales=0, upsell_sales=0, **CALC)
    assert cut["decision"] == "cortar" and cut["profit"] == -465.68
    few = funnel.analyze(ad_spend=17.5, visitors=100, checkouts_started=5, front_sales=1,
                         bump_sales=0, upsell_sales=0, **{**CALC, "front_price": 6.9})
    assert few["decision"] == "dados_insuficientes"


def test_calc_variable_cost_can_flip_decision_to_cut():
    base = dict(ad_spend=500.0, visitors=2000, checkouts_started=200, front_sales=40, bump_sales=0,
                upsell_sales=0, **CALC)
    assert funnel.analyze(**base)["decision"] == "manter"
    heavy = funnel.analyze(**{**base, "variable_cost_per_order": 15.0})
    assert heavy["decision"] == "cortar" and heavy["profit"] < 0


# --- contrato ---
@pytest.mark.parametrize("kw", [
    dict(ad_spend=0), dict(ad_spend=-1), dict(ad_spend=float("nan")), dict(visitors=0),
    dict(front_price=0), dict(platform_fee_pct=60.0), dict(tax_pct=-1.0), dict(front_sales=-3),
    dict(scale_step_pct=99.0), dict(launch_campaign=True), dict(set_budget=900),
])
def test_invalid_funnel_requests_rejected(kw):
    with pytest.raises(ValidationError):
        FunnelRequest(**{**BASE, **kw})


@pytest.mark.parametrize("missing", ["platform_fee_pct", "tax_pct", "ad_spend", "front_price", "visitors"])
def test_required_fields_fail_closed(missing):
    d = dict(BASE)
    d.pop(missing)
    with pytest.raises(ValidationError):
        FunnelRequest(**d)


@pytest.mark.parametrize("raw", ["", "[]", "{", "null", '{"product": "x"}'])
def test_parse_request_rejects_malformed(raw):
    with pytest.raises(FunnelRequestInvalid):
        parse_request(raw)


# --- pipeline ---
def test_pipeline_scale(env):
    res = pipe(env, j()).run("x")
    assert res.ok and res.data["decision"] == "escalar"
    assert any(e["event"] == "llm_response" for e in env.events())


def test_pipeline_cut(env):
    res = pipe(env, j(ad_spend=800.0, visitors=1000, checkouts_started=60, front_sales=20,
                      bump_sales=0, upsell_sales=0)).run("x")
    assert res.ok and res.data["decision"] == "cortar"


def test_pipeline_single_sale_is_insufficient_data(env):
    res = pipe(env, j(ad_spend=17.5, visitors=100, checkouts_started=5, front_sales=1, bump_sales=0,
                      upsell_sales=0, front_price=6.9)).run("x")
    assert res.ok and res.data["decision"] == "dados_insuficientes"


@pytest.mark.parametrize("kw", [
    dict(bump_sales=99),                                  # bump > front
    dict(upsell_sales=99),                                # upsell > front
    dict(checkouts_started=3000),                         # checkouts > visitantes
    dict(front_sales=500),                                # front > checkouts
    dict(bump_price=0.0),                                 # bump vendido sem preço
    dict(product="x; rm -rf /"),                          # produto com caractere perigoso
])
def test_pipeline_rejects_incoherent_data(env, kw):
    res = pipe(env, j(**kw)).run("x")
    assert not res.ok and res.reasons
    assert any(e["event"] == "rejection" for e in env.events())


def test_pipeline_fails_closed_without_fee_or_tax(env):
    assert not pipe(env, j(platform_fee_pct=None)).run("x").ok
    assert not pipe(env, j(tax_pct=None)).run("x").ok


def test_pipeline_rejects_real_action_field_and_junk(env):
    assert not pipe(env, j(launch_campaign=True)).run("x").ok
    assert not pipe(env, "lixo").run("x").ok


def test_pipeline_calls_only_analyze_funnel(env):
    pipe(env, j()).run("x")
    tools = {e.get("tool") for e in env.events() if e["event"] == "tool_call_attempt"}
    assert tools == {"analyze_funnel"}


# --- veto e permissões ---
def make_agent(env):
    return FunnelAgent(tools=build_funnel_tools(), monitor=env.monitor, permissions=env.perms,
                       logger=env.logger, ctx=RunContext(run_id="t"))


@pytest.mark.parametrize("tool", ["launch_campaign", "set_budget", "send_whatsapp", "publish_page",
                                  "checkout", "execution_order"])
def test_real_action_tools_vetoed(env, tool):
    with pytest.raises(ToolBlocked) as exc:
        make_agent(env).call_tool(tool)
    assert exc.value.head == "veto"


def test_funnel_agent_cannot_use_finance_tool(env):
    with pytest.raises(ToolBlocked) as exc:
        make_agent(env).call_tool("read_portfolio")
    assert exc.value.head == "permissions"


def test_funnel_agent_has_its_own_identity_and_permissions(env):
    agent = make_agent(env)
    assert agent.name == "funnel_agent"
    assert agent.name != "sales_agent"
    assert env.perms.is_allowed("funnel_agent", "analyze_funnel")
    assert not env.perms.is_allowed("funnel_agent", "compute_margin")
    assert not env.perms.is_allowed("sales_agent", "analyze_funnel")


def test_pipeline_audit_labels_funnel_agent(env):
    result = pipe(env, j()).run("x")
    assert result.ok
    labeled = [e for e in env.events() if "agent" in e]
    assert labeled
    assert {e["agent"] for e in labeled} == {"funnel_agent"}

