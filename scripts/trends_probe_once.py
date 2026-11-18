"""Consulta unica e manual. Nao entra no agendamento.

Mostra o que a pagina devolve, sem gravar nada no banco e sem
transformar a resposta em candidato. E so leitura de diagnostico.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

TERMO = sys.argv[1] if len(sys.argv) > 1 else "inteligencia artificial"

BASE = "https" + "://" + "trends.google.com"
ALVO = (
    BASE + "/trends/api/explore"
    "?hl=pt-BR&tz=180&req="
    '{"comparisonItem":[{"keyword":"' + TERMO
    + '","geo":"BR","time":"now 7-d"}],'
    '"category":0,"property":""}'
)

CABECALHOS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    ),
    "Accept-Language": "pt-BR,pt;q=0.9",
}

print("Termo consultado:", TERMO)
print("Endereco:", ALVO)
print()

try:
    import httpx
except ImportError:
    print("ERRO: httpx nao esta instalado no ambiente virtual.")
    sys.exit(1)

try:
    resposta = httpx.get(
        ALVO,
        headers=CABECALHOS,
        timeout=20.0,
        follow_redirects=False,
    )
except httpx.HTTPError as exc:
    print("ERRO de rede:", type(exc).__name__, str(exc)[:200])
    sys.exit(1)

print("Status:", resposta.status_code)
print("Content-Type:", resposta.headers.get("content-type"))
print("Tamanho:", len(resposta.content), "bytes")
print()
print("Primeiros 600 caracteres da resposta:")
print("-" * 60)
print(repr(resposta.text[:600]))
print("-" * 60)
