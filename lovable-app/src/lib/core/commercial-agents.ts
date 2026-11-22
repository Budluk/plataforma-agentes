// Pure contracts, prompts and gates for the nine commercial agents (Fase 5).
// No I/O, no clock, no database, no secrets. This is a proposal of roles and
// permissions over the existing registry: it does not create schema, register
// execution tools or enable sending.

import { z } from "zod";
import {
  AUTONOMY_LEVELS,
  SENSIBLE_ACTIONS,
  checkCommercialTool,
  decideAutonomy,
  type AutonomyDecision,
  type AutonomyLevel,
} from "./comercial";
import { COMMERCIAL_AGENT_SYSTEM_BASE } from "./prompts";
import { KNOWN_TOOLS, REGISTRY } from "./toolRegistry";

export const COMMERCIAL_AGENT_IDS = [
  "prospector_agent",
  "qualifier_agent",
  "crm_steward_agent",
  "pipeline_agent",
  "funnel_agent",
  "sales_agent",
  "proposal_agent",
  "followup_agent",
  "insights_agent",
] as const;
export type CommercialAgentId = (typeof COMMERCIAL_AGENT_IDS)[number];

/** Read/preparation actions only. Sensitive actions are never agent actions. */
export const COMMERCIAL_ACTIONS = [
  "avaliar_fonte",
  "preparar_lead",
  "calcular_score",
  "qualificar_lead",
  "detectar_duplicatas",
  "previsualizar_merge",
  "segmentar_contatos",
  "montar_kanban",
  "mover_oportunidade",
  "ler_funil",
  "calcular_margem",
  "sugerir_preco",
  "calcular_break_even",
  "preparar_proposta",
  "validar_desconto",
  "rascunhar_resposta",
  "preparar_lembrete",
  "carregar_conversa",
  "validar_template",
  "avaliar_janela",
  "preparar_optout",
  "ler_dashboard",
  "gerar_leitura",
] as const;
export type CommercialAction = (typeof COMMERCIAL_ACTIONS)[number];

/** Explicit action -> tool map. Existing sales/funnel tools are reused. */
export const COMMERCIAL_ACTION_TOOL: Record<CommercialAction, string> = {
  avaliar_fonte: "avaliar_fonte",
  preparar_lead: "preparar_lead",
  calcular_score: "calcular_score",
  qualificar_lead: "qualificar_lead",
  detectar_duplicatas: "detectar_duplicatas",
  previsualizar_merge: "previsualizar_merge",
  segmentar_contatos: "segmentar_contatos",
  montar_kanban: "montar_kanban",
  mover_oportunidade: "mover_oportunidade",
  ler_funil: "analyze_funnel",
  calcular_margem: "compute_margin",
  sugerir_preco: "suggest_price",
  calcular_break_even: "break_even",
  preparar_proposta: "preparar_proposta",
  validar_desconto: "validar_desconto",
  rascunhar_resposta: "rascunhar_resposta",
  preparar_lembrete: "preparar_lembrete",
  carregar_conversa: "carregar_conversa",
  validar_template: "validar_template",
  avaliar_janela: "avaliar_janela",
  preparar_optout: "preparar_optout",
  ler_dashboard: "ler_dashboard",
  gerar_leitura: "gerar_leitura",
};

export const CommercialAgentSpec = z
  .object({
    id: z.enum(COMMERCIAL_AGENT_IDS),
    name: z.string().trim().min(1).max(80),
    role: z.string().trim().min(1).max(300),
    purpose: z.string().trim().min(1).max(300),
    dataMinimization: z.string().trim().min(1).max(300),
    actions: z.array(z.enum(COMMERCIAL_ACTIONS)).min(1).max(10),
    defaultAutonomy: z.enum(AUTONOMY_LEVELS),
    outputContract: z.string().trim().min(1).max(80),
  })
  .strict();
export type CommercialAgentSpec = z.infer<typeof CommercialAgentSpec>;

/**
 * The nine proposed commercial roles. `defaultAutonomy` is a starting point
 * for a tenant grant; it never grants permission by itself — the server must
 * supply the actions from `agent_grants` on every authorization.
 */
