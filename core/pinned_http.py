"""Transporte HTTP com DNS fixado, compartilhado por pesquisa e dados de mercado.

A resolução acontece uma vez e só IPs públicos são usados na conexão. Nenhuma
API privada do httpx/httpcore é modificada: este módulo monta seu próprio
``httpx.BaseTransport`` em cima de um ``httpcore.ConnectionPool`` público.
"""
from __future__ import annotations
import ipaddress
import socket
import httpcore
import httpx

MAX_ADDRESSES = 16


def _is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or
        ip.is_reserved or ip.is_unspecified
    )


def resolve_public_host(host: str) -> tuple[str, ...]:
    """Resolve uma vez e devolve somente IPs públicos para fixar a conexão."""
    name = str(host or "").strip().lower().rstrip(".")
    if not name:
        raise ValueError("URL sem host")
    try:
        literal = ipaddress.ip_address(name)
    except ValueError:
        try:
            infos = socket.getaddrinfo(name, None, type=socket.SOCK_STREAM)
        except socket.gaierror:
            raise ValueError(f"Não foi possível resolver o domínio {name!r}.") from None
        addresses = tuple(sorted({info[4][0] for info in infos}))
    else:
        if isinstance(literal, ipaddress.IPv6Address) and literal.ipv4_mapped:
            literal = literal.ipv4_mapped
        addresses = (str(literal),)
    if not addresses or len(addresses) > MAX_ADDRESSES:
        raise ValueError(f"Resolução de {name!r} inválida")
    if any(not _is_public_ip(address) for address in addresses):
        raise ValueError(f"Domínio {name!r} resolve para endereço privado")
    return addresses


class PinnedBackend(httpcore.SyncBackend):
    """Conecta somente aos IPs já resolvidos e validados para o host da URL."""

    def __init__(self, resolver=resolve_public_host):
        self.resolver = resolver

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        try:
            addresses = self.resolver(host)
        except ValueError as exc:
            raise httpcore.ConnectError(f"resolução de {host} rejeitada: {exc}") from None
        if not addresses or any(not _is_public_ip(address) for address in addresses):
            raise httpcore.ConnectError(f"endereços inválidos para {host}")
        for address in addresses:
            try:
                return super().connect_tcp(
                    address, port, timeout=timeout,
                    local_address=local_address, socket_options=socket_options,
                )
            except (httpcore.ConnectError, httpcore.ConnectTimeout, OSError):
                continue
        raise httpcore.ConnectError(f"falha ao conectar em {host} nos endereços validados") from None


_CORE_ERROR_NAMES = (
    "ConnectError", "ConnectTimeout", "ReadError", "ReadTimeout",
    "WriteError", "WriteTimeout", "PoolTimeout", "ProxyError",
    "UnsupportedProtocol", "RemoteProtocolError", "LocalProtocolError",
    "ProtocolError", "NetworkError", "TimeoutException",
)
_CORE_ERRORS = {
    name: getattr(httpx, name, httpx.TransportError)
    for name in _CORE_ERROR_NAMES
    if getattr(httpcore, name, None) is not None
}
_CORE_EXCEPTIONS = tuple(getattr(httpcore, name) for name in _CORE_ERRORS)


def _as_httpx_error(exc: Exception) -> httpx.HTTPError:
    """httpcore não é httpx.HTTPError; traduz para quem chama via httpx.Client."""
    return _CORE_ERRORS.get(type(exc).__name__, httpx.TransportError)(str(exc))


class _PinnedStream(httpx.SyncByteStream):
    """Adapta o stream do httpcore à interface pública do httpx, sem ler tudo de uma vez."""

    def __init__(self, stream):
        self._stream = stream

    def __iter__(self):
        return iter(self._stream)

    def close(self) -> None:
        close = getattr(self._stream, "close", None)
        if close is not None:
            close()


class PinnedTransport(httpx.BaseTransport):
    """Transporte HTTP com pool próprio e DNS fixado, sem proxy e sem keepalive."""

    def __init__(self, *, resolver=resolve_public_host, verify=True, cert=None,
                 http1=True, http2=False, limits=None, retries=0,
                 uds=None, local_address=None, socket_options=None):
        self.limits = limits or httpx.Limits(max_keepalive_connections=0)
        self.resolver = resolver
        self.backend = PinnedBackend(resolver)
        self.pool = httpcore.ConnectionPool(
            ssl_context=httpx.create_ssl_context(verify=verify, cert=cert, trust_env=False),
            max_connections=self.limits.max_connections,
            max_keepalive_connections=self.limits.max_keepalive_connections,
            keepalive_expiry=self.limits.keepalive_expiry,
            http1=http1, http2=http2, retries=retries, uds=uds,
            local_address=local_address, socket_options=socket_options,
            network_backend=self.backend,
        )

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        core_request = httpcore.Request(
            request.method,
            str(request.url),
            headers=request.headers.raw,
            content=request.read(),
            extensions={"timeout": request.extensions.get("timeout", {})},
        )
        try:
            response = self.pool.handle_request(core_request)
        except _CORE_EXCEPTIONS as exc:
            raise _as_httpx_error(exc) from None
        return httpx.Response(response.status, headers=response.headers,
                              stream=_PinnedStream(response.stream),
                              extensions=response.extensions, request=request)

    def close(self) -> None:
        self.pool.close()
