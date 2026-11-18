from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import timezone
from pathlib import Path

from content_automation.trends import TrendCandidate


class TrendStore:
    """Historico de observacoes. Nao autoriza publicacao."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

        with closing(self._connect()) as conn:
            with conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS trend_observations (
                        id INTEGER PRIMARY KEY,
                        source TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        url TEXT NOT NULL,
                        language TEXT NOT NULL,
                        region TEXT NOT NULL,
                        collected_at TEXT NOT NULL,
                        views INTEGER CHECK(views IS NULL OR views >= 0),
                        UNIQUE(
                            source, url, language, region, collected_at
                        )
                    )
                """)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def save(self, candidate: TrendCandidate) -> bool:
        """True se inseriu; False se a observacao ja existia."""
        if not isinstance(candidate, TrendCandidate):
            raise TypeError("candidate deve ser TrendCandidate")

        collected_at = candidate.collected_at.astimezone(
            timezone.utc
        ).isoformat(timespec="microseconds")

        values = (
            candidate.source,
            candidate.topic,
            candidate.url,
            candidate.language,
            candidate.region,
            collected_at,
            candidate.views,
        )

        with closing(self._connect()) as conn:
            with conn:
                cursor = conn.execute("""
                    INSERT INTO trend_observations (
                        source, topic, url, language,
                        region, collected_at, views
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(
                        source, url, language, region, collected_at
                    ) DO NOTHING
                """, values)
                return cursor.rowcount == 1

    def observations_for(
        self, candidate: TrendCandidate
    ) -> list[dict]:
        """Historico de UM conteudo, em ordem cronologica.

        Somente leitura. Nao grava nada e nao autoriza publicacao.
        """
        if not isinstance(candidate, TrendCandidate):
            raise TypeError("candidate deve ser TrendCandidate")

        with closing(self._connect()) as conn:
            rows = conn.execute("""
                SELECT source, topic, url, language,
                       region, collected_at, views
                FROM trend_observations
                WHERE source = ? AND url = ?
                  AND language = ? AND region = ?
                ORDER BY collected_at ASC, id ASC
            """, (
                candidate.source,
                candidate.url,
                candidate.language,
                candidate.region,
            )).fetchall()

        return [dict(row) for row in rows]
    def observations_by_key(
        self, source: str, url: str, language: str, region: str
    ) -> list[dict]:
        """Historico de UM conteudo pela sua identidade.

        Somente leitura. Nao grava nada e nao autoriza publicacao.
        """
        for name, value in (
            ("source", source),
            ("url", url),
            ("language", language),
            ("region", region),
        ):
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name}: texto obrigatorio")

        with closing(self._connect()) as conn:
            rows = conn.execute("""
                SELECT source, topic, url, language,
                       region, collected_at, views
                FROM trend_observations
                WHERE source = ? AND url = ?
                  AND language = ? AND region = ?
                ORDER BY collected_at ASC, id ASC
            """, (source, url, language, region)).fetchall()

        return [dict(row) for row in rows]
    def list_observations(self, limit: int = 100) -> list[dict]:
        if type(limit) is not int or not 1 <= limit <= 1000:
            raise ValueError("limit deve ser inteiro entre 1 e 1000")

        with closing(self._connect()) as conn:
            rows = conn.execute("""
                SELECT source, topic, url, language,
                       region, collected_at, views
                FROM trend_observations
                ORDER BY collected_at ASC, id ASC
                LIMIT ?
            """, (limit,)).fetchall()

        return [dict(row) for row in rows]