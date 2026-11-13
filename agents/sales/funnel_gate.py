from __future__ import annotations
from agents.sales.funnel_contracts import FunnelRequest
from agents.sales.gate import SAFE_TEXT


def check_request(req: FunnelRequest) -> list[str]:
    reasons: list[str] = []
    if not SAFE_TEXT.match(req.product):
        reasons.append("nome do produto contém caracteres não permitidos")
    if req.checkouts_started > req.visitors:
        reasons.append("checkouts iniciados maiores que visitantes (dados incoerentes)")
    if req.front_sales > req.checkouts_started:
        reasons.append("vendas do front maiores que checkouts iniciados (dados incoerentes)")
    if req.bump_sales > req.front_sales:
        reasons.append("vendas de order bump maiores que vendas do front (dados incoerentes)")
    if req.upsell_sales > req.front_sales:
        reasons.append("vendas de upsell maiores que vendas do front (dados incoerentes)")
    if req.bump_sales > 0 and req.bump_price == 0:
        reasons.append("há vendas de order bump mas o preço do bump é 0")
    if req.upsell_sales > 0 and req.upsell_price == 0:
        reasons.append("há vendas de upsell mas o preço do upsell é 0")
    if req.platform_fee_pct + req.tax_pct >= 100:
        reasons.append("taxa da plataforma + imposto somam 100% ou mais")
    return reasons