export const COMMERCIAL_AGENTS: readonly CommercialAgentSpec[] = [
  {
    id: "prospector_agent",
    name: "Prospecção",
    role: "Avalia fontes autorizadas e prepara leads candidatos sem contatar ninguém.",
    purpose: "Formar uma lista de prospecção rastreável, com finalidade e base legal registradas.",
    dataMinimization: "Nome, canal autorizado e evidência de consentimento; sem documento em claro.",
    actions: ["avaliar_fonte", "preparar_lead"],
    defaultAutonomy: "assistido",
    outputContract: "LeadCapture",
  },
  {
    id: "qualifier_agent",
    name: "Qualificação",
    role: "Calcula score com evidências explícitas e recomenda uma classificação.",
    purpose: "Priorizar contatos com critérios auditáveis, mantendo hipóteses como hipóteses.",
    dataMinimization: "Apenas os sinais necessários ao score; nenhum dado inferido preenche lacuna.",
    actions: ["calcular_score", "qualificar_lead"],
    defaultAutonomy: "semiautonomo",
    outputContract: "QualificationResult",
  },
  {
    id: "crm_steward_agent",
    name: "CRM e higiene",
    role: "Detecta duplicatas, mostra preview de união e aplica segmentos sem mesclar registros.",
    purpose: "Manter a base consistente e pronta para revisão humana.",
    dataMinimization: "Chaves de deduplicação e tags; nada é exportado ou eliminado.",
    actions: ["detectar_duplicatas", "previsualizar_merge", "segmentar_contatos"],
    defaultAutonomy: "semiautonomo",
    outputContract: "MergePreview",
  },
  {
    id: "pipeline_agent",
    name: "Funil e Kanban",
    role: "Monta quadros a partir de oportunidades reais e propõe avanços de etapa.",
    purpose: "Tornar o funil legível sem inventar probabilidades ou valores.",
    dataMinimization: "Identificador, etapa, valor e probabilidade informada; etapas desconhecidas ficam visíveis.",
    actions: ["montar_kanban", "mover_oportunidade"],
    defaultAutonomy: "autonomo_controlado",
    outputContract: "StageMoveDecision",
  },
  {
    id: "funnel_agent",
    name: "Análise de funil",
    role: "Lê o funil de anúncios e vendas com as ferramentas já existentes.",
    purpose: "Calcular margem e conversão somente sobre números informados pelo operador.",
    dataMinimization: "Números agregados de anúncios e vendas; nenhum dado pessoal é necessário.",
    actions: ["ler_funil"],
    defaultAutonomy: "autonomo_controlado",
    outputContract: "FunnelAnalysis",
  },
  {
    id: "sales_agent",
    name: "Vendas e margem",
    role: "Reutiliza margem, preço sugerido e ponto de equilíbrio já registrados.",
    purpose: "Dar apoio numérico a decisões de preço sem aplicar alteração de tabela.",
    dataMinimization: "Custos, preços e tarifas informados; nenhum preço de concorrente é buscado automaticamente.",
    actions: ["calcular_margem", "sugerir_preco", "calcular_break_even"],
    defaultAutonomy: "autonomo_controlado",
    outputContract: "SalesOutcome",
  },
  {
    id: "proposal_agent",
    name: "Propostas",
    role: "Prepara rascunhos de proposta e valida descontos contra a tabela autorizada.",
    purpose: "Reduzir retrabalho com propostas rastreáveis, sem envio nem compromisso financeiro.",
    dataMinimization: "Itens, quantidades e desconto da tabela; o rascunho não contém dados sensíveis extras.",
    actions: ["preparar_proposta", "validar_desconto"],
    defaultAutonomy: "semiautonomo",
    outputContract: "rascunho de proposta (contrato na Fase 8)",
  },
  {
    id: "followup_agent",
    name: "Relacionamento",
    role: "Rascunha respostas e lembretes; o envio real permanece com uma pessoa.",
    purpose: "Agilizar o acompanhamento sem automatizar mensagens nem campanhas.",
    dataMinimization: "Só o necessário para o rascunho; opt-out bloqueia qualquer sugestão de contato.",
    actions: [
      "rascunhar_resposta",
      "preparar_lembrete",
      "carregar_conversa",
      "validar_template",
      "avaliar_janela",
      "preparar_optout",
    ],
    defaultAutonomy: "assistido",
    outputContract: "rascunho de resposta (contrato na Fase 6)",
  },
  {
    id: "insights_agent",
    name: "Inteligência comercial",
    role: "Consolida leituras do dashboard, séries e tendências salvas com status explícito.",
    purpose: "Expor o que os dados reais dizem e onde não há base suficiente.",
    dataMinimization: "Métricas agregadas e tendências já salvas; vitrine ilustrativa rotulada AMOSTRA.",
    actions: ["ler_dashboard", "gerar_leitura"],
    defaultAutonomy: "autonomo_controlado",
    outputContract: "IntelligenceReading (inteligencia.ts)",
  },
];

