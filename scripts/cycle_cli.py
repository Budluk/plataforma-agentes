"""Liga o ciclo: tendencia -> conteudo -> proposta de publicacao.

Nao publica e nao gasta token: usa LLM falso e handler simulado.
O pedido fica aguardando aprovacao humana em scripts/approvals.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.content.pipeline import ContentPipeline
from agents.publisher.contracts import PublishPost
from agents.publisher.wiring import NOME_ACAO, build_publisher
from content_automation.trend_store import TrendStore
from core.control_store import ControlStore
from core.llm_client import FakeLLM


class FakeMemory:
    def record_run(self, agent, pessoa, status, detalhe):
        return None


class FakeLogger:
    def log(self, evento, **campos):
        return None


RASCUNHO = json.dumps({
    "hook": "Gancho gerado a partir da tendencia",
    "script": "Roteiro curto escrito pelo LLM falso para provar o ciclo.",
    "caption": "Legenda de exemplo gerada no ciclo completo.",
    "hashtags": ["#teste", "#ciclo"],
    "language": "pt-BR",
})


def resumo_do_banco(store: TrendStore) -> list[dict]:
    return store.list_observations(limit=50)


def escolher_pauta(linhas: list[dict]) -> dict | None:
    if not linhas:
        return None
    return linhas[-1]


def montar(store_trend, control, data_dir, plataforma, conta, persona):
    memory, logger = FakeMemory(), FakeLogger()
    llm = FakeLLM(RASCUNHO)
    conteudo = ContentPipeline(llm, memory, logger, persona_id=persona)
    gateway = build_publisher(store=control, data_dir=data_dir)
    return conteudo, gateway


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Ciclo completo: tendencia, conteudo e proposta."
    )
    parser.add_argument("--trend-db", type=Path,
                        default=ROOT / "data" / "trends.sqlite3")
    parser.add_argument("--control-db", type=Path,
                        default=ROOT / "data" / "control.db")
    parser.add_argument("--platform", default="tiktok")
    parser.add_argument("--account", default="conta-1")
    parser.add_argument("--persona", default="exemplo")
    parser.add_argument("--tema", default=None,
                        help="usa este tema em vez da tendencia do banco")
    args = parser.parse_args(argv)

    store_trend = TrendStore(args.trend_db)
    control = ControlStore(args.control_db)
    control.init()

    tema = args.tema
    if tema is None:
        pauta = escolher_pauta(resumo_do_banco(store_trend))
        if pauta is None:
            print("Nenhuma tendencia no banco. Use --tema para informar um.")
            return 1
        tema = pauta["topic"]

    print(f"Tema escolhido: {tema}")

    conteudo, gateway = montar(
        store_trend, control, ROOT / "data",
        args.platform, args.account, args.persona,
    )

    resultado = conteudo.run(tema)
    if not resultado.ok:
        print("Conteudo recusado:", "; ".join(resultado.reasons))
        return 1

    dados = resultado.data
    print()
    print("Rascunho gerado:")
    print("  gancho :", dados["hook"])
    print("  roteiro:", dados["script"][:70] + "...")
    print("  legenda:", dados["caption"][:70] + "...")
    print("  tags   :", " ".join(dados["hashtags"]))

    content_hash = hashlib.sha256(
        (dados["hook"] + dados["script"] + dados["caption"]).encode("utf-8")
    ).hexdigest()
    media_hash = hashlib.sha256(b"sem-midia-neste-teste").hexdigest()

    parametros = {
        "platform": args.platform,
        "account_id": args.account,
        "persona_id": args.persona,
        "content_hash": content_hash,
        "media_hash": media_hash,
        "caption": dados["caption"][:2200],
    }

    PublishPost.model_validate(parametros)

    pedido = gateway.propose(
        NOME_ACAO, parametros, "ciclo_cli", "run-ciclo"
    )

    print()
    print("Proposta criada — nada foi publicado.")
    print("  pedido :", pedido.approval_id)
    print("  acao   :", pedido.action)
    print("  expira :", pedido.expires_ts)
    print()
    print("Para ver e aprovar:")
    print("  python scripts/approvals.py list")
    print(f"  python scripts/approvals.py approve {pedido.approval_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
