// Pure security, LGPD and production-readiness contracts for Fase 10. No I/O,
// no clock reads, no database, no secrets, no deployment, no exposure. This
// module reuses the existing gates, redaction and audit hash chain instead of
// creating parallel rules. It never authorizes an external side effect.

import { z } from "zod";
import { auditCanon, auditHash, canonical, GENESIS_HASH } from "./canonical";
import {
  AUTONOMY_LEVELS,
  canonicalAction,
  checkCommercialTool,
  SENSIBLE_ACTIONS,
  TENANT_ROLES,
  type AutonomyLevel,
  type TenantRole,
} from "./comercial";
import { commercialAgent, authorizeCommercialAction } from "./commercial-agents";
import { evaluateAutomationKillSwitch } from "./automacoes";
import { timestampMs } from "./dashboard";
import { redact } from "./redact";

const ID = z.string().trim().min(1).max(80);
const LABEL = z.string().trim().min(1).max(160);
const STAMP = z.string().trim().min(1).max(60);

// ---------------- Actors and permissions ----------------

const HumanActor = z
  .object({
    kind: z.literal("humano"),
    organization_id: ID,
    user_id: ID,
    role: z.enum(TENANT_ROLES),
    active: z.boolean(),
  })
  .strict();

const AgentActor = z
  .object({
    kind: z.literal("agente"),
    organization_id: ID,
    agent_id: ID,
    actions: z.array(z.string().trim().min(1).max(80)).max(60),
    autonomy: z.enum(AUTONOMY_LEVELS),
    active: z.boolean(),
  })
  .strict();

const IntegrationActor = z
  .object({
    kind: z.literal("integracao"),
    organization_id: ID,
    integration: ID,
    scopes: z.array(z.string().trim().min(1).max(80)).max(60),
    active: z.boolean(),
    expires_at: STAMP.nullable().default(null),
  })
  .strict();

export const Actor = z.discriminatedUnion("kind", [HumanActor, AgentActor, IntegrationActor]);
export type Actor = z.infer<typeof Actor>;

export type Capability = "leitura" | "escrita" | "aprovacao" | "administracao";

const ROLE_CAPABILITIES: Record<TenantRole, readonly Capability[]> = {
  viewer: ["leitura"],
  seller: ["leitura", "escrita"],
  manager: ["leitura", "escrita", "aprovacao"],
  admin: ["leitura", "escrita", "aprovacao", "administracao"],
  owner: ["leitura", "escrita", "aprovacao", "administracao"],
};

const READ_ACTIONS = new Set([
  "ler_dashboard",
  "gerar_leitura",
  "carregar_conversa",
  "ler_funil",
  "avaliar_fonte",
  "avaliar_janela",
  "validar_template",
  "detectar_duplicatas",
  "previsualizar_merge",
  "montar_kanban",
  "calcular_score",
  "calcular_margem",
  "sugerir_preco",
  "calcular_break_even",
  "health",
  "list_apps",
  "list",
]);
const APPROVAL_ACTIONS = new Set(["aprovar_proposta", "aprovar_desconto", "aprovar_plantao"]);
const ADMIN_ACTIONS = new Set(["alteracao_permissoes", "configurar_tenant"]);

/** Aliases are canonicalized once in comercial.ts and reused here. */
const capabilityFor = (action: string): Capability => {
  const canonical = canonicalAction(action);
  return ADMIN_ACTIONS.has(canonical)
    ? "administracao"
    : APPROVAL_ACTIONS.has(canonical)
      ? "aprovacao"
      : READ_ACTIONS.has(canonical)
        ? "leitura"
        : "escrita";
};

const scopeFor = (capability: Capability): string =>
  ({ leitura: "read", escrita: "write", aprovacao: "approve", administracao: "admin" })[capability];

/** read < write < approve < admin. Unknown scopes are always weaker. */
const SCOPE_RANK: Record<string, number> = { read: 0, write: 1, approve: 2, admin: 3 };

const isSensible = (action: string): boolean =>
  (SENSIBLE_ACTIONS as readonly string[]).includes(canonicalAction(action));

export interface ActorPermission {
  allowed: boolean;
  requiresApproval: boolean;
  ator: "humano" | "agente" | "integracao";
  origem: string;
  capability: Capability;
  reasons: string[];
}

export interface ActorPermissionInput {
  actor: unknown;
  organizationId: string;
  action: string;
  /** Optional scope override for integrations; defaults to the action capability. */
  scope?: string;
  /** Optional tool name, always re-checked against the existing hard gate. */
  tool?: string;
  now: Date | number | string;
  killEngaged?: boolean;
}

