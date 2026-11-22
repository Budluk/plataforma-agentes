import { describe, expect, it } from "vitest";
import {
  MessageTemplate,
  assertSupportedChannel,
  detectOptOut,
  evaluateRetention,
  evaluateSendGate,
  evaluateServiceWindow,
  prepareOptOut,
  prepareReminder,
  prepareReply,
  redactForAudit,
  validateTemplateUse,
} from "@/lib/core/atendimento";

const CONVERSATION = {
  id: "conv-1",
  organization_id: "org-1",
  contact_id: "person-1",
  channel: "whatsapp_business_api",
  status: "aberta",
  assignee_user_id: null,
  opted_out: false,
  last_inbound_at: "2026-11-21T10:00:00.000Z",
  created_at: "2026-11-21T09:00:00.000Z",
};
const AS_OF = "2026-11-21T12:00:00.000Z";
const TEMPLATE = MessageTemplate.parse({
  id: "tpl-1",
  name: "confirmacao_atendimento",
  language: "pt-BR",
  category: "utility",
  approved: true,
  variables: ["nome"],
  body: "Ola {{1}}, confirmamos o atendimento.",
});
const REPLY = {
  organization_id: "org-1",
  conversation: CONVERSATION,
  contactOptedOut: false,
  asOf: AS_OF,
  template: TEMPLATE,
  variables: ["nome"],
  draftText: "Ola, confirmamos seu atendimento.",
  purpose: "atendimento comercial",
  legalBasis: "consentimento" as const,
  evidenceRef: "consent-123",
  grantActions: ["rascunhar_resposta"],
  autonomy: "autonomo_controlado" as const,
};

describe("official channel policy", () => {
  it("accepts only supported channels and rejects unofficial WhatsApp automation", () => {
    expect(assertSupportedChannel("whatsapp_business_api")).toBe("whatsapp_business_api");
    expect(assertSupportedChannel("email")).toBe("email");
    expect(() => assertSupportedChannel("whatsapp_web")).toThrow("não suportado");
    expect(() => assertSupportedChannel("whatsapp_personal")).toThrow("Business API oficial");
  });
});

describe("opt-out detection", () => {
  it("matches accent-insensitive whole terms in Portuguese and English", () => {
    expect(detectOptOut("NÃO QUERO MAIS receber mensagens.").optedOut).toBe(true);
    expect(detectOptOut("Por favor, PARAR ").matched).toContain("parar");
    expect(detectOptOut("please STOP").matched).toContain("stop");
  });

  it("does not match unrelated substrings", () => {
    expect(detectOptOut("Vou parar de enviar propostas").optedOut).toBe(true);
    expect(detectOptOut("A barra do app esta parada").optedOut).toBe(false);
    expect(detectOptOut("Quero continuar recebendo novidades").optedOut).toBe(false);
  });
});

describe("official 24h service window", () => {
  it("measures the remaining time from an explicit instant", () => {
    const w = evaluateServiceWindow({ asOf: AS_OF, lastInboundAt: CONVERSATION.last_inbound_at });
    expect(w.status).toBe("medido");
    expect(w.open).toBe(true);
    expect(w.hoursRemaining).toBe(22);
  });

  it("closes the window after 24 hours and never guesses without inbound data", () => {
    expect(
      evaluateServiceWindow({ asOf: "2026-11-22T11:00:00.000Z", lastInboundAt: CONVERSATION.last_inbound_at }),
    ).toMatchObject({ status: "medido", open: false, hoursRemaining: 0 });
    expect(evaluateServiceWindow({ asOf: AS_OF })).toMatchObject({
      status: "sem_dados",
      open: false,
    });
    expect(
      evaluateServiceWindow({ asOf: AS_OF, lastInboundAt: "2026-11-22T10:00:00.000Z" }),
    ).toMatchObject({ status: "sem_dados", open: false });
  });

  it("fails closed on invalid inputs", () => {
    expect(() => evaluateServiceWindow({ asOf: "data invalida" })).toThrow("asOf");
    expect(() =>
      evaluateServiceWindow({ asOf: AS_OF, lastInboundAt: CONVERSATION.last_inbound_at, windowHours: 48 }),
    ).toThrow("24 horas");
  });
});

