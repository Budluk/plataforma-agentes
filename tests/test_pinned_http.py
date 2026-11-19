import httpcore
import httpx
import pytest

from agents.finance.market_data import HttpMarketData
from agents.finance.market_parsers import MarketDataError
from agents.research.fetcher import FetchError, HttpFetcher
from core import pinned_http
from core.pinned_http import PinnedBackend, PinnedTransport, resolve_public_host

ALLOWED = frozenset({"brapi.dev"})
URL = "https://brapi.dev/api/quote/PETR4"
MARKET_HOSTS = frozenset({"brapi.dev"})


def test_research_and_market_share_the_same_pinned_transport():
    fetcher, market = HttpFetcher(ALLOWED), HttpMarketData(MARKET_HOSTS)
    try:
        for transport in (fetcher.transport, market.transport):
            assert isinstance(transport, PinnedTransport)
            assert transport.resolver is resolve_public_host
            assert isinstance(transport.pool, httpcore.ConnectionPool)
    finally:
        fetcher.transport.close()
        market.transport.close()


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.5", "::1", "::ffff:192.168.1.2"])
def test_private_dns_fails_closed_in_both_clients(monkeypatch, address):
    monkeypatch.setattr(
        pinned_http.socket, "getaddrinfo",
        lambda *a, **k: [(2, 1, 6, "", (address, 0))],
    )
    fetcher, market = HttpFetcher(ALLOWED), HttpMarketData(MARKET_HOSTS)
    try:
        with pytest.raises(FetchError, match="rede"):
            fetcher.fetch(URL)
        with pytest.raises(MarketDataError, match="rede"):
            market.get_quote("PETR4")
    finally:
        fetcher.transport.close()
        market.transport.close()


def test_injected_resolver_cannot_force_a_private_connection():
    backend = PinnedBackend(resolver=lambda host: ("10.0.0.5",))
    with pytest.raises(httpcore.ConnectError, match="inválidos"):
        backend.connect_tcp("brapi.dev", 443)


def test_successful_core_response_is_readable_by_httpx():
    transport = PinnedTransport()

    def ok(request):
        return httpcore.Response(200, headers={"content-type": "application/json"},
                                 content=b'{"ok": true}')

    transport.pool.handle_request = ok
    try:
        with httpx.Client(transport=transport) as client:
            response = client.get(URL)
        assert response.status_code == 200
        assert response.json() == {"ok": True}
    finally:
        transport.close()


def test_httpcore_errors_become_httpx_errors_for_callers():
    transport = PinnedTransport()
    try:
        def boom(request):
            raise httpcore.ConnectError("sem rede")

        transport.pool.handle_request = boom
        request = httpx.Request("GET", URL)
        with pytest.raises(httpx.ConnectError, match="sem rede"):
            transport.handle_request(request)
    finally:
        transport.close()
