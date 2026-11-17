from __future__ import annotations
from datetime import datetime, timezone
from core.control_store import ControlStore
from core.redact import redact


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="seconds") if ts else None


def describe(row: dict) -> dict:
    return {"id": row["id"], "action": row["action"], "status": row["status"], "actor": row["actor"],
            "created": _iso(row["created_ts"]), "expires": _iso(row["expires_ts"]),
            "decided_by": row["decided_by"], "params": redact(row["params"]), "params_hash": row["params_hash"][:12]}


def pending(store: ControlStore) -> list[dict]:
    return [describe(r) for r in store.list_approvals("pending")]


def decide(store: ControlStore, approval_id: int, approve: bool, by: str) -> str:
    result = store.human_decide(approval_id, approve, by)
    store.append_audit("human", by, "decision", "approvals", result, {"approval_id": approval_id, "approve": approve})
    return result


def engage_kill(store: ControlStore, reason: str, by: str) -> None:
    store.engage(reason, by)
    store.append_audit("human", by, "kill_switch", "kill_switch", "engaged", {"reason": reason})


def release_kill(store: ControlStore, by: str) -> None:
    store.release(by)
    store.append_audit("human", by, "kill_switch", "kill_switch", "released", {})
