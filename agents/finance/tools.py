from __future__ import annotations
from pathlib import Path
from core.contracts import ALLOWED_ASSETS, AlertEvent
from core.memory import Memory

MOCK_PRICES = {"PETR4": 38.0, "VALE3": 62.0, "ITUB4": 33.0, "BTCUSDT": 65000.0, "EURUSD": 1.08}


def build_tools(memory: Memory, notes_dir, portfolio: dict) -> dict:
    notes_dir = Path(notes_dir)

    def get_market_data(asset: str) -> dict:
        if asset not in ALLOWED_ASSETS or asset not in MOCK_PRICES:
            raise ValueError(f"ativo não permitido: {asset!r}")
        return {"asset": asset, "price": MOCK_PRICES[asset], "source": "mock"}

    def read_portfolio() -> dict:
        return dict(portfolio)

    def write_research_note(asset: str, text: str) -> str:
        if asset not in ALLOWED_ASSETS:
            raise ValueError(f"ativo não permitido: {asset!r}")
        notes_dir.mkdir(parents=True, exist_ok=True)
        path = notes_dir / f"{asset}_{len(list(notes_dir.glob(asset + '_*.md'))) + 1}.md"
        path.write_text(text, encoding="utf-8")
        return path.name

    def emit_alert(alert: dict) -> dict:
        event = AlertEvent.model_validate(alert)
        memory.save_alert(event.asset, event.model_dump())
        return event.model_dump()

    return {"get_market_data": get_market_data, "read_portfolio": read_portfolio,
            "write_research_note": write_research_note, "emit_alert": emit_alert}
