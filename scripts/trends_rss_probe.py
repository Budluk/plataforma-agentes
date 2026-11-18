"""Teste unico do feed RSS do Google Trends. Nao grava nada."""

from __future__ import annotations

import sys

BASE = "https" + "://" + "trends.google.com"
ALVO = BASE + "/trending/rss?geo=BR"

CABECALHOS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml",
}

try:
    import httpx
except ImportError:
    print("ERRO: httpx nao esta instalado.")
    sys.exit(1)

print("Endereco:", ALVO)
print()

try:
    r = httpx.get(ALVO, headers=CABECALHOS, timeout=20.0)
except httpx.HTTPError as exc:
    print("ERRO de rede:", type(exc).__name__, str(exc)[:200])
    sys.exit(1)

print("Status:", r.status_code)
print("Content-Type:", r.headers.get("content-type"))
print("Tamanho:", len(r.content), "bytes")
print()

if r.status_code != 200:
    print("Corpo (inicio):", repr(r.text[:300]))
    sys.exit(0)

texto = r.text
print("Tem <item>: ", texto.count("<item>"))
print("Tem <title>: ", texto.count("<title>"))
print()
print("Primeiros 700 caracteres:")
print("-" * 60)
print(texto[:700])
print("-" * 60)
