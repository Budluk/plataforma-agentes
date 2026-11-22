// Pure commercial contracts and gates for the CentralIA sales platform.
// No I/O, no clock, no database, no secrets. Safe on client and server.
// This is architecture for Fase 2: it does not create schema or enable sending.

import { z } from "zod";
import { assertNoExecutionTool, ExecutionToolForbidden } from "./hardGate";

export const TENANT_ROLES = ["owner", "admin", "manager", "seller", "viewer"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const AUTONOMY_LEVELS = ["assistido", "semiautonomo", "autonomo_controlado"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** Actions whose effect is external, irreversible or legally sensitive. */
export const SENSIBLE_ACTIONS = [
  "desconto_extraordinario",
  "alteracao_preco",
  "campanha_em_massa",
  "exclusao",
  "exportacao_dados",
  "contrato",
  "compromisso_financeiro",
  "alteracao_permissoes",
  "envio_mensagem",
  "checkout",
  "pagamento",
] as const;
export type SensibleAction = (typeof SENSIBLE_ACTIONS)[number];

export const Membership = z
  .object({
    organization_id: z.string().trim().min(1).max(64),
    user_id: z.string().trim().min(1).max(128),
    role: z.enum(TENANT_ROLES),
    active: z.boolean(),
  })
  .strict();
export type Membership = z.infer<typeof Membership>;

export const AgentGrant = z
  .object({
    organization_id: z.string().trim().min(1).max(64),
    agent_id: z.string().trim().min(1).max(64),
    actions: z.array(z.string().trim().min(1).max(80)).max(60),
    autonomy: z.enum(AUTONOMY_LEVELS),
    max_discount_pct: z.number().finite().min(0).max(100),
    active: z.boolean(),
  })
  .strict();
export type AgentGrant = z.infer<typeof AgentGrant>;

export interface AutonomyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
}

export interface AutonomyInput {
  action: string;
  autonomy: AutonomyLevel;
  grantActions: readonly string[];
  /** Null when the action does not involve a discount. */
  discountPct?: number | null;
  /** Result of the configured price table check. */
  withinPriceTable?: boolean;
  killEngaged?: boolean;
}

const isSensible = (action: string): action is SensibleAction =>
  (SENSIBLE_ACTIONS as readonly string[]).includes(action);

/**
 * Decides whether an agent may proceed and whether a human must approve.
 * Fail closed: unknown action, inactive grant, kill switch or missing price
 * evidence blocks or requires approval. Never enables external side effects.
 */
export function decideAutonomy(input: AutonomyInput): AutonomyDecision {
  const reasons: string[] = [];
  if (input.killEngaged)
    return { allowed: false, requiresApproval: false, reasons: ["kill switch ativo"] };
  if (!input.action.trim())
    return { allowed: false, requiresApproval: false, reasons: ["ação vazia"] };
  if (!input.grantActions.includes(input.action)) {
    return {
      allowed: false,
      requiresApproval: false,
      reasons: [`ação '${input.action}' não concedida ao agente`],
    };
  }
  if (isSensible(input.action)) {
    return {
      allowed: false,
      requiresApproval: true,
      reasons: [`'${input.action}' exige aprovação humana em todos os níveis de autonomia`],
    };
  }
  if (
    input.discountPct !== undefined &&
    input.discountPct !== null &&
    (!input.withinPriceTable || input.discountPct < 0 || input.discountPct > 100)
  ) {
    return {
      allowed: false,
      requiresApproval: true,
      reasons: ["desconto fora da tabela autorizada ou inválido"],
    };
  }
  if (input.autonomy === "assistido") {
    reasons.push("nível assistido: a IA recomenda, o humano executa");
    return { allowed: false, requiresApproval: true, reasons };
  }
  if (input.autonomy === "semiautonomo") {
    reasons.push("nível semiautônomo: ação preparada, aprovação necessária");
    return { allowed: false, requiresApproval: true, reasons };
  }
  return {
    allowed: true,
    requiresApproval: false,
    reasons: ["ação autorizada dentro dos limites"],
  };
}

/** Reuses the existing hard gate instead of creating a parallel veto list. */
export function checkCommercialTool(tool: string): { allowed: boolean; reason: string } {
  try {
    assertNoExecutionTool(tool);
    return { allowed: true, reason: "ferramenta permitida" };
  } catch (e) {
    if (e instanceof ExecutionToolForbidden) return { allowed: false, reason: e.message };
    return { allowed: false, reason: "falha ao avaliar ferramenta; bloqueado por padrão" };
  }
}

// ---------------- Lead scoring ----------------

const SCORE_WEIGHTS = {
  fit: 0.3,
  interest: 0.25,
  ability: 0.2,
  urgency: 0.15,
  interactions: 0.1,
} as const;

const ScoreSignal = z.number().finite().min(0).max(100);

export const LeadSignals = z
  .object({
    fit: ScoreSignal.optional(),
    interest: ScoreSignal.optional(),
    ability: ScoreSignal.optional(),
    urgency: ScoreSignal.optional(),
    interactions: ScoreSignal.optional(),
  })
  .strict();
export type LeadSignals = z.infer<typeof LeadSignals>;

export interface LeadScoreResult {
  status: "medido" | "sem_dados";
  score: number | null;
  used: string[];
  reason: string;
}

/**
 * Weighted mean of the signals actually present. Absent signals are not
 * zero-filled; fewer than two signals yields sem_dados. Evidence quality is
 * the caller's responsibility and is never inferred here.
 */
export function scoreLead(signals: LeadSignals): LeadScoreResult {
  const used = Object.keys(SCORE_WEIGHTS).filter(
    (k) => signals[k as keyof LeadSignals] !== undefined,
  );
  if (used.length < 2) {
    return {
      status: "sem_dados",
      score: null,
      used,
      reason: "Menos de duas evidências disponíveis; score não calculado.",
    };
  }
  const weightSum = used.reduce((sum, k) => sum + SCORE_WEIGHTS[k as keyof LeadSignals], 0);
  const weighted = used.reduce(
    (sum, k) =>
      sum + SCORE_WEIGHTS[k as keyof LeadSignals] * (signals[k as keyof LeadSignals] ?? 0),
    0,
  );
  return {
    status: "medido",
    score: Math.round((weighted / weightSum) * 100) / 100,
    used,
    reason: `Score calculado com ${used.length} evidência(s): ${used.join(", ")}.`,
  };
}

// ---------------- Money and forecasts ----------------

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formats integer cents as BRL. Caller supplies the value; no clock or rate. */
export function formatBRLFromCents(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents)) throw new Error("amount_cents deve ser inteiro seguro");
  return BRL.format(amountCents / 100);
}

export const Forecast = z
  .object({
    scope: z.string().trim().min(1).max(120),
    period: z.string().trim().min(1).max(60),
    value_cents: z.number().int().nonnegative(),
    confidence: z.number().finite().min(0).max(1),
    inputs: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
    limitations: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  })
  .strict();
export type Forecast = z.infer<typeof Forecast>;
