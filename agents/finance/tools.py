from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
from agents.finance.market_parsers import MarketDataError
from core.contracts import ALLOWED_ASSETS, AlertEvent
from core.market import Quote, age_seconds
from core.memory import Memory

MOCK_PRICES = {"PETR4": 38.0, "VALE3": 62.0, "ITUB4": 33.0, "BTCUSDT": 65000.0, "EURUSD": 1.08}


def build_tools(memory: Memory, notes_dir, portfolio: dict, market=None, quote_holder: dict | None = None) -> dict:
    """market=None usa preços de mentira (marcados 'mock'). Com provedor, falha de dados = erro, nunca mock."""
    notes_dir = Path(notes_dir)

    def get_market_data(asset: str) -> dict:
        if asset not in ALLOWED_ASSETS:
            raise ValueError(f"ativo não permitido: {asset!r}")
        now = datetime.now(timezone.utc)
        if market is None:
            if asset not in MOCK_PRICES:
                raise ValueError(f"ativo não permitido: {asset!r}")
            quote = Quote(asset=asset, price=MOCK_PRICES[asset], as_of=now, source="mock", kind="mock")
        else:
            try:
                quote = market.get_quote(asset)
            except MarketDataError as exc:
                raise ValueError(f"dados de mercado indisponíveis: {exc}") from None
        if quote.asset != asset:
            raise ValueError("cotação de outro ativo (falha fechada)")
        if quote_holder is not None:
            quote_holder["quote"] = quote
        # ao LLM vão só números e rótulos fixos; nenhum texto livre vindo do provedor
        return {"asset": quote.asset, "price": quote.price, "source": quote.source, "kind": quote.kind,
                "age_minutes": max(0, int(age_seconds(quote, now) // 60))}

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
