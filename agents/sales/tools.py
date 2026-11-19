from __future__ import annotations
from agents.sales import pricing
from core.tool_registry import AGENT_TOOL


def build_sales_tools() -> dict:
    def compute_margin(unit_cost: float, price: float) -> dict:
        return {"margin_pct": round(pricing.margin_pct(unit_cost, price), 2),
                "markup_pct": round(pricing.markup_pct(unit_cost, price), 2),
                "profit_per_unit": round(price - unit_cost, 2)}

    def suggest_price(unit_cost: float, target_margin_pct: float, competitor_prices: list) -> dict:
        price = pricing.price_for_margin(unit_cost, target_margin_pct)
        return {"suggested_price": round(price, 2),
                "market": pricing.market_position(price, competitor_prices)}

    def break_even(unit_cost: float, price: float, fixed_costs: float) -> dict:
        units = pricing.break_even_units(fixed_costs, unit_cost, price)
        return {"units": units, "revenue": round(units * price, 2)}

    return {AGENT_TOOL[("sales_agent", role)]: fn for role, fn in (
        ("margin", compute_margin), ("price", suggest_price), ("break_even", break_even))}
