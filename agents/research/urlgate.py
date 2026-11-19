from __future__ import annotations
from pathlib import Path
from urllib.parse import urlparse

from core.pinned_http import MAX_ADDRESSES, resolve_public_host  # noqa: F401


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
