import sqlite3
import pytest
from core.control_store import ControlStore, params_hash


class Clock:
    def __init__(self, t=1_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


def make(tmp_path, clock=None):
    store = ControlStore(tmp_path / "control.db", clock=clock or Clock())
    store.init()
    return store


def tables(path):
    con = sqlite3.connect(path)
    try:
        return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        con.close()


def test_init_creates_tables_version_and_is_idempotent(tmp_path):
    store = make(tmp_path)
    store.init()
    assert {"audit_events", "approvals", "kill_switch", "action_calls"} <= tables(store.path)
    assert store.schema_version() == 1


def test_audit_chain_is_valid_and_secrets_are_redacted(tmp_path):
    store = make(tmp_path)
    for i in range(5):
        store.append_audit(f"r{i}", "agente", "evento", "demo.acao", "ok", {"n": i, "api_key": "SEGREDO", "texto": "gsk_" + "q" * 30})
    ok, n, bad = store.verify_chain()
    assert (ok, n, bad) == (True, 5, None)
    dump = str(store.audit_tail(10))
    assert "SEGREDO" not in dump and "gsk_" not in dump


def test_audit_is_append_only(tmp_path):
    store = make(tmp_path)
    store.append_audit("r", "a", "e")
    con = sqlite3.connect(store.path)
    try:
        with pytest.raises(sqlite3.Error):
            con.execute("UPDATE audit_events SET actor='x'")
        with pytest.raises(sqlite3.Error):
            con.execute("DELETE FROM audit_events")
    finally:
        con.close()


def test_chain_detects_tampering_even_if_the_triggers_are_dropped(tmp_path):
    store = make(tmp_path)
    for i in range(4):
        store.append_audit("r", "a", "e", detail={"i": i})
    con = sqlite3.connect(store.path)
    con.execute("DROP TRIGGER audit_no_update")
    con.execute("UPDATE audit_events SET detail='{\"i\":99}' WHERE id=2")
    con.commit()
    con.close()
    ok, n, bad = store.verify_chain()
    assert ok is False and bad == 2 and n == 1


def test_approval_lifecycle(tmp_path):
    clock = Clock()
    store = make(tmp_path, clock)
    aid = store.create_approval("demo.acao", {"qty": 1}, "agente", "r1", 600)
    row = store.get_approval(aid)
    assert row["status"] == "pending" and row["params"] == {"qty": 1} and row["params_hash"] == params_hash({"qty": 1})
    assert store.consume(aid) is False                      # pendente não pode ser consumida
    assert store.human_decide(aid, True, "lucas") == "approved"
    assert store.human_decide(aid, True, "lucas") == "already_approved"
    assert store.consume(aid) is True and store.consume(aid) is False
    assert store.get_approval(aid)["status"] == "used"
    assert store.human_decide(999, True, "x") == "not_found"


def test_deny_and_expiry(tmp_path):
    clock = Clock()
    store = make(tmp_path, clock)
    a = store.create_approval("demo.acao", {}, "ag", "r", 600)
    assert store.human_decide(a, False, "lucas") == "denied" and store.consume(a) is False
    b = store.create_approval("demo.acao", {}, "ag", "r", 600)
    clock.t += 601
    assert store.human_decide(b, True, "lucas") == "expired"
    c = store.create_approval("demo.acao", {}, "ag", "r", 600)
    assert store.human_decide(c, True, "lucas") == "approved"
    clock.t += 601
    assert store.consume(c) is False                        # aprovada, mas vencida


def test_list_approvals_filters_by_status(tmp_path):
    store = make(tmp_path)
    a = store.create_approval("demo.acao", {}, "ag", "r", 600)
    store.create_approval("demo.acao", {}, "ag", "r", 600)
    store.human_decide(a, True, "lucas")
    assert len(store.list_approvals()) == 2
    assert [r["id"] for r in store.list_approvals("approved")] == [a]


def test_kill_switch_defaults_off_engages_redacts_and_releases(tmp_path):
    store = make(tmp_path)
    assert store.kill_state() == (False, "")
    store.engage("parar tudo gsk_" + "k" * 30, "lucas")
    engaged, why = store.kill_state()
    assert engaged and "gsk_" not in why
    store.release("lucas")
    assert store.kill_state() == (False, "")


def test_kill_switch_fails_closed_when_unreadable(tmp_path):
    empty = ControlStore(tmp_path / "vazio.db")             # sem init: sem tabelas
    assert empty.kill_state()[0] is True
    garbage = tmp_path / "lixo.db"
    garbage.write_bytes(b"isto nao e um banco sqlite" * 50)
    assert ControlStore(garbage).kill_state()[0] is True


def test_rate_limit_counts_inside_the_window_only(tmp_path):
    clock = Clock()
    store = make(tmp_path, clock)
    assert store.try_record_call("demo.acao", "proposal", 2, 60) is True
    assert store.try_record_call("demo.acao", "proposal", 2, 60) is True
    assert store.try_record_call("demo.acao", "proposal", 2, 60) is False
    assert store.try_record_call("demo.acao", "execution", 2, 60) is True    # contador separado por tipo
    assert store.try_record_call("outra.acao", "proposal", 2, 60) is True    # e por ação
    clock.t += 61
    assert store.try_record_call("demo.acao", "proposal", 2, 60) is True
