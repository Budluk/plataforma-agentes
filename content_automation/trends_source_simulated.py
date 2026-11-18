from __future__ import annotations

from datetime import datetime, timezone

from content_automation.trends import TrendCandidate

PREFIXO_TERMOS = "https" + "://" + "trends.google.com" + "/trends/explore?q="


class SimulatedTrendsSource:
    """Fonte falsa do Google Trends. Nao acessa a rede, nunca.

    Reproduz apenas o formato: um termo, um indice relativo (0 a 100)
    e a regiao. Serve para provar o contrato antes de qualquer chamada real.
    """

    def __init__(self, leituras, quando=None):
        if not isinstance(leituras, list):
            raise TypeError("leituras deve ser lista")
        self._leituras = list(leituras)
        self._quando = quando or datetime(
            2026, 11, 17, 9, 0, tzinfo=timezone.utc
        )

    def collect(self) -> list[TrendCandidate]:
        candidatos: list[TrendCandidate] = []

        for leitura in self._leituras:
            termo = leitura.get("termo", "")
            indice = leitura.get("indice")
            regiao = leitura.get("regiao", "BR")

            if not isinstance(termo, str) or not termo.strip():
                raise ValueError("termo obrigatorio")

            if (
                type(indice) is not int
                or indice < 0
                or indice > 100
            ):
                raise ValueError(
                    "indice deve ser inteiro entre 0 e 100"
                )

            candidatos.append(TrendCandidate(
                source="google_trends",
                topic=termo.strip(),
                url=PREFIXO_TERMOS + termo.strip().replace(" ", "+"),
                language="pt-BR",
                region=regiao,
                collected_at=self._quando,
                metric="search_index",
                views=indice,
            ))

        return candidatos
