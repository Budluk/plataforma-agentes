import { describe, it, expect } from "vitest";
import {
  evaluateActorPermission,
  evaluateProcessing,
  evaluateDataSubjectRequest,
  buildSecurityAuditEvent,
  verifyAuditChain,
} from "@/lib/core/seguranca";

describe("evaluateActorPermission — papéis de tenant", () => {
  const humano = {
    kind: "humano" as const,
    organization_id: "org-1",
    user_id: "user-1",
    role: "seller" as const,
    active: true,
  };

  const baseInput = {
    actor: humano,
    organizationId: "org-1",
    action: "ler_dashboard",
    now: "2026-11-22T10:00:00Z" as const,
  };

  it("viewer não pode escrever", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: { ...humano, role: "viewer" },
      action: "criar_proposta",
    });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain("papel");
  });

  it("seller pode escrever registros próprios", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: { ...humano, role: "seller" },
      action: "criar_proposta",
    });
    expect(v.allowed).toBe(true);
  });

  it("admin pode escrever (ação não sensível)", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: { ...humano, role: "admin" },
      action: "criar_proposta",
    });
    expect(v.allowed).toBe(true);
  });

  it("ação sensível é bloqueada mesmo para admin", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: { ...humano, role: "admin" },
      action: "alteracao_permissoes",
    });
    expect(v.allowed).toBe(false);
    expect(v.requiresApproval).toBe(true);
  });

  it("hard gate bloqueia ferramentas proibidas", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: { ...humano, role: "admin" },
      action: "enviar_mensagem",
      tool: "send_whatsapp",
    });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain("vetada");
  });

  it("ator inativo é bloqueado", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: { ...humano, active: false },
      action: "ler_dashboard",
    });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain("inativa");
  });

  it("tenant divergente é bloqueado", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      organizationId: "org-2",
      action: "ler_dashboard",
    });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain("tenant divergente");
  });

  it("hard gate bloqueia ferramentas proibidas", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: { ...humano, role: "admin" },
      action: "enviar_mensagem",
      tool: "send_whatsapp",
    });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain("vetada");
  });
});

describe("evaluateProcessing — LGPD", () => {
  const processing = {
    organization_id: "org-1",
    purpose: "marketing",
    legal_basis: "consentimento" as const,
    collected_at: "2026-11-21T00:00:00Z",
    retention_days: 30,
    fields: ["nome", "email"],
    consent_id: "consent-1",
    consented_at: "2026-11-21T00:00:00Z",
  };

  it("bloqueia tratamento sem finalidade", () => {
    const v = evaluateProcessing({
      processing: { ...processing, purpose: "" },
      now: "2026-11-22T10:00:00Z",
      organizationId: "org-1",
    });
    expect(["bloqueado", "sem_dados"]).toContain(v.status);
    expect(v.reasons.length).toBeGreaterThan(0);
  });

  it("bloqueia sem base legal", () => {
    const v = evaluateProcessing({
      processing: { ...processing, legal_basis: "" as any },
      now: "2026-11-22T10:00:00Z",
      organizationId: "org-1",
    });
    expect(["bloqueado", "sem_dados"]).toContain(v.status);
  });

  it("bloqueia com oposição do titular", () => {
    const v = evaluateProcessing({
      processing,
      now: "2026-11-22T10:00:00Z",
      organizationId: "org-1",
      opposed: true,
    });
    expect(v.status).toBe("bloqueado");
    expect(v.reasons.some((r) => r.includes("oposto"))).toBe(true);
  });

  it("permite com finalidade, base legal e consentimento", () => {
    const v = evaluateProcessing({
      processing,
      now: "2026-11-22T10:00:00Z",
      organizationId: "org-1",
    });
    expect(v.status).toBe("permitido");
  });

  it("bloqueia campo sensível sem justificativa", () => {
    const v = evaluateProcessing({
      processing: { ...processing, fields: ["cpf", "nome"] },
      now: "2026-11-22T10:00:00Z",
      organizationId: "org-1",
    });
    expect(v.status).toBe("bloqueado");
    expect(v.reasons.some((r) => r.includes("justificativa"))).toBe(true);
  });
});

