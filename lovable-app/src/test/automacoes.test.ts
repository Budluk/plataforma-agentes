import { describe, expect, it } from "vitest";
import {
  AutomationData,
  RetryPolicy,
  Workflow,
  WorkflowTrigger,
  evaluateAutomationKillSwitch,
  evaluateCondition,
  evaluateConditions,
  idempotencyKey,
  planRetry,
  planWorkflowRun,
  redactAutomationAudit,
  validateWorkflowDefinition,
  type AutomationRunInput,
} from "@/lib/core/automacoes";
import { commercialToolAllowed } from "@/lib/core/commercial-agents";

const AS_OF = "2026-11-21T12:00:00.000Z";

const WORKFLOW = Workflow.parse({
  id: "wf-qualificacao",
  organization_id: "org-1",
  name: "Qualificação automática",
  purpose: "Preparar score para revisão humana",
  legalBasis: "interesse_legitimo",
  dataKeys: ["status", "score"],
  active: true,
  approvalRequired: true,
  triggerKinds: ["lead_qualificado"],
  conditionMode: "todos",
  conditions: [{ field: "status", op: "igual", value: "qualificado" }],
  retry: { maxAttempts: 2, backoffSeconds: 60, trigger: "indisponibilidade" },
  steps: [
    {
      id: "calcular",
      agent: "qualifier_agent",
      action: "calcular_score",
      purpose: "Calcular score com evidências informadas",
      params: {},
    },
  ],
});

const TRIGGER = WorkflowTrigger.parse({
  kind: "lead_qualificado",
  organization_id: "org-1",
  event_id: "evt-1",
  entity_id: "person-1",
  occurred_at: AS_OF,
});

const RUN: AutomationRunInput = {
  organizationId: "org-1",
  workflow: WORKFLOW,
  trigger: TRIGGER,
  data: { status: "qualificado", score: 82 },
  grants: { qualifier_agent: ["calcular_score"] },
  autonomy: { qualifier_agent: "autonomo_controlado" },
  asOf: AS_OF,
};

describe("workflow definition", () => {
  it("accepts a definition that uses only registered agents, actions and declared fields", () => {
    expect(RetryPolicy.safeParse(WORKFLOW.retry).success).toBe(true);
    expect(Workflow.safeParse(WORKFLOW).success).toBe(true);
    expect(validateWorkflowDefinition(WORKFLOW)).toEqual({ ok: true, issues: [] });
  });

  it("rejects undeclared condition fields, duplicate step ids and scope mismatches", () => {
    expect(
      validateWorkflowDefinition({
        ...WORKFLOW,
        conditions: [{ field: "nao_declarado", op: "igual", value: "x" }],
      }).ok,
    ).toBe(false);
    const duplicated = { ...WORKFLOW.steps[0], id: "calcular" };
    expect(validateWorkflowDefinition({ ...WORKFLOW, steps: [duplicated, duplicated] }).issues).toContain(
      "ids de etapa duplicados",
    );
    expect(
      validateWorkflowDefinition({
        ...WORKFLOW,
        steps: [{ ...WORKFLOW.steps[0], action: "preparar_proposta" }],
      }).issues,
    ).toContain("calcular: ação 'preparar_proposta' fora do escopo de 'qualifier_agent'");
  });

  it("rejects sensitive actions and secret-looking step parameters", () => {
    const sensitive = validateWorkflowDefinition({
      ...WORKFLOW,
      steps: [{ ...WORKFLOW.steps[0], action: "envio_mensagem" }],
    });
    expect(sensitive.ok).toBe(false);
    expect(sensitive.issues.length).toBeGreaterThan(0);
    expect(
      validateWorkflowDefinition({
        ...WORKFLOW,
        steps: [{ ...WORKFLOW.steps[0], params: { api_key: "abc" } }],
      }).issues,
    ).toContain("calcular: parâmetro sensível 'api_key' não permitido");
  });
});

