import { describe, it, expect } from "vitest";
import {
  buildFunnelSnapshot,
  buildKanbanBoard,
  defaultPipelineStages,
  decideStageMove,
  prepareLeadCapture,
  qualifyLead,
  type FunnelEvent,
  type OpportunityCard,
  type PipelineStage,
} from "@/lib/core/pipeline";
import type { ContactLike } from "@/lib/core/crm";

const STAGES: PipelineStage[] = [
  { key: "lead_recebido", label: "Recebido", position: 0, probability_default: 0, active: true },
  {
    key: "qualificacao",
    label: "Qualificação",
    position: 1,
    probability_default: 50,
    active: true,
  },
  { key: "venda_ganha", label: "Ganha", position: 2, probability_default: 100, active: true },
  { key: "venda_perdida", label: "Perdida", position: 3, probability_default: 0, active: true },
];

const CARDS: OpportunityCard[] = [
  { id: "o1", stage: "lead_recebido", amount_cents: 10_000, probability: null },
  { id: "o2", stage: "qualificacao", amount_cents: 20_000, probability: 80 },
  { id: "o3", stage: "venda_ganha", amount_cents: 50_000, probability: null },
  { id: "o4", stage: "qualificacao", amount_cents: -1 },
  { id: "o5", stage: "etapa_inexistente", amount_cents: 1_000 },
];

const CAPTURE = {
  organization_id: "org1",
  source: "site",
  source_authorized: true,
  display_name: "Maria",
  emails: ["maria@example.com"],
  phones: ["(11) 99999-9999"],
  document_token: null,
  company: "Acme",
  purpose: "contato comercial",
  legal_basis: "consentimento",
  consent_granted: true,
  evidence_ref: null,
};

describe("pipeline configuration", () => {
  it("suggests the eleven stages without inventing probabilities", () => {
    const stages = defaultPipelineStages();
    expect(stages).toHaveLength(11);
    expect(stages[0]?.key).toBe("lead_recebido");
    expect(stages[10]?.key).toBe("pos_venda");
    expect(stages.every((s) => s.probability_default === 0 && s.active)).toBe(true);
    expect(stages.find((s) => s.key === "qualificacao")?.label).toBe("Qualificação");
  });

  it("fails closed on duplicate stage keys or positions", () => {
    expect(() => buildKanbanBoard([...STAGES, { ...STAGES[0]!, key: "outra" }], [])).toThrow(
      "posição duplicada",
    );
    expect(() =>
      buildKanbanBoard([...STAGES, { ...STAGES[0]!, key: "outra", position: 99 }], []),
    ).not.toThrow();
  });
});

describe("Kanban board", () => {
  it("groups by configured stage, discards invalid amounts and lists unknown stages", () => {
    const board = buildKanbanBoard(STAGES, CARDS);
    expect(board.status).toBe("medido");
    expect(board.columns.map((c) => c.key)).toEqual([
      "lead_recebido",
      "qualificacao",
      "venda_ganha",
      "venda_perdida",
    ]);
    expect(board.columns[0]).toMatchObject({
      count: 1,
      total_cents: 10_000,
      invalid_amounts: 0,
      weighted_cents: null,
      probability_sources: { explicit: 0, stage_default: 0, missing: 1 },
    });
    expect(board.columns[1]).toMatchObject({
      count: 2,
      total_cents: 20_000,
      invalid_amounts: 1,
      weighted_cents: 16_000,
      probability_sources: { explicit: 1, stage_default: 0, missing: 0 },
    });
    expect(board.columns[2]).toMatchObject({
      terminal: true,
      weighted_cents: 50_000,
      probability_sources: { explicit: 0, stage_default: 1, missing: 0 },
    });
    expect(board.open_cents).toBe(30_000);
    expect(board.weighted_open_cents).toBe(16_000);
    expect(board.invalid_amounts).toBe(1);
    expect(board.unmapped).toEqual({ count: 1, ids: ["o5"] });
  });

  it("never invents cards or values for an empty board", () => {
    const board = buildKanbanBoard(STAGES, []);
    expect(board.status).toBe("sem_dados");
    expect(board.open_cents).toBe(0);
    expect(board.weighted_open_cents).toBeNull();
    expect(board.columns.every((c) => c.count === 0 && c.weighted_cents === null)).toBe(true);
  });

  it("discards a card whose amount would overflow the column aggregate", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const board = buildKanbanBoard(STAGES, [
      { id: "a", stage: "lead_recebido", amount_cents: huge, probability: null },
      { id: "b", stage: "lead_recebido", amount_cents: huge, probability: null },
    ]);
    expect(board.columns[0]).toMatchObject({ count: 2, total_cents: huge, invalid_amounts: 1 });
    expect(board.columns[0]?.reason).toContain("estouro");
    expect(board.open_cents).toBe(huge);
  });

  it("reports an unsafe board total as null instead of a wrong number", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const board = buildKanbanBoard(STAGES, [
      { id: "a", stage: "lead_recebido", amount_cents: huge, probability: null },
      { id: "b", stage: "qualificacao", amount_cents: huge, probability: null },
    ]);
    expect(board.open_cents).toBeNull();
    expect(board.reason).toContain("limite seguro");
  });
});

