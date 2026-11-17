from __future__ import annotations
import re
from agents.studio.contracts import StudioRequest

_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def check_request(req: StudioRequest) -> list[str]:
    """Gate determinístico da área studio. Qualquer dúvida rejeita."""
    reasons: list[str] = []
    if req.prompt is not None and _CONTROL.search(req.prompt):
        reasons.append("descrição contém caractere de controle")

    if req.action == "create":
        if req.project_id is not None:
            reasons.append("criação não aceita project_id")
        if not (req.prompt or "").strip():
            reasons.append("descrição ausente (falha fechada)")
        elif _URL.search(req.prompt):
            reasons.append("descrição não pode conter URL; a área studio só gera a partir de texto")
    elif req.action in ("status", "validate"):
        if req.project_id is None:
            reasons.append("project_id ausente (falha fechada)")
        if req.prompt is not None:
            reasons.append(f"{req.action} não aceita descrição")
    else:  # health, list
        if req.prompt is not None or req.project_id is not None:
            reasons.append(f"{req.action} não aceita parâmetros")
    return reasons
