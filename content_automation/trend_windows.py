from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

WindowMode = Literal["latest", "window", "full"]


@dataclass(frozen=True)
class Frame:
    """Recorte do historico usado para calcular crescimento."""

    mode: WindowMode
    previous: dict
    current: dict
    observations: int
    observations_in_frame: int


def _instant(row: dict) -> datetime:
    return parse_stamp(row["collected_at"])


def parse_stamp(stamp: str) -> datetime:
    parsed = datetime.fromisoformat(stamp)
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("observacao sem fuso horario no banco")
    return parsed.astimezone(timezone.utc)


def select_frame(
    rows: list[dict],
    *,
    mode: WindowMode = "latest",
    window_hours: int = 24,
) -> Frame | None:
    """Escolhe o recorte do historico. Nao classifica viralidade.

    None quando nao ha observacoes suficientes no recorte escolhido.
    """

    if mode not in ("latest", "window", "full"):
        raise ValueError("mode deve ser latest, window ou full")

    if type(window_hours) is not int or window_hours < 1:
        raise ValueError("window_hours deve ser inteiro positivo")

    ordered = sorted(rows, key=_instant)
    total = len(ordered)

    if total < 2:
        return None

    if mode == "latest":
        return Frame(
            mode=mode,
            previous=ordered[-2],
            current=ordered[-1],
            observations=total,
            observations_in_frame=2,
        )

    if mode == "full":
        return Frame(
            mode=mode,
            previous=ordered[0],
            current=ordered[-1],
            observations=total,
            observations_in_frame=total,
        )

    end = parse_stamp(ordered[-1]["collected_at"])
    limit = end - timedelta(hours=window_hours)

    inside = [
        row for row in ordered if parse_stamp(row["collected_at"]) >= limit
    ]

    if len(inside) < 2:
        return None

    return Frame(
        mode=mode,
        previous=inside[0],
        current=inside[-1],
        observations=total,
        observations_in_frame=len(inside),
    )