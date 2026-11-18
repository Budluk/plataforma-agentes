from __future__ import annotations

from pathlib import Path


class DryRunPublisher:
    """Handler de publicacao que NAO publica.

    Registra a intencao em disco e devolve o que aparenta ser um
    resultado. Nenhum socket e aberto, nenhuma credencial e lida.
    Trocar isto pelo adaptador real e o ultimo passo da cadeia;
    todo o resto do caminho ja estara provado antes disso.
    """

    def __init__(self, destino: str | Path):
        self.destino = Path(destino)

    def __call__(self, params: dict) -> dict:
        self.destino.parent.mkdir(parents=True, exist_ok=True)

        linha = (
            f"{params['platform']}|{params['account_id']}"
            f"|{params['persona_id']}|{params['content_hash'][:12]}"
            f"|{params['media_hash'][:12]}"
            f"|{len(params['caption'])}"
        )

        with self.destino.open("a", encoding="utf-8") as arquivo:
            arquivo.write(linha + "\n")

        return {
            "simulado": True,
            "publicado": False,
            "plataforma": params["platform"],
            "conta": params["account_id"],
            "motivo": "handler simulado, nada foi enviado",
        }
