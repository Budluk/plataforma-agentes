from __future__ import annotations
import json
from datetime import datetime, timezone
from urllib.parse import urlparse
import httpx
from pydantic import ValidationError
from agents.finance.market_parsers import MarketDataError, parse_binance, parse_brapi, parse_frankfurter
from agents.research.urlgate import load_allowed_domains as load_market_hosts  # noqa: F401
from core.contracts import ALLOWED_ASSETS
from core.market import Quote, check_quote
from core.pinned_http import PinnedTransport

# URLs fixas: nenhum texto do usuário ou do LLM entra na URL.
ROUTES = {
    "PETR4": ("brapi", "https://brapi.dev/api/quote/PETR4"),
    "VALE3": ("brapi", "https://brapi.dev/api/quote/VALE3"),
    "ITUB4": ("brapi", "https://brapi.dev/api/quote/ITUB4"),
    "BTCUSDT": ("binance", "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT"),
    "EURUSD": ("frankfurter", "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD"),
}
KIND = {"brapi": "last_trade", "binance": "last_trade", "frankfurter": "daily_reference"}
PARSERS = {
    "brapi": lambda asset, payload: parse_brapi(asset, payload),
    "binance": lambda asset, payload: parse_binance(asset, payload),
    "frankfurter": lambda asset, payload: parse_frankfurter(asset[:3], asset[3:], payload),
}


class HttpMarketData:
    """Somente leitura: só GET, só https, hosts da lista, IPs fixados, sem redirect e resposta limitada."""

    def __init__(self, allowed_hosts, *, transport=None, timeout: float = 10.0, max_bytes: int = 200_000,
                 clock=None, user_agent: str | None = None):
        self.allowed_hosts = allowed_hosts
        self.transport = transport if transport is not None else PinnedTransport()
        self.timeout, self.max_bytes = timeout, max_bytes
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.user_agent = user_agent or "plataforma-agentes/0.1 (dados de mercado somente leitura)"

    def _get_json(self, url: str):
        parts = urlparse(url)
        if parts.scheme != "https" or parts.hostname not in self.allowed_hosts:
            raise MarketDataError(f"host fora da lista permitida: {parts.hostname}")
        body = bytearray()
        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=False, transport=self.transport,
                              headers={"User-Agent": self.user_agent}, trust_env=False) as client:
                with client.stream("GET", url) as r:
                    if 300 <= r.status_code < 400:
                        raise MarketDataError("redirecionamento não permitido")
                    if r.status_code != 200:
                        raise MarketDataError(f"HTTP {r.status_code}")
                    if "json" not in r.headers.get("content-type", "").lower():
                        raise MarketDataError("tipo de conteúdo não é JSON")
                    for chunk in r.iter_bytes():
                        body.extend(chunk)
                        if len(body) > self.max_bytes:
                            raise MarketDataError("resposta grande demais")
        except httpx.HTTPError as exc:
            raise MarketDataError(f"erro de rede: {type(exc).__name__}") from None
        try:
            return json.loads(bytes(body))
        except (ValueError, RecursionError):
            raise MarketDataError("resposta não é JSON válido") from None

    def get_quote(self, asset: str) -> Quote:
        route = ROUTES.get(asset)
        if route is None or asset not in ALLOWED_ASSETS:
            raise MarketDataError(f"ativo sem rota de dados: {asset!r}")
        provider, url = route
        price, as_of = PARSERS[provider](asset, self._get_json(url))
        try:
            quote = Quote(asset=asset, price=price, as_of=as_of, source=provider, kind=KIND[provider])
        except ValidationError:
            raise MarketDataError("cotação falhou na validação") from None
        reasons = check_quote(quote, self.clock())
        if reasons:
            raise MarketDataError("; ".join(reasons))
        return quote


class FakeMarketData:
    """Para testes e demo offline. Aplica o mesmo teste de frescor do provedor real."""

    def __init__(self, quotes: dict, error: str | None = None):
        self.quotes, self.error, self.calls = quotes, error, 0

    def get_quote(self, asset: str) -> Quote:
        self.calls += 1
        if self.error:
            raise MarketDataError(self.error)
        if asset not in self.quotes:
            raise MarketDataError(f"sem cotação para {asset!r}")
        quote = self.quotes[asset]
        reasons = check_quote(quote, datetime.now(timezone.utc))
        if reasons:
            raise MarketDataError("; ".join(reasons))
        return quote
