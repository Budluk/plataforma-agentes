from __future__ import annotations
from dataclasses import dataclass
from urllib.parse import urljoin
import httpcore
import httpx
from agents.research.urlgate import check_url, resolve_public_host


class FetchError(Exception):
    pass


class PinnedBackend(httpcore.SyncBackend):
    """Conecta somente aos IPs já resolvidos e validados para o host da URL."""

    def __init__(self, resolver=resolve_public_host):
        self._resolver = resolver

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        addresses = self._resolver(host)
        errors = []
        for address in addresses:
            try:
                return super().connect_tcp(
                    address, port, timeout=timeout,
                    local_address=local_address, socket_options=socket_options,
                )
            except (httpcore.ConnectError, httpcore.ConnectTimeout, OSError) as exc:
                errors.append(exc)
        raise httpcore.ConnectError(f"falha ao conectar em {host} nos endereços validados") from None


class PinnedTransport(httpx.HTTPTransport):
    """HTTPTransport com DNS pinning, sem proxy e sem reutilizar conexões."""

    def __init__(self, *, resolver=resolve_public_host, verify=True, cert=None,
                 http1=True, http2=False, limits=None, retries=0,
                 uds=None, local_address=None, socket_options=None):
        limits = limits or httpx.Limits(max_keepalive_connections=0)
        super().__init__(
            verify=verify, cert=cert, trust_env=False, http1=http1, http2=http2,
            limits=limits, retries=retries, uds=uds, local_address=local_address,
            socket_options=socket_options,
        )
        self._pool.close()  # pool criado pelo pai sem pinning; nunca foi usado
        self._pool = httpcore.ConnectionPool(
            ssl_context=httpx.create_ssl_context(verify=verify, cert=cert, trust_env=False),
            max_connections=limits.max_connections,
            max_keepalive_connections=limits.max_keepalive_connections,
            keepalive_expiry=limits.keepalive_expiry,
            http1=http1, http2=http2, retries=retries, uds=uds,
            local_address=local_address, socket_options=socket_options,
            network_backend=PinnedBackend(resolver),
        )


@dataclass
class FetchedPage:
    url: str
    content_type: str
    text: str
    truncated: bool = False


class HttpFetcher:
    def __init__(self, allowed, *, max_bytes: int = 200_000, timeout: float = 10.0,
                 max_redirects: int = 3, transport=None,
                 user_agent: str | None = None):
        self.allowed = allowed
        self.max_bytes, self.timeout, self.max_redirects = max_bytes, timeout, max_redirects
        self.transport = transport if transport is not None else PinnedTransport()
        self.user_agent = user_agent or "plataforma-agentes/0.1 (pesquisa somente leitura)"

    def fetch(self, url: str) -> FetchedPage:
        current = url
        headers = {"User-Agent": self.user_agent}
        with httpx.Client(timeout=self.timeout, follow_redirects=False,
                          transport=self.transport, headers=headers,
                          trust_env=False) as client:
            for _ in range(self.max_redirects + 1):
                reasons = check_url(current, self.allowed)
                if reasons:
                    raise FetchError("; ".join(reasons))
                try:
                    with client.stream("GET", current) as r:
                        if r.status_code in (301, 302, 303, 307, 308):
                            location = r.headers.get("location")
                            if not location:
                                raise FetchError("redirecionamento sem destino")
                            current = urljoin(current, location)
                            continue
                        if r.status_code != 200:
                            raise FetchError(f"HTTP {r.status_code}")
                        ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
                        if ctype not in ("text/html", "text/plain"):
                            raise FetchError(f"tipo de conteúdo não permitido: {ctype or 'desconhecido'}")
                        chunks, total, truncated = [], 0, False
                        for chunk in r.iter_bytes():
                            total += len(chunk)
                            if total > self.max_bytes:
                                chunks.append(chunk[: len(chunk) - (total - self.max_bytes)])
                                truncated = True
                                break
                            chunks.append(chunk)
                        body = b"".join(chunks)
                        try:
                            text = body.decode(r.encoding or "utf-8", errors="replace")
                        except LookupError:
                            text = body.decode("utf-8", errors="replace")
                        return FetchedPage(url=current, content_type=ctype, text=text, truncated=truncated)
                except httpx.HTTPError as exc:
                    raise FetchError(f"erro de rede: {type(exc).__name__}") from None
            raise FetchError("redirecionamentos demais")


class FakeFetcher:
    """Para testes e demo offline. Não faz rede."""

    def __init__(self, pages: dict[str, str]):
        self.pages, self.calls = pages, 0

    def fetch(self, url: str) -> FetchedPage:
        self.calls += 1
        if url not in self.pages:
            raise FetchError("página não encontrada (fake)")
        return FetchedPage(url=url, content_type="text/html", text=self.pages[url])