describe("conditions", () => {
  it("evaluates equality, numeric comparison, membership and containment", () => {
    expect(evaluateCondition({ field: "status", op: "igual", value: "qualificado" }, { status: "qualificado" }).passed).toBe(true);
    expect(evaluateCondition({ field: "score", op: "maior_que", value: 80 }, { score: 82 }).passed).toBe(true);
    expect(evaluateCondition({ field: "status", op: "em", value: ["novo", "qualificado"] }, { status: "qualificado" }).passed).toBe(true);
    expect(evaluateCondition({ field: "tags", op: "contem", value: "vip" }, { tags: ["vip", "quente"] }).passed).toBe(true);
    expect(evaluateCondition({ field: "status", op: "fora", value: ["novo"] }, { status: "qualificado" }).passed).toBe(true);
  });

  it("supports existence checks without inventing a value", () => {
    expect(evaluateCondition({ field: "score", op: "existe" }, { score: 82 }).passed).toBe(true);
    expect(evaluateCondition({ field: "score", op: "nao_existe" }, {}).passed).toBe(true);
    expect(evaluateCondition({ field: "score", op: "existe" }, {}).status).toBe("medido");
  });

  it("fails closed on missing fields, type mismatches and prototype paths", () => {
    expect(evaluateCondition({ field: "ausente", op: "igual", value: "x" }, {})).toMatchObject({
      status: "sem_dados",
      passed: false,
    });
    expect(evaluateCondition({ field: "score", op: "maior_que", value: "80" }, { score: 82 }).status).toBe("sem_dados");
    expect(evaluateCondition({ field: "__proto__", op: "igual", value: "x" }, {}).status).toBe("sem_dados");
  });

  it("applies todos/qualquer modes and refuses empty or invalid conditions", () => {
    const conditions = [
      { field: "status", op: "igual", value: "qualificado" },
      { field: "score", op: "maior_que", value: 90 },
    ];
    expect(evaluateConditions(conditions, RUN.data, "todos").passed).toBe(false);
    expect(evaluateConditions(conditions, RUN.data, "qualquer").passed).toBe(true);
    expect(evaluateConditions([], RUN.data).status).toBe("sem_dados");
    expect(evaluateConditions(conditions, { status: "qualificado" }).status).toBe("sem_dados");
    expect(AutomationData.safeParse({ chave: { aninhado: "x" } }).success).toBe(false);
  });
});

describe("global kill switch", () => {
  it("halts every automation when engaged", () => {
    expect(evaluateAutomationKillSwitch(true)).toMatchObject({ halted: true });
    expect(evaluateAutomationKillSwitch(false)).toMatchObject({ halted: false });
    const plan = planWorkflowRun({ ...RUN, killEngaged: true });
    expect(plan.status).toBe("bloqueado");
    expect(plan.reasons[0]).toContain("kill switch");
    expect(plan.steps).toEqual([]);
    expect(plan.audit.step_status_counts).toEqual({});
    expect(plan.canExecute).toBe(false);
  });
});

describe("retry planning", () => {
  it("plans a bounded retry from the explicit instant without scheduling it", () => {
    const plan = planRetry(WORKFLOW.retry, { attempt: 1, asOf: AS_OF });
    expect(plan.status).toBe("planejado");
    expect(plan.attempt).toBe(2);
    expect(plan.nextAttemptAt).toBe("2026-11-21T12:01:00.000Z");
    expect(plan.requiresApproval).toBe(true);
    expect(plan.reason).toContain("nenhuma ação é executada automaticamente");
  });

  it("blocks retries past the limit or with invalid instants", () => {
    expect(planRetry(WORKFLOW.retry, { attempt: 2, asOf: AS_OF }).status).toBe("bloqueado");
    expect(planRetry(WORKFLOW.retry, { attempt: 1, asOf: "agora" }).status).toBe("bloqueado");
    expect(planRetry({}, { attempt: 1, asOf: AS_OF }).status).toBe("bloqueado");
  });
});

