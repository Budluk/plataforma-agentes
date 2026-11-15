import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
import httpx
import pytest
from pydantic import ValidationError
from agents.finance.market_data import FakeMarketData, HttpMarketData, KIND, ROUTES, load_market_hosts
from agents.finance.market_parsers import (MarketDataError, parse_binance, parse_brapi, parse_frankfurter)
from agents.finance.portfolio_file import load_portfolio
from agents.finance.tools import build_tools
from core.contracts import ALLOWED_ASSETS, AlertEvent
from core.llm_client import FakeLLM
from core.market import (MAX_AGE_SECONDS, MAX_ENTRY_DEVIATION_PCT, Quote, check_entry_vs_market, check_quote)
from pipelines.finance_pipeline import FinancePipeline
from tests.helpers import proposal
from tests.test_base_agent import GOOD, OK as FIN_OK

NOW = datetime(2026, 11, 14, 15, 0, tzinfo=timezone.utc)
HOSTS = frozenset({"brapi.dev", "data-api.binance.vision", "api.frankfurter.dev"})
ROOT = Path(__file__).resolve().parent.parent


def fresh_quote(asset="PETR4", price=38.0, age=60, source="brapi", kind="last_trade"):
    return Quote(asset=asset, price=price, as_of=datetime.now(timezone.utc) - timedelta(seconds=age),
                 source=source, kind=kind)


# ---------------- leitores de resposta ----------------
def brapi(**kw):
    return {"results": [{"symbol": "PETR4", "currency": "BRL", "regularMarketPrice": 38.5,
                         "regularMarketTime": "2026-11-14T14:55:00.000Z", **kw}], "took": 5}


@pytest.mark.parametrize("payload", [
    None, [], {}, {"results": []}, {"results": "x"}, {"results": [1]},
    brapi(symbol="VALE3"), brapi(currency="USD"), brapi(requestedSymbol="VALE3"),
    brapi(regularMarketPrice=None), brapi(regularMarketPrice=0), brapi(regularMarketPrice=-1),
    brapi(regularMarketPrice=float("nan")), brapi(regularMarketPrice=float("inf")),
    brapi(regularMarketPrice="abc"), brapi(regularMarketPrice=True),
    brapi(regularMarketTime=None), brapi(regularMarketTime="ontem"),
    brapi(regularMarketTime="2026-11-14T14:55:00"),
])
def test_brapi_parser_rejects(payload):
    with pytest.raises(MarketDataError):
        parse_brapi("PETR4", payload)


def test_brapi_parser_accepts_and_normalizes_timezone():
    price, t = parse_brapi("PETR4", brapi(regularMarketTime="2026-11-14T11:55:00-03:00"))
    assert price == 38.5 and t == datetime(2026, 11, 14, 14, 55, tzinfo=timezone.utc)


def binance(**kw):
    return {"symbol": "BTCUSDT", "lastPrice": "65000.10", "closeTime": 1763132100000, **kw}


@pytest.mark.parametrize("payload", [
    None, [], binance(symbol="ETHUSDT"), binance(lastPrice="abc"), binance(lastPrice="0"),
    binance(lastPrice=None), binance(closeTime="123"), binance(closeTime=0), binance(closeTime=True),
    binance(closeTime=10**30), binance(closeTime=None),
])
def test_binance_parser_rejects(payload):
    with pytest.raises(MarketDataError):
        parse_binance("BTCUSDT", payload)


def frank(**kw):
    return {"amount": 1.0, "base": "EUR", "date": "2026-11-13", "rates": {"USD": 1.0812}, **kw}


@pytest.mark.parametrize("payload", [
    None, [], frank(base="USD"), frank(rates={}), frank(rates={"GBP": 0.8}), frank(rates={"USD": 1.1, "GBP": 0.8}),
    frank(rates={"USD": -1}), frank(rates={"USD": "x"}), frank(date="13/11/2026"), frank(date=None), frank(rates="x"),
])
def test_frankfurter_parser_rejects(payload):
    with pytest.raises(MarketDataError):
        parse_frankfurter("EUR", "USD", payload)


