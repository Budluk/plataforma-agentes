"""Ciclo com LLM real. Consome tokens da chave configurada.

Continua sem publicar: o handler e o simulado. O que muda em
relacao ao cycle_cli.py e que o texto passa a ser escrito pelo
modelo, nao mais um rascunho fixo.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.content.personas import (
    PersonaInvalida,
    carregar_persona,
    exigir_persona_ativa,
    tema_permitido,
)
from agents.content.pipeline import ContentPipeline
from agents.publisher.contracts import PublishPost
from agents.publisher.wiring import NOME_ACAO, build_publisher
from core.control_store import ControlStore
from core.llm_client import HttpLLMClient, LLMError


class FakeMemory:
    def record_run(self, agent, pessoa, status, detalhe):
        return None


class FakeLogger:
    def log(self, evento, **campos):
        return None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Ciclo com LLM real. Consome tokens."
    )
    parser.add_argument("--tema", required=True)
    parser.add_argument("--platform", default="tiktok")
    parser.add_argument("--account", default="conta-1")
    parser.add_argument("--persona", default="ativa")
    parser.add_argument("--control-db", type=Path,
                        default=ROOT / "data" / "control.db")
    args = parser.parse_args(argv)

    load_dotenv(ROOT / ".env")

    try:
        llm = HttpLLMClient("groq")
    except LLMError as exc:
        print("ERRO ao preparar o LLM:", exc)
        return 1

    caminho_persona = ROOT / "config" / "personas" / (args.persona + ".json")
    try:
        persona = carregar_persona(caminho_persona)
        exigir_persona_ativa(persona)
    except PersonaInvalida as exc:
        print("Persona recusada:", exc)
        return 1

    if not tema_permitido(persona, args.tema):
        print("Tema fora do escopo desta persona:", args.tema)
        print("Permitidos:", ", ".join(persona.allowed_topics))
        return 1

    conta = persona.accounts[0]
    print("Persona:", persona.persona_id, "| conta autorizada:", conta)
    print("Modelo:", llm.model)
    print("Tema:", args.tema)
    print()

    conteudo = ContentPipeline(
        llm, FakeMemory(), FakeLogger(), persona_id=persona.persona_id
    )
    resultado = conteudo.run(args.tema)

    if not resultado.ok:
        print("Conteudo recusado:", "; ".join(resultado.reasons))
        return 1

    dados = resultado.data
    print("Rascunho gerado pelo modelo:")
    print("  gancho :", dados["hook"])
    print("  roteiro:", dados["script"][:120])
    print("  legenda:", dados["caption"][:120])
    print("  tags   :", " ".join(dados["hashtags"]))
    print()

    content_hash = hashlib.sha256(
        (dados["hook"] + dados["script"] + dados["caption"]).encode("utf-8")
    ).hexdigest()
    media_hash = hashlib.sha256(b"sem-midia-neste-teste").hexdigest()

    parametros = {
        "platform": args.platform,
        "account_id": conta,
        "persona_id": args.persona,
        "content_hash": content_hash,
        "media_hash": media_hash,
        "caption": dados["caption"][:2200],
    }

    PublishPost.model_validate(parametros)

    store = ControlStore(args.control_db)
    store.init()
    gateway = build_publisher(store=store, data_dir=ROOT / "data")
    pedido = gateway.propose(NOME_ACAO, parametros, "cycle_live", "run-live")

    print("Proposta criada — nada foi publicado.")
    print("  pedido:", pedido.approval_id)
    print()
    print("Para aprovar:")
    print(f"  python scripts/approvals.py approve {pedido.approval_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