describe("approved templates", () => {
  it("accepts an approved template with the exact declared variables", () => {
    expect(MessageTemplate.safeParse(TEMPLATE).success).toBe(true);
    expect(
      validateTemplateUse({
        template: TEMPLATE,
        variables: ["nome"],
        consentGranted: true,
        channel: "whatsapp_business_api",
      }).allowed,
    ).toBe(true);
  });

  it("blocks unapproved templates, wrong variables and marketing without consent", () => {
    expect(
      validateTemplateUse({
        template: { ...TEMPLATE, approved: false },
        variables: ["nome"],
        consentGranted: true,
        channel: "whatsapp_business_api",
      }).reasons[0],
    ).toContain("não aprovado");
    expect(
      validateTemplateUse({
        template: TEMPLATE,
        variables: ["outro"],
        consentGranted: true,
        channel: "whatsapp_business_api",
      }).allowed,
    ).toBe(false);
    expect(
      validateTemplateUse({
        template: { ...TEMPLATE, category: "marketing" },
        variables: ["nome"],
        consentGranted: false,
        channel: "whatsapp_business_api",
      }).allowed,
    ).toBe(false);
  });
});

describe("sending gate", () => {
  it("never allows sending, even with an explicit grant and controlled autonomy", () => {
    const gate = evaluateSendGate({
      autonomy: "autonomo_controlado",
      grantActions: ["envio_mensagem"],
    });
    expect(gate.allowed).toBe(false);
    expect(gate.requiresApproval).toBe(true);
    expect(gate.reasons[0]).toContain("aprovação humana");
  });
});

describe("reply draft", () => {
  it("prepares a reviewable draft with no sending capability and redacted audit", () => {
    const out = prepareReply(REPLY);
    expect(out.status).toBe("preparado");
    expect(out.canSend).toBe(false);
    expect(out.requiresApproval).toBe(true);
    expect(out.draft?.prepared_for).toBe("revisao_humana");
    expect(out.draft?.template_id).toBe("tpl-1");
    expect(JSON.stringify(out.audit)).not.toContain("confirmamos seu atendimento");
    expect(out.audit.body_size).toBe("vazio");
  });

  it("allows a free-form reply inside the window without a template", () => {
    const out = prepareReply({ ...REPLY, template: null, variables: [] });
    expect(out.status).toBe("preparado");
    expect(out.draft?.template_id).toBeNull();
  });

  it("blocks opt-out, kill switch and missing grant", () => {
    expect(prepareReply({ ...REPLY, contactOptedOut: true }).reasons[0]).toContain("optou");
    expect(prepareReply({ ...REPLY, conversation: { ...CONVERSATION, opted_out: true } }).status).toBe(
      "bloqueado",
    );
    expect(
      prepareReply({ ...REPLY, killEngaged: true }).reasons.some((r) => r.includes("kill switch")),
    ).toBe(true);
    expect(prepareReply({ ...REPLY, grantActions: [] }).reasons[0]).toContain("não concedida");
  });

  it("blocks a reply outside the window when no approved template is supplied", () => {
    const out = prepareReply({
      ...REPLY,
      asOf: "2026-11-22T13:00:00.000Z",
      template: null,
      variables: [],
    });
    expect(out.status).toBe("bloqueado");
    expect(out.reasons.some((r) => r.includes("janela"))).toBe(true);
    expect(out.draft).toBeNull();
  });

  it("keeps assisted drafts as drafts even when the gate is satisfied", () => {
    const out = prepareReply({ ...REPLY, autonomy: "assistido" });
    expect(out.status).toBe("preparado");
    expect(out.canSend).toBe(false);
    expect(out.requiresApproval).toBe(true);
  });

  it("blocks invalid conversations and missing legal basis evidence", () => {
    expect(prepareReply({ ...REPLY, conversation: { id: "x" } }).status).toBe("bloqueado");
    expect(prepareReply({ ...REPLY, evidenceRef: null }).reasons[0]).toContain("evidence_ref");
  });

  it("blocks tenant divergence against the conversation tenant", () => {
    const out = prepareReply({ ...REPLY, organization_id: "org-2" });
    expect(out.status).toBe("bloqueado");
    expect(out.reasons.some((r) => r.includes("tenant divergente"))).toBe(true);
    expect(out.draft).toBeNull();
  });
});

