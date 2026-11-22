import { describe, expect, it } from "vitest";
import {
  CatalogProduct,
  PriceTable,
  ProposalRequest,
  buildProposalReport,
  evaluateDiscount,
  prepareProposal,
  proposalPrintHtml,
  resolvePrice,
  snapshotProposalVersion,
  type ProposalNarrative,
} from "@/lib/core/propostas";

const AS_OF = "2026-11-21T12:00:00.000Z";

const CATALOG = [
  CatalogProduct.parse({
    organization_id: "org-1",
    sku: "CURSO-AVANCADO",
    name: "Curso Avançado",
    description: "Curso real",
    category: "educacao",
    unit: "un",
    active: true,
    origin: "real",
  }),
  CatalogProduct.parse({
    organization_id: "org-1",
    sku: "AMOSTRA-1",
    name: "Pacote ilustrativo",
    description: "Apenas demonstração",
    category: "amostra",
    unit: "un",
    active: true,
    origin: "amostra",
  }),
];

const TABLE = PriceTable.parse({
  id: "pt-1",
  organization_id: "org-1",
  name: "Tabela principal",
  currency: "BRL",
  active: true,
  items: [
    {
      sku: "CURSO-AVANCADO",
      currency: "BRL",
      amount_cents: 10000,
      min_qty: 1,
      max_discount_pct: 10,
      tax_pct: 0,
      valid_from: null,
      valid_until: null,
      active: true,
    },
    {
      sku: "AMOSTRA-1",
      currency: "BRL",
      amount_cents: 5000,
      min_qty: 1,
      max_discount_pct: 0,
      tax_pct: 0,
      valid_from: null,
      valid_until: null,
      active: true,
    },
    {
      sku: "INATIVO",
      currency: "BRL",
      amount_cents: 9000,
      min_qty: 1,
      max_discount_pct: 0,
      valid_from: null,
      valid_until: null,
      active: false,
    },
  ],
});

const REQUEST = ProposalRequest.parse({
  id: "prop-1",
  organization_id: "org-1",
  customer_id: "person-1",
  opportunity_id: "opp-1",
  version: 1,
  origin: "real",
  status: "rascunho",
  valid_until: "2026-12-31T23:59:59.000Z",
  payment_terms: "à vista",
  notes: "nota interna que não deve aparecer na auditoria",
  items: [{ sku: "CURSO-AVANCADO", qty: 2, discount_pct: 5, notes: "item aprovado" }],
});

const RUN = {
  organizationId: "org-1",
  proposal: REQUEST,
  catalog: CATALOG,
  priceTable: TABLE,
  grantActions: ["preparar_proposta", "validar_desconto"],
  autonomy: "autonomo_controlado" as const,
  asOf: AS_OF,
};

const NARRATIVE: ProposalNarrative = {
  resumo: "Proosta preparada apenas com dados informados nesta sessão.",
  destaques: ["Totais calculados por código."],
  atencao: [],
  proximos_passos: ["Revisar com uma pessoa antes de qualquer uso externo."],
};

describe("catalog and price resolution", () => {
  it("resolves a vigent BRL price from the supplied table", () => {
    const price = resolvePrice({ table: TABLE, sku: "CURSO-AVANCADO", qty: 2, asOf: AS_OF });
    expect(price.status).toBe("medido");
    expect(price.amount_cents).toBe(10000);
    expect(price.max_discount_pct).toBe(10);
    expect(price.table_id).toBe("pt-1");
  });

  it("fails closed on missing, inactive or out-of-window prices", () => {
    expect(resolvePrice({ table: TABLE, sku: "DESCONHECIDO", qty: 1, asOf: AS_OF }).status).toBe("sem_dados");
    expect(resolvePrice({ table: TABLE, sku: "INATIVO", qty: 1, asOf: AS_OF }).status).toBe("sem_dados");
    expect(resolvePrice({ table: TABLE, sku: "CURSO-AVANCADO", qty: 0, asOf: AS_OF }).status).toBe("sem_dados");
    expect(resolvePrice({ table: TABLE, sku: "CURSO-AVANCADO", qty: 1, asOf: "agora" }).status).toBe("sem_dados");
    expect(resolvePrice({ table: { ...TABLE, active: false }, sku: "CURSO-AVANCADO", qty: 1, asOf: AS_OF }).status).toBe("sem_dados");
  });

  it("honours explicit validity windows without reading a clock", () => {
    const future = PriceTable.parse({
      ...TABLE,
      items: [{ ...TABLE.items[0]!, valid_from: "2026-12-01T00:00:00.000Z" }],
    });
    expect(resolvePrice({ table: future, sku: "CURSO-AVANCADO", qty: 1, asOf: AS_OF }).status).toBe("sem_dados");
    expect(
      resolvePrice({ table: future, sku: "CURSO-AVANCADO", qty: 1, asOf: "2026-12-02T00:00:00.000Z" }).status,
    ).toBe("medido");
  });
});

