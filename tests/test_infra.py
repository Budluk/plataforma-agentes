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


def test_logger_scrubs_secrets_inside_values(tmp_path):
    log = JsonlLogger(tmp_path / "l.jsonl")
    message = ("Bearer abcdefgh12345678 sk-ABCDEFGHIJKLMNOP "
               "ghp_ABCDEFGHIJKLMNOPQRST AIzaABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh")
    log.log("prompt", mensagem=message, nested={"texto": "Bearer ZZZZZZZZ9999"})

    text = (tmp_path / "l.jsonl").read_text(encoding="utf-8")
    assert "abcdefgh12345678" not in text
    assert "sk-ABCDEFGHIJKLMNOP" not in text
    assert "ghp_ABCDEFGHIJKLMNOPQRST" not in text
    assert "AIzaABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh" not in text
    assert "ZZZZZZZZ9999" not in text
    assert "***" in text


def test_logger_rotates_jsonl(tmp_path):
    path = tmp_path / "l.jsonl"
    log = JsonlLogger(path, max_bytes=1, backups=2)
    for event in ("um", "dois", "tres"):
        log.log(event)

    assert json.loads(path.read_text(encoding="utf-8"))["event"] == "tres"
    assert json.loads((tmp_path / "l.jsonl.1").read_text(encoding="utf-8"))["event"] == "dois"
    assert json.loads((tmp_path / "l.jsonl.2").read_text(encoding="utf-8"))["event"] == "um"


def test_logger_rotation_respects_backup_limit(tmp_path):
    path = tmp_path / "l.jsonl"
    log = JsonlLogger(path, max_bytes=1, backups=1)
    for i in range(4):
        log.log("e", i=i)

    assert not (tmp_path / "l.jsonl.2").exists()
    assert json.loads(path.read_text(encoding="utf-8"))["i"] == 3
    assert json.loads((tmp_path / "l.jsonl.1").read_text(encoding="utf-8"))["i"] == 2


def test_logger_without_backups_keeps_only_current_file(tmp_path):
    path = tmp_path / "l.jsonl"
    log = JsonlLogger(path, max_bytes=1, backups=0)
    for i in range(3):
        log.log("e", i=i)

    assert not (tmp_path / "l.jsonl.1").exists()
    assert json.loads(path.read_text(encoding="utf-8"))["i"] == 2


def test_memory_run_and_alert(tmp_path):
    m = Memory(tmp_path / "m.db")
    m.init_schema()
    assert m.record_run("analyst", "PETR4", "ok") == 1
    m.save_alert("PETR4", {"message": "teste"})
    assert m.list_alerts() == [{"asset": "PETR4", "message": "teste"}]





