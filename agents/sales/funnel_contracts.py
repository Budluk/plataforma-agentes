from __future__ import annotations
from typing import Annotated
from pydantic import Field
from core.contracts import _Strict

Money = Annotated[float, Field(gt=0, le=1e9, allow_inf_nan=False)]
Price0 = Annotated[float, Field(ge=0, le=1e9, allow_inf_nan=False)]
Pct = Annotated[float, Field(ge=0, le=50, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0, le=1_000_000_000)]


class FunnelRequest(_Strict):
    product: str = Field(min_length=1, max_length=60)
    ad_spend: Money
    visitors: Annotated[int, Field(ge=1, le=1_000_000_000)]
    checkouts_started: Count
    front_sales: Count
    bump_sales: Count = 0
    upsell_sales: Count = 0
    front_price: Money
    bump_price: Price0 = 0.0
    upsell_price: Price0 = 0.0
    platform_fee_pct: Pct
    tax_pct: Pct
    variable_cost_per_order: Price0 = 0.0
    scale_roas: Annotated[float, Field(gt=0, le=50, allow_inf_nan=False)] = 1.8
    scale_step_pct: Annotated[float, Field(gt=0, le=50, allow_inf_nan=False)] = 20.0
    min_sales_for_decision: Annotated[int, Field(ge=1, le=10000)] = 10
