// Pure atendimento/WhatsApp contracts for Fase 6. No I/O, no clock, no
// database, no network, no secrets. Nothing here sends a message: outbound
// actions remain vetoed by hardGate.ts and require an approved ADR + official
// Business API integration before any execution tool can exist.

import { z } from "zod";
import { decideAutonomy, type AutonomyDecision, type AutonomyLevel } from "./comercial";
import { authorizeCommercialAction } from "./commercial-agents";
import { round2, timestampMs } from "./dashboard";

export const WHATSAPP_OFFICIAL_CHANNEL = "whatsapp_business_api";
export const SUPPORTED_CHANNELS = ["whatsapp_business_api", "email", "painel"] as const;
export type Channel = (typeof SUPPORTED_CHANNELS)[number];
export const SERVICE_WINDOW_HOURS = 24;

/** Rejects personal/automation channels; WhatsApp only via the official API. */
export function assertSupportedChannel(channel: string): Channel {
  if (!(SUPPORTED_CHANNELS as readonly string[]).includes(channel))
    throw new Error(
      `canal não suportado: '${channel}'. WhatsApp somente via Business API oficial.`,
    );
  return channel as Channel;
}

export const Conversation = z
  .object({
    id: z.string().trim().min(1).max(64),
    organization_id: z.string().trim().min(1).max(64),
    contact_id: z.string().trim().min(1).max(64),
    channel: z.enum(SUPPORTED_CHANNELS),
    status: z.enum(["aberta", "pendente", "encerrada"]),
    assignee_user_id: z.string().trim().max(128).nullable().default(null),
    opted_out: z.boolean(),
    last_inbound_at: z.string().trim().min(1).max(60).nullable().default(null),
    created_at: z.string().trim().min(1).max(60),
  })
  .strict();
export type Conversation = z.infer<typeof Conversation>;

export const MessageTemplate = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(80),
    language: z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    category: z.enum(["utility", "marketing", "authentication"]),
    approved: z.boolean(),
    variables: z.array(z.string().trim().min(1).max(40)).max(10),
    body: z.string().trim().min(1).max(1024),
  })
  .strict();
export type MessageTemplate = z.infer<typeof MessageTemplate>;

// ---------------- Official window ----------------

export interface ServiceWindowInput {
  /** Explicit instant supplied by the caller; the contract never reads a clock. */
  asOf: Date | number | string;
  lastInboundAt?: string | null;
  /** Conservative override, never above the official 24h limit. */
  windowHours?: number;
}

export interface ServiceWindow {
  status: "medido" | "sem_dados";
  open: boolean;
  hoursRemaining: number | null;
  reason: string;
}

/** Official 24h customer-service window. No inbound timestamp means sem_dados. */
export function evaluateServiceWindow(input: ServiceWindowInput): ServiceWindow {
  const nowMs = timestampMs(input.asOf);
  if (nowMs === null) throw new Error("asOf deve ser um timestamp válido");
  const hours = input.windowHours ?? SERVICE_WINDOW_HOURS;
  if (!Number.isFinite(hours) || hours < 1 || hours > SERVICE_WINDOW_HOURS)
    throw new Error("janela de atendimento deve estar entre 1 e 24 horas");

  const lastMs = input.lastInboundAt ? timestampMs(input.lastInboundAt) : null;
  if (input.lastInboundAt && lastMs === null)
    return {
      status: "sem_dados",
      open: false,
      hoursRemaining: null,
      reason: "última mensagem recebida inválida; janela não calculada",
    };
  if (lastMs === null)
    return {
      status: "sem_dados",
      open: false,
      hoursRemaining: null,
      reason: "sem mensagem recebida registrada; janela não calculada",
    };
  if (lastMs > nowMs)
    return {
      status: "sem_dados",
      open: false,
      hoursRemaining: null,
      reason: "última mensagem no futuro; janela não calculada",
    };

  const windowMs = hours * 3_600_000;
  const elapsed = nowMs - lastMs;
  if (elapsed >= windowMs)
    return {
      status: "medido",
      open: false,
      hoursRemaining: 0,
      reason: `janela de ${hours}h expirada; resposta livre não é permitida`,
    };
  return {
    status: "medido",
    open: true,
    hoursRemaining: round2((windowMs - elapsed) / 3_600_000),
    reason: `janela de ${hours}h aberta; sem valores inferidos`,
  };
}

