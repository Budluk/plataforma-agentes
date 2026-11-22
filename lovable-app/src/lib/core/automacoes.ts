// Pure automation contracts for Fase 7. No I/O, no clock, no database, no
// queue, no secrets. This module PLANS runs; it never executes a step. Every
// step is authorized through the existing commercial agent gate, so no new
// tool is registered and sending/campaigns/checkout/payments stay vetoed by
// hardGate.ts.

import { z } from "zod";
import { AUTONOMY_LEVELS, canonicalAction, SENSIBLE_ACTIONS, type AutonomyLevel } from "./comercial";
import {
  COMMERCIAL_ACTIONS,
  COMMERCIAL_ACTION_TOOL,
  COMMERCIAL_AGENT_IDS,
  authorizeCommercialAction,
  commercialAgent,
  commercialToolAllowed,
  type CommercialAction,
  type CommercialAgentId,
} from "./commercial-agents";
import { timestampMs } from "./dashboard";

export const WORKFLOW_TRIGGERS = [
  "lead_criado",
  "lead_qualificado",
  "oportunidade_movida",
  "conversa_recebida",
  "proposta_preparada",
  "revisao_manual",
] as const;
export type WorkflowTriggerKind = (typeof WORKFLOW_TRIGGERS)[number];

export const CONDITION_OPERATORS = [
  "igual",
  "diferente",
  "maior_que",
  "maior_ou_igual",
  "menor_que",
  "menor_ou_igual",
  "contem",
  "nao_contem",
  "existe",
  "nao_existe",
  "em",
  "fora",
] as const;

const FIELD = z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_.]*$/).max(80);
const ENTITY_ID = z.string().trim().min(1).max(64);
const DataPrimitive = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
const DataValue = z.union([
  DataPrimitive,
  z.array(z.union([z.string().max(200), z.number().finite()])).max(50),
]);

/** Caller-supplied facts only. No fetch, no inference, no default zero. */
export const AutomationData = z
  .record(FIELD, DataValue)
  .superRefine((data, ctx) => {
    if (Object.keys(data).length > 30)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "muitas chaves de dados" });
  });
export type AutomationData = z.infer<typeof AutomationData>;

export const WorkflowCondition = z
  .object({
    field: FIELD,
    op: z.enum(CONDITION_OPERATORS),
    value: DataValue.optional(),
  })
  .strict();
export type WorkflowCondition = z.infer<typeof WorkflowCondition>;

const StepParamValue = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);

export const WorkflowStep = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9_]+$/).min(1).max(40),
    agent: z.enum(COMMERCIAL_AGENT_IDS),
    action: z.enum(COMMERCIAL_ACTIONS),
    purpose: z.string().trim().min(1).max(200),
    params: z
      .record(z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(40), StepParamValue)
      .default({}),
  })
  .strict();
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const RetryPolicy = z
  .object({
    maxAttempts: z.number().int().min(1).max(3),
    backoffSeconds: z.number().int().min(0).max(300),
    trigger: z.enum(["indisponibilidade", "validacao"]),
  })
  .strict();
export type RetryPolicy = z.infer<typeof RetryPolicy>;

export const Workflow = z
  .object({
    id: ENTITY_ID,
    organization_id: ENTITY_ID,
    name: z.string().trim().min(1).max(80),
    purpose: z.string().trim().min(1).max(200),
    legalBasis: z.enum(["consentimento", "contrato", "interesse_legitimo", "obrigacao_legal"]),
    /** Only these keys may be supplied as facts; everything else is rejected. */
    dataKeys: z.array(FIELD).min(1).max(30),
    active: z.boolean(),
    approvalRequired: z.boolean().default(true),
    triggerKinds: z.array(z.enum(WORKFLOW_TRIGGERS)).min(1).max(6),
    conditionMode: z.enum(["todos", "qualquer"]).default("todos"),
    conditions: z.array(WorkflowCondition).max(12).default([]),
    retry: RetryPolicy.default({ maxAttempts: 1, backoffSeconds: 60, trigger: "indisponibilidade" }),
    steps: z.array(WorkflowStep).min(1).max(10),
  })
  .strict();