describe("discount gate", () => {
  const base = {
    baseCents: 20000,
    maxDiscountPct: 10,
    grantActions: ["validar_desconto"],
    autonomy: "autonomo_controlado" as const,
  };

  it("allows an in-table discount under controlled autonomy", () => {
    const verdict = evaluateDiscount({ ...base, discountPct: 5 });
    expect(verdict.allowed).toBe(true);
    expect(verdict.requiresApproval).toBe(false);
    expect(verdict.extraordinary).toBe(false);
    expect(verdict.discount_cents).toBe(1000);
    expect(verdict.total_cents).toBe(19000);
  });

  it("requires approval at assisted autonomy and for extraordinary discounts", () => {
    expect(evaluateDiscount({ ...base, discountPct: 5, autonomy: "assistido" }).requiresApproval).toBe(true);
    const extraordinary = evaluateDiscount({ ...base, discountPct: 20, grantActions: ["validar_desconto", "desconto_extraordinario"] });
    expect(extraordinary.extraordinary).toBe(true);
    expect(extraordinary.allowed).toBe(false);
    expect(extraordinary.requiresApproval).toBe(true);
    expect(extraordinary.reasons[0]).toContain("acima do limite");
  });

  it("blocks on kill switch, missing grant and invalid percentages", () => {
    expect(evaluateDiscount({ ...base, discountPct: 5, killEngaged: true }).reasons[0]).toContain("kill switch");
    expect(evaluateDiscount({ ...base, discountPct: 5, grantActions: [] }).allowed).toBe(false);
    expect(evaluateDiscount({ ...base, discountPct: 101 }).reasons[0]).toContain("inválido");
  });
});

describe("proposal preparation", () => {
  it("builds a deterministic draft with integer BRL totals and no external effect", () => {
    const out = prepareProposal(RUN);
    expect(out.status).toBe("preparado");
    expect(out.canSend).toBe(false);
    expect(out.canCheckout).toBe(false);
    expect(out.requiresApproval).toBe(false);
    expect(out.draft).toMatchObject({
      currency: "BRL",
      subtotal_cents: 20000,
      discount_cents: 1000,
      tax_cents: 0,
      total_cents: 19000,
      approval_required: false,
    });
    expect(out.draft?.items[0]?.unit_price_cents).toBe(10000);
    expect(out.reasons.some((r) => r.includes("nenhum envio"))).toBe(true);
    expect(prepareProposal(RUN).draft).toEqual(out.draft);
  });

  it("flags extraordinary discounts instead of silently rejecting them", () => {
    const proposal = ProposalRequest.parse({
      ...REQUEST,
      items: [{ sku: "CURSO-AVANCADO", qty: 2, discount_pct: 20, notes: "" }],
    });
    const out = prepareProposal({ ...RUN, proposal });
    expect(out.status).toBe("preparado");
    expect(out.requiresApproval).toBe(true);
    expect(out.draft?.approval_required).toBe(true);
    expect(out.reasons.some((r) => r.includes("acima do limite"))).toBe(true);
  });

  it("requires approval under assisted autonomy and blocks on a missing grant", () => {
    expect(prepareProposal({ ...RUN, autonomy: "assistido" }).requiresApproval).toBe(true);
    const blocked = prepareProposal({ ...RUN, grantActions: [] });
    expect(blocked.status).toBe("bloqueado");
    expect(blocked.draft).toBeNull();
    expect(blocked.reasons.some((r) => r.includes("não concedida"))).toBe(true);
  });

  it("stops every draft when the kill switch is engaged", () => {
    const out = prepareProposal({ ...RUN, killEngaged: true });
    expect(out.status).toBe("bloqueado");
    expect(out.reasons[0]).toContain("kill switch");
    expect(out.audit.status).toBe("bloqueado");
  });

  it("redacts notes and payment terms from the audit record", () => {
    const out = prepareProposal(RUN);
    const serialized = JSON.stringify(out.audit);
    expect(out.audit.customer_id).toBe("person-1");
    expect(out.audit.item_count).toBe(1);
    expect(serialized).not.toContain("nota interna");
    expect(serialized).not.toContain("à vista");
    expect(serialized).not.toContain("item aprovado");
  });

  it("keeps sample and real catalogs strictly separated", () => {
    const sample = prepareProposal({
      ...RUN,
      proposal: ProposalRequest.parse({
        ...REQUEST,
        origin: "amostra",
        items: [{ sku: "AMOSTRA-1", qty: 1, discount_pct: 0, notes: "" }],
      }),
    });
    expect(sample.status).toBe("preparado");
    expect(sample.draft?.items[0]?.name).toContain("AMOSTRA");
    expect(sample.reasons.some((r) => r.includes("ilustrativa"))).toBe(true);

    const mixed = prepareProposal({
      ...RUN,
      proposal: ProposalRequest.parse({
        ...REQUEST,
        items: [{ sku: "AMOSTRA-1", qty: 1, discount_pct: 0, notes: "" }],
      }),
    });
    expect(mixed.status).toBe("bloqueado");
    expect(mixed.reasons.some((r) => r.includes("origem"))).toBe(true);
  });

  it("fails closed on tenant mismatch, invalid dates and unpriced items", () => {
    expect(prepareProposal({ ...RUN, organizationId: "org-2" }).reasons[0]).toContain("tenant divergente");
    expect(prepareProposal({ ...RUN, asOf: "agora" }).reasons[0]).toContain("instante de referência");
    expect(
      prepareProposal({ ...RUN, proposal: { ...REQUEST, valid_until: "2026-01-01T00:00:00.000Z" } }).reasons[0],
    ).toContain("validade");
    expect(
      prepareProposal({
        ...RUN,
        proposal: ProposalRequest.parse({
          ...REQUEST,
          items: [{ sku: "SEM-PRECO", qty: 1, discount_pct: 0, notes: "" }],
        }),
      }).reasons[0],
    ).toContain("catálogo");
    expect(prepareProposal({ ...RUN, catalog: CATALOG.map((p) => ({ ...p, organization_id: "org-2" })) }).reasons[0]).toContain(
      "outro tenant",
    );
  });
});

