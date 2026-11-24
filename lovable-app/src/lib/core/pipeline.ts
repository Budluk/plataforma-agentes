// Pure lead and pipeline primitives for Fase 4. No I/O, no clock, no database.
// Stages are tenant configuration supplied by the caller; probabilities and
// amounts never come from invented data.

import { z } from "zod";
import { decideAutonomy, scoreLead, type AutonomyLevel, type LeadSignals } from "./comercial";
import { detectDuplicates, type ContactLike, type DuplicateGroup } from "./crm";
import { round2 } from "./dashboard";

export const DEFAULT_STAGE_KEYS = [
  "lead_recebido",
  "lead_identificado",
  "primeiro_contato",
  "qualificacao",
  "reuniao_demo",
  "proposta_enviada",
  "negociacao",
  "fechamento",
  "venda_ganha",
  "venda_perdida",
  "pos_venda",
] as const;

const DEFAULT_STAGE_LABELS: Record<string, string> = {
  lead_recebido: "Lead recebido",
  lead_identificado: "Lead identificado",
  primeiro_contato: "Primeiro contato",
  qualificacao: "Qualificação",
  reuniao_demo: "Reunião/demo",
  proposta_enviada: "Proposta enviada",
  negociacao: "Negociação",
  fechamento: "Fechamento",
  venda_ganha: "Venda ganha",
  venda_perdida: "Venda perdida",
  pos_venda: "Pós-venda",
};

const TERMINAL_STAGES = new Set(["venda_ganha", "venda_perdida", "pos_venda"]);

export const PipelineStage = z
  .object({
    key: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(80),
    position: z.number().int().min(0).max(1000),
    /** 0 means "not configured"; no probability is guessed. */
    probability_default: z.number().finite().min(0).max(100),
    active: z.boolean(),
  })
  .strict();
export type PipelineStage = z.infer<typeof PipelineStage>;

/** Suggested order only. Probabilities stay unset until the tenant configures them. */
export function defaultPipelineStages(): PipelineStage[] {
  return DEFAULT_STAGE_KEYS.map((key, position) => ({
    key,
    label: DEFAULT_STAGE_LABELS[key] ?? key,
    position,
    probability_default: 0,
    active: true,
  }));
}

function validateStages(stages: readonly PipelineStage[]): PipelineStage[] {
  const keys = new Set<string>();
  const positions = new Set<number>();
  for (const stage of stages) {
    if (!PipelineStage.safeParse(stage).success) throw new Error("configuração de etapa inválida");
    if (keys.has(stage.key) || positions.has(stage.position))
      throw new Error("configuração de pipeline inválida: chave ou posição duplicada");
    keys.add(stage.key);
    positions.add(stage.position);
  }
  return [...stages].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
}

// ---------------- Kanban ----------------

export interface OpportunityCard {
  id: string;
  stage: string;
  amount_cents: number;
  probability?: number | null;
}

interface ProbabilitySources {
  explicit: number;
  stage_default: number;
  missing: number;
}

export interface KanbanColumn {
  key: string;
  label: string;
  position: number;
  terminal: boolean;
  count: number;
  total_cents: number;
  invalid_amounts: number;
  weighted_cents: number | null;
  probability_sources: ProbabilitySources;
  reason: string;
}

export interface KanbanBoard {
  status: "medido" | "sem_dados";
  columns: KanbanColumn[];
  /** null = a soma não é um inteiro seguro; nenhum número é inventado no lugar dela. */
  open_cents: number | null;
  weighted_open_cents: number | null;
  unmapped: { count: number; ids: string[] };
  invalid_amounts: number;
  reason: string;
}

const validCents = (v: number) => Number.isSafeInteger(v) && v >= 0;
const validProbability = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
/** Só devolve um número enquanto a soma continuar sendo um inteiro seguro. */
const safeAdd = (sum: number, value: number): number | null => {
  const next = sum + value;
  return Number.isSafeInteger(next) ? next : null;
};

