from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from urllib.parse import urlsplit


METRICAS_CONHECIDAS = frozenset({
    "views",
    "search_index",
    "approx_traffic",
    "outlier_ratio",
})


@dataclass(frozen=True)


class TrendCandidate:
    """Sinal coletado. Nao significa tendencia viral confirmada."""

    source: str
    topic: str
    url: str
    language: str
    region: str
    collected_at: datetime
    metric: str = "views"
    views: int | None = None

    def __post_init__(self) -> None:
        limits = {
            "source": 80,
            "topic": 300,
            "url": 2048,
            "language": 35,
            "region": 20,
        }

        for name, limit in limits.items():
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name}: texto obrigatorio")
            if len(value) > limit:
                raise ValueError(f"{name}: tamanho excedido")

        try:
            parsed = urlsplit(self.url)
            port = parsed.port
        except ValueError as exc:
            raise ValueError("url invalida") from exc

        if (
            self.url != self.url.strip()
            or any(char.isspace() for char in self.url)
            or parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or port not in (None, 443)
        ):
            raise ValueError("url deve ser HTTPS sem credenciais")

        if not isinstance(self.collected_at, datetime):
            raise ValueError("collected_at deve ser datetime")

        if (
            self.collected_at.tzinfo is None
            or self.collected_at.utcoffset() is None
        ):
            raise ValueError("collected_at exige fuso horario")

        if not isinstance(self.metric, str) or not self.metric.strip():
            raise ValueError("metric: texto obrigatorio")
        if self.metric not in METRICAS_CONHECIDAS:
            raise ValueError("metric desconhecida: " + repr(self.metric))

        if self.views is not None:
            if type(self.views) is not int or self.views < 0:
                raise ValueError("views deve ser inteiro nao negativo")

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "topic": self.topic,
            "url": self.url,
            "language": self.language,
            "region": self.region,
            "collected_at": self.collected_at.isoformat(),
            "metric": self.metric,
            "views": self.views,
            "status": "candidate",
        }


class TrendSource(Protocol):
    def collect(self) -> list[TrendCandidate]:
        """Retorna candidatos, nunca autorizacoes de publicacao."""
        ...


class FakeTrendSource:
    """Fonte deterministica para testes, sem rede e sem LLM."""

    def collect(self) -> list[TrendCandidate]:
        return [
            TrendCandidate(
                source="fake",
                topic="Exemplo simulado de pauta sobre Python",
                url="https://example.com/simulado/python",
                language="pt-BR",
                region="BR",
                collected_at=datetime(
                    2026, 1, 1, 12, 0, tzinfo=timezone.utc
                ),
                views=1200,
            )
        ]
