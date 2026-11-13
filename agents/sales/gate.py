from __future__ import annotations
import re
from agents.sales.contracts import SalesRequest

SAFE_TEXT = re.compile(r"^[\w\s\-./]+$")


def check_request(req: SalesRequest) -> list[str]:
    reasons: list[str] = []
    if not SAFE_TEXT.match(req.product):
        reasons.append("nome do produto contém caracteres não permitidos")
    if req.action == "margin":
        if req.price is None:
            reasons.append("preço ausente (falha fechada)")
        elif req.price < req.unit_cost:
            reasons.append("preço abaixo do custo (venda com prejuízo)")
    elif req.action == "price":
        if req.target_margin_pct is None:
            reasons.append("margem-alvo ausente (falha fechada)")
    elif req.action == "break_even":
        if req.price is None or req.fixed_costs is None:
            reasons.append("preço ou custos fixos ausentes (falha fechada)")
        elif req.price <= req.unit_cost:
            reasons.append("preço não supera o custo unitário; não há ponto de equilíbrio")
    return reasons