/** Groups supplied opportunities into configured columns. Unknown stages are listed, never dropped silently. */
export function buildKanbanBoard(
  stages: readonly PipelineStage[],
  opportunities: readonly OpportunityCard[],
): KanbanBoard {
  const ordered = validateStages(stages);
  const active = ordered.filter((s) => s.active);
  const byKey = new Map(active.map((s) => [s.key, s]));
  const seen = new Set<string>();
  const unmappedIds: string[] = [];

  const columns: KanbanColumn[] = active.map((stage) => {
    const cards = opportunities.filter((o) => o.stage.trim() === stage.key);
    let total_cents = 0;
    let invalid_amounts = 0;
    let overflow_amounts = 0;
    let weighted_cents = 0;
    let weightedCards = 0;
    let weightedOverflow = false;
    const probability_sources: ProbabilitySources = { explicit: 0, stage_default: 0, missing: 0 };
    for (const card of cards) {
      seen.add(card.id);
      if (!validCents(card.amount_cents)) {
        invalid_amounts++;
        continue;
      }
      const nextTotal = safeAdd(total_cents, card.amount_cents);
      if (nextTotal === null) {
        invalid_amounts++;
        overflow_amounts++;
        continue;
      }
      total_cents = nextTotal;
      const probability = validProbability(card.probability)
        ? card.probability
        : stage.probability_default > 0
          ? stage.probability_default
          : null;
      if (validProbability(card.probability)) probability_sources.explicit++;
      else if (stage.probability_default > 0) probability_sources.stage_default++;
      else probability_sources.missing++;
      if (probability !== null) {
        const weighted = Math.round(card.amount_cents * (probability / 100));
        const nextWeighted = validCents(weighted) ? safeAdd(weighted_cents, weighted) : null;
        if (nextWeighted === null) weightedOverflow = true;
        else {
          weighted_cents = nextWeighted;
          weightedCards++;
        }
      }
    }
    return {
      key: stage.key,
      label: stage.label,
      position: stage.position,
      terminal: TERMINAL_STAGES.has(stage.key),
      count: cards.length,
      total_cents,
      invalid_amounts,
      weighted_cents: weightedCards && !weightedOverflow ? weighted_cents : null,
      probability_sources,
      reason: [
        invalid_amounts
          ? `${invalid_amounts} valor(es) inválido(s) descartado(s) desta coluna${overflow_amounts ? ` (${overflow_amounts} por estouro)` : ""}.`
          : "Valores e probabilidades vêm das linhas informadas e da configuração da etapa.",
        weightedOverflow ? "Soma ponderada não mensurável nesta coluna." : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  for (const card of opportunities) {
    if (!seen.has(card.id)) unmappedIds.push(card.id);
  }
  const open = columns.filter((c) => !c.terminal);
  const openWeighted = open.filter((c) => c.weighted_cents !== null);
  const measured = columns.some((c) => c.count > 0);
  const openTotal = open.reduce<number | null>(
    (sum, c) => (sum === null ? null : safeAdd(sum, c.total_cents)),
    0,
  );
  const openWeightedTotal = openWeighted.reduce<number | null>(
    (sum, c) => (sum === null ? null : safeAdd(sum, c.weighted_cents ?? 0)),
    0,
  );
  return {
    status: measured ? "medido" : "sem_dados",
    columns,
    open_cents: openTotal,
    weighted_open_cents: openWeighted.length ? openWeightedTotal : null,
    unmapped: { count: unmappedIds.length, ids: unmappedIds.slice(0, 20) },
    invalid_amounts: columns.reduce((sum, c) => sum + c.invalid_amounts, 0),
    reason: measured
      ? `Quadros montados somente com oportunidades informadas; etapas desconhecidas ficam em unmapped.${openTotal === null || openWeightedTotal === null ? " Alguns totais excedem o limite seguro e não foram informados." : ""}`
      : "Nenhuma oportunidade informada; nenhum valor foi inferido.",
  };
}

// ---------------- Stage moves ----------------

export interface StageMoveInput {
  from: string;
  to: string;
  stages: readonly PipelineStage[];
  action?: string;
  autonomy: AutonomyLevel;
  grantActions: readonly string[];
  allowedTransitions?: readonly { from: string; to: string }[];
  killEngaged?: boolean;
}

export interface StageMoveDecision {
  allowed: boolean;
  requiresApproval: boolean;
  kind: "avanco" | "retorno" | "terminal" | "invalido" | "bloqueado";
  reasons: string[];
}

/** Forward moves may be automated; backward and terminal moves always need a human. */
export function decideStageMove(input: StageMoveInput): StageMoveDecision {
  const ordered = validateStages(input.stages);
  const from = ordered.find((s) => s.key === input.from && s.active);
  const to = ordered.find((s) => s.key === input.to && s.active);
  if (!from || !to) {
    return {
      allowed: false,
      requiresApproval: false,
      kind: "invalido",
      reasons: ["etapa de origem ou destino inexistente/inativa"],
    };
  }
  if (from.key === to.key) {
    return {
      allowed: false,
      requiresApproval: false,
      kind: "invalido",
      reasons: ["origem e destino são iguais"],
    };
  }

  const explicitlyAllowed = input.allowedTransitions?.some(
    (t) => t.from === from.key && t.to === to.key,
  );
  let kind: StageMoveDecision["kind"];
  if (TERMINAL_STAGES.has(to.key)) kind = "terminal";
  else if (to.position > from.position) kind = "avanco";
  else if (explicitlyAllowed) kind = "retorno";
  else
    return {
      allowed: false,
      requiresApproval: false,
      kind: "invalido",
      reasons: ["retorno de etapa sem regra explícita autorizada"],
    };

  const gate = decideAutonomy({
    action: input.action ?? "mover_oportunidade",
    autonomy: input.autonomy,
    grantActions: input.grantActions,
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
  });
  if (!gate.allowed && !gate.requiresApproval)
    return { allowed: false, requiresApproval: false, kind: "bloqueado", reasons: gate.reasons };

  const reasons = [...gate.reasons];
  if (kind === "retorno")
    reasons.push("retorno de etapa exige confirmação humana e registro em auditoria");
  if (kind === "terminal") reasons.push("fechamento em etapa terminal exige confirmação humana");
  if (gate.requiresApproval || kind === "retorno" || kind === "terminal")
    return { allowed: false, requiresApproval: true, kind, reasons };
  return { allowed: true, requiresApproval: false, kind, reasons };
}

// ---------------- Lead capture ----------------

export const LeadCapture = z
  .object({
    organization_id: z.string().trim().min(1).max(64),
    source: z.string().trim().min(1).max(80),
    /** Server-resolved from lead_sources; never trust a browser-provided flag. */
    source_authorized: z.boolean(),
    display_name: z.string().trim().min(1).max(160),
    emails: z.array(z.string().trim().email().max(254)).max(10),
    phones: z
      .array(
        z
          .string()
          .trim()
          .regex(/^\+?[0-9 ()-]{8,20}$/),
      )
      .max(10),
    document_token: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{8,128}$/)
      .nullable()
      .default(null),
    company: z.string().trim().max(160).nullable().default(null),
    purpose: z.string().trim().min(1).max(200),
    legal_basis: z.enum(["consentimento", "interesse_legitimo", "contrato"]),
    consent_granted: z.boolean(),
    evidence_ref: z.string().trim().max(200).nullable().default(null),
  })
  .strict();
export type LeadCapture = z.infer<typeof LeadCapture>;

export interface CapturePreview {
  status: "preparado" | "bloqueado";
  requiresConfirmation: true;
  reasons: string[];
  duplicateGroups: DuplicateGroup[];
  lead: Omit<LeadCapture, "source_authorized" | "consent_granted"> | null;
}

const CANDIDATE_ID = "__candidato__";

/** Validates provenance and LGPD basis, then previews duplicates. Never writes. */
export function prepareLeadCapture(
  input: unknown,
  existing: readonly ContactLike[],
): CapturePreview {
  const parsed = LeadCapture.safeParse(input);
  if (!parsed.success) {
    return {
      status: "bloqueado",
      requiresConfirmation: true,
      reasons: parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`),
      duplicateGroups: [],
      lead: null,
    };
  }
  const lead = parsed.data;
  const candidate: ContactLike = {
    id: CANDIDATE_ID,
    display_name: lead.display_name,
    emails: lead.emails,
    phones: lead.phones,
    document_token: lead.document_token,
  };
  const duplicateGroups = detectDuplicates([...existing, candidate])
    .filter((g) => g.ids.includes(CANDIDATE_ID))
    .map((g) => ({ ...g, ids: g.ids.filter((id) => id !== CANDIDATE_ID) }));

  const reasons: string[] = [];
  if (!lead.source_authorized) reasons.push("fonte não autorizada para prospecção");
  if (lead.legal_basis === "consentimento" && !lead.consent_granted)
    reasons.push("base legal 'consentimento' sem consentimento registrado");
  if (lead.legal_basis !== "consentimento" && !lead.evidence_ref)
    reasons.push("base legal informada sem evidência registrada (evidence_ref)");
  if (duplicateGroups.length)
    reasons.push("possíveis duplicatas exigem confirmação antes da unificação");

  if (reasons.length) {
    return {
      status: "bloqueado",
      requiresConfirmation: true,
      reasons,
      duplicateGroups,
      lead: null,
    };
  }
  const { source_authorized: _authorized, consent_granted: _granted, ...safeLead } = lead;
  void _authorized;
  void _granted;
  return {
    status: "preparado",
    requiresConfirmation: true,
    reasons: [
      "Lead preparado para confirmação humana; nenhum registro foi gravado.",
      "Necessidades inferidas permanecem como hipótese até confirmação do contato.",
    ],
    duplicateGroups,
    lead: safeLead,
  };
}

// ---------------- Qualification ----------------

export interface QualificationOptions {
  threshold?: number;
  optedOut?: boolean;
  needVerified?: boolean;
}

export interface QualificationResult {
  status: "qualificado" | "nao_qualificado" | "sem_dados";
  score: number | null;
  used: string[];
  requiresHumanConfirmation: true;
  outreachAllowed: boolean;
  reasons: string[];
}

/** Recommends a classification from explicit evidence; the human confirms it. */
export function qualifyLead(
  signals: LeadSignals,
  options: QualificationOptions = {},
): QualificationResult {
  const threshold = options.threshold ?? 60;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
    throw new Error("limiar de qualificação deve estar entre 0 e 100");
  const scored = scoreLead(signals);
  const reasons = [scored.reason];
  if (scored.status === "sem_dados") {
    return {
      status: "sem_dados",
      score: null,
      used: scored.used,
      requiresHumanConfirmation: true,
      outreachAllowed: false,
      reasons,
    };
  }
  const status = (scored.score ?? 0) >= threshold ? "qualificado" : "nao_qualificado";
  reasons.push(
    `Limiar configurado: ${threshold}; classificação é recomendação, não fato confirmado.`,
  );
  if (!options.needVerified)
    reasons.push("Necessidade ainda é hipótese até confirmação do contato.");
  const outreachAllowed = !options.optedOut;
  if (!outreachAllowed)
    reasons.push("Contato optou por não receber mensagens; nenhum envio é permitido.");
  return {
    status,
    score: scored.score,
    used: scored.used,
    requiresHumanConfirmation: true,
    outreachAllowed,
    reasons,
  };
}

// ---------------- Funnel from recorded moves ----------------

export interface FunnelEvent {
  opportunity_id: string;
  from_stage: string | null;
  to_stage: string;
}

export interface FunnelStep {
  key: string;
  label: string;
  position: number;
  entered: number | null;
  exited: number | null;
  conversion_pct: number | null;
  reason: string;
}

export interface FunnelSnapshot {
  status: "medido" | "sem_dados";
  steps: FunnelStep[];
  totalEvents: number;
  unknownStages: string[];
  reason: string;
}

/** Counts only recorded moves. Missing prior stage means no conversion percentage. */
export function buildFunnelSnapshot(
  stages: readonly PipelineStage[],
  events: readonly FunnelEvent[],
): FunnelSnapshot {
  const ordered = validateStages(stages).filter((s) => s.active);
  const known = new Set(ordered.map((s) => s.key));
  const unknown = new Set<string>();
  const entered = new Map<string, number>();
  const exited = new Map<string, number>();
  for (const event of events) {
    if (!known.has(event.to_stage)) unknown.add(event.to_stage);
    else entered.set(event.to_stage, (entered.get(event.to_stage) ?? 0) + 1);
    if (event.from_stage && !known.has(event.from_stage)) unknown.add(event.from_stage);
    else if (event.from_stage)
      exited.set(event.from_stage, (exited.get(event.from_stage) ?? 0) + 1);
  }
  const steps: FunnelStep[] = ordered.map((stage, index) => {
    const previous = index > 0 ? ordered[index - 1] : undefined;
    const currentEntered = entered.get(stage.key) ?? 0;
    const previousEntered = previous ? (entered.get(previous.key) ?? 0) : 0;
    const conversion_pct =
      previous && previousEntered > 0 ? round2((currentEntered / previousEntered) * 100) : null;
    return {
      key: stage.key,
      label: stage.label,
      position: stage.position,
      entered: events.length ? currentEntered : null,
      exited: events.length ? (exited.get(stage.key) ?? 0) : null,
      conversion_pct,
      reason: !events.length
        ? "Sem movimentações informadas."
        : conversion_pct === null
          ? "Sem entrada suficiente na etapa anterior; conversão não calculada."
          : `Conversão sobre as entradas da etapa anterior (${previous?.key}).`,
    };
  });
  return {
    status: events.length ? "medido" : "sem_dados",
    steps,
    totalEvents: events.length,
    unknownStages: [...unknown].sort((a, b) => a.localeCompare(b)),
    reason:
      "Contagens derivadas das movimentações informadas; etapas desconhecidas não entram nos cálculos.",
  };
}