describe("stage move decisions", () => {
  const move = (overrides: Partial<Parameters<typeof decideStageMove>[0]> = {}) =>
    decideStageMove({
      from: "lead_recebido",
      to: "qualificacao",
      stages: STAGES,
      autonomy: "autonomo_controlado",
      grantActions: ["mover_oportunidade"],
      ...overrides,
    });

  it("allows a forward move only for granted, controlled autonomy", () => {
    expect(move()).toMatchObject({ allowed: true, requiresApproval: false, kind: "avanco" });
    expect(move({ autonomy: "assistido" })).toMatchObject({
      allowed: false,
      requiresApproval: true,
    });
    expect(move({ grantActions: [] })).toMatchObject({ kind: "bloqueado" });
  });

  it("honours the kill switch and sensible-action approval", () => {
    expect(move({ killEngaged: true })).toMatchObject({
      allowed: false,
      requiresApproval: false,
      kind: "bloqueado",
    });
    expect(move({ action: "envio_mensagem", grantActions: ["envio_mensagem"] })).toMatchObject({
      allowed: false,
      requiresApproval: true,
    });
  });

  it("blocks unknown stages and unauthorised regressions", () => {
    expect(move({ to: "inexistente" })).toMatchObject({ kind: "invalido" });
    expect(move({ from: "venda_ganha" })).toMatchObject({ kind: "invalido" });
    expect(
      move({
        from: "venda_ganha",
        allowedTransitions: [{ from: "venda_ganha", to: "qualificacao" }],
      }),
    ).toMatchObject({ kind: "retorno", requiresApproval: true });
  });

  it("always requires a human for a terminal stage", () => {
    expect(move({ to: "venda_ganha" })).toMatchObject({
      allowed: false,
      requiresApproval: true,
      kind: "terminal",
    });
  });
});

