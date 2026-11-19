from __future__ import annotations
from typing import Annotated, Literal
from pydantic import Field
from core.contracts import _Strict

Midi = Annotated[int, Field(ge=0, le=127)]
MAX_MIDI_NOTES = 12
MIN_SEMITONES = -24
MAX_SEMITONES = 24


class MusicRequest(_Strict):
    action: Literal["identify_chord", "transpose", "tab"]
    notes: list[Midi] = Field(min_length=1, max_length=MAX_MIDI_NOTES)
    semitones: int = Field(default=0, ge=MIN_SEMITONES, le=MAX_SEMITONES)
