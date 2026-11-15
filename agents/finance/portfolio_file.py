from __future__ import annotations
import json
import time
from pathlib import Path
from pydantic import ValidationError
from core.contracts import PortfolioState


def load_portfolio(path, *, max_age_hours: float = 24.0) -> dict:
    """Lê o portfólio que VOCÊ mantém em data/portfolio.json. Ausente, ilegível ou antigo vira
    'inconsistente' e o hard gate rejeita (falha fechada). Para saber o motivo, use describe_problem."""
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


def describe_problem(path, *, max_age_hours: float = 24.0) -> str | None:
    """Diz por que o arquivo vai ser rejeitado, sem nunca mostrar os valores."""
    p = Path(path)
    if not p.is_file():
        return "arquivo não existe (crie com scripts/set_portfolio.py)"
    try:
        data = json.loads(p.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        return f"JSON inválido (linha {exc.lineno}, coluna {exc.colno}); regrave com scripts/set_portfolio.py"
    except (OSError, ValueError):
        return "arquivo ilegível"
    if not isinstance(data, dict):
        return "o conteúdo deve ser um objeto JSON"
    try:
        state = PortfolioState.model_validate(data)
    except ValidationError as exc:
        fields = ", ".join(".".join(str(x) for x in e["loc"]) + f"({e['type']})" for e in exc.errors())
        return f"campos inválidos: {fields}"
    if state.equity is None or state.daily_pnl_pct is None:
        return "faltam equity e/ou daily_pnl_pct"
    if time.time() - p.stat().st_mtime > max_age_hours * 3600:
        return f"arquivo com mais de {max_age_hours:g} h; o gate o trata como inconsistente"
    return None


def parse_number(text: str) -> float:
    """Aceita 25000.5 ou 25000,5; recusa os dois separadores juntos (ambíguo)."""
    s = text.strip()
    if "," in s and "." in s:
        raise ValueError("use só um separador decimal (ponto ou vírgula)")
    return float(s.replace(",", "."))


def write_portfolio(path, *, equity: float, daily_pnl_pct: float, consistent: bool = True) -> PortfolioState:
    state = PortfolioState(equity=equity, daily_pnl_pct=daily_pnl_pct, equity_snapshot_consistent=consistent)
    if state.equity <= 0:
        raise ValueError("equity deve ser positivo")
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state.model_dump(), indent=2) + "\n", encoding="utf-8")
    return state
