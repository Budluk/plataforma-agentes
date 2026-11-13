from __future__ import annotations
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

SENSITIVE = ("key", "token", "secret", "password", "authorization")


def _redact(value):
    if isinstance(value, dict):
        return {k: ("***" if any(s in str(k).lower() for s in SENSITIVE) else _redact(v))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    return value


class JsonlLogger:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def log(self, event: str, **fields) -> None:
        record = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **_redact(fields)}
        line = json.dumps(record, ensure_ascii=False, default=str)
        with self._lock:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
