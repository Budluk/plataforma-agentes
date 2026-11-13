from __future__ import annotations
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Memory:
    def __init__(self, db_path):
        self.db_path = str(db_path)

    def init_schema(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as con:
            con.execute("CREATE TABLE IF NOT EXISTS agent_runs ("
                        "id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, agent TEXT NOT NULL, "
                        "asset TEXT, status TEXT NOT NULL, detail TEXT)")
            con.execute("CREATE TABLE IF NOT EXISTS alerts ("
                        "id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, "
                        "asset TEXT NOT NULL, payload TEXT NOT NULL)")
            con.commit()

    def record_run(self, agent: str, asset: str | None, status: str, detail: str = "") -> int:
        with closing(sqlite3.connect(self.db_path)) as con:
            cur = con.execute("INSERT INTO agent_runs (ts, agent, asset, status, detail) VALUES (?,?,?,?,?)",
                              (_now(), agent, asset, status, detail))
            con.commit()
            return cur.lastrowid

    def save_alert(self, asset: str, payload: dict) -> int:
        with closing(sqlite3.connect(self.db_path)) as con:
            cur = con.execute("INSERT INTO alerts (ts, asset, payload) VALUES (?,?,?)",
                              (_now(), asset, json.dumps(payload, ensure_ascii=False)))
            con.commit()
            return cur.lastrowid

    def list_alerts(self) -> list[dict]:
        with closing(sqlite3.connect(self.db_path)) as con:
            rows = con.execute("SELECT asset, payload FROM alerts ORDER BY id").fetchall()
        return [{"asset": a, **json.loads(p)} for a, p in rows]
