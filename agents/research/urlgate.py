from __future__ import annotations
import ipaddress
import socket
from pathlib import Path
from urllib.parse import urlparse

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


def load_allowed_domains(path) -> frozenset[str]:
    p = Path(path)
    if not p.exists():
        return frozenset()  # sem arquivo = nada permitido (falha fechada)
    out = set()
    for line in p.read_text(encoding="utf-8").splitlines():
        entry = line.strip().lower()
        if not entry or entry.startswith("#"):
            continue
        if any(c in entry for c in "/:@ ") or "." not in entry:
            continue
        out.add(entry)
    return frozenset(out)


def check_url(url: str, allowed) -> list[str]:
    try:
        p = urlparse(url)
        port = p.port
    except ValueError:
        return ["URL inválida"]
    reasons: list[str] = []
    if p.scheme != "https":
        reasons.append("somente https é permitido")
    host = (p.hostname or "").lower()
    if not host:
        return reasons + ["URL sem host"]
    if p.username or p.password or "@" in p.netloc:
        reasons.append("URL com credenciais não é permitida")
    if port not in (None, 443):
        reasons.append(f"porta {port} não é permitida")
    if not any(host == d or host.endswith("." + d) for d in allowed):
        reasons.append(f"domínio fora da lista permitida: {host}")
    return reasons