// ---------------- Templates ----------------

export interface TemplateUseInput {
  template: MessageTemplate;
  variables: readonly string[];
  consentGranted: boolean;
  channel: Channel;
}

export interface TemplateUseVerdict {
  allowed: boolean;
  reasons: string[];
}

/** Only approved templates with exact variable sets may be used. */
export function validateTemplateUse(input: TemplateUseInput): TemplateUseVerdict {
  const reasons: string[] = [];
  const t = input.template;
  if (!t.approved) reasons.push("template não aprovado na plataforma oficial");
  if (t.category === "marketing" && !input.consentGranted)
    reasons.push("template de marketing exige consentimento registrado");
  const expected = [...t.variables].sort((a, b) => a.localeCompare(b));
  const given = [...input.variables].sort((a, b) => a.localeCompare(b));
  if (
    expected.length !== given.length ||
    expected.some((v, i) => v !== given[i])
  )
    reasons.push("variáveis informadas divergem das declaradas no template");
  if (input.channel !== WHATSAPP_OFFICIAL_CHANNEL && t.category !== "utility")
    reasons.push("categoria de template suportada apenas no WhatsApp Business API");
  return { allowed: reasons.length === 0, reasons };
}

// ---------------- Opt-out ----------------

const OPT_OUT_TERMS = [
  "parar",
  "sair",
  "cancelar",
  "descadastrar",
  "remover",
  "não quero mais",
  "nao quero mais",
  "stop",
  "unsubscribe",
  "opt out",
  "opt-out",
] as const;

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-term match, accent-insensitive. A match always blocks further drafts. */
export function detectOptOut(text: string): { optedOut: boolean; matched: string[]; reason: string } {
  const normalized = stripAccents(text).trim().toLowerCase();
  const matched = OPT_OUT_TERMS.filter((term) => {
    const needle = escapeRegExp(stripAccents(term));
    return new RegExp(`(^|[^\\p{L}\\p{N}])${needle}($|[^\\p{L}\\p{N}])`, "u").test(normalized);
  });
  return {
    optedOut: matched.length > 0,
    matched: [...matched],
    reason: matched.length
      ? `pedido de oposição detectado: ${matched.join(", ")}. Nenhuma mensagem deve ser proposta.`
      : "nenhum termo de oposição detectado no texto informado",
  };
}

// ---------------- Audit redaction ----------------

export type AuditDirection = "entrada" | "saida" | "interno";

export interface RedactableMessage {
  conversation_id: string;
  contact_id: string;
  channel: string;
  direction: AuditDirection;
  template_id?: string | null;
  body?: string | null;
  status?: string;
}

export interface RedactedAuditRecord {
  conversation_id: string;
  contact_id: string;
  channel: string;
  direction: AuditDirection;
  template_id: string | null;
  body_size: "vazio" | "curto" | "medio" | "longo";
  status: string;
}

/** Keeps ids and sizes only: the raw body never reaches audit or LLM prompts. */
export function redactForAudit(message: RedactableMessage): RedactedAuditRecord {
  const length = Array.from(message.body ?? "").length;
  return {
    conversation_id: message.conversation_id,
    contact_id: message.contact_id,
    channel: message.channel,
    direction: message.direction,
    template_id: message.template_id ?? null,
    body_size:
      length === 0 ? "vazio" : length <= 160 ? "curto" : length <= 600 ? "medio" : "longo",
    status: message.status ?? "rascunho",
  };
}

const asText = (v: unknown) => (typeof v === "string" ? v.slice(0, 64) : "");

