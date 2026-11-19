"""Registro unico de ferramentas da plataforma.

Este modulo e a fonte unica de verdade para os nomes de ferramentas e seus
metadados. As estruturas usadas pelo monitor, pelas permissoes, pela API HTTP
e pela fabrica de ferramentas do studio sao todas derivadas de ``REGISTRY``:

* ``KNOWN_TOOLS``     -> todas as ferramentas conhecidas (cabeça registry);
* ``STUDIO_TOOLS``    -> ferramentas que exigem a sonda de saude antes delas;
* ``SEED``            -> pares (agente, ferramenta) aplicados no banco;
* ``TOOL_SPECS``      -> contrato publico da API HTTP/CLI da area studio;
* ``STUDIO_ACTION_TOOL`` -> (acao, kind) da StudioRequest -> nome da ferramenta;
* ``STUDIO_AGENT_TOOL`` -> metodo do StudioAgent -> nome da ferramenta;
* ``STUDIO_PARAM_ALIASES`` -> campo da ferramenta -> campo da StudioRequest;
* ``AGENT_TOOL``          -> (agente, papel) -> ferramenta (areas nao studio);
* ``build_studio_tools`` -> callables Python entregues ao StudioAgent.

Somente stdlib: nenhum import de ``core.*``, ``agents.*``, ``pipelines.*`` ou
``scripts.*``. Assim o grafo de imports permanece acrilico e o registro pode
ser usado por qualquer camada.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ToolSpec:
    """Descreve uma ferramenta e todos os metadados que dela derivam.

    Os cinco primeiros campos preservam a ordem posicional original usada por
    ``scripts/studio_api.RUN_SPEC``. Os demais descrevem o dono da ferramenta,
    a regra de sequencia, o metodo do cliente chamado pela fabrica e o
    mapeamento da acao fechada de StudioRequest.

    ``param_aliases`` liga um campo da ferramenta ao campo correspondente do
    contrato (por exemplo ``content`` <- ``message``). Assim o pipeline nao
    repete nomes em if/elif e o StudioAgent nao grava nomes de ferramenta: o
    registro e a unica fonte de verdade.
    """

    method: str = ""
    description: str = ""
    required: tuple[str, ...] = ()
    optional: tuple[str, ...] = ()
    integers: tuple[str, ...] = ()
    agent: str = ""
    group: str = ""
    requires: tuple[str, ...] = ()
    client_method: str = ""
    action: str = ""
    kind: str = ""
    agent_method: str = ""
    param_aliases: tuple[tuple[str, str], ...] = ()

    def schema(self, name: str) -> dict:
        """Contrato exposto por ``GET /tools`` e ``GET /tools/<nome>``."""
        return {
            "name": name,
            "description": self.description,
            "required": list(self.required),
            "optional": list(self.optional),
            "integers": list(self.integers),
        }


REGISTRY: dict[str, ToolSpec] = {
    # --- areas nao studio -------------------------------------------------
    # ``agent_method`` e o papel semantico usado pelo agente/fabrica; o nome da
    # ferramenta continua sendo a chave do registro, nunca um literal na camada
    # que chama ou constroi a ferramenta.
    "get_market_data": ToolSpec(agent="analyst", agent_method="market_data"),
    "read_portfolio": ToolSpec(agent="risk_manager", agent_method="portfolio"),
    "write_research_note": ToolSpec(agent="analyst", agent_method="note"),
    "emit_alert": ToolSpec(agent="pipeline", requires=("read_portfolio",),
                           agent_method="alert"),
    "identify_chord": ToolSpec(agent="music_agent", agent_method="identify_chord",
                               action="identify_chord"),
    "transpose_notes": ToolSpec(agent="music_agent", agent_method="transpose",
                                action="transpose"),
    "to_guitar_tab": ToolSpec(agent="music_agent", agent_method="tab", action="tab"),
    "compute_margin": ToolSpec(agent="sales_agent", agent_method="margin", action="margin"),
    "suggest_price": ToolSpec(agent="sales_agent", agent_method="price", action="price"),
    "break_even": ToolSpec(agent="sales_agent", agent_method="break_even",
                           action="break_even"),
    "analyze_funnel": ToolSpec(agent="sales_agent", agent_method="funnel"),
    "fetch_page": ToolSpec(agent="research_agent", agent_method="fetch"),
    "analyze_code": ToolSpec(agent="dev_agent", agent_method="analyze"),
    "save_code_file": ToolSpec(agent="dev_agent", agent_method="save"),
    # --- area studio ------------------------------------------------------
    # studio_health nao exige a si mesma: e a sonda que habilita as outras 16.
    "studio_health": ToolSpec(
        method="health",
        description="Confirma que o CloneStudio local está saudável.",
        agent="studio_agent", group="studio", client_method="health",
        action="health", agent_method="health",
    ),
    "studio_list_apps": ToolSpec(
        method="list_apps",
        description="Lista os apps do CloneStudio (até 20, sem código).",
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="list_apps",
        action="list", agent_method="list_apps",
    ),
    "studio_create_app": ToolSpec(
        method="create",
        description="Cria um app React a partir de uma descrição.",
        required=("prompt",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="create",
        action="create", agent_method="create_app",
    ),
    "studio_app_status": ToolSpec(
        method="status",
        description="Mostra o estado de um app, sem código nem logs.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="status",
        action="status", agent_method="app_status",
    ),
    "studio_validate_app": ToolSpec(
        method="validate",
        description="Valida o preview de um app e devolve só as contagens.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="validate",
        action="validate", agent_method="validate_app",
    ),
    "studio_send_message": ToolSpec(
        method="message",
        description="Envia uma alteração por chat para um app.",
        required=("project_id", "content"),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="send_message",
        action="messages", agent_method="send_message",
        param_aliases=(("content", "message"),),
    ),
    "studio_fix_app": ToolSpec(
        method="fix",
        description="Pede uma correção de build para um app.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="fix",
        action="fix", agent_method="fix_app",
    ),
    "studio_fix_validation": ToolSpec(
        method="fix_validation",
        description="Corrige problemas encontrados na validação do preview.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="fix_validation",
        action="fix_validation", agent_method="fix_validation",
    ),
    "studio_rebuild_app": ToolSpec(
        method="rebuild",
        description="Recompila um app existente.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="rebuild",
        action="rebuild", agent_method="rebuild_app",
    ),
    "studio_retry_app": ToolSpec(
        method="retry",
        description="Tenta gerar de novo um app que falhou.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="retry",
        action="retry", agent_method="retry_app",
    ),
    "studio_list_versions": ToolSpec(
        method="versions",
        description="Lista o histórico de versões de um app.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="versions",
        action="versions", agent_method="list_versions",
    ),
    "studio_restore_version": ToolSpec(
        method="restore",
        description="Restaura uma versão do histórico e recompila.",
        required=("project_id", "version"),
        integers=("version",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="restore",
        action="restore", agent_method="restore_version",
    ),
    "studio_import_site": ToolSpec(
        method="import_site",
        description="Importa um site público como app.",
        required=("url",), optional=("prompt",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="import_site",
        action="import", kind="site", agent_method="import_site",
    ),
    "studio_import_github": ToolSpec(
        method="import_github",
        description="Importa um repositório público do github.com.",
        required=("url",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="import_github",
        action="import", kind="github", agent_method="import_github",
    ),
    "studio_import_app": ToolSpec(
        method="import_app",
        description="Cria um app a partir de outro app existente.",
        required=("project_id",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="import_app",
        action="import", kind="app", agent_method="import_app",
    ),
    "studio_analyze_inspiration": ToolSpec(
        method="inspiration",
        description="Analisa um canal/perfil público de rede social.",
        required=("url",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="analyze_inspiration",
        action="inspiration", agent_method="analyze_inspiration",
    ),
    "studio_create_inspiration": ToolSpec(
        method="create_inspiration",
        description="Cria um app original a partir de uma análise.",
        required=("inspiration_token",), optional=("prompt",),
        agent="studio_agent", group="studio", requires=("studio_health",),
        client_method="create_inspiration",
        action="inspiration_create", agent_method="create_inspiration",
    ),
}

KNOWN_TOOLS = frozenset(REGISTRY)
STUDIO_TOOLS = frozenset(
    name for name, spec in REGISTRY.items() if "studio_health" in spec.requires
)
STUDIO_AGENT_TOOLS = frozenset(
    name for name, spec in REGISTRY.items() if spec.agent == "studio_agent"
)
SEED = [(spec.agent, name) for name, spec in REGISTRY.items()]
TOOL_SPECS: dict[str, ToolSpec] = {
    name: spec for name, spec in REGISTRY.items() if spec.method
}

# Acoes fechadas de StudioRequest -> ferramenta. ``kind`` faz parte da chave
# porque ``import`` tem tres ferramentas (site, github, app); as demais acoes
# usam ``""`` como kind. 14 acoes simples + 3 importacoes = 17 ferramentas.
STUDIO_ACTION_TOOL: dict[tuple[str, str], str] = {
    (spec.action, spec.kind): name
    for name, spec in REGISTRY.items()
    if spec.agent == "studio_agent" and spec.action
}

# Metodos publicos do StudioAgent -> ferramenta. Usado pelo agente e pelo
# pipeline para nao repetir ``studio_*`` em nenhuma das duas camadas.
STUDIO_AGENT_TOOL: dict[str, str] = {
    spec.agent_method: name
    for name, spec in REGISTRY.items()
    if spec.agent == "studio_agent" and spec.agent_method
}

# Unico desvio de nome entre StudioRequest e uma ferramenta studio.
STUDIO_PARAM_ALIASES: dict[str, str] = {
    param: source
    for spec in REGISTRY.values()
    for param, source in spec.param_aliases
}

# Areas nao studio: (agente, papel) -> ferramenta. ``agent_method`` e o papel
# publico (inclui as acoes fechadas de sales/music, que usam o mesmo valor).
# As 14 ferramentas fora do studio passam a ter seu nome resolvido aqui.
AGENT_TOOL: dict[tuple[str, str], str] = {
    (spec.agent, spec.agent_method): name
    for name, spec in REGISTRY.items()
    if spec.agent and spec.agent_method and not spec.method
}
