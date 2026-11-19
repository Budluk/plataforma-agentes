from __future__ import annotations
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


AUDIT_WARNING = "aviso: auditoria indisponível"


def safe_record_run(memory, logger, agent: str, asset: str | None, status: str,
                    detail: str = "", *, run_id: str | None = None) -> str | None:
    """Registra a execução sem transformar falha de auditoria em falha da ação.

    A ação já aconteceu quando este helper é chamado. Uma falha no SQLite (ou em
    qualquer outro backend de auditoria) deve virar aviso no resultado e evento
    no JSONL — nunca uma exceção que sugira ao chamador repetir a ação.
    """
    try:
        memory.record_run(agent, asset, status, detail)
        return None
    except Exception as exc:
        warning = f"{AUDIT_WARNING} ({type(exc).__name__})"
        fields = {"agent": agent, "status": status, "error": type(exc).__name__}
        if run_id:
            fields["run_id"] = run_id
        if detail:
            fields["detail_chars"] = len(detail)
        module = type(exc).__module__
        if module:
            fields["exception_module"] = module
        if logger is not None:
            try:
                logger.log("audit_degraded", **fields)
            except Exception:
                pass  # o log de auditoria da falha também nunca derruba a resposta
        return warning


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
