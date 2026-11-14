from __future__ import annotations
import json
import time
from pathlib import Path


def load_portfolio(path, *, max_age_hours: float = 24.0) -> dict:
    """Lê o portfólio que VOCÊ mantém em data/portfolio.json. Ausente, ilegível ou antigo vira
    'inconsistente' e o hard gate rejeita (falha fechada)."""
    p = Path(path)
    if not p.is_file():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    if time.time() - p.stat().st_mtime > max_age_hours * 3600:
        data["equity_snapshot_consistent"] = False
    return data