describe("lead capture", () => {
  it("prepares a lead for human confirmation without writing it", () => {
    const r = prepareLeadCapture(CAPTURE, []);
    expect(r.status).toBe("preparado");
    expect(r.requiresConfirmation).toBe(true);
    expect(r.duplicateGroups).toEqual([]);
    expect(r.lead).toMatchObject({
      display_name: "Maria",
      purpose: "contato comercial",
      legal_basis: "consentimento",
    });
    expect(r.lead).not.toHaveProperty("source_authorized");
  });

  it("blocks missing authorisation, consent evidence and invalid fields", () => {
    expect(prepareLeadCapture({ ...CAPTURE, source_authorized: false }, []).reasons[0]).toContain(
      "fonte não autorizada",
    );
    expect(prepareLeadCapture({ ...CAPTURE, consent_granted: false }, []).reasons[0]).toContain(
      "consentimento registrado",
    );
    expect(
      prepareLeadCapture({ ...CAPTURE, legal_basis: "interesse_legitimo" }, []).reasons[0],
    ).toContain("evidence_ref");
    const invalid = prepareLeadCapture({ ...CAPTURE, emails: ["invalido"] }, []);
    expect(invalid.status).toBe("bloqueado");
    expect(invalid.lead).toBeNull();
    expect(invalid.reasons[0]).toContain("emails.0");
  });

  it("flags possible duplicates using normalised existing contacts", () => {
    const existing: ContactLike[] = [
      {
        id: "c1",
        display_name: "Maria Antiga",
        emails: ["MARIA@example.com"],
        phones: [],
        document_token: null,
      },
    ];
    const r = prepareLeadCapture(CAPTURE, existing);
    expect(r.status).toBe("bloqueado");
    expect(r.duplicateGroups).toEqual([{ key: "maria@example.com", reason: "email", ids: ["c1"] }]);
    expect(r.lead).toBeNull();
    expect(r.reasons.some((reason) => reason.includes("duplicatas"))).toBe(true);
  });
});

describe("qualification", () => {
  it("recommends a classification from explicit evidence only", () => {
    const r = qualifyLead({ fit: 100, ability: 80 });
    expect(r.score).toBe(92);
    expect(r.status).toBe("qualificado");
    expect(r.used).toEqual(["fit", "ability"]);
    expect(r.outreachAllowed).toBe(true);
    expect(r.requiresHumanConfirmation).toBe(true);
    expect(r.reasons.some((reason) => reason.includes("hipótese"))).toBe(true);
  });

  it("respects opt-out and refuses to classify without two signals", () => {
    expect(qualifyLead({ fit: 100 }, { optedOut: true })).toMatchObject({
      status: "sem_dados",
      score: null,
      outreachAllowed: false,
    });
    expect(qualifyLead({ fit: 100, ability: 80 }, { optedOut: true }).outreachAllowed).toBe(false);
    expect(qualifyLead({ fit: 100, ability: 80 }, { threshold: 10 }).status).toBe("qualificado");
    expect(() => qualifyLead({ fit: 100 }, { threshold: 200 })).toThrow("limiar");
  });
});

describe("funnel snapshot", () => {
  const FUNNEL_STAGES: PipelineStage[] = STAGES.slice(0, 3);
  const EVENTS: FunnelEvent[] = [
    { opportunity_id: "a", from_stage: null, to_stage: "lead_recebido" },
    { opportunity_id: "a", from_stage: "lead_recebido", to_stage: "qualificacao" },
    { opportunity_id: "b", from_stage: null, to_stage: "lead_recebido" },
    { opportunity_id: "c", from_stage: "qualificacao", to_stage: "venda_ganha" },
    { opportunity_id: "d", from_stage: null, to_stage: "venda_ganha" },
    { opportunity_id: "e", from_stage: "lead_recebido", to_stage: "lead_recebido" },
    { opportunity_id: "f", from_stage: null, to_stage: "desconhecida" },
  ];

  it("counts recorded moves and leaves unknown stages out", () => {
    const s = buildFunnelSnapshot(FUNNEL_STAGES, EVENTS);
    expect(s.status).toBe("medido");
    expect(s.totalEvents).toBe(7);
    expect(
      s.steps.map((step) => [step.key, step.entered, step.exited, step.conversion_pct]),
    ).toEqual([
      ["lead_recebido", 3, 2, null],
      ["qualificacao", 1, 1, 33.33],
      ["venda_ganha", 2, 0, 200],
    ]);
    expect(s.unknownStages).toEqual(["desconhecida"]);
  });

  it("reports sem_dados instead of zero-based conversion when nothing was recorded", () => {
    const s = buildFunnelSnapshot(FUNNEL_STAGES, []);
    expect(s.status).toBe("sem_dados");
    expect(s.steps.every((step) => step.entered === null && step.conversion_pct === null)).toBe(
      true,
    );
  });
});
