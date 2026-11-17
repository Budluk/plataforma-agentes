from __future__ import annotations
import hashlib
import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from core.redact import redact

SCHEMA_VERSION = 1
GENESIS_HASH = "0" * 64


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)


def params_hash(params: dict) -> str:
    return hashlib.sha256(canonical(params).encode("utf-8")).hexdigest()


def _event_hash(prev: str, ts: float, run_id: str, actor: str, event: str, action: str, status: str, detail: str) -> str:
    return hashlib.sha256((prev + canonical([ts, run_id, actor, event, action, status, detail])).encode("utf-8")).hexdigest()


_DDL = (
    "CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, "
    "run_id TEXT NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL, action TEXT NOT NULL DEFAULT '', "
    "status TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '{}', prev_hash TEXT NOT NULL, hash TEXT NOT NULL)",
    "CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events "
    "BEGIN SELECT RAISE(ABORT, 'audit_events é somente inserção'); END",
    "CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events "
    "BEGIN SELECT RAISE(ABORT, 'audit_events é somente inserção'); END",
    "CREATE TABLE IF NOT EXISTS approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, created_ts REAL NOT NULL, "
    "action TEXT NOT NULL, params_json TEXT NOT NULL, params_hash TEXT NOT NULL, actor TEXT NOT NULL, "
    "run_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','approved','denied','expired','used','failed')), "
    "expires_ts REAL NOT NULL, decided_ts REAL, decided_by TEXT, result_json TEXT)",
    "CREATE TABLE IF NOT EXISTS kill_switch (id INTEGER PRIMARY KEY CHECK (id = 1), engaged INTEGER NOT NULL, "
    "ts REAL NOT NULL, reason TEXT NOT NULL, set_by TEXT NOT NULL)",
    "INSERT OR IGNORE INTO kill_switch (id, engaged, ts, reason, set_by) VALUES (1, 0, 0, '', '')",
    "CREATE TABLE IF NOT EXISTS action_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, "
    "action TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('proposal','execution')))",
    "CREATE INDEX IF NOT EXISTS ix_action_calls ON action_calls (action, kind, ts)",
)