export type Workflow = z.infer<typeof Workflow>;

export const WorkflowTrigger = z
  .object({
    kind: z.enum(WORKFLOW_TRIGGERS),
    organization_id: ENTITY_ID,
    event_id: ENTITY_ID,
    entity_id: ENTITY_ID,
    occurred_at: z.string().trim().min(1).max(60),
  })
  .strict();
export type WorkflowTrigger = z.infer<typeof WorkflowTrigger>;

const issueText = (e: z.ZodError, limit = 5) =>
  e.issues
    .slice(0, limit)
    .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`);

// ---------------- Kill switch ----------------

export interface KillSwitchVerdict {
  halted: boolean;
  reason: string;
}

/** Global stop: a single engaged flag halts every planned automation. */
export function evaluateAutomationKillSwitch(engaged: boolean): KillSwitchVerdict {
  return {
    halted: engaged,
    reason: engaged
      ? "kill switch global ativo: todas as automações estão interrompidas"
      : "kill switch global desligado; nenhuma execução foi iniciada",
  };
}

// ---------------- Conditions ----------------

export interface ConditionVerdict {
  status: "medido" | "sem_dados";
  passed: boolean;
  reason: string;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Blocks prototype keys and walks only plain object paths supplied by the caller. */
function readPath(data: Record<string, unknown>, field: string): { present: boolean; value?: unknown } {
  const parts = field.split(".");
  if (parts.length > 4 || parts.some((p) => ["__proto__", "constructor", "prototype"].includes(p)))
    return { present: false };
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || !(part in current)) return { present: false };
    current = (current as Record<string, unknown>)[part];
  }
  return { present: true, value: current };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => v === b[i]);
  return typeof a === typeof b && a === b;
}

/** Evaluates one condition against explicit facts. Missing data fails closed. */
export function evaluateCondition(raw: unknown, data: Record<string, unknown>): ConditionVerdict {
  const parsed = WorkflowCondition.safeParse(raw);
  if (!parsed.success)
    return { status: "sem_dados", passed: false, reason: `condição inválida: ${issueText(parsed.error)[0]}` };
  const condition = parsed.data;
  const { present, value } = readPath(data, condition.field);

  if (condition.op === "existe")
    return { status: "medido", passed: present, reason: `campo '${condition.field}' ${present ? "presente" : "ausente"}` };
  if (condition.op === "nao_existe")
    return { status: "medido", passed: !present, reason: `campo '${condition.field}' ${present ? "presente" : "ausente"}` };
  if (!present)
    return { status: "sem_dados", passed: false, reason: `campo '${condition.field}' ausente; condição não avaliada` };
  if (condition.value === undefined && condition.op !== "contem" && condition.op !== "nao_contem")
    return { status: "sem_dados", passed: false, reason: `condição '${condition.op}' exige valor informado` };

  const expected = condition.value;
  switch (condition.op) {
    case "igual":
      return { status: "medido", passed: sameValue(value, expected), reason: `igualdade avaliada em '${condition.field}'` };
    case "diferente":
      return { status: "medido", passed: !sameValue(value, expected), reason: `diferença avaliada em '${condition.field}'` };
    case "maior_que":
    case "maior_ou_igual":
    case "menor_que":
    case "menor_ou_igual": {
      if (!isFiniteNumber(value) || !isFiniteNumber(expected))
        return { status: "sem_dados", passed: false, reason: `operador '${condition.op}' exige dois números finitos` };
      const passed =
        condition.op === "maior_que"
          ? value > expected
          : condition.op === "maior_ou_igual"
            ? value >= expected
            : condition.op === "menor_que"
              ? value < expected
              : value <= expected;
      return { status: "medido", passed, reason: `comparação numérica avaliada em '${condition.field}'` };
    }
    case "contem":
    case "nao_contem": {
      const contained =
        typeof value === "string" && typeof expected === "string"
          ? value.includes(expected)
          : Array.isArray(value) && expected !== undefined && !Array.isArray(expected)
            ? value.some((v) => sameValue(v, expected))
            : null;
      if (contained === null)
        return { status: "sem_dados", passed: false, reason: `operador '${condition.op}' exige texto ou lista compatível` };
      const passed = condition.op === "contem" ? contained : !contained;
      return { status: "medido", passed, reason: `busca avaliada em '${condition.field}'` };
    }
    case "em":
    case "fora": {
      if (!Array.isArray(expected))
        return { status: "sem_dados", passed: false, reason: `operador '${condition.op}' exige lista de valores` };
      const found = expected.some((v) => sameValue(value, v));
      const passed = condition.op === "em" ? found : !found;
      return { status: "medido", passed, reason: `pertencimento avaliado em '${condition.field}'` };
    }
  }
}

export interface ConditionsVerdict {
  status: "medido" | "sem_dados";
  passed: boolean;
  evaluated: number;
  matched: number;
  reason: string;
}

/** Empty or undecidable conditions never fire a workflow. */
export function evaluateConditions(
  rawConditions: readonly unknown[],
  rawData: unknown,
  mode: "todos" | "qualquer" = "todos",
): ConditionsVerdict {
  const conditions = z.array(WorkflowCondition).max(12).safeParse(rawConditions);
  if (!conditions.success)
    return { status: "sem_dados", passed: false, evaluated: 0, matched: 0, reason: `condições inválidas: ${issueText(conditions.error)[0]}` };
  const data = AutomationData.safeParse(rawData);
  if (!data.success)
    return { status: "sem_dados", passed: false, evaluated: 0, matched: 0, reason: `dados inválidos: ${issueText(data.error)[0]}` };
  if (conditions.data.length === 0)
    return { status: "sem_dados", passed: false, evaluated: 0, matched: 0, reason: "workflow sem condições declaradas; não dispara" };

  let matched = 0;
  for (const condition of conditions.data) {
    const verdict = evaluateCondition(condition, data.data);
    if (verdict.status !== "medido")
      return { status: "sem_dados", passed: false, evaluated: conditions.data.length, matched, reason: verdict.reason };
    if (verdict.passed) matched += 1;
  }
  const passed = mode === "todos" ? matched === conditions.data.length : matched > 0;
  return {
    status: "medido",
    passed,
    evaluated: conditions.data.length,
    matched,
    reason: `${mode === "todos" ? "todas" : "pelo menos uma"} as condições ${passed ? "foram atendidas" : "não foram atendidas"} (${matched}/${conditions.data.length})`,
  };
}

// ---------------- Retry planning ----------------

export interface RetryPlan {
  status: "planejado" | "bloqueado";
  attempt: number;
  nextAttemptAt: string | null;
  attemptsRemaining: number;
  requiresApproval: true;
  reason: string;
}

/** Computes a planned retry from an explicit instant. Nothing is scheduled. */
export function planRetry(policyRaw: unknown, input: { attempt: number; asOf: Date | number | string }): RetryPlan {
  const blocked = (reason: string): RetryPlan => ({
    status: "bloqueado",
    attempt: input.attempt,
    nextAttemptAt: null,
    attemptsRemaining: 0,
    requiresApproval: true,
    reason,
  });
  const policy = RetryPolicy.safeParse(policyRaw);
  if (!policy.success) return blocked(`política de retentativa inválida: ${issueText(policy.error)[0]}`);
  const asOfMs = timestampMs(input.asOf);
  if (asOfMs === null) return blocked("instante de referência inválido; retentativa não planejada");
  if (!Number.isInteger(input.attempt) || input.attempt < 1)
    return blocked("número de tentativa inválido; retentativa não planejada");
  if (input.attempt >= policy.data.maxAttempts)
    return blocked(`limite de ${policy.data.maxAttempts} tentativa(s) atingido; sem novas tentativas`);

  const nextAttemptAt = new Date(asOfMs + policy.data.backoffSeconds * 1000).toISOString();
  return {
    status: "planejado",
    attempt: input.attempt + 1,
    nextAttemptAt,
    attemptsRemaining: policy.data.maxAttempts - input.attempt,
    requiresApproval: true,
    reason: `tentativa ${input.attempt + 1} planejada para ${nextAttemptAt}; reinício exige aprovação humana e nenhuma ação é executada automaticamente`,
  };
}

// ---------------- Audit redaction ----------------

export interface AutomationAuditInput {
  organization_id: string;
  workflow_id: string;
  run_id: string;
  trigger_kind: string | null;
  event_id: string;
  status: string;
  reasons: readonly string[];
  dataKeys: readonly string[];
  stepStatuses: readonly string[];
}

export interface AutomationAuditRecord {
  organization_id: string;
  workflow_id: string;
  run_id: string;
  trigger_kind: string | null;
  event_id: string;
  status: string;
  data_key_count: number;
  step_status_counts: Record<string, number>;
  reasons: string[];
}

/** Ids, counts and bounded fixed reasons only: no fact values or step params. */
export function redactAutomationAudit(input: AutomationAuditInput): AutomationAuditRecord {
  const step_status_counts: Record<string, number> = {};
  for (const status of input.stepStatuses) step_status_counts[status] = (step_status_counts[status] ?? 0) + 1;
  return {
    organization_id: input.organization_id,
    workflow_id: input.workflow_id,
    run_id: input.run_id,
    trigger_kind: input.trigger_kind,
    event_id: input.event_id,
    status: input.status,
    data_key_count: input.dataKeys.length,
    step_status_counts,
    reasons: input.reasons.slice(0, 8).map((r) => r.slice(0, 200)),
  };
}

// ---------------- Definition validation ----------------

const SECRET_PARAM = /token|secret|password|api[_-]?key/i;

/** Checks a workflow against the existing agent/tool matrix without side effects. */
export function validateWorkflowDefinition(raw: unknown): { ok: boolean; issues: string[] } {
  const parsed = Workflow.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: issueText(parsed.error, 12) };
  const workflow = parsed.data;
  const issues: string[] = [];

  if (new Set(workflow.triggerKinds).size !== workflow.triggerKinds.length)
    issues.push("gatilhos duplicados");
  if (new Set(workflow.steps.map((s) => s.id)).size !== workflow.steps.length)
    issues.push("ids de etapa duplicados");
  if (new Set(workflow.dataKeys).size !== workflow.dataKeys.length)
    issues.push("chaves de dados duplicadas");

  for (const condition of workflow.conditions) {
    if (!workflow.dataKeys.includes(condition.field))
      issues.push(`condição '${condition.field}' não declarada em dataKeys`);
  }
  for (const step of workflow.steps) {
    if ((SENSIBLE_ACTIONS as readonly string[]).includes(canonicalAction(step.action)))
      issues.push(`${step.id}: ação sensível não permitida em automação`);
    if (!(COMMERCIAL_ACTIONS as readonly string[]).includes(step.action))
      issues.push(`${step.id}: ação não registrada`);
    if (!commercialAgent(step.agent).actions.includes(step.action as CommercialAction))
      issues.push(`${step.id}: ação '${step.action}' fora do escopo de '${step.agent}'`);
    const toolGate = commercialToolAllowed(COMMERCIAL_ACTION_TOOL[step.action as CommercialAction]);
    if (!toolGate.allowed) issues.push(`${step.id}: ${toolGate.reason}`);
    for (const key of Object.keys(step.params)) {
      if (SECRET_PARAM.test(key)) issues.push(`${step.id}: parâmetro sensível '${key}' não permitido`);
    }
  }
  return { ok: issues.length === 0, issues };
}

// ---------------- Run planning ----------------

export type AutomationRunStatus = "planejado" | "aguardando_aprovacao" | "bloqueado" | "nao_disparado";

export interface PlannedStep {
  id: string;
  agent: CommercialAgentId;
  action: CommercialAction;
  tool: string;
  status: "preparado" | "aguardando_aprovacao" | "bloqueado";
  allowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
  retry: {
    max_attempts: number;
    backoff_seconds: number;
    automatic: false;
    requires_approval: true;
  };
}

export interface AutomationRunPlan {
  status: AutomationRunStatus;
  run_id: string;
  idempotency_key: string;
  organization_id: string;
  workflow_id: string;
  trigger_kind: string | null;
  /** Always false: this phase has no executor of any kind. */
  canExecute: false;
  requiresApproval: boolean;
  reasons: string[];
  steps: PlannedStep[];
  audit: AutomationAuditRecord;
}

export interface AutomationRunInput {
  /** Tenant supplied by the server; never taken from the prompt. */
  organizationId: string;
  workflow: unknown;
  trigger: unknown;
  data: unknown;
  /** Server-supplied from agent_grants, keyed by agent. */
  grants: Partial<Record<CommercialAgentId, readonly string[]>>;
  autonomy?: Partial<Record<CommercialAgentId, AutonomyLevel>>;
  killEngaged?: boolean;
  /** Explicit instant; the contract never reads a clock. */
  asOf: Date | number | string;
}

/** Deterministic per tenant, workflow and event. No hash, no clock, no I/O. */
export function idempotencyKey(organizationId: string, workflowId: string, eventId: string): string {
  return `${organizationId.trim()}|${workflowId.trim()}|${eventId.trim()}`.slice(0, 200);
}

/**
 * Plans a workflow run and applies every gate. It never queues, sends or
 * mutates anything: an approved plan is still just a plan in this phase.
 */
export function planWorkflowRun(input: AutomationRunInput): AutomationRunPlan {
  const triggerParsed = WorkflowTrigger.safeParse(input.trigger);
  const workflowParsed = Workflow.safeParse(input.workflow);
  const organizationId = input.organizationId.trim();
  const workflowId = workflowParsed.success ? workflowParsed.data.id : "desconhecido";
  const eventId = triggerParsed.success ? triggerParsed.data.event_id : "desconhecido";
  const triggerKind = triggerParsed.success ? triggerParsed.data.kind : null;
  const runId = idempotencyKey(organizationId, workflowId, eventId);
  const idempotency = runId;

  const makePlan = (
    status: AutomationRunStatus,
    reasons: string[],
    steps: PlannedStep[] = [],
    requiresApproval = true,
    dataKeys: string[] = [],
  ): AutomationRunPlan => ({
    status,
    run_id: runId,
    idempotency_key: idempotency,
    organization_id: organizationId,
    workflow_id: workflowId,
    trigger_kind: triggerKind,
    canExecute: false,
    requiresApproval,
    reasons,
    steps,
    audit: redactAutomationAudit({
      organization_id: organizationId,
      workflow_id: workflowId,
      run_id: runId,
      trigger_kind: triggerKind,
      event_id: eventId,
      status,
      reasons,
      dataKeys,
      stepStatuses: steps.map((s) => s.status),
    }),
  });

  const kill = evaluateAutomationKillSwitch(input.killEngaged === true);
  if (kill.halted) return makePlan("bloqueado", [kill.reason]);

  const asOfMs = timestampMs(input.asOf);
  if (asOfMs === null)
    return makePlan("bloqueado", ["instante de referência inválido; nenhuma execução foi planejada"]);

  const definition = validateWorkflowDefinition(input.workflow);
  if (!definition.ok) return makePlan("bloqueado", definition.issues);
  if (!workflowParsed.success) return makePlan("bloqueado", issueText(workflowParsed.error));
  if (!triggerParsed.success) return makePlan("bloqueado", issueText(triggerParsed.error));

  const workflow = workflowParsed.data;
  const trigger = triggerParsed.data;
  if (!organizationId || workflow.organization_id !== organizationId || trigger.organization_id !== organizationId)
    return makePlan("bloqueado", ["tenant divergente entre execução, workflow e evento; nada foi planejado"]);
  if (!workflow.active) return makePlan("bloqueado", ["workflow inativo; nada foi planejado"]);
  if (!workflow.triggerKinds.includes(trigger.kind))
    return makePlan("nao_disparado", [`gatilho '${trigger.kind}' não está assinado por este workflow`]);

  const occurredMs = timestampMs(trigger.occurred_at);
  if (occurredMs === null)
    return makePlan("bloqueado", ["instante do evento inválido; nenhum plano foi gerado"]);
  if (occurredMs > asOfMs)
    return makePlan("bloqueado", ["evento no futuro em relação ao instante informado; nenhum plano foi gerado"]);

  const dataParsed = AutomationData.safeParse(input.data);
  if (!dataParsed.success)
    return makePlan("bloqueado", [`dados do evento inválidos: ${issueText(dataParsed.error)[0]}`]);
  const data = dataParsed.data;
  const dataKeys = Object.keys(data);
  const undeclared = dataKeys.filter((k) => !workflow.dataKeys.includes(k));
  if (undeclared.length)
    return makePlan("bloqueado", [`chave(s) de dados não declaradas: ${undeclared.slice(0, 5).join(", ")}`], [], true, dataKeys);

  const conditions = evaluateConditions(workflow.conditions, data, workflow.conditionMode);
  if (conditions.status !== "medido")
    return makePlan("bloqueado", [conditions.reason], [], true, dataKeys);
  if (!conditions.passed)
    return makePlan("nao_disparado", [conditions.reason], [], true, dataKeys);

  const autonomy: Partial<Record<CommercialAgentId, AutonomyLevel>> = {};
  for (const [agent, level] of Object.entries(input.autonomy ?? {})) {
    const parsedLevel = z.enum(AUTONOMY_LEVELS).safeParse(level);
    if (!parsedLevel.success)
      return makePlan("bloqueado", [`autonomia inválida para '${agent}'; nada foi planejado`], [], true, dataKeys);
    autonomy[agent as CommercialAgentId] = parsedLevel.data;
  }

  const steps: PlannedStep[] = workflow.steps.map((step) => {
    const auth = authorizeCommercialAction({
      agent: step.agent,
      action: step.action,
      grantActions: input.grants[step.agent] ?? [],
      autonomy: autonomy[step.agent] ?? commercialAgent(step.agent).defaultAutonomy,
    });
    return {
      id: step.id,
      agent: step.agent,
      action: step.action,
      tool: auth.tool,
      status: auth.allowed
        ? "preparado"
        : auth.requiresApproval
          ? "aguardando_aprovacao"
          : "bloqueado",
      allowed: auth.allowed,
      requiresApproval: auth.requiresApproval,
      reasons: auth.reasons.slice(0, 5),
      retry: {
        max_attempts: workflow.retry.maxAttempts,
        backoff_seconds: workflow.retry.backoffSeconds,
        automatic: false as const,
        requires_approval: true as const,
      },
    };
  });

  const stepStatuses = steps.map((s) => s.status);
  const status: AutomationRunStatus = stepStatuses.includes("bloqueado")
    ? "bloqueado"
    : stepStatuses.includes("aguardando_aprovacao")
      ? "aguardando_aprovacao"
      : "planejado";
  const reasons = [
    conditions.reason,
    ...(stepStatuses.includes("bloqueado") ? ["pelo menos uma etapa foi bloqueada pelo gate"] : []),
    "nenhuma ferramenta de envio, campanha, checkout ou pagamento é executada nesta fase",
    "a execução depende de ADR dedicado, integração aprovada e aprovação humana",
  ];
  return makePlan(
    status,
    reasons,
    steps,
    workflow.approvalRequired || status === "aguardando_aprovacao",
    dataKeys,
  );
}