describe("workflow run planning", () => {
  it("plans an authorized run that still cannot execute", () => {
    const plan = planWorkflowRun(RUN);
    expect(plan.status).toBe("planejado");
    expect(plan.canExecute).toBe(false);
    expect(plan.requiresApproval).toBe(true);
    expect(plan.steps[0]).toMatchObject({
      agent: "qualifier_agent",
      action: "calcular_score",
      tool: "calcular_score",
      status: "preparado",
      allowed: true,
    });
    expect(plan.steps[0]?.retry).toMatchObject({ automatic: false, requires_approval: true });
    expect(commercialToolAllowed(plan.steps[0]?.tool ?? "").allowed).toBe(true);
    expect(plan.idempotency_key).toBe("org-1|wf-qualificacao|evt-1");
    expect(planWorkflowRun(RUN).run_id).toBe(plan.run_id);
  });

  it("keeps runs with approvalRequired=false as non-executable plans", () => {
    const plan = planWorkflowRun({ ...RUN, workflow: { ...WORKFLOW, approvalRequired: false } });
    expect(plan.status).toBe("planejado");
    expect(plan.requiresApproval).toBe(false);
    expect(plan.canExecute).toBe(false);
  });

  it("waits for approval under assisted autonomy and blocks on a missing grant", () => {
    const assisted = planWorkflowRun({
      ...RUN,
      autonomy: { qualifier_agent: "assistido" },
    });
    expect(assisted.status).toBe("aguardando_aprovacao");
    expect(assisted.steps[0]?.requiresApproval).toBe(true);
    expect(assisted.canExecute).toBe(false);

    const noGrant = planWorkflowRun({ ...RUN, grants: {} });
    expect(noGrant.status).toBe("bloqueado");
    expect(noGrant.steps[0]?.reasons[0]).toContain("não concedida");
  });

  it("does not fire for unsubscribed triggers or unmet conditions", () => {
    const unsubscribed = planWorkflowRun({
      ...RUN,
      trigger: { ...TRIGGER, kind: "revisao_manual" },
    });
    expect(unsubscribed.status).toBe("nao_disparado");
    const conditionFailed = planWorkflowRun({ ...RUN, data: { status: "novo", score: 40 } });
    expect(conditionFailed.status).toBe("nao_disparado");
    expect(conditionFailed.reasons[0]).toContain("não foram atendidas");
  });

  it("fails closed on tenant mismatch, inactive workflows, future events and bad data", () => {
    expect(planWorkflowRun({ ...RUN, organizationId: "org-2" }).reasons[0]).toContain("tenant divergente");
    expect(planWorkflowRun({ ...RUN, workflow: { ...WORKFLOW, active: false } }).reasons[0]).toContain("inativo");
    expect(
      planWorkflowRun({
        ...RUN,
        trigger: { ...TRIGGER, occurred_at: "2026-11-22T12:00:00.000Z" },
      }).reasons[0],
    ).toContain("evento no futuro");
    expect(planWorkflowRun({ ...RUN, data: { status: "qualificado", cpf: "123" } }).reasons[0]).toContain(
      "não declaradas",
    );
    expect(planWorkflowRun({ ...RUN, data: { score: 82 } }).reasons[0]).toContain(
      "condição não avaliada",
    );
    expect(planWorkflowRun({ ...RUN, asOf: "agora" }).reasons[0]).toContain("instante de referência");
  });

  it("derives a deterministic idempotency key without a clock", () => {
    expect(idempotencyKey(" org-1 ", " wf-1 ", " evt-1 ")).toBe("org-1|wf-1|evt-1");
  });
});

describe("automation audit redaction", () => {
  it("records only ids, counts and bounded reasons", () => {
    const plan = planWorkflowRun({ ...RUN, data: { status: "qualificado", score: 987654 } });
    const serialized = JSON.stringify(plan.audit);
    expect(plan.audit.data_key_count).toBe(2);
    expect(plan.audit.step_status_counts).toEqual({ preparado: 1 });
    expect(plan.audit.event_id).toBe("evt-1");
    expect(serialized).not.toContain("987654");
    expect(serialized).not.toContain("Calcular score com evidências informadas");
  });

  it("bounds reason count and length", () => {
    const audit = redactAutomationAudit({
      organization_id: "org-1",
      workflow_id: "wf-1",
      run_id: "run-1",
      trigger_kind: null,
      event_id: "evt-1",
      status: "bloqueado",
      reasons: Array.from({ length: 20 }, (_, i) => `razão ${i} `.repeat(100)),
      dataKeys: [],
      stepStatuses: [],
    });
    expect(audit.reasons).toHaveLength(8);
    expect(audit.reasons[0]?.length).toBeLessThanOrEqual(200);
  });
});
