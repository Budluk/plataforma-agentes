from __future__ import annotations

from pathlib import Path

from agents.publisher.contracts import PublishPost
from agents.publisher.handlers import DryRunPublisher
from core.actions import ActionGateway, ActionSpec, Limits

NOME_ACAO = "publish.post"

# Limites conservadores: publicar e irreversivel.
MAX_PROPOSALS = 20
MAX_EXECUTIONS = 3
JANELA_SEGUNDOS = 3600
TTL_APROVACAO = 900


def build_publisher(*, store, data_dir, handler=None) -> ActionGateway:
    """Monta o gateway com a acao de publicacao.

    O handler padrao e o simulado: ele nao abre socket, nao le
    credencial e nao publica. Trocar pelo adaptador real e o ultimo
    passo; todo o resto ja esta provado.
    """

    data_dir = Path(data_dir)

    if handler is None:
        handler = DryRunPublisher(data_dir / "publisher_dryrun.txt")

    spec = ActionSpec(
        NOME_ACAO,
        PublishPost,
        Limits(MAX_PROPOSALS, MAX_EXECUTIONS, JANELA_SEGUNDOS),
        approval_ttl_seconds=TTL_APROVACAO,
        description="Publica um conteudo aprovado em uma conta autorizada.",
    )

    return ActionGateway(
        store,
        {NOME_ACAO: spec},
        {NOME_ACAO: handler},
    )
