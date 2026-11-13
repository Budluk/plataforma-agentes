from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

ALLOWED_ASSETS = frozenset({"PETR4", "VALE3", "ITUB4", "BTCUSDT", "EURUSD"})


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AnalystProposal(_Strict):
    asset: str = Field(min_length=1, max_length=20)
    direction: Literal["LONG", "SHORT"]
    entry_price: float = Field(gt=0, allow_inf_nan=False)
    stop_price: float = Field(gt=0, allow_inf_nan=False)
    target_price: float = Field(gt=0, allow_inf_nan=False)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    thesis: str = Field(max_length=1000)


class PortfolioState(_Strict):
    equity: float | None = Field(default=None, allow_inf_nan=False)
    daily_pnl_pct: float | None = Field(default=None, allow_inf_nan=False)
    equity_snapshot_consistent: bool = False


class ComputedRisk(_Strict):
    stop_distance_pct: float
    reward_risk_ratio: float
    levels_coherent: bool


class RiskDecision(_Strict):
    approved: bool
    reasons: list[str]


class AlertEvent(_Strict):
    asset: str
    direction: Literal["LONG", "SHORT"]
    entry_price: float
    stop_price: float
    target_price: float
    reward_risk_ratio: float
    message: str


class ToolCall(_Strict):
    agent: str
    tool: str
    params: dict[str, Any] = Field(default_factory=dict)


class MonitorVerdict(_Strict):
    allowed: bool
    head: str
    reason: str
