from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import AwareDatetime, Field
from core.contracts import AnalystProposal, _Strict

MAX_ENTRY_DEVIATION_PCT = 2.0
FUTURE_TOLERANCE_SECONDS = 300
# Cotação antiga demais é recusada. B3 e Frankfurter aceitam até 5 dias porque fecham
# à noite, em fins de semana e feriados; a idade vai junto no alerta para você ver.
MAX_AGE_SECONDS = {"binance": 120, "brapi": 5 * 86400, "frankfurter": 5 * 86400}


class Quote(_Strict):
    asset: str = Field(min_length=1, max_length=20)
    price: float = Field(gt=0, allow_inf_nan=False)
    as_of: AwareDatetime
    source: Literal["brapi", "binance", "frankfurter", "mock"]
    kind: Literal["last_trade", "daily_reference", "mock"]


def age_seconds(q: Quote, now: datetime) -> float:
    return (now - q.as_of).total_seconds()


def check_quote(q: Quote, now: datetime) -> list[str]:
    if q.source == "mock":
        return []
    reasons: list[str] = []
    age = age_seconds(q, now)
    if age < -FUTURE_TOLERANCE_SECONDS:
        reasons.append("horário da cotação está no futuro")
    limit = MAX_AGE_SECONDS.get(q.source)
    if limit is None:
        reasons.append(f"fonte sem limite de frescor definido: {q.source}")
    elif age > limit:
        reasons.append(f"cotação antiga demais: {int(age // 60)} min (limite {int(limit // 60)} min)")
    return reasons


def check_entry_vs_market(p: AnalystProposal, q: Quote) -> list[str]:
    if p.asset != q.asset:
        return ["cotação de outro ativo (falha fechada)"]
    deviation = abs(p.entry_price - q.price) / q.price * 100
    if deviation > MAX_ENTRY_DEVIATION_PCT:
        return [f"preço de entrada {p.entry_price} está a {deviation:.2f}% do preço de mercado "
                f"{q.price} (limite {MAX_ENTRY_DEVIATION_PCT}%)"]
    return []
