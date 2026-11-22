import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  buildSecurityAuditEvent,
  evaluateActorPermission,
  evaluateDataSubjectRequest,
  evaluateProcessing,
  evaluateProductionReadiness,
  verifyAuditChain,
  type ActorPermissionInput,
  type ReadinessInput,
  type SecurityAuditEvent,
} from "@/lib/core/seguranca";

const NOW = "2026-11-21T12:00:00.000Z";
const AS_OF_SECONDS = 1763731200;

const human = (role: "viewer" | "seller" | "manager" | "admin" | "owner", active = true) => ({
  kind: "humano" as const,
  organization_id: "org-1",
  user_id: "user-1",
  role,
  active,
});

const agent = (
  agent_id = "insights_agent",
  actions: string[] = ["ler_dashboard"],
  autonomy: "assistido" | "semiautonomo" | "autonomo_controlado" = "autonomo_controlado",
  active = true,
) => ({ kind: "agente" as const, organization_id: "org-1", agent_id, actions, autonomy, active });

const integration = (
  scopes: string[] = ["read"],
  expires_at: string | null = "2026-11-22T12:00:00.000Z",
  active = true,
) => ({
  kind: "integracao" as const,
  organization_id: "org-1",
  integration: "whatsapp_business",
  scopes,
  expires_at,
  active,
});

const base = (overrides: Partial<ActorPermissionInput> = {}): ActorPermissionInput => ({
  actor: human("viewer"),
  organizationId: "org-1",
  action: "ler_dashboard",
  now: NOW,
  ...overrides,
});

describe("actor permissions", () => {
  it(" grants read to viewers and administration only to admins/owners", () => {
    expect(evaluateActorPermission(base()).allowed).toBe(true);
    expect(evaluateActorPermission(base({ actor: human("owner"), action: "configurar_tenant" })).allowed).toBe(true);
    const denied = evaluateActorPermission(base({ actor: human("viewer"), action: "configurar_tenant" }));
    expect(denied.allowed).toBe(false);
    expect(denied.reasons[0]).toContain("não possui a capacidade");
    expect(
      evaluateActorPermission(base({ actor: human("manager"), action: "aprovar_proposta" })).allowed,
    ).toBe(true);
    expect(evaluateActorPermission(base({ actor: human("seller"), action: "aprovar_proposta" })).allowed).toBe(false);
  });

  it("blocks inactive memberships, unknown actors and tenant mismatch", () => {
    expect(evaluateActorPermission(base({ actor: human("owner", false) })).origem).toBe("membership");
    expect(evaluateActorPermission(base({ actor: {} })).origem).toBe("ator");
    const mismatch = evaluateActorPermission(
      base({ actor: { ...human("owner"), organization_id: "org-2" } }),
    );
    expect(mismatch.allowed).toBe(false);
    expect(mismatch.origem).toBe("tenant");
    expect(evaluateActorPermission(base({ action: "  " })).origem).toBe("ação");
  });

  it("reuses the commercial agent grants and autonomy levels", () => {
    const allowed = evaluateActorPermission(base({ actor: agent() }));
    expect(allowed.allowed).toBe(true);
    expect(allowed.ator).toBe("agente");
    expect(allowed.origem).toBe("agent_grants");

    const assisted = evaluateActorPermission(base({ actor: agent("insights_agent", ["ler_dashboard"], "assistido") }));
    expect(assisted.allowed).toBe(false);
    expect(assisted.requiresApproval).toBe(true);

    const ungranted = evaluateActorPermission(base({ actor: agent("insights_agent", []) }));
    expect(ungranted.allowed).toBe(false);
    expect(ungranted.reasons[0]).toContain("não concedida");

    const unknown = evaluateActorPermission(base({ actor: agent("agente_inexistente") }));
    expect(unknown.reasons[0]).toContain("não registrado");
    expect(evaluateActorPermission(base({ actor: agent("insights_agent", ["ler_dashboard"], "autonomo_controlado", false) })).origem).toBe("agent_grants");
  });

  it("checks integration scopes, expiration and active state", () => {
    expect(evaluateActorPermission(base({ actor: integration() })).allowed).toBe(true);
    expect(evaluateActorPermission(base({ actor: integration(["write"]) })).allowed).toBe(false);
    expect(evaluateActorPermission(base({ actor: integration(["read"], "2026-11-20T12:00:00.000Z") })).reasons[0]).toContain("expirado");
    expect(evaluateActorPermission(base({ actor: integration(["read"], null, false) })).reasons[0]).toContain("inativo");
    expect(evaluateActorPermission(base({ actor: integration(), scope: "custom" })).reasons[0]).toContain("custom");
  });

  it("applies the hard gate and the global kill switch before any actor branch", () => {
    const gated = evaluateActorPermission(base({ tool: "send_whatsapp" }));
    expect(gated.allowed).toBe(false);
    expect(gated.origem).toBe("hard_gate");
    expect(gated.reasons[0]).toContain("vetada");

    const halted = evaluateActorPermission(base({ killEngaged: true }));
    expect(halted.allowed).toBe(false);
    expect(halted.origem).toBe("kill_switch");
    expect(halted.reasons[0]).toContain("interrompidas");
  });

  it("never lets any actor execute a sensible action", () => {
    for (const actor of [human("owner"), agent("insights_agent", ["envio_mensagem"]), integration(["admin"])]) {
      const verdict = evaluateActorPermission(base({ actor, action: "envio_mensagem" }));
      expect(verdict.allowed).toBe(false);
      expect(verdict.requiresApproval).toBe(true);
      expect(verdict.origem).toBe("ação_sensível");
    }
  });
});

