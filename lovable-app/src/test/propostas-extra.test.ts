import { describe, it, expect } from "vitest";
import {
  prepareProposal,
  resolvePrice,
  snapshotProposalVersion,
  redactProposalAudit,
  evaluateDiscount,
  PROPOSAL_STATUSES,
  PROPOSAL_ORIGINS,
  SAMPLE_LABEL,
  type PrepareProposalInput,
  type ProposalDraft,
  type CatalogProduct,
  type PriceTable,
} from "@/lib/core/propostas";
import { z } from "zod";

const ID = z.string().trim().min(1).max(64);
const SKU = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{1,39}$/);
const STAMP = z.string().trim().min(1).max(60);

const catalog: CatalogProduct[] = [
  {
    organization_id: "org-1",
    sku: "SKU-001",
    name: "Caderno capa dura",
    description: "amostra de papelaria",
    category: "papelaria",
    unit: "un",
    active: true,
    origin: "amostra",
  },
];

const priceTable: PriceTable = {
  id: "tabela-1",
  organization_id: "org-1",
  name: "Tabela padrão",
  currency: "BRL",
  items: [
    {
      sku: "SKU-001",
      currency: "BRL",
      amount_cents: 3490,
      min_qty: 1,
      max_discount_pct: 10,
      tax_pct: 0,
      valid_from: null,
      valid_until: null,
      active: true,
    },
  ],
  active: true,
};

const baseProposal = {
  id: "prop-1",
  organization_id: "org-1",
  customer_id: "cust-1",
  opportunity_id: "opp-1",
  version: 1,
  origin: "amostra" as const,
  status: "rascunho" as const,
  valid_until: "2026-12-31T23:59:59Z",
  payment_terms: "14 dias",
  notes: "",
  items: [{ sku: "SKU-001", qty: 2, discount_pct: 0, notes: "" }],
};

const baseInput: PrepareProposalInput = {
  organizationId: "org-1",
  proposal: baseProposal,
  catalog,
  priceTable,
  grantActions: ["preparar_proposta", "validar_desconto", "desconto_extraordinario"],
  autonomy: "autonomo_controlado",
  asOf: "2026-11-22T10:00:00Z",
};

describe("prepareProposal — preparação de proposta", () => {
  it("prepara proposta com total correto", () => {
    const p = prepareProposal(baseInput);
    expect(p.status).toBe("preparado");
    expect(p.canSend).toBe(false);
    expect(p.canCheckout).toBe(false);
    expect(p.draft?.total_cents).toBe(6980);
    expect(p.draft?.origin).toBe("amostra");
    expect(p.audit.organization_id).toBe("org-1");
    expect(p.reasons.some((r) => r.includes("AMOSTRA"))).toBe(true);
  });

  it("aplica desconto dentro do limite sem aprovação", () => {
    const p = prepareProposal({
      ...baseInput,
      proposal: { ...baseProposal, items: [{ ...baseProposal.items[0], discount_pct: 5 }] },
    });
    expect(p.status).toBe("preparado");
    expect(p.canSend).toBe(false);
    expect(p.canCheckout).toBe(false);
    expect(p.requiresApproval).toBe(false);
    expect(p.draft?.items[0]?.discount_cents).toBeGreaterThan(0);
  });

  it("requer aprovação para desconto acima do limite", () => {
    const p = prepareProposal({
      ...baseInput,
      proposal: { ...baseProposal, items: [{ ...baseProposal.items[0], discount_pct: 50 }] },
    });
    expect(p.status).toBe("preparado");
    expect(p.canSend).toBe(false);
    expect(p.canCheckout).toBe(false);
    expect(p.requiresApproval).toBe(true);
  });

  it("bloqueia com kill switch engajado", () => {
    const p = prepareProposal({ ...baseInput, killEngaged: true });
    expect(p.status).toBe("bloqueado");
    expect(p.draft).toBeNull();
    expect(p.reasons[0]).toContain("kill switch");
  });

  it("bloqueia tenant divergente", () => {
    const p = prepareProposal({ ...baseInput, organizationId: "org-2" });
    expect(p.status).toBe("bloqueado");
    expect(p.draft).toBeNull();
    expect(p.reasons[0]).toContain("tenant divergente");
  });

  it("bloqueia subtotal acima do limite seguro de centavos", () => {
    const hugeTable = {
      ...priceTable,
      items: [{ ...priceTable.items[0], amount_cents: 1_000_000_000_000 }],
    };
    const p = prepareProposal({
      ...baseInput,
      priceTable: hugeTable,
      proposal: {
        ...baseProposal,
        items: [{ ...baseProposal.items[0], qty: 10_000, discount_pct: 0 }],
      },
    });
    expect(p.status).toBe("bloqueado");
    expect(p.reasons.some((r) => r.includes("limite seguro"))).toBe(true);
  });

  it("bloqueia total agregado acima do limite seguro mesmo com itens válidos", () => {
    const twoProducts: CatalogProduct[] = [
      ...catalog,
      {
        organization_id: "org-1",
        sku: "SKU-002",
        name: "Caderno brochura",
        description: "amostra de papelaria",
        category: "papelaria",
        unit: "un",
        active: true,
        origin: "amostra",
      },
    ];
    const twoPrices: PriceTable = {
      ...priceTable,
      items: priceTable.items.map((item) => ({ ...item, amount_cents: 500_000_000_000 })),
    };
    const p = prepareProposal({
      ...baseInput,
      catalog: twoProducts,
      priceTable: {
        ...twoPrices,
        items: [...twoPrices.items, { ...twoPrices.items[0]!, sku: "SKU-002" }],
      },
      proposal: {
        ...baseProposal,
        items: [
          { ...baseProposal.items[0]!, sku: "SKU-001", qty: 10_000 },
          { ...baseProposal.items[0]!, sku: "SKU-002", qty: 10_000 },
        ],
      },
    });
    expect(p.status).toBe("bloqueado");
    expect(p.reasons.some((r) => r.includes("total agregado"))).toBe(true);
  });

  it("SAMPLE_LABEL está presente", () => {
    expect(SAMPLE_LABEL).toContain("AMOSTRA");
    expect(SAMPLE_LABEL).toContain("não é produto, preço ou venda real");
  });
});