describe("evaluateDataSubjectRequest — direitos do titular", () => {
  it("acesso é pendente", () => {
    const v = evaluateDataSubjectRequest(
      {
        organization_id: "org-1",
        subject_id: "subj-1",
        kind: "acesso",
        status: "aberta",
        created_at: "2026-11-22T10:00:00Z",
      },
      "org-1",
    );
    expect(v.status).toBe("pendente");
    expect(v.requiresApproval).toBe(false);
  });

  it("exclusão requer aprovação", () => {
    const v = evaluateDataSubjectRequest(
      {
        organization_id: "org-1",
        subject_id: "subj-1",
        kind: "exclusao",
        status: "aberta",
        created_at: "2026-11-22T10:00:00Z",
      },
      "org-1",
    );
    expect(v.requiresApproval).toBe(true);
  });

  it("tenant divergente é bloqueado", () => {
    const v = evaluateDataSubjectRequest(
      {
        organization_id: "org-1",
        subject_id: "subj-1",
        kind: "acesso",
        status: "aberta",
        created_at: "2026-11-22T10:00:00Z",
      },
      "org-2",
    );
    expect(v.status).toBe("bloqueado");
  });
});

describe("buildSecurityAuditEvent + verifyAuditChain", () => {
  it("cria evento e verifica cadeia de hashes", async () => {
    const ev = await buildSecurityAuditEvent({
      organizationId: "org-1",
      runId: "run-1",
      actor: "user-1",
      event: "acao_executada",
      action: "criar_proposta",
      status: "ok",
      detail: { proposta_id: "prop-1" },
      asOfSeconds: 1795360800,
    });
    expect(ev.hash).toBeDefined();
    expect(ev.canon).toBeDefined();
    expect(ev.previous_hash).toBeDefined();

    const chain = await verifyAuditChain([ev]);
    expect(chain.ok).toBe(true);
  });

  it("detecta elo quebrado na cadeia", async () => {
    const ev1 = await buildSecurityAuditEvent({
      organizationId: "org-1",
      runId: "run-1",
      actor: "user-1",
      event: "acao_executada",
      action: "criar_proposta",
      status: "ok",
      detail: {},
      asOfSeconds: 1795360800,
    });
    const ev2 = await buildSecurityAuditEvent({
      organizationId: "org-1",
      runId: "run-2",
      actor: "user-1",
      event: "acao_executada",
      action: "criar_proposta",
      status: "ok",
      detail: {},
      asOfSeconds: 1795360900,
      previousHash: "hash_errado",
    });
    const chain = await verifyAuditChain([ev1, ev2]);
    expect(chain.ok).toBe(false);
    expect(chain.badIndex).toBe(1);
  });

  it("mascara CPF no detalhe antes de escrever a auditoria", async () => {
    const ev = await buildSecurityAuditEvent({
      organizationId: "org-1",
      runId: "run-3",
      actor: "user-1",
      event: "acao_executada",
      action: "criar_proposta",
      status: "ok",
      detail: { cpf: "123.456.789-00", nome: "Ana" },
      asOfSeconds: 1795360800,
    });
    expect(ev.canon).not.toContain("123.456.789-00");
    expect(ev.canon).toContain("***");
  });
});

describe("regressões de gate e escopo", () => {
  const humano = {
    kind: "humano" as const,
    organization_id: "org-1",
    user_id: "user-1",
    role: "seller" as const,
    active: true,
  };
  const baseInput = {
    actor: humano,
    organizationId: "org-1",
    action: "criar_proposta",
    now: "2026-11-22T10:00:00Z" as const,
  };

  it("alias 'enviar_mensagem' continua sendo ação sensível", () => {
    const v = evaluateActorPermission({ ...baseInput, action: "enviar_mensagem" });
    expect(v.allowed).toBe(false);
    expect(v.requiresApproval).toBe(true);
    expect(v.reasons[0]).toContain("aprovação");
  });

  it("integração não pode rebaixar escopo de escrita para read", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: {
        kind: "integracao",
        organization_id: "org-1",
        integration: "crm",
        scopes: ["read"],
        active: true,
        expires_at: null,
      },
      scope: "read",
    });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain("mais fraco");
  });

  it("integração com escopo write é autorizada para escrita", () => {
    const v = evaluateActorPermission({
      ...baseInput,
      actor: {
        kind: "integracao",
        organization_id: "org-1",
        integration: "crm",
        scopes: ["write"],
        active: true,
        expires_at: null,
      },
    });
    expect(v.allowed).toBe(true);
  });
});