function fallbackAudit(raw: unknown, direction: AuditDirection): RedactedAuditRecord {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return redactForAudit({
    conversation_id: asText(obj["id"] ?? obj["conversation_id"]),
    contact_id: asText(obj["contact_id"]),
    channel: asText(obj["channel"]) || "desconhecido",
    direction,
    status: "rascunho",
  });
}

// ---------------- Sending gate ----------------

export interface SendGateInput {
  autonomy: AutonomyLevel;
  grantActions: readonly string[];
  killEngaged?: boolean;
}

/**
 * Even an explicit grant cannot make `envio_mensagem` executable: it is a
 * sensible action in comercial.ts and always requires a human.
 */
export function evaluateSendGate(input: SendGateInput): AutonomyDecision {
  return decideAutonomy({
    action: "envio_mensagem",
    autonomy: input.autonomy,
    grantActions: [...input.grantActions, "envio_mensagem"],
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
  });
}

// ---------------- Reply draft ----------------

export interface ReplyDraftInput {
  organization_id: string;
  conversation: unknown;
  contactOptedOut: boolean;
  asOf: Date | number | string;
  template: unknown | null;
  variables: readonly string[];
  draftText: string;
  purpose: string;
  legalBasis: "consentimento" | "contrato" | "interesse_legitimo";
  evidenceRef?: string | null;
  marketingConsent?: boolean;
  grantActions: readonly string[];
  autonomy: AutonomyLevel;
  killEngaged?: boolean;
}

export interface ReplyDraftPayload {
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  channel: Channel;
  template_id: string | null;
  body: string;
  purpose: string;
  legal_basis: string;
  evidence_ref: string | null;
  prepared_for: "revisao_humana";
}

export interface ReplyDraft {
  status: "preparado" | "bloqueado";
  /** Always false in this phase: no execution tool exists for sending. */
  canSend: false;
  requiresApproval: boolean;
  reasons: string[];
  audit: RedactedAuditRecord;
  draft: ReplyDraftPayload | null;
}