describe("resolvePrice — precificação por SKU", () => {
  it("resolve preço vigente", () => {
    const r = resolvePrice({
      table: priceTable,
      sku: "SKU-001",
      qty: 2,
      asOf: "2026-11-22T10:00:00Z",
    });
    expect(r.status).toBe("medido");
    expect(r.amount_cents).toBe(3490);
    expect(r.table_id).toBe("tabela-1");
  });

  it("retorna sem_dados para SKU inexistente", () => {
    const r = resolvePrice({
      table: priceTable,
      sku: "SKU-999",
      qty: 1,
      asOf: "2026-11-22T10:00:00Z",
    });
    expect(r.status).toBe("sem_dados");
    expect(r.amount_cents).toBeNull();
  });

  it("retorna sem_dados para tabela inativa", () => {
    const r = resolvePrice({
      table: { ...priceTable, active: false },
      sku: "SKU-001",
      qty: 1,
      asOf: "2026-11-22T10:00:00Z",
    });
    expect(r.status).toBe("sem_dados");
  });
});

describe("snapshotProposalVersion — versionamento imutável", () => {
  const draft: ProposalDraft = {
    id: "prop-1",
    organization_id: "org-1",
    customer_id: "cust-1",
    opportunity_id: "opp-1",
    version: 1,
    origin: "amostra",
    status: "rascunho",
    currency: "BRL",
    valid_until: "2026-12-31",
    payment_terms: "14 dias",
    notes: "",
    items: [
      {
        sku: "SKU-001",
        name: `${SAMPLE_LABEL} · Caderno capa dura`,
        origin: "amostra",
        sample: true,
        qty: 2,
        unit_price_cents: 3490,
        max_discount_pct: 10,
        discount_pct: 0,
        discount_cents: 0,
        tax_pct: 0,
        tax_cents: 0,
        total_cents: 6980,
        notes: "",
      },
    ],
    subtotal_cents: 6980,
    discount_cents: 0,
    tax_cents: 0,
    total_cents: 6980,
    approval_required: false,
  };

  it("cria snapshot com hash SHA-256", async () => {
    const s = await snapshotProposalVersion(draft, {
      proposalId: "prop-1",
      organizationId: "org-1",
      asOf: "2026-11-22T10:00:00Z",
      actor: "user-1",
    });
    expect(s.version).toBe(1);
    expect(s.snapshot_id).toBeDefined();
    expect(s.snapshot_id.length).toBe(64);
    expect(s.created_at).toBe("2026-11-22T10:00:00.000Z");
    expect(s.actor).toBe("user-1");
  });

  it("detecta alteração no próximo snapshot", async () => {
    const s1 = await snapshotProposalVersion(draft, {
      proposalId: "prop-1",
      organizationId: "org-1",
      asOf: "2026-11-22T10:00:00Z",
      actor: "user-1",
    });
    const s2 = await snapshotProposalVersion(
      { ...draft, version: 2, total_cents: 9990 },
      { proposalId: "prop-1", organizationId: "org-1", asOf: "2026-11-22T11:00:00Z", actor: "user-1", previousSnapshotId: s1.snapshot_id },
    );
    expect(s2.snapshot_id).not.toBe(s1.snapshot_id);
    expect(s2.previous_snapshot_id).toBe(s1.snapshot_id);
  });

  it("rejeita tenant divergente", async () => {
    await expect(
      snapshotProposalVersion(draft, {
        proposalId: "prop-1",
        organizationId: "org-2",
        asOf: "2026-11-22T10:00:00Z",
        actor: "user-1",
      }),
    ).rejects.toThrow("tenant divergente");
  });

  it("rejeita proposta inválida", async () => {
    await expect(
      snapshotProposalVersion({ ...draft, id: "prop-999" } as ProposalDraft, {
        proposalId: "prop-1",
        organizationId: "org-1",
        asOf: "2026-11-22T10:00:00Z",
        actor: "user-1",
      }),
    ).rejects.toThrow("id da proposta divergente");
  });
});

