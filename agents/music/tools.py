from __future__ import annotations
from agents.music import theory


def build_music_tools() -> dict:
    def identify_chord(notes: list) -> dict:
        return {"chord": theory.identify_chord(notes)}

    def transpose_notes(notes: list, semitones: int) -> dict:
        out = theory.transpose(notes, semitones)
        return {"notes": out, "names": [theory.note_name(n) for n in out]}

    def to_guitar_tab(notes: list) -> dict:
        return {"tab": theory.to_guitar_tab(notes)}

    return {"identify_chord": identify_chord, "transpose_notes": transpose_notes,
            "to_guitar_tab": to_guitar_tab}
