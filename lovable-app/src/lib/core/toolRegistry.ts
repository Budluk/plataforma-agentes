/**
 * Single registry of platform tools — port of the source `core/tool_registry.py`.
 * Every derived structure (monitor `requires`, permissions seed, studio dispatch,
 * agent tool names) comes from here, so no layer repeats a tool name.
 * Pure data: no I/O, safe for client and server.
 */

export interface ToolSpec {
  /** HTTP method name exposed by the local CloneStudio client (studio tools only). */
  method?: string;
  description?: string;
  required?: readonly string[];
  optional?: readonly string[];
  integers?: readonly string[];
  agent?: string;
  group?: string;
  /** Tools that must already be in the run history before this one. */
  requires?: readonly string[];
  clientMethod?: string;
  action?: string;
  kind?: string;
  agentMethod?: string;
  paramAliases?: readonly (readonly [string, string])[];
}

const req = (...n: string[]) => n;

export const REGISTRY: Record<string, ToolSpec> = {
  // --- areas outside studio ---------------------------------------------
  get_market_data: { agent: "analyst", agentMethod: "market_data" },
  read_portfolio: { agent: "risk_manager", agentMethod: "portfolio" },
  write_research_note: { agent: "analyst", agentMethod: "note" },
  emit_alert: { agent: "pipeline", requires: req("read_portfolio"), agentMethod: "alert" },
  identify_chord: { agent: "music_agent", agentMethod: "identify_chord", action: "identify_chord" },
  transpose_notes: { agent: "music_agent", agentMethod: "transpose", action: "transpose" },
  to_guitar_tab: { agent: "music_agent", agentMethod: "tab", action: "tab" },
  compute_margin: { agent: "sales_agent", agentMethod: "margin", action: "margin" },
  suggest_price: { agent: "sales_agent", agentMethod: "price", action: "price" },
  break_even: { agent: "sales_agent", agentMethod: "break_even", action: "break_even" },
  analyze_funnel: { agent: "funnel_agent", agentMethod: "funnel" },
  fetch_page: { agent: "research_agent", agentMethod: "fetch" },
  analyze_code: { agent: "dev_agent", agentMethod: "analyze" },
  save_code_file: { agent: "dev_agent", agentMethod: "save" },
  // --- commercial area (Fase 5) -----------------------------------------
  // Read/preparation tools only. Sending, campaigns, checkout and payments
  // remain vetoed by hardGate.ts and are never registered here.
  avaliar_fonte: { agent: "prospector_agent", agentMethod: "avaliar_fonte", action: "avaliar_fonte" },
  preparar_lead: { agent: "prospector_agent", agentMethod: "preparar_lead", action: "preparar_lead" },
  calcular_score: { agent: "qualifier_agent", agentMethod: "calcular_score", action: "calcular_score" },
  qualificar_lead: { agent: "qualifier_agent", agentMethod: "qualificar_lead", action: "qualificar_lead" },
  detectar_duplicatas: {
    agent: "crm_steward_agent",
    agentMethod: "detectar_duplicatas",
    action: "detectar_duplicatas",
  },
  previsualizar_merge: {
    agent: "crm_steward_agent",
    agentMethod: "previsualizar_merge",
    action: "previsualizar_merge",
  },
  segmentar_contatos: {
    agent: "crm_steward_agent",
    agentMethod: "segmentar_contatos",
    action: "segmentar_contatos",
  },
  montar_kanban: { agent: "pipeline_agent", agentMethod: "montar_kanban", action: "montar_kanban" },
  mover_oportunidade: {
    agent: "pipeline_agent",
    agentMethod: "mover_oportunidade",
    action: "mover_oportunidade",
  },
  // funnel_agent already owns analyze_funnel; sales_agent already owns
  // compute_margin, suggest_price and break_even. Do not duplicate them.
  preparar_proposta: {
    agent: "proposal_agent",
    agentMethod: "preparar_proposta",
    action: "preparar_proposta",
  },
  validar_desconto: {
    agent: "proposal_agent",
    agentMethod: "validar_desconto",
    action: "validar_desconto",
  },
  rascunhar_resposta: {
    agent: "followup_agent",
    agentMethod: "rascunhar_resposta",
    action: "rascunhar_resposta",
  },
  preparar_lembrete: {
    agent: "followup_agent",
    agentMethod: "preparar_lembrete",
    action: "preparar_lembrete",
  },
  carregar_conversa: {
    agent: "followup_agent",
    agentMethod: "carregar_conversa",
    action: "carregar_conversa",
  },
  validar_template: {
    agent: "followup_agent",
    agentMethod: "validar_template",
    action: "validar_template",
  },
  avaliar_janela: {
    agent: "followup_agent",
    agentMethod: "avaliar_janela",
    action: "avaliar_janela",
  },
  preparar_optout: {
    agent: "followup_agent",
    agentMethod: "preparar_optout",
    action: "preparar_optout",
  },
  ler_dashboard: { agent: "insights_agent", agentMethod: "ler_dashboard", action: "ler_dashboard" },
  gerar_leitura: { agent: "insights_agent", agentMethod: "gerar_leitura", action: "gerar_leitura" },
  // --- studio area (17 tools; studio_health enables the other 16) --------
  studio_health: {
    method: "health",
    description: "Confirma que o CloneStudio local está saudável.",
    agent: "studio_agent",
    group: "studio",
    clientMethod: "health",
    action: "health",
    agentMethod: "health",
  },
  studio_list_apps: {
    method: "list_apps",
    description: "Lista os apps do CloneStudio (até 20, sem código).",
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "list_apps",
    action: "list",
    agentMethod: "list_apps",
  },
  studio_create_app: {
    method: "create",
    description: "Cria um app React a partir de uma descrição.",
    required: req("prompt"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "create",
    action: "create",
    agentMethod: "create_app",
  },
  studio_app_status: {
    method: "status",
    description: "Mostra o estado de um app, sem código nem logs.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "status",
    action: "status",
    agentMethod: "app_status",
  },
  studio_validate_app: {
    method: "validate",
    description: "Valida o preview de um app e devolve só as contagens.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "validate",
    action: "validate",
    agentMethod: "validate_app",
  },
  studio_send_message: {
    method: "message",
    description: "Envia uma alteração por chat para um app.",
    required: req("project_id", "content"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "send_message",
    action: "messages",
    agentMethod: "send_message",
    paramAliases: [["content", "message"]],
  },
  studio_fix_app: {
    method: "fix",
    description: "Pede uma correção de build para um app.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "fix",
    action: "fix",
    agentMethod: "fix_app",
  },
  studio_fix_validation: {
    method: "fix_validation",
    description: "Corrige problemas encontrados na validação do preview.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "fix_validation",
    action: "fix_validation",
    agentMethod: "fix_validation",
  },
  studio_rebuild_app: {
    method: "rebuild",
    description: "Recompila um app existente.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "rebuild",
    action: "rebuild",
    agentMethod: "rebuild_app",
  },
  studio_retry_app: {
    method: "retry",
    description: "Tenta gerar de novo um app que falhou.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "retry",
    action: "retry",
    agentMethod: "retry_app",
  },
  studio_list_versions: {
    method: "versions",
    description: "Lista o histórico de versões de um app.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "versions",
    action: "versions",
    agentMethod: "list_versions",
  },
  studio_restore_version: {
    method: "restore",
    description: "Restaura uma versão do histórico e recompila.",
    required: req("project_id", "version"),
    integers: req("version"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "restore",
    action: "restore",
    agentMethod: "restore_version",
  },
  studio_import_site: {
    method: "import_site",
    description: "Importa um site público como app.",
    required: req("url"),
    optional: req("prompt"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "import_site",
    action: "import",
    kind: "site",
    agentMethod: "import_site",
  },
  studio_import_github: {
    method: "import_github",
    description: "Importa um repositório público do github.com.",
    required: req("url"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "import_github",
    action: "import",
    kind: "github",
    agentMethod: "import_github",
  },
  studio_import_app: {
    method: "import_app",
    description: "Cria um app a partir de outro app existente.",
    required: req("project_id"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "import_app",
    action: "import",
    kind: "app",
    agentMethod: "import_app",
  },
  studio_analyze_inspiration: {
    method: "inspiration",
    description: "Analisa um canal/perfil público de rede social.",
    required: req("url"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "analyze_inspiration",
    action: "inspiration",
    agentMethod: "analyze_inspiration",
  },
  studio_create_inspiration: {
    method: "create_inspiration",
    description: "Cria um app original a partir de uma análise.",
    required: req("inspiration_token"),
    optional: req("prompt"),
    agent: "studio_agent",
    group: "studio",
    requires: req("studio_health"),
    clientMethod: "create_inspiration",
    action: "inspiration_create",
    agentMethod: "create_inspiration",
  },
};

export const KNOWN_TOOLS = new Set(Object.keys(REGISTRY));

export const STUDIO_TOOLS = new Set(
  Object.entries(REGISTRY)
    .filter(([, s]) => (s.requires ?? []).includes("studio_health"))
    .map(([n]) => n),
);

/** (agent, tool) pairs applied to the capabilities table. */
export const SEED: [string, string][] = Object.entries(REGISTRY)
  .filter(([, s]) => s.agent)
  .map(([n, s]) => [s.agent as string, n]);

/** Tools that carry a public HTTP/CLI contract (the studio area). */
export const TOOL_SPECS: Record<string, ToolSpec> = Object.fromEntries(
  Object.entries(REGISTRY).filter(([, s]) => s.method),
);

const key = (action: string, kind: string) => `${action}\u0000${kind}`;

/** Closed StudioRequest action (+ import kind) -> tool name. */
export const STUDIO_ACTION_TOOL = new Map<string, string>(
  Object.entries(REGISTRY)
    .filter(([, s]) => s.agent === "studio_agent" && s.action)
    .map(([n, s]) => [key(s.action as string, s.kind ?? ""), n]),
);

/** Public StudioAgent method -> tool name. */
export const STUDIO_AGENT_TOOL = new Map<string, string>(
  Object.entries(REGISTRY)
    .filter(([, s]) => s.agent === "studio_agent" && s.agentMethod)
    .map(([, s]) => [s.agentMethod as string, Object.keys(REGISTRY).find((n) => REGISTRY[n] === s) as string]),
);

/** The single name deviation between StudioRequest and a tool parameter. */
export const STUDIO_PARAM_ALIASES: Record<string, string> = Object.fromEntries(
  Object.values(REGISTRY).flatMap((s) => (s.paramAliases ?? []).map(([p, src]) => [p, src])),
);

/** Areas outside studio: (agent, role) -> tool. */
export const AGENT_TOOL = new Map<string, string>(
  Object.entries(REGISTRY)
    .filter(([, s]) => s.agent && s.agentMethod && !s.method)
    .map(([n, s]) => [`${s.agent}\u0000${s.agentMethod}`, n]),
);

export const agentTool = (agent: string, role: string): string => AGENT_TOOL.get(`${agent}\u0000${role}`) ?? "";
export const studioActionTool = (action: string, kind = ""): string => STUDIO_ACTION_TOOL.get(key(action, kind)) ?? "";
