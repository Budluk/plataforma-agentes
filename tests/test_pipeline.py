from core.llm_client import FakeLLM
from pipelines.finance_pipeline import FinancePipeline
from tests.test_base_agent import GOOD, OK


def pipe(env, resp=OK):
    return FinancePipeline(FakeLLM(resp), env.memory, env.perms, env.logger, env.monitor, env.notes)


def test_approved_saves_alert(env):
    res = pipe(env).run("PETR4", GOOD)
    assert res.approved and res.alert
    assert len(env.memory.list_alerts()) == 1


def test_inconsistent_snapshot_rejected(env):
    res = pipe(env).run("PETR4", {**GOOD, "equity_snapshot_consistent": False})
    assert not res.approved and env.memory.list_alerts() == []


def test_daily_loss_rejected(env):
    res = pipe(env).run("PETR4", {**GOOD, "daily_pnl_pct": -5.0})
    assert not res.approved and env.memory.list_alerts() == []


def test_missing_portfolio_fields_fail_closed(env):
    assert not pipe(env).run("PETR4", {}).approved


def test_unknown_asset_rejected_with_reason(env):
    res = pipe(env).run("DOGE", GOOD)
    assert not res.approved and res.reasons


def test_bad_llm_output_rejected_and_logged(env):
    res = pipe(env, "lixo").run("PETR4", GOOD)
    assert not res.approved
    assert any(e["event"] == "rejection" and e["reasons"] for e in env.events())
