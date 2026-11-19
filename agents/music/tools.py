from __future__ import annotations
from agents.music import theory
from core.tool_registry import AGENT_TOOL


def build_music_tools() -> dict:
    def identify_chord(notes: list) -> dict:
        return {"chord": theory.identify_chord(notes)}

    def transpose_notes(notes: list, semitones: int) -> dict:
        out = theory.transpose(notes, semitones)
        return {"notes": out, "names": [theory.note_name(n) for n in out]}

    def to_guitar_tab(notes: list) -> dict:
        return {"tab": theory.to_guitar_tab(notes)}

    return {AGENT_TOOL[("music_agent", role)]: fn for role, fn in (
        ("identify_chord", identify_chord), ("transpose", transpose_notes),
        ("tab", to_guitar_tab))}
