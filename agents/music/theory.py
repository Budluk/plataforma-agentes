from __future__ import annotations

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
TUNING_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64]  # E2 A2 D3 G3 B3 E4
MAX_FRET = 22
MAX_CHORD_NOTES = len(TUNING_LOW_TO_HIGH)  # uma nota por corda
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
    """Posiciona as notas de um acorde em cordas distintas.

    Cada nota recebe uma corda diferente para que o resultado seja tocável
    simultaneamente. Entre as posições possíveis, escolhe a de menor extensão
    entre trastes (e, em empate, a de menor soma de trastes), o que evita
    acordes com esticamentos impossíveis. A ordem das notas de entrada é
    preservada na saída.
    """
    if len(midi_notes) > MAX_CHORD_NOTES:
        raise ValueError(
            f"acorde com {len(midi_notes)} notas excede as {MAX_CHORD_NOTES} cordas do violão"
        )

    options = []
    for n in midi_notes:
        choices = [(idx, n - open_note) for idx, open_note in enumerate(TUNING_LOW_TO_HIGH)
                   if 0 <= n - open_note <= MAX_FRET]
        if not choices:
            raise ValueError(f"nota {n} fora do alcance do violão")
        options.append(sorted(choices, key=lambda item: (item[1], item[0])))

    best: list[tuple[int, int]] | None = None
    best_cost: tuple[int, int, tuple[int, ...]] | None = None
    current: list[tuple[int, int]] = []

    def search(position: int, used: set[int]) -> None:
        nonlocal best, best_cost
        if position == len(options):
            frets = [fret for _, fret in current]
            cost = (max(frets) - min(frets), sum(frets), tuple(frets))
            if best_cost is None or cost < best_cost:
                best_cost, best = cost, list(current)
            return
        for idx, fret in options[position]:
            if idx in used:
                continue
            used.add(idx)
            current.append((idx, fret))
            search(position + 1, used)
            current.pop()
            used.remove(idx)

    search(0, set())
    if best is None:
        raise ValueError(f"não foi possível posicionar o acorde em cordas distintas: {midi_notes}")

    return [{"note": note_name(n), "string": 6 - idx, "fret": fret}
            for n, (idx, fret) in zip(midi_notes, best)]