# ---------------- provedor HTTP com transporte simulado (sem rede) ----------------
def canned(now=NOW):
    return {
        "brapi.dev": {"results": [{"symbol": "PETR4", "currency": "BRL", "regularMarketPrice": 38.5,
                                   "regularMarketTime": (now - timedelta(minutes=5)).isoformat()}]},
        "data-api.binance.vision": {"symbol": "BTCUSDT", "lastPrice": "65000.10",
                                    "closeTime": int((now - timedelta(seconds=30)).timestamp() * 1000)},
        "api.frankfurter.dev": {"amount": 1.0, "base": "EUR", "date": "2026-11-13", "rates": {"USD": 1.0812}},
    }


def http(handler=None, hosts=HOSTS, data=None, **kw):
    data = data if data is not None else canned()
    calls = {"n": 0, "ua": None}

    def default(request):
        calls["n"] += 1
        calls["ua"] = request.headers.get("user-agent")
        return httpx.Response(200, headers={"content-type": "application/json"}, json=data[request.url.host])

    def counting(request):
        calls["n"] += 1
        return handler(request)

    client = HttpMarketData(hosts, transport=httpx.MockTransport(counting if handler else default),
                            clock=lambda: NOW, **kw)
    return client, calls


def test_each_provider_returns_a_validated_quote():
    client, _ = http()
    q = client.get_quote("PETR4")
    assert (q.price, q.source, q.kind) == (38.5, "brapi", "last_trade")
    q = client.get_quote("BTCUSDT")
    assert (q.price, q.source, q.kind) == (65000.10, "binance", "last_trade")
    q = client.get_quote("EURUSD")
    assert (q.price, q.source, q.kind) == (1.0812, "frankfurter", "daily_reference")


def test_payload_for_another_symbol_is_rejected():
    client, _ = http()
    with pytest.raises(MarketDataError):
        client.get_quote("VALE3")          # a resposta simulada é de PETR4


def test_default_user_agent_is_generic_and_sent():
    client, calls = http()
    client.get_quote("PETR4")
    assert "plataforma-agentes" in calls["ua"] and "@" not in calls["ua"]


@pytest.mark.parametrize("hosts", [frozenset(), frozenset({"brapi.dev"})])
def test_host_missing_from_config_is_refused_before_any_request(hosts):
    client, calls = http(hosts=hosts)
    with pytest.raises(MarketDataError, match="fora da lista"):
        client.get_quote("BTCUSDT")
    assert calls["n"] == 0


def test_unknown_asset_makes_no_request():
    client, calls = http()
    with pytest.raises(MarketDataError):
        client.get_quote("DOGE")
    assert calls["n"] == 0


@pytest.mark.parametrize("response", [
    httpx.Response(500), httpx.Response(404), httpx.Response(429),
    httpx.Response(302, headers={"location": "https://brapi.dev/api/quote/PETR4"}),
    httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html></html>"),
    httpx.Response(200, headers={"content-type": "application/json"}, content=b"nao e json"),
    httpx.Response(200, headers={"content-type": "application/json"}, content=b"[1, 2]"),
])
def test_http_failures_are_errors_not_quotes(response):
    client, _ = http(handler=lambda r: response)
    with pytest.raises(MarketDataError):
        client.get_quote("PETR4")


def test_network_error_and_oversized_body_are_errors():
    def boom(request):
        raise httpx.ConnectError("sem rede")
    with pytest.raises(MarketDataError, match="rede"):
        http(handler=boom)[0].get_quote("PETR4")
    big = httpx.Response(200, headers={"content-type": "application/json"}, content=b'{"a": "' + b"x" * 500 + b'"}')
    with pytest.raises(MarketDataError, match="grande"):
        http(handler=lambda r: big, max_bytes=100)[0].get_quote("PETR4")