/** Evaluates one actor × action with fail-closed tenant, grant and kill checks. */
export function evaluateActorPermission(input: ActorPermissionInput): ActorPermission {
  const parsed = Actor.safeParse(input.actor);
  const action = canonicalAction(input.action);
  const capability = capabilityFor(action);
  const denied = (
    ator: ActorPermission["ator"],
    origem: string,
    reasons: string[],
    requiresApproval = false,
  ): ActorPermission => ({ allowed: false, requiresApproval, ator, origem, capability, reasons });

  if (!parsed.success)
    return denied("humano", "ator", ["ator desconhecido ou inválido; nenhuma permissão concedida"]);
  const actor = parsed.data;
  const org = input.organizationId.trim();
  if (!org || actor.organization_id.trim() !== org)
    return denied(actor.kind, "tenant", ["tenant divergente; nenhuma permissão concedida"]);
  if (!action)
    return denied(actor.kind, "ação", ["ação vazia; nenhuma permissão concedida"]);

  const kill = evaluateAutomationKillSwitch(input.killEngaged === true);
  if (kill.halted) return denied(actor.kind, "kill_switch", [kill.reason]);

  if (input.tool !== undefined) {
    const toolGate = checkCommercialTool(input.tool);
    if (!toolGate.allowed) return denied(actor.kind, "hard_gate", [toolGate.reason]);
  }
  if (isSensible(action))
    return denied(
      actor.kind,
      "ação_sensível",
      [`'${action}' exige aprovação humana em todos os níveis; nenhuma execução foi autorizada`],
      true,
    );

  if (actor.kind === "humano") {
    if (!actor.active) return denied("humano", "membership", ["membership inativa"]);
    if (!ROLE_CAPABILITIES[actor.role].includes(capability))
      return denied("humano", "membership", [`papel '${actor.role}' não possui a capacidade '${capability}'`]);
    return {
      allowed: true,
      requiresApproval: false,
      ator: "humano",
      origem: "membership",
      capability,
      reasons: [`permissão de leitura/escrita conforme o papel '${actor.role}' no tenant informado`],
    };
  }

  if (actor.kind === "agente") {
    if (!actor.active) return denied("agente", "agent_grants", ["grant de agente inativo"]);
    if (!actor.actions.includes(action))
      return denied("agente", "agent_grants", [`ação '${action}' não concedida ao agente`]);
    try {
      commercialAgent(actor.agent_id as Parameters<typeof commercialAgent>[0]);
    } catch {
      return denied("agente", "agent_grants", ["agente não registrado no catálogo comercial"]);
    }
    const auth = authorizeCommercialAction({
      agent: actor.agent_id as Parameters<typeof authorizeCommercialAction>[0]["agent"],
      action: action as Parameters<typeof authorizeCommercialAction>[0]["action"],
      grantActions: actor.actions,
      autonomy: actor.autonomy as AutonomyLevel,
      ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
    });
    return {
      allowed: auth.allowed,
      requiresApproval: auth.requiresApproval,
      ator: "agente",
      origem: "agent_grants",
      capability,
      reasons: auth.reasons,
    };
  }

  if (!actor.active) return denied("integracao", "integration_grants", ["grant de integração inativo"]);
  if (actor.expires_at !== null) {
    const expires = timestampMs(actor.expires_at);
    const now = timestampMs(input.now);
    if (expires === null || now === null)
      return denied("integracao", "integration_grants", ["validade da integração ou instante inválido"]);
    if (now > expires) return denied("integracao", "integration_grants", ["grant de integração expirado"]);
  }
  const minimumScope = scopeFor(capability);
  const requestedScope = input.scope?.trim() || null;
  if (
    requestedScope !== null &&
    (SCOPE_RANK[requestedScope] ?? -1) < (SCOPE_RANK[minimumScope] ?? 0)
  )
    return denied(
      "integracao",
      "integration_grants",
      [`escopo '${requestedScope}' é mais fraco que o mínimo '${minimumScope}' exigido por '${capability}'`],
    );
  const requiredScope = requestedScope ?? minimumScope;
  if (!actor.scopes.includes(requiredScope))
    return denied("integracao", "integration_grants", [`escopo '${requiredScope}' não concedido`]);
  return {
    allowed: true,
    requiresApproval: false,
    ator: "integracao",
    origem: "integration_grants",
    capability,
    reasons: [`escopo '${requiredScope}' ativo para a integração '${actor.integration}'`],
  };
}

// ---------------- LGPD ----------------