describe("reminder draft", () => {
  it("prepares an internal task with an explicit due date and no sending", () => {
    const out = prepareReminder({
      organization_id: "org-1",
      contact_id: "person-1",
      dueAt: "2026-11-23T12:00:00.000Z",
      note: "Ligar para confirmar horário",
      contactOptedOut: false,
      grantActions: ["preparar_lembrete"],
      autonomy: "autonomo_controlado",
    });
    expect(out.status).toBe("preparado");
    expect(out.canSend).toBe(false);
    expect(out.reminder?.due_at).toBe("2026-11-23T12:00:00.000Z");
  });

  it("blocks opted-out contacts and invalid deadlines", () => {
    const base = {
      organization_id: "org-1",
      contact_id: "person-1",
      dueAt: "2026-11-23T12:00:00.000Z",
      note: "Ligar",
      contactOptedOut: false,
      grantActions: ["preparar_lembrete"],
      autonomy: "autonomo_controlado" as const,
    };
    expect(prepareReminder({ ...base, contactOptedOut: true }).status).toBe("bloqueado");
    expect(prepareReminder({ ...base, dueAt: "quando der" }).status).toBe("bloqueado");
    expect(prepareReminder({ ...base, organization_id: "  " }).status).toBe("bloqueado");
  });
});

describe("LGPD records", () => {
  it("prepares an opposition record that always requires confirmation", () => {
    const out = prepareOptOut({
      organization_id: "org-1",
      contact_id: "person-1",
      source: "contato",
      matchedTerms: ["parar"],
      evidenceRef: "msg-42",
      asOf: AS_OF,
    });
    expect(out.status).toBe("preparado");
    expect(out.requiresConfirmation).toBe(true);
    expect(out.record?.kind).toBe("oposicao");
    expect(out.record?.effective_at).toBe(AS_OF);
  });

  it("blocks an opposition with an invalid instant", () => {
    const out = prepareOptOut({
      organization_id: "org-1",
      contact_id: "person-1",
      source: "operador",
      matchedTerms: [],
      asOf: "invalido",
    });
    expect(out.status).toBe("bloqueado");
    expect(out.record).toBeNull();
  });

  it("flags retention due dates without deleting anything", () => {
    const policy = {
      entity_type: "messages",
      purpose: "atendimento",
      retention_days: 30,
      legal_basis: "obrigacao_legal",
      active: true,
    };
    const due = evaluateRetention(policy, "2026-01-01T00:00:00.000Z", AS_OF);
    expect(due.status).toBe("medido");
    expect(due.dueForDeletion).toBe(true);
    expect(due.requiresApproval).toBe(true);
    expect(evaluateRetention(policy, "2026-11-20T00:00:00.000Z", AS_OF).dueForDeletion).toBe(false);
    expect(evaluateRetention({ ...policy, active: false }, "2026-01-01T00:00:00.000Z", AS_OF).status).toBe(
      "sem_dados",
    );
  });

  it("redacts the message body from every audit record", () => {
    const audit = redactForAudit({
      conversation_id: "conv-1",
      contact_id: "person-1",
      channel: "whatsapp_business_api",
      direction: "entrada",
      body: "CPF 123.456.789-00 e segredo",
      status: "recebido",
    });
    expect(audit.body_size).toBe("curto");
    expect(JSON.stringify(audit)).not.toContain("123.456.789-00");
    expect(JSON.stringify(audit)).not.toContain("segredo");
  });
});
