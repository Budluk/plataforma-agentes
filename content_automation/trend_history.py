from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from content_automation.trend_growth import GrowthResult, compare_growth
from content_automation.trend_store import TrendStore
from content_automation.trends import TrendCandidate


@dataclass(frozen=True)
class HistoryResult:
    status: str
    reason: str
    observations: int
    growth: GrowthResult | None = None


def restore_candidate(row: dict) -> TrendCandidate:
    """Revalida dados vindos do banco antes de qualquer uso."""
    data = dict(row)
    data["collected_at"] = datetime.fromisoformat(
        data["collected_at"]
    )
    return TrendCandidate(**data)


def analyze_key(
    store: TrendStore,
    source: str,
    url: str,
    language: str,
    region: str,
    *,
    min_interval_seconds: int = 300,
) -> HistoryResult:
    """Analise pelo identificador do conteudo.

    Nao exige topic nem collected_at, porque a identidade
    de um conteudo e fonte + url + idioma + regiao.
    """

    if not isinstance(store, TrendStore):
        raise TypeError("store deve ser TrendStore")

    for name, value in (
        ("source", source),
        ("url", url),
        ("language", language),
        ("region", region),
    ):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{name}: texto obrigatorio")

    if (
        type(min_interval_seconds) is not int
        or min_interval_seconds < 1
    ):
        raise ValueError("min_interval_seconds deve ser inteiro positivo")

    rows = store.observations_by_key(source, url, language, region)
    count = len(rows)

    if count < 2:
        return HistoryResult(
            status="insufficient_history",
            reason="Menos de duas observacoes para este conteudo",
            observations=count,
        )

    previous = restore_candidate(rows[-2])
    current = restore_candidate(rows[-1])

    growth = compare_growth(
        previous,
        current,
        min_interval_seconds=min_interval_seconds,
    )

    return HistoryResult(
        status=growth.status,
        reason=growth.reason,
        observations=count,
        growth=growth,
    )

def analyze_history(
    store: TrendStore,
    reference: TrendCandidate,
    *,
    min_interval_seconds: int = 300,
) -> HistoryResult:
    """Analisa o historico de UM conteudo. Nunca declara viralidade."""

    if not isinstance(store, TrendStore):
        raise TypeError("store deve ser TrendStore")

    if not isinstance(reference, TrendCandidate):
        raise TypeError("reference deve ser TrendCandidate")

    rows = store.observations_for(reference)
    count = len(rows)

    if count < 2:
        return HistoryResult(
            status="insufficient_history",
            reason="Menos de duas observacoes para este conteudo",
            observations=count,
        )

    previous = restore_candidate(dict(rows[-2]))
    current = restore_candidate(dict(rows[-1]))

    growth = compare_growth(
        previous,
        current,
        min_interval_seconds=min_interval_seconds,
    )

    return HistoryResult(
        status=growth.status,
        reason=growth.reason,
        observations=count,
        growth=growth,
    )