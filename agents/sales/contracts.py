from __future__ import annotations
from typing import Annotated, Literal
from pydantic import Field
from core.contracts import _Strict

Money = Annotated[float, Field(gt=0, le=1e9, allow_inf_nan=False)]


class SalesRequest(_Strict):
    action: Literal["margin", "price", "break_even"]
    product: str = Field(min_length=1, max_length=60)
    unit_cost: Money
    price: Money | None = None
    target_margin_pct: float | None = Field(default=None, ge=0, lt=95, allow_inf_nan=False)
    fixed_costs: float | None = Field(default=None, ge=0, le=1e9, allow_inf_nan=False)
    competitor_prices: list[Money] = Field(default_factory=list, max_length=20)
