import sqlite3
from types import SimpleNamespace

from agents.central.router import RouteResult
from core.llm_client import FakeLLM
from core.memory import AUDIT_WARNING, Memory, safe_record_run
from pipelines.central_pipeline import CentralPipeline
from pipelines.finance_pipeline import FinancePipeline
from pipelines.studio_pipeline import StudioPipeline
from scripts.studio_api import dispatch
from tests.test_base_agent import GOOD as PORTFOLIO, OK as FIN_OK
from tests.test_studio import make_client, routes_handler


class BrokenMemory(Memory):
    """SQLite indisponível só no registro de auditoria; demais escritas seguem normais."""

    def record_run(self, *args, **kwargs):
        raise sqlite3.OperationalError("database is locked")


def _studio_pipeline(env, memory=None):
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("GET", "/api/projects"): {"projects": []},
    })
    return StudioPipeline(make_client(handler), memory or env.memory,
                          env.perms, env.logger, env.monitor)


def test_safe_record_run_degrades_without_raising(env):
    sentinel = "DETALHE_RESERVADO_NAO_GRAVAR"
    warning = safe_record_run(BrokenMemory(env.db), env.logger, "x", None, "ok",
                              sentinel, run_id="r1")
    assert warning and warning.startswith(AUDIT_WARNING)
    event = next(e for e in env.events() if e["event"] == "audit_degraded")
    assert event["run_id"] == "r1"
    assert event["agent"] == "x"
    assert event["error"] == "OperationalError"
    assert event["detail_chars"] == len(sentinel)
    assert "detail" not in event
    assert "exception" not in event
    raw = env.log_path.read_text(encoding="utf-8")
    assert sentinel not in raw
    assert "database is locked" not in raw


def test_studio_success_survives_audit_failure(env):
    result = _studio_pipeline(env, BrokenMemory(env.db)).list_apps()
    assert result.ok
    assert any(AUDIT_WARNING in r for r in result.reasons)
    assert any(e["event"] == "audit_degraded" for e in env.events())


def test_studio_rejection_survives_audit_failure(env):
    result = _studio_pipeline(env, BrokenMemory(env.db)).run("")
    assert not result.ok
    assert result.reasons[0] == "pedido vazio"
    assert any(AUDIT_WARNING in r for r in result.reasons)


def test_api_does_not_turn_audit_failure_into_500(env):
    response = dispatch(_studio_pipeline(env, BrokenMemory(env.db)),
                        method="POST", target="/tools/studio_list_apps",
                        headers={"Content-Type": "application/json"}, body=b"{}",
                        logger=env.logger)
    assert response.status == 200
    assert response.payload["ok"] is True
    assert any(AUDIT_WARNING in r for r in response.payload["reasons"])


def test_central_survives_audit_failure(env):
    class Router:
        def route(self, text, run_id):
            return RouteResult(area="music", text=text)

    def handle(text):
        return SimpleNamespace(ok=True, data={"chord": "C"}, reasons=[])

    pipeline = CentralPipeline(Router(), {"music": handle}, BrokenMemory(env.db), env.logger)
    result = pipeline.handle("acorde")
    assert result.ok and result.dispatched
    assert any(AUDIT_WARNING in r for r in result.reasons)


def test_finance_keeps_the_alert_when_audit_fails(env):
    pipeline = FinancePipeline(FakeLLM(FIN_OK), BrokenMemory(env.db), env.perms,
                               env.logger, env.monitor, env.notes)
    result = pipeline.run("PETR4", PORTFOLIO)
    assert result.approved and result.alert
    assert any(AUDIT_WARNING in r for r in result.reasons)
    assert len(env.memory.list_alerts()) == 1
