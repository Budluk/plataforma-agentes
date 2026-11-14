from __future__ import annotations
from agents.dev.contracts import DevRequest


def check_request(req: DevRequest) -> list[str]:
    reasons: list[str] = []
    if req.action == "write":
        if not req.task or not req.task.strip():
            reasons.append("tarefa ausente (falha fechada)")
        if req.code is not None:
            reasons.append("pedido de escrita não deve trazer código")
    else:
        if not req.code or not req.code.strip():
            reasons.append("código ausente para revisão (falha fechada)")
        if req.task is not None:
            reasons.append("pedido de revisão não deve trazer tarefa")
    return reasons