def test_stale_and_future_quotes_are_refused():
    old_binance = canned()
    old_binance["data-api.binance.vision"]["closeTime"] = int((NOW - timedelta(minutes=10)).timestamp() * 1000)
    with pytest.raises(MarketDataError, match="antiga"):
        http(data=old_binance)[0].get_quote("BTCUSDT")
    old_brapi = canned()
    old_brapi["brapi.dev"]["results"][0]["regularMarketTime"] = (NOW - timedelta(days=6)).isoformat()
    with pytest.raises(MarketDataError, match="antiga"):
        http(data=old_brapi)[0].get_quote("PETR4")
    old_fx = canned()
    old_fx["api.frankfurter.dev"]["date"] = (NOW - timedelta(days=7)).strftime("%Y-%m-%d")
    with pytest.raises(MarketDataError, match="antiga"):
        http(data=old_fx)[0].get_quote("EURUSD")
    future = canned()
    future["data-api.binance.vision"]["closeTime"] = int((NOW + timedelta(hours=1)).timestamp() * 1000)
    with pytest.raises(MarketDataError, match="futuro"):
        http(data=future)[0].get_quote("BTCUSDT")


def test_market_data_module_is_read_only():
    text = (ROOT / "agents" / "finance" / "market_data.py").read_text(encoding="utf-8")
    assert 'client.stream("GET"' in text
    for verb in (".post(", ".put(", ".delete(", ".patch("):
        assert verb not in text


def test_routes_cover_every_allowed_asset_with_https_and_configured_hosts():
    assert set(ROUTES) == set(ALLOWED_ASSETS)
    shipped = load_market_hosts(ROOT / "config" / "market_data_hosts.txt")
    for asset, (provider, url) in ROUTES.items():
        assert url.startswith("https://")
        assert url.split("/")[2] in shipped, asset
        assert provider in KIND and provider in MAX_AGE_SECONDS


# ---------------- checagens do gate ----------------
def test_check_quote_rules():
    assert check_quote(fresh_quote(source="mock", kind="mock", age=10**9), datetime.now(timezone.utc)) == []
    assert check_quote(fresh_quote(source="binance", age=60), datetime.now(timezone.utc)) == []
    assert check_quote(fresh_quote(source="binance", age=600), datetime.now(timezone.utc))
    assert check_quote(fresh_quote(source="binance", age=-3600), datetime.now(timezone.utc))


def test_entry_must_stay_close_to_the_market_price():
    q = fresh_quote(price=100.0)
    assert check_entry_vs_market(proposal(entry_price=101.9), q) == []
    assert check_entry_vs_market(proposal(entry_price=98.1), q) == []
    far = check_entry_vs_market(proposal(entry_price=102.5), q)
    assert far and str(MAX_ENTRY_DEVIATION_PCT) in far[0]
    assert check_entry_vs_market(proposal(entry_price=50.0), q)
    assert check_entry_vs_market(proposal(asset="VALE3", entry_price=100.0), q)


@pytest.mark.parametrize("kw", [dict(price=0), dict(price=-1), dict(price=float("nan")),
                                dict(source="yahoo"), dict(kind="tick")])
def test_quote_contract_rejects(kw):
    base = dict(asset="PETR4", price=38.0, as_of=datetime.now(timezone.utc), source="brapi", kind="last_trade")
    with pytest.raises(ValidationError):
        Quote(**{**base, **kw})


def test_quote_rejects_naive_datetime_and_extra_fields():
    with pytest.raises(ValidationError):
        Quote(asset="PETR4", price=1.0, as_of=datetime(2026, 11, 14), source="brapi", kind="last_trade")
    with pytest.raises(ValidationError):
        Quote(asset="PETR4", price=1.0, as_of=datetime.now(timezone.utc), source="brapi", kind="last_trade", x=1)


