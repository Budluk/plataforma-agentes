from __future__ import annotations
from agents.music.contracts import MusicRequest
from agents.music.theory import MAX_FRET, TUNING_LOW_TO_HIGH


def check_request(req: MusicRequest) -> list[str]:
    reasons: list[str] = []
    if req.action == "transpose":
        for n in req.notes:
            if not 0 <= n + req.semitones <= 127:
                reasons.append(f"nota {n} transposta em {req.semitones} sai do intervalo 0-127")
                break
    if req.action == "tab":
        low, high = TUNING_LOW_TO_HIGH[0], TUNING_LOW_TO_HIGH[-1] + MAX_FRET
        bad = [n for n in req.notes if not low <= n <= high]
        if bad:
            reasons.append(f"notas fora do alcance do violão ({low}-{high}): {bad}")
    return reasons
