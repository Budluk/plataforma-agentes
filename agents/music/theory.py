from __future__ import annotations

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
TUNING_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64]  # E2 A2 D3 G3 B3 E4
MAX_FRET = 22
TEMPLATES = {
    "maj": {0, 4, 7}, "min": {0, 3, 7}, "dim": {0, 3, 6}, "aug": {0, 4, 8},
    "7": {0, 4, 7, 10}, "maj7": {0, 4, 7, 11}, "min7": {0, 3, 7, 10},
    "sus4": {0, 5, 7}, "sus2": {0, 2, 7},
}
SUFFIX = {"maj": "", "min": "m"}


def note_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def identify_chord(midi_notes: list[int]) -> str | None:
    if not midi_notes:
        return None
    pcs = {n % 12 for n in midi_notes}
    bass = min(midi_notes) % 12
    found = []
    for root in range(12):
        rel = {(p - root) % 12 for p in pcs}
        for quality, tpl in TEMPLATES.items():
            if rel == tpl:
                found.append((0 if root == bass else 1, root, quality))
    if not found:
        return None
    _, root, quality = sorted(found)[0]
    return NOTE_NAMES[root] + SUFFIX.get(quality, quality)


def transpose(midi_notes: list[int], semitones: int) -> list[int]:
    out = [n + semitones for n in midi_notes]
    if any(not 0 <= n <= 127 for n in out):
        raise ValueError("transposição leva nota para fora de 0-127")
    return out


def to_guitar_tab(midi_notes: list[int]) -> list[dict]:
    tab = []
    for n in midi_notes:
        options = [(n - open_note, idx) for idx, open_note in enumerate(TUNING_LOW_TO_HIGH)
                   if 0 <= n - open_note <= MAX_FRET]
        if not options:
            raise ValueError(f"nota {n} fora do alcance do violão")
        fret, idx = min(options)
        tab.append({"note": note_name(n), "string": 6 - idx, "fret": fret})
    return tab
