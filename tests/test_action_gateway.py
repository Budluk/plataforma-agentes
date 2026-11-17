import sqlite3
import pytest
from core import approvals_admin as adm
from core.actions import ActionFailed, ActionGateway, ActionRefused, ActionSpec, Limits
from core.control_store import ControlStore


class Clock:
    def __init__(self, t=1_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


class Order:
    """Stub com a interface do Pydantic que o gateway usa (model_validate / model_dump)."""

    def __init__(self, symbol, qty):
        self.symbol, self.qty = symbol, qty

    @classmethod
    def model_validate(cls, data):
        if not isinstance(data, dict) or set(data) != {"symbol", "qty"}:
            raise ValueError("campos")
        if not isinstance(data["symbol"], str) or not data["symbol"]:
            raise ValueError("symbol")
        if isinstance(data["qty"], bool) or not isinstance(data["qty"], int) or not 1 <= data["qty"] <= 100:
            raise ValueError("qty")
        return cls(data["symbol"], data["qty"])

    def model_dump(self, mode="python"):
        return {"symbol": self.symbol, "qty": self.qty}


class Env:
    def __init__(self, tmp_path, limits=Limits(5, 5, 60), handler=None, store_cls=ControlStore):
        self.clock = Clock()
        self.store = store_cls(tmp_path / "control.db", clock=self.clock)
        self.store.init()
        self.calls = []

        def default(params):
            self.calls.append(params)
            return {"filled": params["qty"]}

        spec = ActionSpec("demo.order", Order, limits, approval_ttl_seconds=600)
        self.gw = ActionGateway(self.store, {"demo.order": spec}, {"demo.order": handler or default})

    def propose(self, **kw):
        return self.gw.propose("demo.order", kw or {"symbol": "PETR4", "qty": 2}, "agente", "run1")

    def approve(self, aid):
        return adm.decide(self.store, aid, True, "lucas")

    def execute(self, aid):
        return self.gw.execute(aid, "executor", "run2")

    def events(self):
        return self.store.audit_tail(200)


def refused(code, fn, *a):
    with pytest.raises(ActionRefused) as exc:
        fn(*a)
    assert exc.value.code == code, exc.value.code


def test_happy_path_needs_a_human_and_runs_once(tmp_path):
    e = Env(tmp_path)
    p = e.propose()
    assert e.store.get_approval(p.approval_id)["status"] == "pending" and e.calls == []
    refused("not_approved", e.execute, p.approval_id)           # sem aprovação humana não executa
    assert e.calls == []
    assert e.approve(p.approval_id) == "approved"
    out = e.execute(p.approval_id)
    assert out.result == {"filled": 2} and e.calls == [{"symbol": "PETR4", "qty": 2}]
    assert e.store.get_approval(p.approval_id)["status"] == "used"
    refused("not_approved", e.execute, p.approval_id)           # uso único
    assert len(e.calls) == 1
    assert e.store.verify_chain()[0] is True


def test_denied_and_expired_requests_never_run(tmp_path):
    e = Env(tmp_path)
    p = e.propose()
    adm.decide(e.store, p.approval_id, False, "lucas")
    refused("not_approved", e.execute, p.approval_id)
    q = e.propose()
    e.approve(q.approval_id)
    e.clock.t += 601
    refused("not_approved", e.execute, q.approval_id)
    assert e.calls == []


def test_invalid_params_are_refused_and_create_no_approval(tmp_path):
    e = Env(tmp_path)
    for bad in ({"symbol": "PETR4", "qty": 0}, {"symbol": "PETR4", "qty": True}, {"symbol": "", "qty": 1},
                {"symbol": "PETR4", "qty": 1, "extra": "x"}, {"symbol": "PETR4"}, {}):
        refused("invalid_params", e.gw.propose, "demo.order", bad, "agente", "r")
    refused("invalid_params", e.gw.propose, "demo.order", "nao e dict", "agente", "r")
    assert e.store.list_approvals() == []
    assert any(ev["status"] == "invalid_params" for ev in e.events())


def test_unknown_actions_are_refused(tmp_path):
    e = Env(tmp_path)
    for name in ("outra.coisa", "", None, 123, "demo.order; drop table"):
        refused("unknown_action", e.gw.propose, name, {"symbol": "A", "qty": 1}, "agente", "r")


def test_proposal_and_execution_rate_limits(tmp_path):
    e = Env(tmp_path, limits=Limits(max_proposals=2, max_executions=1, window_seconds=60))
    a, b = e.propose(), e.propose()
    refused("rate_limited", e.gw.propose, "demo.order", {"symbol": "A", "qty": 1}, "agente", "r")
    e.approve(a.approval_id)
    e.approve(b.approval_id)
    e.execute(a.approval_id)
    refused("rate_limited", e.execute, b.approval_id)
    assert e.store.get_approval(b.approval_id)["status"] == "approved"   # a aprovação não foi gasta
    e.clock.t += 61
    assert e.execute(b.approval_id).result == {"filled": 2}


def test_kill_switch_blocks_everything_and_does_not_burn_approvals(tmp_path):
    e = Env(tmp_path)
    p = e.propose()
    e.approve(p.approval_id)
    adm.engage_kill(e.store, "emergência", "lucas")
    refused("kill_switch", e.execute, p.approval_id)
    refused("kill_switch", e.gw.propose, "demo.order", {"symbol": "A", "qty": 1}, "agente", "r")
    assert e.store.get_approval(p.approval_id)["status"] == "approved" and e.calls == []
    adm.release_kill(e.store, "lucas")
    assert e.execute(p.approval_id).result == {"filled": 2}


class FlipStore(ControlStore):
    """Simula o kill switch sendo acionado entre a aprovação consumida e a chamada do handler."""
    reads = 0

    def kill_state(self):
        FlipStore.reads += 1
        return (FlipStore.reads >= 2, "acionado no meio")


def test_kill_switch_pressed_right_before_the_handler_aborts_the_action(tmp_path):
    FlipStore.reads = 0
    e = Env(tmp_path, store_cls=FlipStore)
    p = e.propose()                                             # leitura 1 (propose)
    e.approve(p.approval_id)
    FlipStore.reads = 0
    refused("kill_switch", e.execute, p.approval_id)            # leitura 1 passa, leitura 2 trava
    assert e.calls == [] and e.store.get_approval(p.approval_id)["status"] == "failed"


def test_tampered_stored_params_are_detected(tmp_path):
    e = Env(tmp_path)
    p = e.propose()
    e.approve(p.approval_id)
    con = sqlite3.connect(e.store.path)
    con.execute("UPDATE approvals SET params_json='{\"qty\":100,\"symbol\":\"PETR4\"}' WHERE id=?", (p.approval_id,))
    con.commit()
    con.close()
    refused("tampered", e.execute, p.approval_id)
    q = e.propose()
    e.approve(q.approval_id)
    con = sqlite3.connect(e.store.path)
    con.execute("UPDATE approvals SET params_json='{\"qty\":9999,\"symbol\":\"X\"}' WHERE id=?", (q.approval_id,))
    con.commit()
    con.close()
    refused("tampered", e.execute, q.approval_id)
    assert e.calls == []


def test_handler_failure_is_contained_marked_and_does_not_leak(tmp_path):
    def boom(params):
        raise RuntimeError("falha com segredo gsk_" + "s" * 30)

    e = Env(tmp_path, handler=boom)
    p = e.propose()
    e.approve(p.approval_id)
    with pytest.raises(ActionFailed) as exc:
        e.execute(p.approval_id)
    assert "gsk_" not in str(exc.value) and "RuntimeError" in str(exc.value)
    row = e.store.get_approval(p.approval_id)
    assert row["status"] == "failed" and row["result"] == {"error": "RuntimeError"}
    assert "gsk_" not in str(e.events())
    refused("not_approved", e.execute, p.approval_id)           # falhou: não tenta de novo sem nova aprovação


def test_non_dict_handler_result_is_wrapped(tmp_path):
    e = Env(tmp_path, handler=lambda params: 7)
    p = e.propose()
    e.approve(p.approval_id)
    assert e.execute(p.approval_id).result == {"value": 7}


def test_missing_approval_is_refused(tmp_path):
    refused("not_found", Env(tmp_path).execute, 999)


def test_audit_records_actor_run_and_never_the_secrets(tmp_path):
    e = Env(tmp_path)
    p = e.gw.propose("demo.order", {"symbol": "gsk_" + "x" * 30, "qty": 1}, "agente-financas", "run-42")
    e.approve(p.approval_id)
    e.execute(p.approval_id)
    events = e.events()
    assert {ev["actor"] for ev in events} >= {"agente-financas", "lucas", "executor"}
    assert any(ev["run_id"] == "run-42" and ev["event"] == "proposed" for ev in events)
    assert "gsk_" not in str(events)
    assert e.store.verify_chain()[0] is True


def test_constructor_validations(tmp_path):
    store = ControlStore(tmp_path / "c.db")
    ok = ActionSpec("demo.order", Order, Limits(1, 1, 1))
    with pytest.raises(ValueError):
        ActionGateway(store, {"demo.order": ok}, {})
    with pytest.raises(ValueError):
        ActionGateway(store, {"outro.nome": ok}, {"outro.nome": lambda p: {}})
    for bad in ("Demo", "a", "x y", "1abc", "demo/order", "demo.order;drop"):
        with pytest.raises(ValueError):
            ActionSpec(bad, Order, Limits(1, 1, 1))
    with pytest.raises(ValueError):
        ActionSpec("demo.order", object, Limits(1, 1, 1))
    for ttl in (10, 90000):
        with pytest.raises(ValueError):
            ActionSpec("demo.order", Order, Limits(1, 1, 1), approval_ttl_seconds=ttl)
    for lim in ((0, 1, 1), (1, 0, 1), (1, 1, 0)):
        with pytest.raises(ValueError):
            Limits(*lim)
