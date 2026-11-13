from __future__ import annotations
from typing import Annotated, Literal
from pydantic import Field
from core.contracts import _Strict

Midi = Annotated[int, Field(ge=0, le=127)]


class MusicRequest(_Strict):
    action: Literal["identify_chord", "transpose", "tab"]
    notes: list[Midi] = Field(min_length=1, max_length=12)
    semitones: int = Field(default=0, ge=-24, le=24)