describe("version snapshots", () => {
  it("creates a deterministic, chained, canonical hash", async () => {
    const draft = prepareProposal(RUN).draft!;
    const input = { proposalId: "prop-1", asOf: AS_OF, actor: "operador-1" };
    const v1 = await snapshotProposalVersion(draft, input);
    const v1Again = await snapshotProposalVersion(draft, input);
    expect(v1.snapshot_id).toBe(v1Again.snapshot_id);
    expect(v1.snapshot_id).toHaveLength(64);
    expect(v1.previous_snapshot_id).toBeNull();
    expect(v1.created_at).toBe(AS_OF);

    const v2 = await snapshotProposalVersion({ ...draft, version: 2 }, {
      ...input,
      previousSnapshotId: v1.snapshot_id,
    });
    expect(v2.previous_snapshot_id).toBe(v1.snapshot_id);
    expect(v2.snapshot_id).not.toBe(v1.snapshot_id);
  });

  it("refuses divergent ids, invalid actors and invalid instants", async () => {
    const draft = prepareProposal(RUN).draft!;
    await expect(
      snapshotProposalVersion(draft, { proposalId: "outra", asOf: AS_OF, actor: "operador-1" }),
    ).rejects.toThrow("divergente");
    await expect(
      snapshotProposalVersion(draft, { proposalId: "prop-1", asOf: "agora", actor: "operador-1" }),
    ).rejects.toThrow("instante");
    await expect(
      snapshotProposalVersion(draft, { proposalId: "prop-1", asOf: AS_OF, actor: "" }),
    ).rejects.toThrow("ator");
  });
});

describe("proposal PDF model", () => {
  it("uses the report model and the existing browser print renderer", () => {
    const doc = buildProposalReport({ draft: prepareProposal(RUN).draft!, generatedAt: "21/11/2026 12:00" });
    expect(doc.title).toBe("Proposta comercial");
    expect(JSON.stringify(doc.blocks)).toContain("190,00");
    const html = proposalPrintHtml({ draft: prepareProposal(RUN).draft!, generatedAt: "21/11/2026 12:00" });
    expect(html.startsWith('<!doctype html>\n<html lang="pt-BR">')).toBe(true);
    expect(html).toContain("190,00");
  });

  it("labels sample proposals and never presents them as a real offer", () => {
    const sample = prepareProposal({
      ...RUN,
      proposal: ProposalRequest.parse({
        ...REQUEST,
        origin: "amostra",
        items: [{ sku: "AMOSTRA-1", qty: 1, discount_pct: 0, notes: "" }],
      }),
    }).draft!;
    const doc = buildProposalReport({ draft: sample, generatedAt: "21/11/2026 12:00" });
    expect(doc.title).toBe("Proposta (AMOSTRA)");
    expect(JSON.stringify(doc.blocks)).toContain("não é produto, preço ou venda real");
  });

  it("keeps numbers deterministic when the AI layer is absent or fails", () => {
    const draft = prepareProposal(RUN).draft!;
    const plain = buildProposalReport({ draft, generatedAt: "21/11/2026 12:00" });
    expect(JSON.stringify(plain.blocks)).not.toContain("Leitura por IA");

    const withNarrative = buildProposalReport({ draft, generatedAt: "21/11/2026 12:00", narrative: NARRATIVE });
    expect(JSON.stringify(withNarrative.blocks)).toContain("5. Leitura por IA");
    expect(JSON.stringify(withNarrative.blocks)).toContain("Proosta preparada");

    const failed = buildProposalReport({ draft, generatedAt: "21/11/2026 12:00", narrativeError: "modelo indisponível" });
    expect(JSON.stringify(failed.blocks)).toContain("modelo indisponível");
    expect(JSON.stringify(failed.blocks)).toContain("permanecem determinísticos");
    expect(JSON.stringify(failed.blocks)).not.toContain("Proosta preparada");
  });
});