export const LEGAL_BASES = [
  "consentimento",
  "contrato",
  "obrigacao_legal",
  "interesse_legitimo",
  "tutela_direitos",
] as const;

export const SENSITIVE_FIELDS = [
  "cpf",
  "cnpj",
  "rg",
  "documento",
  "document_token",
  "endereco",
  "telefone",
  "data_nascimento",
] as const;

export const DataProcessing = z
  .object({
    organization_id: ID,
    purpose: LABEL,
    legal_basis: z.enum(LEGAL_BASES),
    collected_at: STAMP,
    retention_days: z.number().int().min(1).max(3650),
    fields: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
    consent_id: ID.nullable().default(null),
    consented_at: STAMP.nullable().default(null),
    revoked_at: STAMP.nullable().default(null),
    sensitive_justification: z.string().trim().max(300).nullable().default(null),
  })
  .strict();
export type DataProcessing = z.infer<typeof DataProcessing>;

export interface ProcessingVerdict {
  status: "permitido" | "bloqueado" | "sem_dados";
  reasons: string[];
}

export interface ProcessingInput {
  processing: unknown;
  now: Date | number | string;
  organizationId: string;
  /** Explicit opposition from the data subject; never inferred from a score. */
  opposed?: boolean;
}

/** Checks declared purpose, legal basis, consent, minimization, retention and opposition. */
export function evaluateProcessing(input: ProcessingInput): ProcessingVerdict {
  const parsed = DataProcessing.safeParse(input.processing);
  if (!parsed.success)
    return {
      status: "sem_dados",
      reasons: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "campo"}: ${i.message}`),
    };
  const p = parsed.data;
  const reasons: string[] = [];
  if (p.organization_id.trim() !== input.organizationId.trim())
    reasons.push("tenant divergente; nenhum tratamento foi autorizado");
  if (input.opposed === true) reasons.push("titular oposto: nenhum novo tratamento foi autorizado");
  if (p.revoked_at !== null) reasons.push("consentimento revogado; nenhum tratamento foi autorizado");

  const nowMs = timestampMs(input.now);
  const collectedMs = timestampMs(p.collected_at);
  if (nowMs === null || collectedMs === null)
    reasons.push("instante de coleta ou de referência inválido; retenção não verificada");
  else {
    if (collectedMs > nowMs) reasons.push("coleta no futuro; nada foi autorizado");
    if (collectedMs + p.retention_days * 86_400_000 < nowMs)
      reasons.push(`prazo de retenção de ${p.retention_days} dia(s) expirado; nada foi autorizado`);
  }

  if (p.legal_basis === "consentimento") {
    if (!p.consent_id || !p.consented_at) reasons.push("base legal de consentimento exige consent_id e consented_at");
    else if (timestampMs(p.consented_at) === null) reasons.push("data de consentimento inválida");
  }
  const sensitive = p.fields.filter((f) => (SENSITIVE_FIELDS as readonly string[]).includes(f.trim().toLowerCase()));
  if (sensitive.length && !p.sensitive_justification)
    reasons.push(`campos sensíveis (${sensitive.join(", ")}) exigem justificativa explícita de minimização`);

  return reasons.length
    ? { status: "bloqueado", reasons }
    : {
        status: "permitido",
        reasons: [
          `finalidade '${p.purpose}' com base legal '${p.legal_basis}'`,
          `minimização declarada em ${p.fields.length} campo(s)`,
        ],
      };
}

export const DataSubjectRequest = z
  .object({
    organization_id: ID,
    subject_id: ID,
    kind: z.enum(["acesso", "correcao", "exclusao", "oposicao", "portabilidade"]),
    status: z.enum(["aberta", "em_analise", "concluida"]),
    created_at: STAMP,
    approved_by: ID.nullable().default(null),
  })
  .strict();
export type DataSubjectRequest = z.infer<typeof DataSubjectRequest>;

export interface DataSubjectVerdict {
  status: "pendente" | "bloqueado" | "concluido";
  requiresApproval: boolean;
  reasons: string[];
}

export function evaluateDataSubjectRequest(request: unknown, organizationId: string): DataSubjectVerdict {
  const parsed = DataSubjectRequest.safeParse(request);
  if (!parsed.success)
    return {
      status: "bloqueado",
      requiresApproval: false,
      reasons: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "campo"}: ${i.message}`),
    };
  const r = parsed.data;
  if (r.organization_id.trim() !== organizationId.trim())
    return { status: "bloqueado", requiresApproval: false, reasons: ["tenant divergente"] };
  if (timestampMs(r.created_at) === null)
    return { status: "bloqueado", requiresApproval: false, reasons: ["data de abertura inválida"] };
  const needsApproval = r.kind === "exclusao" || r.kind === "portabilidade";
  if (r.status === "concluida" && needsApproval && !r.approved_by)
    return {
      status: "bloqueado",
      requiresApproval: true,
      reasons: [`'${r.kind}' concluída sem aprovação humana registrada`],
    };
  if (r.status !== "concluida")
    return {
      status: "pendente",
      requiresApproval: needsApproval,
      reasons: [
        `solicitação de ${r.kind} ${r.status}; nenhuma exportação ou exclusão foi executada nesta camada`,
      ],
    };
  return {
    status: "concluido",
    requiresApproval: false,
    reasons: ["solicitação registrada como concluída pelo chamador; nenhuma ação foi executada nesta camada"],
  };
}