/** Produces a reviewable draft only. It never sends, schedules or publishes. */
export function prepareReply(input: ReplyDraftInput): ReplyDraft {
  const sendGate = evaluateSendGate({
    autonomy: input.autonomy,
    grantActions: input.grantActions,
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
  });
  const base = (status: ReplyDraft["status"], reasons: string[], audit: RedactedAuditRecord) => ({
    status,
    canSend: false as const,
    requiresApproval: sendGate.requiresApproval,
    reasons,
    audit,
    draft: null,
  });

  const parsed = Conversation.safeParse(input.conversation);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`);
    return base("bloqueado", issues, fallbackAudit(input.conversation, "saida"));
  }
  const conv = parsed.data;
  const blocks: string[] = [];
  const notes: string[] = [];
  const audit = redactForAudit({
    conversation_id: conv.id,
    contact_id: conv.contact_id,
    channel: conv.channel,
    direction: "saida",
    status: "rascunho",
  });

  if (conv.opted_out || input.contactOptedOut)
    blocks.push("contato optou por não receber mensagens; nenhum rascunho é permitido");
  if (conv.status === "encerrada")
    blocks.push("conversa encerrada; reabertura exige ação humana");

  const purpose = input.purpose.trim();
  if (!purpose || Array.from(purpose).length > 200)
    blocks.push("finalidade ausente ou longa demais");
  const evidence = input.evidenceRef?.trim() ?? null;
  if (input.legalBasis !== "contrato" && !evidence)
    blocks.push(`base legal '${input.legalBasis}' exige evidence_ref registrado`);

  let template: MessageTemplate | null = null;
  if (input.template !== null && input.template !== undefined) {
    const t = MessageTemplate.safeParse(input.template);
    if (!t.success) blocks.push("template inválido ou fora do contrato");
    else {
      template = t.data;
      const consent =
        (input.legalBasis === "consentimento" && Boolean(evidence)) ||
        input.marketingConsent === true;
      const verdict = validateTemplateUse({
        template,
        variables: input.variables,
        consentGranted: consent,
        channel: conv.channel,
      });
      if (!verdict.allowed) blocks.push(...verdict.reasons);
    }
  }

  const window = evaluateServiceWindow({
    asOf: input.asOf,
    ...(conv.last_inbound_at === null ? {} : { lastInboundAt: conv.last_inbound_at }),
  });
  if (!template && window.status !== "medido") blocks.push(window.reason);
  else if (!template && !window.open)
    blocks.push("janela de atendimento expirada sem template aprovado");
  notes.push(window.reason);

  const body = input.draftText.trim();
  if (!body || Array.from(body).length > 2000)
    blocks.push("texto do rascunho vazio ou acima de 2000 caracteres");

  const auth = authorizeCommercialAction({
    agent: "followup_agent",
    action: "rascunhar_resposta",
    grantActions: input.grantActions,
    autonomy: input.autonomy,
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
  });
  if (!auth.allowed && !auth.requiresApproval) blocks.push(...auth.reasons);
  if (auth.requiresApproval) notes.push(...auth.reasons);
  notes.push(...sendGate.reasons);
  notes.push("nenhum envio foi executado; o rascunho depende de revisão humana");

  if (blocks.length) return base("bloqueado", [...blocks, ...notes], audit);
  return {
    status: "preparado",
    canSend: false,
    requiresApproval: sendGate.requiresApproval,
    reasons: [...notes],
    audit,
    draft: {
      organization_id: input.organization_id,
      conversation_id: conv.id,
      contact_id: conv.contact_id,
      channel: conv.channel,
      template_id: template?.id ?? null,
      body,
      purpose,
      legal_basis: input.legalBasis,
      evidence_ref: evidence,
      prepared_for: "revisao_humana",
    },
  };
}

// ---------------- Reminder draft ----------------

export interface ReminderDraftInput {
  organization_id: string;
  contact_id: string;
  dueAt: Date | number | string;
  note: string;
  contactOptedOut: boolean;
  grantActions: readonly string[];
  autonomy: AutonomyLevel;
  killEngaged?: boolean;
}

export interface ReminderDraft {
  status: "preparado" | "bloqueado";
  canSend: false;
  requiresApproval: boolean;
  reasons: string[];
  reminder: {
    organization_id: string;
    contact_id: string;
    due_at: string;
    note: string;
    prepared_for: "revisao_humana";
  } | null;
}

/** Internal follow-up task with an explicit due date; no message is sent. */
export function prepareReminder(input: ReminderDraftInput): ReminderDraft {
  const auth = authorizeCommercialAction({
    agent: "followup_agent",
    action: "preparar_lembrete",
    grantActions: input.grantActions,
    autonomy: input.autonomy,
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
  });
  const blocks: string[] = [];
  if (input.contactOptedOut)
    blocks.push("contato optou por não receber contato; nenhum lembrete é proposto");
  const dueMs = timestampMs(input.dueAt);
  if (dueMs === null) blocks.push("prazo do lembrete inválido; nenhuma data foi inferida");
  const note = input.note.trim();
  if (!note || Array.from(note).length > 300) blocks.push("nota do lembrete vazia ou longa demais");
  if (!auth.allowed && !auth.requiresApproval) blocks.push(...auth.reasons);

  const reasons = [...blocks, ...auth.reasons, "nenhum envio foi executado"];
  return {
    status: blocks.length ? "bloqueado" : "preparado",
    canSend: false,
    requiresApproval: true,
    reasons,
    reminder: blocks.length
      ? null
      : {
          organization_id: input.organization_id,
          contact_id: input.contact_id,
          due_at: new Date(dueMs as number).toISOString(),
          note,
          prepared_for: "revisao_humana",
        },
  };
}

// ---------------- LGPD: oposição e retenção ----------------

export interface OptOutDraftInput {
  organization_id: string;
  contact_id: string;
  source: "contato" | "operador";
  matchedTerms: readonly string[];
  evidenceRef?: string | null;
  asOf: Date | number | string;
}

export interface OptOutDraft {
  status: "preparado" | "bloqueado";
  requiresConfirmation: true;
  reasons: string[];
  record: {
    organization_id: string;
    contact_id: string;
    kind: "oposicao";
    source: string;
    matched_terms: string[];
    evidence_ref: string | null;
    effective_at: string;
  } | null;
}

/** Prepares an opposition record. The human confirms and the server appends it. */
export function prepareOptOut(input: OptOutDraftInput): OptOutDraft {
  const asOfMs = timestampMs(input.asOf);
  const blocks: string[] = [];
  if (asOfMs === null) blocks.push("instante informado inválido");
  if (input.source !== "contato" && input.source !== "operador")
    blocks.push("origem da oposição inválida");
  if (input.matchedTerms.length > 10) blocks.push("muitos termos de oposição informados");
  if (input.matchedTerms.some((t) => !t.trim() || Array.from(t).length > 40))
    blocks.push("termo de oposição inválido");
  const evidence = input.evidenceRef?.trim() ?? null;
  if (evidence && Array.from(evidence).length > 200) blocks.push("evidência longa demais");

  return {
    status: blocks.length ? "bloqueado" : "preparado",
    requiresConfirmation: true,
    reasons: [
      ...blocks,
      "oposição bloqueia novas mensagens assim que confirmada e registrada",
      "nenhuma linha foi gravada por esta função",
    ],
    record: blocks.length
      ? null
      : {
          organization_id: input.organization_id,
          contact_id: input.contact_id,
          kind: "oposicao",
          source: input.source,
          matched_terms: [...input.matchedTerms].map((t) => t.trim()),
          evidence_ref: evidence,
          effective_at: new Date(asOfMs as number).toISOString(),
        },
  };
}

export const RetentionPolicy = z
  .object({
    entity_type: z.string().trim().min(1).max(60),
    purpose: z.string().trim().min(1).max(200),
    retention_days: z.number().int().min(1).max(2555),
    legal_basis: z.enum(["consentimento", "interesse_legitimo", "contrato", "obrigacao_legal"]),
    active: z.boolean(),
  })
  .strict();
export type RetentionPolicy = z.infer<typeof RetentionPolicy>;

export interface RetentionVerdict {
  status: "medido" | "sem_dados";
  dueForDeletion: boolean;
  daysElapsed: number | null;
  /** Exclusion is sensible: never executed by an agent. */
  requiresApproval: true;
  reason: string;
}

/** Flags retention due dates only; deletion remains a human-approved action. */
export function evaluateRetention(
  raw: unknown,
  createdAt: string,
  asOf: Date | number | string,
): RetentionVerdict {
  const policy = RetentionPolicy.safeParse(raw);
  if (!policy.success)
    return {
      status: "sem_dados",
      dueForDeletion: false,
      daysElapsed: null,
      requiresApproval: true,
      reason: "política de retenção inválida; nada foi excluído",
    };
  if (!policy.data.active)
    return {
      status: "sem_dados",
      dueForDeletion: false,
      daysElapsed: null,
      requiresApproval: true,
      reason: "política de retenção inativa; nada foi excluído",
    };
  const createdMs = timestampMs(createdAt);
  const nowMs = timestampMs(asOf);
  if (createdMs === null || nowMs === null || createdMs > nowMs)
    return {
      status: "sem_dados",
      dueForDeletion: false,
      daysElapsed: null,
      requiresApproval: true,
      reason: "datas de criação ou referência inválidas; retenção não calculada",
    };
  const daysElapsed = round2((nowMs - createdMs) / 86_400_000);
  return {
    status: "medido",
    dueForDeletion: daysElapsed >= policy.data.retention_days,
    daysElapsed,
    requiresApproval: true,
    reason:
      daysElapsed >= policy.data.retention_days
        ? `prazo de ${policy.data.retention_days} dia(s) atingido; exclusão exige aprovação humana`
        : `prazo de ${policy.data.retention_days} dia(s) não atingido; nenhuma ação tomada`,
  };
}