describe("redactProposalAudit — auditoria redigida", () => {
  it("redige dados da proposta para auditoria", () => {
    const r = redactProposalAudit(baseInput.proposal as ProposalDraft, ["motivo 1", "motivo 2"]);
    expect(r.organization_id).toBe("org-1");
    expect(r.proposal_id).toBe("prop-1");
    expect(r.item_count).toBe(1);
    expect(r.reasons.length).toBe(2);
    expect(r.reasons[0]).toBe("motivo 1");
  });

  it("redige proposta nula", () => {
    const r = redactProposalAudit(null, ["sem dados"]);
    expect(r.proposal_id).toBe("desconhecido");
    expect(r.status).toBe("bloqueado");
  });

  it("não rotula como amostra uma proposta real bloqueada", () => {
    const r = redactProposalAudit(null, ["bloqueado"], "real");
    expect(r.origin).toBe("real");
    expect(prepareProposal({ ...baseInput, organizationId: "org-2", proposal: { ...baseProposal, origin: "real" } }).audit.origin).toBe("real");
  });
});

describe("evaluateDiscount — veredito de desconto", () => {
  it("desconto dentro do limite é permitido", () => {
    const v = evaluateDiscount({
      baseCents: 10000,
      discountPct: 5,
      maxDiscountPct: 10,
      grantActions: ["validar_desconto"],
      autonomy: "autonomo_controlado",
    });
    expect(v.allowed).toBe(true);
    expect(v.extraordinary).toBe(false);
    expect(v.discount_cents).toBe(500);
    expect(v.total_cents).toBe(9500);
  });

  it("desconto acima do limite requer aprovação", () => {
    const v = evaluateDiscount({
      baseCents: 10000,
      discountPct: 50,
      maxDiscountPct: 10,
      grantActions: ["desconto_extraordinario"],
      autonomy: "autonomo_controlado",
    });
    expect(v.extraordinary).toBe(true);
    expect(v.requiresApproval).toBe(true);
  });

  it("kill switch bloqueia desconto", () => {
    const v = evaluateDiscount({
      baseCents: 10000,
      discountPct: 5,
      maxDiscountPct: 10,
      grantActions: ["validar_desconto"],
      autonomy: "autonomo_controlado",
      killEngaged: true,
    });
    expect(v.allowed).toBe(false);
    expect(v.reasons[0]).toContain("kill switch");
  });
});

describe("PROPOSAL_STATUSES e PROPOSAL_ORIGINS", () => {
  it("apenas rascunho e em_revisao (sem aprovado automático)", () => {
    expect(PROPOSAL_STATUSES).toEqual(["rascunho", "em_revisao"]);
  });

  it("apenas real e amostra como origens", () => {
    expect(PROPOSAL_ORIGINS).toEqual(["real", "amostra"]);
  });
});