describe("LGPD processing", () => {
  const processing = {
    organization_id: "org-1",
    purpose: "Qualificar leads do funil comercial",
    legal_basis: "contrato" as const,
    collected_at: "2026-11-01T12:00:00.000Z",
    retention_days: 365,
    fields: ["nome", "email"],
    consent_id: null,
    consented_at: null,
    revoked_at: null,
    sensitive_justification: null,
  };

  it("allows declared purpose, legal basis, minimization and retention", () => {
    const verdict = evaluateProcessing({ processing, now: NOW, organizationId: "org-1" });
    expect(verdict.status).toBe("permitido");
    expect(verdict.reasons[0]).toContain("base legal");
  });

  it("blocks opposition, revocation, tenant mismatch and expired retention", () => {
    expect(evaluateProcessing({ processing, now: NOW, organizationId: "org-1", opposed: true }).status).toBe("bloqueado");
    expect(evaluateProcessing({ processing: { ...processing, revoked_at: NOW }, now: NOW, organizationId: "org-1" }).reasons[0]).toContain("revogado");
    expect(evaluateProcessing({ processing, now: NOW, organizationId: "org-2" }).status).toBe("bloqueado");
    const expired = evaluateProcessing({
      processing: { ...processing, collected_at: "2020-01-01T12:00:00.000Z", retention_days: 30 },
      now: NOW,
      organizationId: "org-1",
    });
    expect(expired.reasons.some((r) => r.includes("retenção"))).toBe(true);
  });

  it("requires consent evidence and minimization justification for sensitive fields", () => {
    const consentless = evaluateProcessing({
      processing: { ...processing, legal_basis: "consentimento" },
      now: NOW,
      organizationId: "org-1",
    });
    expect(consentless.status).toBe("bloqueado");
    expect(consentless.reasons.some((r) => r.includes("consent_id"))).toBe(true);

    const sensitive = evaluateProcessing({
      processing: { ...processing, fields: ["nome", "cpf", "telefone"] },
      now: NOW,
      organizationId: "org-1",
    });
    expect(sensitive.reasons[0]).toContain("campos sensíveis");
    expect(
      evaluateProcessing({
        processing: {
          ...processing,
          fields: ["nome", "cpf"],
          sensitive_justification: "Cadastro contratual com documento exigido pela operação.",
        },
        now: NOW,
        organizationId: "org-1",
      }).status,
    ).toBe("permitido");
  });

  it("returns sem_dados for an invalid declaration, never a fabricated approval", () => {
    const verdict = evaluateProcessing({ processing: { purpose: "qualificar" }, now: NOW, organizationId: "org-1" });
    expect(verdict.status).toBe("sem_dados");
    expect(verdict.reasons.length).toBeGreaterThan(0);
  });
});

describe("data subject requests", () => {
  const request = {
    organization_id: "org-1",
    subject_id: "titular-1",
    kind: "acesso" as const,
    status: "aberta" as const,
    created_at: "2026-11-20T12:00:00.000Z",
    approved_by: null,
  };

  it("keeps regular requests pending without executing anything", () => {
    const verdict = evaluateDataSubjectRequest(request, "org-1");
    expect(verdict.status).toBe("pendente");
    expect(verdict.requiresApproval).toBe(false);
    expect(verdict.reasons[0]).toContain("nenhuma exportação ou exclusão foi executada");
  });

  it("requires a human approval for deletion and portability", () => {
    const deletion = evaluateDataSubjectRequest({ ...request, kind: "exclusao" }, "org-1");
    expect(deletion.status).toBe("pendente");
    expect(deletion.requiresApproval).toBe(true);

    const unapproved = evaluateDataSubjectRequest(
      { ...request, kind: "exclusao", status: "concluida" },
      "org-1",
    );
    expect(unapproved.status).toBe("bloqueado");
    expect(unapproved.requiresApproval).toBe(true);

    const approved = evaluateDataSubjectRequest(
      { ...request, kind: "portabilidade", status: "concluida", approved_by: "user-1" },
      "org-1",
    );
    expect(approved.status).toBe("concluido");
  });

  it("blocks tenant mismatch and invalid records", () => {
    expect(evaluateDataSubjectRequest(request, "org-2").reasons[0]).toBe("tenant divergente");
    expect(evaluateDataSubjectRequest({ kind: "acesso" }, "org-1").status).toBe("bloqueado");
    expect(evaluateDataSubjectRequest({ ...request, created_at: "agora" }, "org-1").reasons[0]).toContain("inválida");
  });
});

