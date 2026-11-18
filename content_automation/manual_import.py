from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from content_automation.trend_store import TrendStore
from content_automation.trends import TrendCandidate

COLUMNS = (
    "source",
    "topic",
    "url",
    "language",
    "region",
    "collected_at",
    "views",
)


@dataclass(frozen=True)
class ImportResult:
    inserted: int
    duplicates: int
    rejected: list[tuple[int, str]]

    @property
    def total(self) -> int:
        return self.inserted + self.duplicates

    @property
    def ok(self) -> bool:
        return not self.rejected


def _parse_views(raw: str, line: int) -> int | None:
    text = (raw or "").strip()
    if text == "":
        return None
    if not text.isdigit():
        raise ValueError("views deve ser inteiro nao negativo ou vazio")
    return int(text)


def _parse_candidate(
    row: dict[str, str], fields: dict[str, str], line: int
) -> TrendCandidate:
    if row.get(None):
        raise ValueError("numero de colunas diferente do cabecalho")

    collected_raw = (fields["collected_at"] or "").strip()
    if not collected_raw:
        raise ValueError("collected_at obrigatorio")

    try:
        collected_at = datetime.fromisoformat(collected_raw)
    except ValueError as exc:
        raise ValueError(f"collected_at invalido: {exc}") from exc

    try:
        views = _parse_views(fields["views"], line)
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    return TrendCandidate(
        source=(fields["source"] or "").strip(),
        topic=(fields["topic"] or "").strip(),
        url=(fields["url"] or "").strip(),
        language=(fields["language"] or "").strip(),
        region=(fields["region"] or "").strip(),
        collected_at=collected_at,
        views=views,
    )


def import_observations(
    store: TrendStore, csv_path: str | Path
) -> ImportResult:
    """Le um CSV preenchido a mao e grava observacoes.

    Somente leitura externa: o arquivo e dado, nunca instrucao.
    Linha invalida vira motivo registrado, nunca publicacao.
    """

    if not isinstance(store, TrendStore):
        raise TypeError("store deve ser TrendStore")

    path = Path(csv_path)
    if not path.is_file():
        raise FileNotFoundError(f"arquivo nao encontrado: {path}")

    inserted = 0
    duplicates = 0
    rejected: list[tuple[int, str]] = []

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)

        if reader.fieldnames is None:
            raise ValueError("CSV sem cabecalho")

        normalized = [
            (name or "").strip() for name in reader.fieldnames
        ]

        if tuple(normalized) != COLUMNS:
            raise ValueError(
                "cabecalho deve ser exatamente: " + ",".join(COLUMNS)
            )

        for line, row in enumerate(reader, start=2):
            fields = {
                key: (row.get(key) or "") for key in COLUMNS
            }

            if not any(value.strip() for value in fields.values()):
                continue

            try:
                candidate = _parse_candidate(row, fields, line)
            except (ValueError, TypeError) as exc:
                message = str(exc)
                # Valor recusado ajuda a corrigir a linha sem adivinhar.
                if message.startswith("url"):
                    message = f"{message}: {fields['url']!r}"
                rejected.append((line, message))
                continue

            if store.save(candidate):
                inserted += 1
            else:
                duplicates += 1

    return ImportResult(
        inserted=inserted,
        duplicates=duplicates,
        rejected=rejected,
    )