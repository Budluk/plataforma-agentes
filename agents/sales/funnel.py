from __future__ import annotations


def _pct(a: float, b: float) -> float | None:
    return round(a / b * 100, 2) if b > 0 else None


def analyze(*, ad_spend, visitors, checkouts_started, front_sales, bump_sales, upsell_sales,
            front_price, bump_price, upsell_price, platform_fee_pct, tax_pct,
            variable_cost_per_order, scale_roas, scale_step_pct, min_sales_for_decision) -> dict:
    revenue = front_sales * front_price + bump_sales * bump_price + upsell_sales * upsell_price
    net_revenue = revenue * (1 - (platform_fee_pct + tax_pct) / 100) - front_sales * variable_cost_per_order
    profit = net_revenue - ad_spend
    roas = revenue / ad_spend
    breakeven = revenue / net_revenue if net_revenue > 0 else None

    if front_sales < min_sales_for_decision:
        decision = "dados_insuficientes"
        note = (f"apenas {front_sales} venda(s) no front; mínimo de {min_sales_for_decision} para decidir. "
                "Mantenha e colete mais dados.")
    elif profit < 0:
        decision = "cortar"
        note = "lucro negativo com os números informados; pausar e revisar oferta e criativos."
    elif roas >= scale_roas:
        decision = "escalar"
        note = f"ROAS {roas:.2f} >= {scale_roas} com lucro positivo; considere +{scale_step_pct:g}% de verba."
    else:
        decision = "manter"
        note = "lucro positivo, mas ROAS abaixo do limite de escala."

    return {
        "revenue": round(revenue, 2),
        "net_revenue": round(net_revenue, 2),
        "profit": round(profit, 2),
        "roas": round(roas, 2),
        "breakeven_roas": round(breakeven, 2) if breakeven is not None else None,
        "cpa": round(ad_spend / front_sales, 2) if front_sales > 0 else None,
        "avg_ticket": round(revenue / front_sales, 2) if front_sales > 0 else None,
        "rates": {
            "visit_to_checkout_pct": _pct(checkouts_started, visitors),
            "checkout_to_front_pct": _pct(front_sales, checkouts_started),
            "bump_pct": _pct(bump_sales, front_sales),
            "upsell_pct": _pct(upsell_sales, front_sales),
        },
        "decision": decision,
        "note": note,
        "suggested_budget_change_pct": scale_step_pct if decision == "escalar" else 0,
    }