class ControlStore:
    """Auditoria encadeada (só inserção), aprovações, kill switch e contadores de frequência.
    Fica em data/control.db, separado do sqlite.db operacional."""

    def __init__(self, path, clock=time.time):
        self.path = str(path)
        self.clock = clock

    def _connect(self):
        con = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        con.execute("PRAGMA foreign_keys=ON")
        return con

    def init(self) -> None:
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as con:
            for statement in _DDL:
                con.execute(statement)
            con.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def schema_version(self) -> int:
        with closing(self._connect()) as con:
            return con.execute("PRAGMA user_version").fetchone()[0]

    # ---------------- auditoria ----------------
    def append_audit(self, run_id: str, actor: str, event: str, action: str = "", status: str = "", detail=None) -> int:
        ts = self.clock()
        det = canonical(redact(detail or {}))
        with closing(self._connect()) as con:
            con.execute("BEGIN IMMEDIATE")
            try:
                row = con.execute("SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1").fetchone()
                prev = row[0] if row else GENESIS_HASH
                h = _event_hash(prev, ts, run_id, actor, event, action, status, det)
                cur = con.execute(
                    "INSERT INTO audit_events (ts, run_id, actor, event, action, status, detail, prev_hash, hash) "
                    "VALUES (?,?,?,?,?,?,?,?,?)", (ts, run_id, actor, event, action, status, det, prev, h))
                con.execute("COMMIT")
                return cur.lastrowid
            except Exception:
                con.execute("ROLLBACK")
                raise

    def verify_chain(self):
        prev, n = GENESIS_HASH, 0
        with closing(self._connect()) as con:
            for id_, ts, run_id, actor, event, action, status, det, p, h in con.execute(
                    "SELECT id, ts, run_id, actor, event, action, status, detail, prev_hash, hash FROM audit_events ORDER BY id"):
                if p != prev or h != _event_hash(prev, ts, run_id, actor, event, action, status, det):
                    return False, n, id_
                prev, n = h, n + 1
        return True, n, None

    def audit_tail(self, limit: int = 20) -> list[dict]:
        with closing(self._connect()) as con:
            rows = con.execute("SELECT id, ts, run_id, actor, event, action, status, detail FROM audit_events "
                               "ORDER BY id DESC LIMIT ?", (int(limit),)).fetchall()
        return [{"id": r[0], "ts": r[1], "run_id": r[2], "actor": r[3], "event": r[4], "action": r[5],
                 "status": r[6], "detail": json.loads(r[7])} for r in reversed(rows)]

    # ---------------- aprovações ----------------
    def create_approval(self, action: str, params: dict, actor: str, run_id: str, ttl_seconds: int) -> int:
        now = self.clock()
        with closing(self._connect()) as con:
            cur = con.execute(
                "INSERT INTO approvals (created_ts, action, params_json, params_hash, actor, run_id, status, expires_ts) "
                "VALUES (?,?,?,?,?,?, 'pending', ?)",
                (now, action, canonical(params), params_hash(params), actor, run_id, now + ttl_seconds))
            return cur.lastrowid

    @staticmethod
    def _row(r) -> dict:
        return {"id": r[0], "created_ts": r[1], "action": r[2], "params": json.loads(r[3]), "params_hash": r[4],
                "actor": r[5], "run_id": r[6], "status": r[7], "expires_ts": r[8], "decided_ts": r[9],
                "decided_by": r[10], "result": json.loads(r[11]) if r[11] else None}

    _COLS = ("id, created_ts, action, params_json, params_hash, actor, run_id, status, expires_ts, "
             "decided_ts, decided_by, result_json")

    def get_approval(self, approval_id: int):
        with closing(self._connect()) as con:
            r = con.execute(f"SELECT {self._COLS} FROM approvals WHERE id=?", (approval_id,)).fetchone()
        return self._row(r) if r else None

    def list_approvals(self, status: str | None = None, limit: int = 50) -> list[dict]:
        sql, args = f"SELECT {self._COLS} FROM approvals", []
        if status:
            sql += " WHERE status=?"
            args.append(status)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(int(limit))
        with closing(self._connect()) as con:
            return [self._row(r) for r in con.execute(sql, args).fetchall()]

    def human_decide(self, approval_id: int, approve: bool, by: str) -> str:
        """Só deve ser chamado por core/approvals_admin.py (usado pela CLI de uma pessoa)."""
        now = self.clock()
        with closing(self._connect()) as con:
            con.execute("BEGIN IMMEDIATE")
            try:
                row = con.execute("SELECT status, expires_ts FROM approvals WHERE id=?", (approval_id,)).fetchone()
                if row is None:
                    result = "not_found"
                elif row[0] != "pending":
                    result = f"already_{row[0]}"
                elif row[1] <= now:
                    con.execute("UPDATE approvals SET status='expired' WHERE id=?", (approval_id,))
                    result = "expired"
                else:
                    result = "approved" if approve else "denied"
                    con.execute("UPDATE approvals SET status=?, decided_ts=?, decided_by=? WHERE id=?",
                                (result, now, by, approval_id))
                con.execute("COMMIT")
                return result
            except Exception:
                con.execute("ROLLBACK")
                raise

    def consume(self, approval_id: int) -> bool:
        """Uso único: só passa de 'approved' para 'used' se ainda estiver válida."""
        with closing(self._connect()) as con:
            cur = con.execute("UPDATE approvals SET status='used' WHERE id=? AND status='approved' AND expires_ts>?",
                              (approval_id, self.clock()))
            return cur.rowcount == 1

    def finish(self, approval_id: int, ok: bool, result: dict | None) -> None:
        with closing(self._connect()) as con:
            con.execute("UPDATE approvals SET status=?, result_json=? WHERE id=? AND status='used'",
                        ("used" if ok else "failed", canonical(redact(result or {})), approval_id))

    # ---------------- kill switch ----------------
    def engage(self, reason: str, by: str) -> None:
        with closing(self._connect()) as con:
            con.execute("UPDATE kill_switch SET engaged=1, ts=?, reason=?, set_by=? WHERE id=1",
                        (self.clock(), redact(reason)[:200], by))

    def release(self, by: str) -> None:
        with closing(self._connect()) as con:
            con.execute("UPDATE kill_switch SET engaged=0, ts=?, reason='', set_by=? WHERE id=1", (self.clock(), by))

    def kill_state(self) -> tuple[bool, str]:
        """Falha fechada: se o estado não puder ser lido, conta como ativado."""
        try:
            with closing(self._connect()) as con:
                row = con.execute("SELECT engaged, reason FROM kill_switch WHERE id=1").fetchone()
            if row is None:
                return True, "estado do kill switch ausente (falha fechada)"
            return bool(row[0]), row[1]
        except sqlite3.Error:
            return True, "estado do kill switch ilegível (falha fechada)"

    # ---------------- limite de frequência ----------------
    def try_record_call(self, action: str, kind: str, limit: int, window_seconds: int) -> bool:
        now = self.clock()
        with closing(self._connect()) as con:
            con.execute("BEGIN IMMEDIATE")
            try:
                n = con.execute("SELECT COUNT(*) FROM action_calls WHERE action=? AND kind=? AND ts>?",
                                (action, kind, now - window_seconds)).fetchone()[0]
                if n >= limit:
                    con.execute("ROLLBACK")
                    return False
                con.execute("INSERT INTO action_calls (ts, action, kind) VALUES (?,?,?)", (now, action, kind))
                con.execute("COMMIT")
                return True
            except Exception:
                con.execute("ROLLBACK")
                raise
