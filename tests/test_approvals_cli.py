import builtins
import contextlib
import io
import sys
from unittest import mock
from core.control_store import ControlStore
from scripts import approvals as cli


class FakeStdin:
    def __init__(self, tty):
        self.tty = tty

    def isatty(self):
        return self.tty


def make(tmp_path):
    store = ControlStore(tmp_path / "control.db")
    store.init()
    return store


def run(args, store, tty=False, typed="SIM"):
    out = io.StringIO()
    with mock.patch.object(sys, "stdin", FakeStdin(tty)), mock.patch.object(builtins, "input", lambda *_: typed), \
            contextlib.redirect_stdout(out):
        code = cli.main(args, store=store)
    return code, out.getvalue()


def test_list_show_and_missing(tmp_path):
    store = make(tmp_path)
    assert "Nenhum pedido" in run(["list"], store)[1]
    aid = store.create_approval("demo.order", {"symbol": "PETR4", "qty": 2, "api_key": "SEGREDO"}, "ag", "r", 600)
    code, text = run(["show", str(aid)], store)
    assert code == 0 and "PETR4" in text and "SEGREDO" not in text
    assert run(["show", "999"], store)[0] == 1


def test_approve_requires_an_interactive_terminal_and_typed_confirmation(tmp_path):
    store = make(tmp_path)
    aid = store.create_approval("demo.order", {"qty": 1}, "ag", "r", 600)
    code, text = run(["approve", str(aid)], store, tty=False)
    assert code == 1 and "interativo" in text and store.get_approval(aid)["status"] == "pending"
    code, text = run(["approve", str(aid)], store, tty=True, typed="nao")
    assert code == 1 and store.get_approval(aid)["status"] == "pending"
    code, text = run(["approve", str(aid)], store, tty=True, typed="SIM")
    assert code == 0 and store.get_approval(aid)["status"] == "approved"


def test_deny_is_always_allowed(tmp_path):
    store = make(tmp_path)
    aid = store.create_approval("demo.order", {"qty": 1}, "ag", "r", 600)
    assert run(["deny", str(aid)], store, tty=False)[0] == 0
    assert store.get_approval(aid)["status"] == "denied"


def test_kill_switch_engages_without_a_terminal_but_release_needs_one(tmp_path):
    store = make(tmp_path)
    assert run(["kill", "engage", "teste"], store, tty=False)[0] == 0
    assert store.kill_state()[0] is True and "ATIVO" in run(["kill", "status"], store)[1]
    code, text = run(["kill", "release"], store, tty=False)
    assert code == 1 and store.kill_state()[0] is True
    assert run(["kill", "release"], store, tty=True, typed="nao")[0] == 1 and store.kill_state()[0] is True
    assert run(["kill", "release"], store, tty=True, typed="SIM")[0] == 0 and store.kill_state()[0] is False


def test_audit_command_verifies_the_chain(tmp_path):
    store = make(tmp_path)
    store.append_audit("r", "a", "e")
    code, text = run(["audit", "--verify"], store)
    assert code == 0 and "ÍNTEGRA" in text
    import sqlite3
    con = sqlite3.connect(store.path)
    con.execute("DROP TRIGGER audit_no_update")
    con.execute("UPDATE audit_events SET actor='forjado'")
    con.commit()
    con.close()
    code, text = run(["audit", "--verify"], store)
    assert code == 2 and "ADULTERADA" in text