# ---------------- ferramenta ----------------
def tools_with(market, holder=None):
    return build_tools(None, "notes", dict(GOOD), market=market, quote_holder=holder)


def test_tool_returns_only_numbers_and_fixed_labels():
    holder = {}
    out = tools_with(FakeMarketData({"PETR4": fresh_quote()}), holder)["get_market_data"]("PETR4")
    assert set(out) == {"asset", "price", "source", "kind", "age_minutes"}
    assert out["source"] == "brapi" and out["kind"] == "last_trade" and out["age_minutes"] >= 0
    assert holder["quote"].price == 38.0


def test_tool_never_falls_back_to_mock_when_the_provider_fails():
    holder = {}
    with pytest.raises(ValueError, match="indisponíveis"):
        tools_with(FakeMarketData({}, error="HTTP 500"), holder)["get_market_data"]("PETR4")
    assert "quote" not in holder


def test_tool_without_provider_is_explicitly_mock():
    assert tools_with(None)["get_market_data"]("PETR4")["source"] == "mock"


def test_tool_rejects_quote_for_another_asset():
    with pytest.raises(ValueError):
        tools_with(FakeMarketData({"PETR4": fresh_quote(asset="VALE3")}))["get_market_data"]("PETR4")


# ---------------- pipeline ----------------
def pipe(env, market, llm=None):
    llm = llm or FakeLLM(FIN_OK)
    return FinancePipeline(llm, env.memory, env.perms, env.logger, env.monitor, env.notes, market=market), llm


def test_pipeline_with_real_quote_emits_alert_with_source_and_age(env):
    p, _ = pipe(env, FakeMarketData({"PETR4": fresh_quote(price=38.2, age=120)}))
    res = p.run("PETR4", dict(GOOD))
    assert res.approved and res.alert.data_source == "brapi" and res.alert.data_age_minutes >= 2
    saved = env.memory.list_alerts()[0]
    assert saved["data_source"] == "brapi"


def test_pipeline_rejects_entry_far_from_the_real_price(env):
    p, _ = pipe(env, FakeMarketData({"PETR4": fresh_quote(price=45.0)}))
    res = p.run("PETR4", dict(GOOD))
    assert not res.approved and "preço de mercado" in res.reasons[0]
    assert env.memory.list_alerts() == []


def test_pipeline_fails_closed_when_market_data_fails_and_never_calls_the_llm(env):
    p, llm = pipe(env, FakeMarketData({}, error="HTTP 500"))
    res = p.run("PETR4", dict(GOOD))
    assert not res.approved and "indisponíveis" in res.reasons[0]
    assert llm.calls == 0 and env.memory.list_alerts() == []


def test_pipeline_rejects_stale_quote(env):
    p, llm = pipe(env, FakeMarketData({"PETR4": fresh_quote(source="binance", age=900)}))
    assert not p.run("PETR4", dict(GOOD)).approved and llm.calls == 0


def test_market_data_is_fetched_through_the_logged_tool_before_the_llm(env):
    p, _ = pipe(env, FakeMarketData({"PETR4": fresh_quote()}))
    p.run("PETR4", dict(GOOD))
    events = [e["event"] for e in env.events()]
    assert events.index("tool_call_attempt") < events.index("llm_request")
    assert env.events()[0]["tool"] == "get_market_data"


def test_pipeline_without_provider_still_works_as_mock(env):
    p, _ = pipe(env, None)
    res = p.run("PETR4", dict(GOOD))
    assert res.approved and res.alert.data_source == "mock"


def test_alert_event_fields_are_optional():
    a = AlertEvent.model_validate({"asset": "PETR4", "direction": "LONG", "entry_price": 1.0, "stop_price": 0.9,
                                   "target_price": 1.3, "reward_risk_ratio": 3.0, "message": "m"})
    assert a.data_source == "" and a.data_age_minutes is None