const BY_ID = new Map(COMMERCIAL_AGENTS.map((a) => [a.id, a]));

export function commercialAgent(id: CommercialAgentId): CommercialAgentSpec {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`agente comercial desconhecido: '${id}'`);
  return found;
}

export function actionsForAgent(id: CommercialAgentId): readonly CommercialAction[] {
  return commercialAgent(id).actions;
}

export function agentsForAction(action: CommercialAction): CommercialAgentId[] {
  return COMMERCIAL_AGENTS.filter((a) => a.actions.includes(action)).map((a) => a.id);
}

/** Tool gate for the commercial area: hard gate first, then registry ownership. */
export function commercialToolAllowed(tool: string): { allowed: boolean; reason: string } {
  const gate = checkCommercialTool(tool);
  if (!gate.allowed) return gate;
  if (!KNOWN_TOOLS.has(tool))
    return { allowed: false, reason: `ferramenta comercial não registrada: '${tool}'` };
  const owner = REGISTRY[tool]?.agent;
  if (!owner || !(COMMERCIAL_AGENT_IDS as readonly string[]).includes(owner))
    return { allowed: false, reason: `ferramenta '${tool}' não pertence a um agente comercial` };
  return { allowed: true, reason: "ferramenta comercial permitida" };
}

export interface CommercialAuthorizationInput {
  agent: CommercialAgentId;
  action: CommercialAction;
  /** Server-supplied from agent_grants; never inferred from the prompt. */
  grantActions?: readonly string[];
  /** Defaults to the agent spec when absent. */
  autonomy?: AutonomyLevel;
  killEngaged?: boolean;
  discountPct?: number | null;
  withinPriceTable?: boolean;
}

export interface CommercialAuthorization extends AutonomyDecision {
  agent: CommercialAgentId;
  action: CommercialAction;
  tool: string;
}

/**
 * Authorizes a read/preparation action. Missing grants fail closed: the caller
 * must supply the tenant's granted actions. Approval never becomes execution.
 */
export function authorizeCommercialAction(
  input: CommercialAuthorizationInput,
): CommercialAuthorization {
  const spec = commercialAgent(input.agent);
  const tool = COMMERCIAL_ACTION_TOOL[input.action];
  const base = { agent: input.agent, action: input.action, tool };

  if (!spec.actions.includes(input.action)) {
    return {
      ...base,
      allowed: false,
      requiresApproval: false,
      reasons: [`ação '${input.action}' fora do escopo de '${spec.name}'`],
    };
  }
  const toolGate = commercialToolAllowed(tool);
  if (!toolGate.allowed) {
    return { ...base, allowed: false, requiresApproval: false, reasons: [toolGate.reason] };
  }
  const decision = decideAutonomy({
    action: input.action,
    autonomy: input.autonomy ?? spec.defaultAutonomy,
    grantActions: input.grantActions ?? [],
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
    ...(input.discountPct === undefined ? {} : { discountPct: input.discountPct }),
    ...(input.withinPriceTable === undefined ? {} : { withinPriceTable: input.withinPriceTable }),
  });
  return { ...base, ...decision };
}

/** Fixed JSON contract for an agent proposal. The LLM never supplies numbers. */
export const CommercialAgentProposal = z
  .object({
    action: z.enum(COMMERCIAL_ACTIONS),
    tool: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(300),
    needs_approval: z.boolean(),
    reasons: z.array(z.string().trim().min(1).max(200)).max(5),
  })
  .strict();