describe("audit chain", () => {
  const auditInput = {
    organizationId: "org-1",
    runId: "run-1",
    actor: "insights_agent",
    event: "leitura",
    action: "gerar_leitura",
    status: "ok",
    asOfSeconds: AS_OF_SECONDS,
    detail: {
      resumo: "leitura deterministica",
      prompt: "segredo do sistema que não deve vazar",
      apiKey: "gsk_abcdefghijklmnopqrstuv",
      nested: { token: "ghp_abcdefghijklmnopqrstuvwxyz012345" },
    },
  };

  it("redacts secrets and omits raw content before canonicalization", async () => {
    const event = await buildSecurityAuditEvent(auditInput);
    expect(event.organization_id).toBe("org-1");
    expect(event.previous_hash).toBe(GENESIS_HASH);
    expect(event.hash).toHaveLength(64);
    expect(event.detail).toContain("leitura deterministica");
    expect(event.detail).toContain("[omitido]");
    expect(event.detail).not.toContain("segredo do sistema");
    expect(event.detail).not.toContain("gsk_abcdefghijklmnopqrstuv");
    expect(event.detail).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz012345");
  });

  it("verifies a chained sequence from genesis", async () => {
    const first = await buildSecurityAuditEvent(auditInput);
    const second = await buildSecurityAuditEvent({
      ...auditInput,
      runId: "run-2",
      action: "ler_dashboard",
      previousHash: first.hash,
      asOfSeconds: AS_OF_SECONDS + 1,
    });
    const chain = [first, second];
    expect(await verifyAuditChain(chain)).toMatchObject({ ok: true, count: 2, badIndex: null });
    expect(second.previous_hash).toBe(first.hash);

    const tampered: SecurityAuditEvent[] = [
      { ...first, detail: first.detail.replace("deterministica", "alterada") },
      second,
    ];
    expect(await verifyAuditChain(tampered)).toMatchObject({
      ok: false,
      reason: "hash do evento divergente",
      badIndex: 0,
    });

    const brokenLink: SecurityAuditEvent[] = [first, { ...second, previous_hash: GENESIS_HASH }];
    expect(await verifyAuditChain(brokenLink)).toMatchObject({
      ok: false,
      reason: "elo anterior divergente",
      badIndex: 1,
    });
    expect(await verifyAuditChain([])).toMatchObject({ ok: true, count: 0 });
  });

  it("fails closed on invalid audit input", async () => {
    await expect(buildSecurityAuditEvent({ ...auditInput, organizationId: "  " })).rejects.toThrow("organization_id");
    await expect(buildSecurityAuditEvent({ ...auditInput, asOfSeconds: 0 })).rejects.toThrow("asOfSeconds");
    await expect(buildSecurityAuditEvent({ ...auditInput, runId: " " })).rejects.toThrow("run_id");
  });
});

describe("production readiness preflight", () => {
  const ready: ReadinessInput = {
    organizationId: "org-1",
    schemaApplied: true,
    typesGenerated: true,
    adrApproved: true,
    rlsApplied: true,
    killStateReadable: true,
    killEngaged: false,
    auditChainOk: true,
    actorChecks: [{ id: "owner", allowed: true, requiresApproval: false }],
    processingChecks: [{ id: "lead", status: "permitido" }],
    integrationChecks: [{ id: "whatsapp_business", approved: true }],
  };

  it("reports pronto but never authorizes exposure, deploy or commit", () => {
    const report = evaluateProductionReadiness(ready);
    expect(report.status).toBe("pronto");
    expect(report.canExpose).toBe(false);
    expect(report.canDeploy).toBe(false);
    expect(report.canCommit).toBe(false);
    expect(report.reasons[0]).toContain("nenhuma exposure");
  });

  it("blocks on missing schema, types, ADR or RLS", () => {
    for (const field of ["schemaApplied", "typesGenerated", "adrApproved", "rlsApplied"] as const) {
      const report = evaluateProductionReadiness({ ...ready, [field]: false });
      expect(report.status).toBe("bloqueado");
      expect(report.checks.find((c) => c.status === "bloqueado")).toBeDefined();
    }
  });

  it("distinguishes kill switch and approval pendencies from hard blocks", () => {
    expect(evaluateProductionReadiness({ ...ready, killEngaged: true }).status).toBe("pendente");
    expect(evaluateProductionReadiness({ ...ready, killStateReadable: false }).status).toBe("bloqueado");
    expect(
      evaluateProductionReadiness({
        ...ready,
        actorChecks: [{ id: "agente", allowed: false, requiresApproval: true }],
      }).status,
    ).toBe("pendente");
    expect(
      evaluateProductionReadiness({ ...ready, processingChecks: [{ id: "lead", status: "sem_dados" }] }).status,
    ).toBe("pendente");
    expect(
      evaluateProductionReadiness({ ...ready, integrationChecks: [{ id: "externa", approved: false }] }).status,
    ).toBe("bloqueado");
    expect(evaluateProductionReadiness({ ...ready, auditChainOk: false }).status).toBe("bloqueado");
  });
});