def test_central_passes_the_market_provider_to_finance(env, tmp_path):
    from agents.research.fetcher import FakeFetcher
    from pipelines.central_wiring import build_central
    market = FakeMarketData({"PETR4": fresh_quote()})
    c = build_central(router_llm=FakeLLM(json.dumps({"area": "finance", "reason": "t"})), area_llm=FakeLLM(FIN_OK),
                      db=env.db, data_dir=tmp_path, allowed_domains=frozenset({"wikipedia.org"}),
                      allowed_imports=frozenset({"math"}), fetcher=FakeFetcher({}),
                      portfolio_provider=lambda: dict(GOOD), logger=env.logger, market=market)
    r = c.handle("analise petr4")
    assert r.ok and market.calls == 1 and r.data["data_source"] == "brapi"


# ---------------- portfólio em arquivo ----------------
def test_portfolio_file_rules(tmp_path):
    assert load_portfolio(tmp_path / "nao_existe.json") == {}
    p = tmp_path / "p.json"
    p.write_text(json.dumps(GOOD), encoding="utf-8")
    assert load_portfolio(p) == GOOD
    old = time.time() - 48 * 3600
    os.utime(p, (old, old))
    assert load_portfolio(p)["equity_snapshot_consistent"] is False
    p.write_text("{ quebrado", encoding="utf-8")
    assert load_portfolio(p) == {}
    p.write_text("[1, 2]", encoding="utf-8")
    assert load_portfolio(p) == {}
    p.write_text(json.dumps(GOOD), encoding="utf-8-sig")
    assert load_portfolio(p) == GOOD


# ---------------- Agente Central + dados reais ----------------
def _central(env, tmp_path, market, provider=lambda: dict(GOOD), area_llm=None):
    from agents.research.fetcher import FakeFetcher
    from pipelines.central_wiring import build_central
    area_llm = area_llm or FakeLLM(FIN_OK)
    return build_central(router_llm=FakeLLM(json.dumps({"area": "finance", "reason": "t"})), area_llm=area_llm,
                         db=env.db, data_dir=tmp_path, allowed_domains=frozenset({"wikipedia.org"}),
                         allowed_imports=frozenset({"math"}), fetcher=FakeFetcher({}),
                         portfolio_provider=provider, logger=env.logger, market=market), area_llm


def test_central_finance_end_to_end_with_the_http_provider_mocked(env, tmp_path):
    data = canned(datetime.now(timezone.utc))
    hosts_called = []

    def handler(request):
        hosts_called.append(request.url.host)
        return httpx.Response(200, headers={"content-type": "application/json"}, json=data[request.url.host])

    market = HttpMarketData(HOSTS, transport=httpx.MockTransport(handler))
    c, _ = _central(env, tmp_path, market)
    r = c.handle("analise petr4")
    assert r.ok and hosts_called == ["brapi.dev"] and r.data["data_source"] == "brapi"


def test_central_finance_rejects_when_the_market_is_down_without_calling_the_analyst(env, tmp_path):
    c, llm = _central(env, tmp_path, FakeMarketData({}, error="HTTP 503"))
    r = c.handle("analise petr4")
    assert r.dispatched and not r.ok and llm.calls == 0
    assert "indisponíveis" in r.reasons[0]


def test_central_finance_rejects_when_the_portfolio_file_is_missing(env, tmp_path):
    c, _ = _central(env, tmp_path, FakeMarketData({"PETR4": fresh_quote()}), provider=lambda: {})
    r = c.handle("analise petr4")
    assert r.dispatched and not r.ok and any("portfólio" in x for x in r.reasons)


def test_central_cli_wires_market_data_and_the_portfolio_file():
    text = (ROOT / "scripts" / "central_cli.py").read_text(encoding="utf-8")
    assert "HttpMarketData" in text and "load_portfolio" in text and "portfolio_provider=" in text
