from __future__ import annotations
import math
from statistics import median


def margin_pct(cost: float, price: float) -> float:
    return (price - cost) / price * 100


def markup_pct(cost: float, price: float) -> float:
    return (price - cost) / cost * 100


def price_for_margin(cost: float, margin: float) -> float:
    if not 0 <= margin < 100:
        raise ValueError("margem-alvo deve estar em [0, 100)")
    return cost / (1 - margin / 100)


def break_even_units(fixed_costs: float, cost: float, price: float) -> int:
    unit_profit = price - cost
    if unit_profit <= 0:
        raise ValueError("preço não supera o custo unitário")
    return math.ceil(round(fixed_costs / unit_profit, 9))


def market_position(price: float, competitors: list[float]) -> dict | None:
    if not competitors:
        return None
    lo, hi = min(competitors), max(competitors)
    position = "abaixo" if price < lo else "acima" if price > hi else "dentro"
    return {"min": round(lo, 2), "median": round(median(competitors), 2),
            "max": round(hi, 2), "position": position}
