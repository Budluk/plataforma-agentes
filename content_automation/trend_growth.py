from __future__ import annotations

from dataclasses import dataclass
from datetime import timezone
from typing import Literal

from content_automation.trends import TrendCandidate


@dataclass(frozen=True)
class GrowthResult:
    status: Literal["measured", "insufficient_data", "inconsistent_data"]
    reason: str
    elapsed_seconds: float
    delta_views: int | None = None
    growth_pct: float | None = None
    views_per_hour: float | None = None


def compare_growth(
    previous: TrendCandidate,
    current: TrendCandidate,
    *,
    min_interval_seconds: int = 300,
) -> GrowthResult:
    """Compara contadores acumulados; nao comprova viralidade."""

    if getattr(previous, "metric", "views") != getattr(current, "metric", "views"):
        raise ValueError(
            "Comparacao exige a mesma metrica; "
            "visualizacoes e indice nao sao a mesma grandeza"
        )

    if not isinstance(previous, TrendCandidate):
        raise TypeError("previous deve ser TrendCandidate")
    if not isinstance(current, TrendCandidate):
        raise TypeError("current deve ser TrendCandidate")

    if (
        type(min_interval_seconds) is not int
        or min_interval_seconds < 1
    ):
        raise ValueError("min_interval_seconds deve ser inteiro positivo")

    identity_fields = ("source", "url", "language", "region")
    previous_key = tuple(getattr(previous, f) for f in identity_fields)
    current_key = tuple(getattr(current, f) for f in identity_fields)

    if previous_key != current_key:
        raise ValueError(
            "Comparacao exige mesma fonte, URL, idioma e regiao"
        )

    start = previous.collected_at.astimezone(timezone.utc)
    end = current.collected_at.astimezone(timezone.utc)
    elapsed = (end - start).total_seconds()

    if elapsed <= 0:
        raise ValueError("A observacao atual deve ser posterior")

    if previous.views is None or current.views is None:
        return GrowthResult(
            status="insufficient_data",
            reason="Uma das observacoes nao possui visualizacoes",
            elapsed_seconds=elapsed,
        )

    delta = current.views - previous.views

    if delta < 0:
        return GrowthResult(
            status="inconsistent_data",
            reason="Contador diminuiu; verificar correcao ou troca de fonte",
            elapsed_seconds=elapsed,
        )

    if elapsed < min_interval_seconds:
        return GrowthResult(
            status="insufficient_data",
            reason="Intervalo entre observacoes abaixo do minimo",
            elapsed_seconds=elapsed,
        )

    growth_pct = (
        delta / previous.views * 100
        if previous.views > 0
        else None
    )

    return GrowthResult(
        status="measured",
        reason="Crescimento medido; nao implica tendencia viral",
        elapsed_seconds=elapsed,
        delta_views=delta,
        growth_pct=growth_pct,
        views_per_hour=delta / (elapsed / 3600),
    )