// ---------------- Audit chain ----------------

const OMITTED_AUDIT_KEYS = /^(prompt|resposta|response|raw|bruto|body|corpo|message|mensagem|conteudo|content)$/i;

function sanitizeDetail(value: unknown, depth = 0): unknown {
  const safe = redact(value, depth);
  if (Array.isArray(safe)) return safe.map((v) => sanitizeDetail(v, depth + 1));
  if (safe !== null && typeof safe === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(safe as Record<string, unknown>)) {
      out[key] = OMITTED_AUDIT_KEYS.test(key) ? "[omitido]" : sanitizeDetail(val, depth + 1);
    }
    return out;
  }
  return safe;
}

export interface SecurityAuditInput {
  organizationId: string;
  runId: string;
  actor: string;
  event: string;
  action: string;
  status: string;
  detail: unknown;
  asOfSeconds: number;
  previousHash?: string | null;
}

export interface SecurityAuditEvent {
  organization_id: string;
  ts: number;
  run_id: string;
  actor: string;
  event: string;
  action: string;
  status: string;
  detail: string;
  canon: string;
  hash: string;
  previous_hash: string;
}

/** Builds an audit event compatible with the platform's exact canonical chain. */
export async function buildSecurityAuditEvent(input: SecurityAuditInput): Promise<SecurityAuditEvent> {
  const org = input.organizationId.trim();
  if (!org) throw new Error("organization_id inválido; nenhum evento foi construído");
  if (!Number.isFinite(input.asOfSeconds) || input.asOfSeconds <= 0)
    throw new Error("asOfSeconds inválido; nenhum evento foi construído");
  for (const [name, value] of [
    ["run_id", input.runId],
    ["actor", input.actor],
    ["event", input.event],
    ["action", input.action],
    ["status", input.status],
  ] as const) {
    if (typeof value !== "string" || !value.trim())
      throw new Error(`${name} inválido; nenhum evento foi construído`);
  }
  const detail = canonical(sanitizeDetail(input.detail ?? {}));
  const e = {
    ts: input.asOfSeconds,
    run_id: input.runId,
    actor: input.actor,
    event: input.event,
    action: input.action,
    status: input.status,
    detail,
  };
  const previous_hash = input.previousHash?.trim() || GENESIS_HASH;
  return {
    organization_id: org,
    ts: e.ts,
    run_id: e.run_id,
    actor: e.actor,
    event: e.event,
    action: e.action,
    status: e.status,
    detail,
    canon: auditCanon(e),
    hash: await auditHash(previous_hash, e),
    previous_hash,
  };
}

export interface ChainVerification {
  ok: boolean;
  count: number;
  reason: string;
  badIndex: number | null;
}

/** Recomputes the chain from genesis; stored detail is never re-serialized. */
export async function verifyAuditChain(events: readonly SecurityAuditEvent[]): Promise<ChainVerification> {
  let previous = GENESIS_HASH;
  for (const [index, ev] of events.entries()) {
    if (ev.previous_hash !== previous)
      return { ok: false, count: events.length, reason: "elo anterior divergente", badIndex: index };
    const expected = await auditHash(previous, {
      ts: ev.ts,
      run_id: ev.run_id,
      actor: ev.actor,
      event: ev.event,
      action: ev.action,
      status: ev.status,
      detail: ev.detail,
    });
    if (expected !== ev.hash)
      return { ok: false, count: events.length, reason: "hash do evento divergente", badIndex: index };
    previous = ev.hash;
  }
  return {
    ok: true,
    count: events.length,
    reason: events.length ? "cadeia íntegra a partir do genesis" : "nenhum evento informado",
    badIndex: null,
  };
}

// ---------------- Production readiness ----------------

