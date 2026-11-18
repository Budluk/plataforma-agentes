import json
import threading
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from scripts.init_db import create_all


def test_init_db_creates_3_tables_31_capabilities(tmp_path):
    info = create_all(tmp_path / "t.db")
    assert info["tables"] == ["agent_runs", "alerts", "capabilities"]
    assert info["capabilities"] == 31


def test_init_db_is_idempotent(tmp_path):
    create_all(tmp_path / "t.db")
    assert create_all(tmp_path / "t.db")["capabilities"] == 31


def test_permissions(tmp_path):
    create_all(tmp_path / "t.db")
    p = Permissions(tmp_path / "t.db")
    assert p.is_allowed("analyst", "get_market_data")
    assert not p.is_allowed("analyst", "emit_alert")
    assert not p.is_allowed("ghost", "get_market_data")


def test_permissions_fail_closed_without_db(tmp_path):
    assert not Permissions(tmp_path / "nao_existe" / "x.db").is_allowed("analyst", "get_market_data")


def test_logger_writes_valid_jsonl(tmp_path):
    log = JsonlLogger(tmp_path / "l.jsonl")
    log.log("evento", asset="PETR4")
    line = (tmp_path / "l.jsonl").read_text(encoding="utf-8").strip()
    assert json.loads(line)["event"] == "evento"


def test_logger_redacts_secrets(tmp_path):
    log = JsonlLogger(tmp_path / "l.jsonl")
    log.log("x", api_key="SEGREDO", nested={"token": "SEGREDO2"})
    text = (tmp_path / "l.jsonl").read_text(encoding="utf-8")
    assert "SEGREDO" not in text


def test_logger_thread_safe(tmp_path):
    log = JsonlLogger(tmp_path / "l.jsonl")
    ts = [threading.Thread(target=log.log, args=("e",), kwargs={"i": i}) for i in range(50)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    lines = (tmp_path / "l.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 50 and all(json.loads(x) for x in lines)


def test_memory_run_and_alert(tmp_path):
    m = Memory(tmp_path / "m.db")
    m.init_schema()
    assert m.record_run("analyst", "PETR4", "ok") == 1
    m.save_alert("PETR4", {"message": "teste"})
    assert m.list_alerts() == [{"asset": "PETR4", "message": "teste"}]





