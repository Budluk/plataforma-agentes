import json
from types import SimpleNamespace
import pytest
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from scripts.init_db import create_all


@pytest.fixture
def env(tmp_path):
    db = tmp_path / "t.db"
    create_all(db)
    log_path = tmp_path / "l.jsonl"

    def events():
        if not log_path.exists():
            return []
        return [json.loads(x) for x in log_path.read_text(encoding="utf-8").splitlines()]

    return SimpleNamespace(db=db, log_path=log_path, logger=JsonlLogger(log_path),
                           perms=Permissions(db), memory=Memory(db), monitor=ToolMonitor(),
                           notes=tmp_path / "notes", events=events)
