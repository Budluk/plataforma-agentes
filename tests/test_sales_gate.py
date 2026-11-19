"""Gate determinístico de vendas: nomes de produto em uma única linha."""
import pytest

from agents.sales.contracts import SalesRequest
from agents.sales.funnel_contracts import FunnelRequest
from agents.sales.funnel_gate import check_request as check_funnel
from agents.sales.gate import check_request as check_sales

SALES_BASE = dict(action="margin", unit_cost=10.0, price=20.0)
FUNNEL_BASE = dict(ad_spend=500.0, visitors=2000, checkouts_started=200, front_sales=40,
                   front_price=19.9, platform_fee_pct=10.0, tax_pct=6.0)


@pytest.mark.parametrize("product", ["Curso", "Low ticket", "Kit A.B", "pacote/2026", "Cafe"])
def test_safe_product_names_are_allowed(product):
    assert check_sales(SalesRequest(product=product, **SALES_BASE)) == []
    assert check_funnel(FunnelRequest(product=product, **FUNNEL_BASE)) == []


@pytest.mark.parametrize("product", [
    "x; rm -rf /",        # caractere de comando (coberto antes)
    "produto\nlinha",     # quebra de linha no meio
    "produto\n",          # quebra de linha no fim (antes aceita por '$')
    "produto\ttab",       # tabulação
    " produto",           # espaço no início
    "produto ",           # espaço no fim
    "produto  com  dois", # espaços repetidos
])
def test_multiline_or_padded_product_names_are_rejected(product):
    assert any("nome do produto" in reason
               for reason in check_sales(SalesRequest(product=product, **SALES_BASE)))
    assert any("nome do produto" in reason
               for reason in check_funnel(FunnelRequest(product=product, **FUNNEL_BASE)))
