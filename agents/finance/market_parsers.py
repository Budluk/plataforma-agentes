from __future__ import annotations
import math
from datetime import datetime, timezone


class MarketDataError(Exception):
    pass


def _num(value, name: str) -> float:
    if isinstance(value, bool):
        raise MarketDataError(f"{name} inválido")
    if isinstance(value, (int, float)):
        x = float(value)
    elif isinstance(value, str):
        try:
            x = float(value)
        except ValueError:
            raise MarketDataError(f"{name} inválido") from None
    else:
        raise MarketDataError(f"{name} ausente ou inválido")
    if not math.isfinite(x) or x <= 0:
        raise MarketDataError(f"{name} fora do intervalo válido")
    return x


def _iso(value, name: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise MarketDataError(f"{name} ausente")
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise MarketDataError(f"{name} em formato inválido") from None
    if dt.tzinfo is None:
        raise MarketDataError(f"{name} sem fuso horário (rejeitado)")
    return dt.astimezone(timezone.utc)


def parse_brapi(ticker: str, payload) -> tuple[float, datetime]:
    if not isinstance(payload, dict):
        raise MarketDataError("resposta da brapi não é um objeto")
    results = payload.get("results")
    if not isinstance(results, list) or len(results) != 1 or not isinstance(results[0], dict):
        raise MarketDataError("brapi: esperado exatamente um resultado")
    r = results[0]
    if r.get("symbol") != ticker:
        raise MarketDataError("brapi: símbolo diferente do pedido")
    if "requestedSymbol" in r and r["requestedSymbol"] != ticker:
        raise MarketDataError("brapi: cotação pertence a outro ticker")
    if r.get("currency") != "BRL":
        raise MarketDataError("brapi: moeda inesperada")
    return _num(r.get("regularMarketPrice"), "regularMarketPrice"), _iso(r.get("regularMarketTime"), "regularMarketTime")


def parse_binance(symbol: str, payload) -> tuple[float, datetime]:
    if not isinstance(payload, dict):
        raise MarketDataError("resposta da Binance não é um objeto")
    if payload.get("symbol") != symbol:
        raise MarketDataError("binance: símbolo diferente do pedido")
    price = _num(payload.get("lastPrice"), "lastPrice")
    close_ms = payload.get("closeTime")
    if isinstance(close_ms, bool) or not isinstance(close_ms, int) or close_ms <= 0:
        raise MarketDataError("closeTime ausente ou inválido")
    try:
        as_of = datetime.fromtimestamp(close_ms / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        raise MarketDataError("closeTime fora do intervalo") from None
    return price, as_of


def parse_frankfurter(base: str, target: str, payload) -> tuple[float, datetime]:
    if not isinstance(payload, dict):
        raise MarketDataError("resposta do Frankfurter não é um objeto")
    if payload.get("base") != base:
        raise MarketDataError("frankfurter: moeda base diferente do pedido")
    rates = payload.get("rates")
    if not isinstance(rates, dict) or set(rates) != {target}:
        raise MarketDataError("frankfurter: taxas diferentes do pedido")
    price = _num(rates[target], "taxa")
    date = payload.get("date")
    if not isinstance(date, str):
        raise MarketDataError("data ausente")
    try:
        # conservador: meia-noite UTC do dia da taxa, o que só torna a idade maior que a real
        as_of = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise MarketDataError("data em formato inválido") from None
    return price, as_of