export interface ReadinessCheck {
  id: string;
  status: "ok" | "pendente" | "bloqueado";
  reason: string;
}

export interface ReadinessInput {
  organizationId: string;
  schemaApplied: boolean;
  typesGenerated: boolean;
  adrApproved: boolean;
  rlsApplied: boolean;
  killStateReadable: boolean;
  killEngaged: boolean;
  auditChainOk: boolean;
  actorChecks: readonly { id: string; allowed: boolean; requiresApproval: boolean }[];
  processingChecks: readonly { id: string; status: "permitido" | "bloqueado" | "sem_dados" }[];
  integrationChecks: readonly { id: string; approved: boolean }[];
}

export interface ReadinessReport {
  organization_id: string;
  status: "bloqueado" | "pendente" | "pronto";
  checks: ReadinessCheck[];
  /** Always false: no exposure, deployment or commit is performed by this phase. */
  canExpose: false;
  canDeploy: false;
  canCommit: false;
  reasons: string[];
}

/** Documentation-only gate. A "pronto" report still requires separate explicit authorization. */
export function evaluateProductionReadiness(input: ReadinessInput): ReadinessReport {
  const checks: ReadinessCheck[] = [
    {
      id: "tenant",
      status: input.organizationId.trim() ? "ok" : "bloqueado",
      reason: input.organizationId.trim() ? "tenant informado" : "tenant ausente",
    },
    {
      id: "schema",
      status: input.schemaApplied ? "ok" : "bloqueado",
      reason: input.schemaApplied ? "schema aplicado no Lovable" : "schema da Fase 2 ainda não aplicado",
    },
    {
      id: "tipos_gerados",
      status: input.typesGenerated ? "ok" : "bloqueado",
      reason: input.typesGenerated ? "tipos gerados" : "tipos do Supabase ainda não gerados",
    },
    {
      id: "adr_0010",
      status: input.adrApproved ? "ok" : "bloqueado",
      reason: input.adrApproved ? "ADR aprovado" : "ADR 0010 ainda é minuta",
    },
    {
      id: "rls",
      status: input.rlsApplied ? "ok" : "bloqueado",
      reason: input.rlsApplied ? "policies RLS aplicadas" : "policies RLS ainda não aplicadas",
    },
    {
      id: "kill_switch",
      status: !input.killStateReadable
        ? "bloqueado"
        : input.killEngaged
          ? "pendente"
          : "ok",
      reason: !input.killStateReadable
        ? "estado do kill switch ilegível (falha fechada)"
        : input.killEngaged
          ? "kill switch ativo: automações interrompidas"
          : "kill switch legível e desligado",
    },
    {
      id: "auditoria",
      status: input.auditChainOk ? "ok" : "bloqueado",
      reason: input.auditChainOk ? "cadeia de auditoria íntegra" : "cadeia de auditoria inválida",
    },
    ...input.actorChecks.map<ReadinessCheck>((c) => ({
      id: `permissao:${c.id}`,
      status: c.allowed ? "ok" : c.requiresApproval ? "pendente" : "bloqueado",
      reason: c.allowed
        ? "permissão concedida"
        : c.requiresApproval
          ? "depende de aprovação humana"
          : "permissão negada",
    })),
    ...input.processingChecks.map<ReadinessCheck>((c) => ({
      id: `lgpd:${c.id}`,
      status: c.status === "permitido" ? "ok" : c.status === "sem_dados" ? "pendente" : "bloqueado",
      reason:
        c.status === "permitido"
          ? "finalidade, base legal e retenção declaradas"
          : c.status === "sem_dados"
            ? "sem declaração de tratamento"
            : "tratamento bloqueado",
    })),
    ...input.integrationChecks.map<ReadinessCheck>((c) => ({
      id: `integracao:${c.id}`,
      status: c.approved ? "ok" : "bloqueado",
      reason: c.approved ? "integração oficial aprovada" : "integração sem ADR/integração oficial",
    })),
  ];

  const status: ReadinessReport["status"] = checks.some((c) => c.status === "bloqueado")
    ? "bloqueado"
    : checks.some((c) => c.status === "pendente")
      ? "pendente"
      : "pronto";
  return {
    organization_id: input.organizationId.trim(),
    status,
    checks,
    canExpose: false,
    canDeploy: false,
    canCommit: false,
    reasons: [
      "Preflight documental: nenhuma exposure, deploy, tunnel, domínio, segredo, commit ou push foi executado.",
      "Autorização explícita separada continua necessária para qualquer mudança de ambiente ou publicação.",
    ],
  };
}

export { GENESIS_HASH };