export type CommercialAgentProposal = z.infer<typeof CommercialAgentProposal>;

export interface CommercialProposalCheck {
  /** Proposal is coherent with the agent and the gate; it may still need approval. */
  valid: boolean;
  reasons: string[];
  authorization: CommercialAuthorization;
}

/** Validates a parsed-or-raw LLM proposal against the agent scope and the gate. */
export function checkCommercialProposal(
  raw: unknown,
  input: CommercialAuthorizationInput,
): CommercialProposalCheck {
  const authorization = authorizeCommercialAction(input);
  const parsed = CommercialAgentProposal.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      reasons: parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`),
      authorization,
    };
  }
  const proposal = parsed.data;
  const reasons: string[] = [];
  if (proposal.action !== input.action)
    reasons.push(`ação proposta '${proposal.action}' difere da solicitada '${input.action}'`);
  const expectedTool = COMMERCIAL_ACTION_TOOL[proposal.action];
  if (proposal.tool !== expectedTool)
    reasons.push(`ferramenta proposta '${proposal.tool}' difere de '${expectedTool}'`);
  if (!commercialAgent(input.agent).actions.includes(proposal.action))
    reasons.push(`ação '${proposal.action}' fora do escopo de '${input.agent}'`);
  if (authorization.requiresApproval && !proposal.needs_approval)
    reasons.push("a proposta marca needs_approval=false, mas o gate exige aprovação humana");
  const toolGate = commercialToolAllowed(proposal.tool);
  if (!toolGate.allowed) reasons.push(toolGate.reason);
  return { valid: reasons.length === 0, reasons, authorization };
}

/** Builds a bounded system prompt from the spec, never from free-form text. */
export function commercialAgentSystem(id: CommercialAgentId): string {
  const spec = commercialAgent(id);
  const actions = [...spec.actions].sort().join(", ");
  const tools = [...new Set(spec.actions.map((a) => COMMERCIAL_ACTION_TOOL[a]))].sort().join(", ");
  return (
    COMMERCIAL_AGENT_SYSTEM_BASE +
    `Você é '${spec.name}' (${spec.id}). ${spec.role} Finalidade: ${spec.purpose} ` +
    `Ações permitidas: ${actions}. Ferramentas permitidas: ${tools}. ` +
    `Minimização de dados: ${spec.dataMinimization}. ` +
    `Nível de autonomia padrão: ${spec.defaultAutonomy}. ` +
    "Responda SOMENTE com um objeto JSON válido, sem texto extra, com as chaves exatas: " +
    "action (uma das ações permitidas), tool (uma das ferramentas permitidas), " +
    "summary (até 300 caracteres), needs_approval (boolean) e reasons (lista de até 5 textos curtos). " +
    "Nunca proponha ações sensíveis, envio, campanha, checkout ou pagamento."
  );
}

/** Regression check over the whole matrix; used in tests, no side effects. */
export function validateCommercialRegistry(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (new Set(COMMERCIAL_AGENT_IDS).size !== COMMERCIAL_AGENT_IDS.length)
    issues.push("ids de agentes duplicados");
  if (new Set(COMMERCIAL_ACTIONS).size !== COMMERCIAL_ACTIONS.length)
    issues.push("ações comerciais duplicadas");
  for (const action of COMMERCIAL_ACTIONS) {
    const tool = COMMERCIAL_ACTION_TOOL[action];
    const gate = commercialToolAllowed(tool);
    if (!gate.allowed) issues.push(`${action}: ${gate.reason}`);
    if (agentsForAction(action).length === 0) issues.push(`${action}: nenhum agente responsável`);
  }
  for (const spec of COMMERCIAL_AGENTS) {
    const parsed = CommercialAgentSpec.safeParse(spec);
    if (!parsed.success) issues.push(`${spec.id}: spec inválida`);
    const sensitive = spec.actions.filter((a) =>
      (SENSIBLE_ACTIONS as readonly string[]).includes(a),
    );
    if (sensitive.length) issues.push(`${spec.id}: ações sensíveis ${sensitive.join(", ")}`);
  }
  return { ok: issues.length === 0, issues };
}
