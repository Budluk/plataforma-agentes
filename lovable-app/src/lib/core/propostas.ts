// Pure catalog, pricing, discount and proposal contracts for Fase 8. No I/O,
// no clock, no database, no network. Prices come only from a caller-supplied
// price table; descriptions only from the caller-supplied catalog. Nothing
// here sends, publishes, starts checkout or charges a payment.

import { z } from "zod";
import { decideAutonomy, formatBRLFromCents, type AutonomyLevel } from "./comercial";
import { authorizeCommercialAction } from "./commercial-agents";
import { canonical, sha256hex } from "./canonical";
import { timestampMs } from "./dashboard";
import { renderPrintHtml } from "./print-report";
import type { ReportDocument } from "./report";
import type { SalesNarrative } from "./sales-narrative";

export const PROPOSAL_ORIGINS = ["real", "amostra"] as const;
export const PROPOSAL_STATUSES = ["rascunho", "em_revisao"] as const;
export const SAMPLE_LABEL = "AMOSTRA — item ilustrativo, não é produto, preço ou venda real";

const ID = z.string().trim().min(1).max(64);
const SKU = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{1,39}$/);
const STAMP = z.string().trim().min(1).max(60);
const roundCents = (value: number) => Math.round(value);
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const pctText = (v: number) => `${nf.format(v)}%`;

// ---------------- Catalog and price table ----------------

export const CatalogProduct = z
  .object({
    organization_id: ID,
    sku: SKU,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(400).default(""),
    category: z.string().trim().min(1).max(60),
    unit: z.string().trim().min(1).max(20),
    active: z.boolean(),
    /** Explicit provenance; never inferred from a pretty name. */
    origin: z.enum(PROPOSAL_ORIGINS),
  })
  .strict();
export type CatalogProduct = z.infer<typeof CatalogProduct>;

export const PriceItem = z
  .object({
    sku: SKU,
    currency: z.literal("BRL"),
    amount_cents: z.number().int().positive().max(1_000_000_000_000),
    min_qty: z.number().int().min(1).max(100_000),
    max_discount_pct: z.number().finite().min(0).max(100),
    tax_pct: z.number().finite().min(0).max(100).default(0),
    valid_from: STAMP.nullable().default(null),
    valid_until: STAMP.nullable().default(null),
    active: z.boolean(),
  })
  .strict();
export type PriceItem = z.infer<typeof PriceItem>;

export const PriceTable = z
  .object({
    id: ID,
    organization_id: ID,
    name: z.string().trim().min(1).max(80),
    currency: z.literal("BRL"),
    items: z.array(PriceItem).min(1).max(200),
    active: z.boolean(),
  })
  .strict();
export type PriceTable = z.infer<typeof PriceTable>;

export interface PriceResolution {
  status: "medido" | "sem_dados";
  table_id: string | null;
  sku: string;
  amount_cents: number | null;
  max_discount_pct: number | null;
  tax_pct: number | null;
  reason: string;
}

/** Resolves one SKU from explicit table, quantity and instant. No fallback price. */
export function resolvePrice(input: {
  table: unknown;
  sku: string;
  qty: number;
  asOf: Date | number | string;
}): PriceResolution {
  const unresolved = (reason: string): PriceResolution => ({
    status: "sem_dados",
    table_id: null,
    sku: input.sku,
    amount_cents: null,
    max_discount_pct: null,
    tax_pct: null,
    reason,
  });
  const parsed = PriceTable.safeParse(input.table);
  if (!parsed.success)
    return unresolved(`tabela de preço inválida: ${parsed.error.issues[0]?.message ?? "erro desconhecido"}`);
  const table = parsed.data;
  if (!table.active) return unresolved("tabela de preço inativa; nenhum preço foi inferido");
  if (!Number.isInteger(input.qty) || input.qty < 1)
    return unresolved("quantidade inválida; nenhum preço foi inferido");
  const asOfMs = timestampMs(input.asOf);
  if (asOfMs === null) return unresolved("instante de referência inválido; vigência não verificada");

  const eligible = table.items
    .filter((item) => item.sku === input.sku && item.active && item.min_qty <= input.qty)
    .filter((item) => {
      const from = item.valid_from ? timestampMs(item.valid_from) : null;
      const until = item.valid_until ? timestampMs(item.valid_until) : null;
      if ((item.valid_from && from === null) || (item.valid_until && until === null)) return false;
      if (from !== null && asOfMs < from) return false;
      if (until !== null && asOfMs > until) return false;
      return true;
    })
    .sort((a, b) => a.amount_cents - b.amount_cents || a.sku.localeCompare(b.sku));
  if (!eligible.length)
    return unresolved(`sku '${input.sku}' sem preço vigente para a quantidade informada`);

  const chosen = eligible[0]!;
  return {
    status: "medido",
    table_id: table.id,
    sku: input.sku,
    amount_cents: chosen.amount_cents,
    max_discount_pct: chosen.max_discount_pct,
    tax_pct: chosen.tax_pct,
    reason: `preço vigente resolvido na tabela '${table.name}'${eligible.length > 1 ? " (menor preço elegível)" : ""}`,
  };
}

// ---------------- Discount ----------------

export interface DiscountInput {
  baseCents: number;
  discountPct: number;
  maxDiscountPct: number;
  grantActions: readonly string[];
  autonomy: AutonomyLevel;
  killEngaged?: boolean;
}

export interface DiscountVerdict {
  allowed: boolean;
  requiresApproval: boolean;
  extraordinary: boolean;
  discount_cents: number;
  total_cents: number;
  reasons: string[];
}

/**
 * A discount inside the table is a normal preparation action. Above the
 * table limit it becomes `desconto_extraordinario`, which is sensible and
 * never executable by an agent at any autonomy level.
 */
export function evaluateDiscount(input: DiscountInput): DiscountVerdict {
  const fail = (reasons: string[]): DiscountVerdict => ({
    allowed: false,
    requiresApproval: false,
    extraordinary: false,
    discount_cents: 0,
    total_cents: input.baseCents,
    reasons,
  });
  if (!Number.isSafeInteger(input.baseCents) || input.baseCents < 0)
    return fail(["base de desconto inválida; nada foi calculado"]);
  if (
    !Number.isFinite(input.discountPct) ||
    input.discountPct < 0 ||
    input.discountPct > 100 ||
    !Number.isFinite(input.maxDiscountPct) ||
    input.maxDiscountPct < 0 ||
    input.maxDiscountPct > 100
  )
    return fail(["percentual de desconto inválido; nada foi calculado"]);

  const extraordinary = input.discountPct > input.maxDiscountPct;
  const decision = extraordinary
    ? decideAutonomy({
        action: "desconto_extraordinario",
        autonomy: input.autonomy,
        grantActions: [...input.grantActions, "desconto_extraordinario"],
        ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
      })
    : authorizeCommercialAction({
        agent: "proposal_agent",
        action: "validar_desconto",
        grantActions: input.grantActions,
        autonomy: input.autonomy,
        ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
      });

  if (!decision.allowed && !decision.requiresApproval) return fail(decision.reasons);
  const discountCents = roundCents((input.baseCents * input.discountPct) / 100);
  return {
    allowed: decision.allowed,
    requiresApproval: decision.requiresApproval,
    extraordinary,
    discount_cents: Math.min(discountCents, input.baseCents),
    total_cents: input.baseCents - Math.min(discountCents, input.baseCents),
    reasons: [
      ...(extraordinary
        ? [`desconto de ${pctText(input.discountPct)} acima do limite autorizado de ${pctText(input.maxDiscountPct)}`]
        : [`desconto de ${pctText(input.discountPct)} dentro do limite autorizado`]),
      ...decision.reasons,
    ],
  };
}

// ---------------- Proposal request and draft ----------------

export const ProposalItemRequest = z
  .object({
    sku: SKU,
    qty: z.number().int().min(1).max(10_000),
    discount_pct: z.number().finite().min(0).max(100),
    notes: z.string().trim().max(200).default(""),
  })
  .strict();
export type ProposalItemRequest = z.infer<typeof ProposalItemRequest>;

export const ProposalRequest = z
  .object({
    id: ID,
    organization_id: ID,
    customer_id: ID,
    opportunity_id: ID.nullable().default(null),
    version: z.number().int().min(1).max(1000),
    origin: z.enum(PROPOSAL_ORIGINS),
    status: z.enum(PROPOSAL_STATUSES).default("rascunho"),
    valid_until: STAMP,
    payment_terms: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(1000).default(""),
    items: z.array(ProposalItemRequest).min(1).max(30),
  })
  .strict();
export type ProposalRequest = z.infer<typeof ProposalRequest>;

export const ProposalLineItem = z
  .object({
    sku: SKU,
    name: z.string().trim().min(1).max(120),
    origin: z.enum(PROPOSAL_ORIGINS),
    sample: z.boolean(),
    qty: z.number().int().min(1),
    unit_price_cents: z.number().int().positive(),
    max_discount_pct: z.number().finite().min(0).max(100),
    discount_pct: z.number().finite().min(0).max(100),
    discount_cents: z.number().int().nonnegative(),
    tax_pct: z.number().finite().min(0).max(100),
    tax_cents: z.number().int().nonnegative(),
    total_cents: z.number().int().nonnegative(),
    notes: z.string().trim().max(200),
  })
  .strict();
export type ProposalLineItem = z.infer<typeof ProposalLineItem>;

export const ProposalDraft = z
  .object({
    id: ID,
    organization_id: ID,
    customer_id: ID,
    opportunity_id: ID.nullable(),
    version: z.number().int().min(1),
    origin: z.enum(PROPOSAL_ORIGINS),
    status: z.enum(PROPOSAL_STATUSES),
    currency: z.literal("BRL"),
    valid_until: STAMP,
    payment_terms: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(1000),
    items: z.array(ProposalLineItem).min(1).max(30),
    subtotal_cents: z.number().int().nonnegative(),
    discount_cents: z.number().int().nonnegative(),
    tax_cents: z.number().int().nonnegative(),
    total_cents: z.number().int().nonnegative(),
    approval_required: z.boolean(),
  })
  .strict();
export type ProposalDraft = z.infer<typeof ProposalDraft>;

export interface ProposalAuditRecord {
  organization_id: string;
  proposal_id: string;
  version: number;
  origin: "real" | "amostra";
  customer_id: string;
  item_count: number;
  total_cents: number;
  status: "preparado" | "bloqueado";
  reasons: string[];
}

/** Ids, counts and totals only: no notes, payment terms or item descriptions. */
export function redactProposalAudit(
  draft: ProposalDraft | null,
  reasons: readonly string[],
  /** Origin of the request, so a blocked real proposal is never mislabelled as a sample. */
  origin: "real" | "amostra" | null = null,
): ProposalAuditRecord {
  return {
    organization_id: draft?.organization_id ?? "desconhecido",
    proposal_id: draft?.id ?? "desconhecido",
    version: draft?.version ?? 0,
    origin: draft?.origin ?? origin ?? "amostra",
    customer_id: draft?.customer_id ?? "desconhecido",
    item_count: draft?.items.length ?? 0,
    total_cents: draft?.total_cents ?? 0,
    status: draft ? "preparado" : "bloqueado",
    reasons: reasons.slice(0, 8).map((r) => r.slice(0, 200)),
  };
}

export interface PrepareProposalInput {
  organizationId: string;
  proposal: unknown;
  catalog: unknown;
  priceTable: unknown;
  grantActions: readonly string[];
  autonomy: AutonomyLevel;
  killEngaged?: boolean;
  asOf: Date | number | string;
}

export interface ProposalPreparation {
  status: "preparado" | "bloqueado";
  /** Always false: there is no send, publish or checkout tool in this phase. */
  canSend: false;
  canCheckout: false;
  requiresApproval: boolean;
  reasons: string[];
  draft: ProposalDraft | null;
  audit: ProposalAuditRecord;
}

/** Builds a reviewable draft from supplied catalog and price table only. */
export function prepareProposal(input: PrepareProposalInput): ProposalPreparation {
  const raw = input.proposal as { origin?: unknown } | null;
  const requestOrigin = raw && (raw.origin === "real" || raw.origin === "amostra") ? raw.origin : null;
  const empty = (reasons: string[], requiresApproval = false): ProposalPreparation => ({
    status: "bloqueado",
    canSend: false,
    canCheckout: false,
    requiresApproval,
    reasons,
    draft: null,
    audit: redactProposalAudit(null, reasons, requestOrigin),
  });

  if (input.killEngaged === true)
    return empty(["kill switch global ativo: nenhuma proposta foi preparada"]);

  const request = ProposalRequest.safeParse(input.proposal);
  if (!request.success)
    return empty(request.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "campo"}: ${i.message}`));
  const proposal = request.data;
  const organizationId = input.organizationId.trim();
  if (!organizationId || proposal.organization_id !== organizationId)
    return empty(["tenant divergente entre a proposta e a execução; nada foi preparado"]);

  const asOfMs = timestampMs(input.asOf);
  if (asOfMs === null) return empty(["instante de referência inválido; vigência não verificada"]);
  const validUntilMs = timestampMs(proposal.valid_until);
  if (validUntilMs === null || validUntilMs <= asOfMs)
    return empty(["validade da proposta ausente, inválida ou já vencida"]);

  const catalog = z.array(CatalogProduct).max(200).safeParse(input.catalog);
  if (!catalog.success) return empty(["catálogo inválido ou grande demais; nada foi preparado"]);
  if (catalog.data.some((p) => p.organization_id !== organizationId))
    return empty(["catálogo contém produto de outro tenant; nada foi preparado"]);
  const bySku = new Map<string, CatalogProduct>();
  for (const product of catalog.data) {
    if (bySku.has(product.sku))
      return empty([`sku duplicado no catálogo: '${product.sku}'`]);
    bySku.set(product.sku, product);
  }

  const table = PriceTable.safeParse(input.priceTable);
  if (!table.success) return empty(["tabela de preço inválida; nada foi preparado"]);
  if (table.data.organization_id !== organizationId)
    return empty(["tabela de preço pertence a outro tenant; nada foi preparado"]);

  const auth = authorizeCommercialAction({
    agent: "proposal_agent",
    action: "preparar_proposta",
    grantActions: input.grantActions,
    autonomy: input.autonomy,
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
  });
  const hardBlocks: string[] = [];
  if (!auth.allowed && !auth.requiresApproval) hardBlocks.push(...auth.reasons);

  const lines: ProposalLineItem[] = [];
  const approvalNotes: string[] = [];
  let anyApproval = auth.requiresApproval;
  for (const requested of proposal.items) {
    const product = bySku.get(requested.sku);
    if (!product || !product.active) {
      hardBlocks.push(`sku '${requested.sku}' ausente ou inativo no catálogo`);
      continue;
    }
    if (product.origin !== proposal.origin)
      hardBlocks.push(`sku '${requested.sku}' tem origem '${product.origin}' diferente de '${proposal.origin}'`);
    const price = resolvePrice({ table: table.data, sku: requested.sku, qty: requested.qty, asOf: input.asOf });
    if (price.status !== "medido") {
      hardBlocks.push(price.reason);
      continue;
    }
    const subtotal = price.amount_cents! * requested.qty;
    if (!Number.isSafeInteger(subtotal)) {
      hardBlocks.push(`subtotal de '${requested.sku}' excede o limite seguro de centavos; nenhuma proposta foi preparada`);
      continue;
    }
    const discount = evaluateDiscount({
      baseCents: subtotal,
      discountPct: requested.discount_pct,
      maxDiscountPct: price.max_discount_pct!,
      grantActions: input.grantActions,
      autonomy: input.autonomy,
      ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
    });
    if (!discount.allowed && !discount.requiresApproval) {
      hardBlocks.push(...discount.reasons);
      continue;
    }
    if (discount.requiresApproval) {
      anyApproval = true;
      approvalNotes.push(...discount.reasons.slice(0, 2));
    }
    const taxCents = roundCents((discount.total_cents * price.tax_pct!) / 100);
    const lineTotal = discount.total_cents + taxCents;
    if (!Number.isSafeInteger(lineTotal)) {
      hardBlocks.push(`total de '${requested.sku}' excede o limite seguro de centavos; nenhuma proposta foi preparada`);
      continue;
    }
    lines.push({
      sku: product.sku,
      name: product.origin === "amostra" ? `${SAMPLE_LABEL} · ${product.name}` : product.name,
      origin: product.origin,
      sample: product.origin === "amostra",
      qty: requested.qty,
      unit_price_cents: price.amount_cents!,
      max_discount_pct: price.max_discount_pct!,
      discount_pct: requested.discount_pct,
      discount_cents: discount.discount_cents,
      tax_pct: price.tax_pct!,
      tax_cents: taxCents,
      total_cents: lineTotal,
      notes: requested.notes,
    });
  }
  if (lines.length !== proposal.items.length)
    hardBlocks.push("nem todos os itens puderam ser precificados; nenhuma proposta parcial foi montada");
  if (hardBlocks.length) return empty(hardBlocks, anyApproval);

  const subtotal = lines.reduce((s, l) => s + l.unit_price_cents * l.qty, 0);
  const discountCents = lines.reduce((s, l) => s + l.discount_cents, 0);
  const taxCents = lines.reduce((s, l) => s + l.tax_cents, 0);
  const totalCents = subtotal - discountCents + taxCents;
  if (![subtotal, discountCents, taxCents, totalCents].every(Number.isSafeInteger))
    return empty(
      ["total agregado da proposta excede o limite seguro de centavos; nenhuma proposta foi preparada"],
      anyApproval,
    );
  const draft: ProposalDraft = {
    id: proposal.id,
    organization_id: proposal.organization_id,
    customer_id: proposal.customer_id,
    opportunity_id: proposal.opportunity_id,
    version: proposal.version,
    origin: proposal.origin,
    status: proposal.status,
    currency: "BRL",
    valid_until: proposal.valid_until,
    payment_terms: proposal.payment_terms,
    notes: proposal.notes,
    items: lines,
    subtotal_cents: subtotal,
    discount_cents: discountCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    approval_required: anyApproval,
  };
  const reasons = [
    ...auth.reasons,
    ...approvalNotes,
    "nenhum envio, publicação, checkout ou pagamento foi executado",
    ...(proposal.origin === "amostra"
      ? ["proposta ilustrativa: todos os itens são rotulados AMOSTRA"]
      : []),
  ];
  return {
    status: "preparado",
    canSend: false,
    canCheckout: false,
    requiresApproval: anyApproval,
    reasons,
    draft,
    audit: redactProposalAudit(draft, reasons, draft.origin),
  };
}

// ---------------- Immutable version snapshot ----------------

export interface ProposalVersion {
  organization_id: string;
  proposal_id: string;
  version: number;
  snapshot_id: string;
  previous_snapshot_id: string | null;
  created_at: string;
  actor: string;
  snapshot: ProposalDraft;
}

/** Canonical JSON + SHA-256, matching the platform's audit/approval hash style. */
export async function snapshotProposalVersion(
  draft: ProposalDraft,
  input: {
    proposalId: string;
    organizationId: string;
    asOf: Date | number | string;
    actor: string;
    previousSnapshotId?: string | null;
  },
): Promise<ProposalVersion> {
  const parsedDraft = ProposalDraft.safeParse(draft);
  if (!parsedDraft.success) throw new Error("rascunho de proposta inválido; nenhuma versão foi criada");
  if (input.organizationId.trim() !== draft.organization_id)
    throw new Error("tenant divergente; nenhuma versão foi criada");
  if (input.proposalId.trim() !== draft.id)
    throw new Error("id da proposta divergente; nenhuma versão foi criada");
  const actor = input.actor.trim();
  if (!actor || actor.length > 128) throw new Error("ator inválido; nenhuma versão foi criada");
  const asOfMs = timestampMs(input.asOf);
  if (asOfMs === null) throw new Error("instante de versão inválido; nenhuma versão foi criada");
  const previous = input.previousSnapshotId?.trim() || null;
  if (previous && previous.length > 128) throw new Error("hash anterior inválido; nenhuma versão foi criada");

  const snapshot = parsedDraft.data;
  const snapshotId = await sha256hex(
    canonical({
      previous_snapshot_id: previous,
      proposal_id: input.proposalId.trim(),
      version: snapshot.version,
      snapshot,
    }),
  );
  return {
    organization_id: snapshot.organization_id,
    proposal_id: snapshot.id,
    version: snapshot.version,
    snapshot_id: snapshotId,
    previous_snapshot_id: previous,
    created_at: new Date(asOfMs).toISOString(),
    actor,
    snapshot,
  };
}

// ---------------- Browser-printable PDF model ----------------

export interface ProposalReportInput {
  draft: ProposalDraft;
  generatedAt: string;
  /** Optional editorial layer only; numbers stay deterministic. */
  narrative?: SalesNarrative | null;
  narrativeError?: string | null;
}

const brl = (cents: number) => formatBRLFromCents(cents);

function narrativeBlocks(input: ProposalReportInput) {
  if (!input.narrative && !input.narrativeError) return [];
  const heading = { kind: "text" as const, text: "5. Leitura por IA", style: "heading" as const };
  if (input.narrativeError)
    return [
      heading,
      {
        kind: "text" as const,
        text: `A IA não completou a leitura: ${input.narrativeError}. Os valores acima permanecem determinísticos.`,
        style: "muted" as const,
      },
    ];
  const n = input.narrative;
  if (!n) return [];
  return [
    heading,
    {
      kind: "text" as const,
      text: "Texto editorial gerado pela IA somente a partir desta proposta; não é novo cálculo nem promessa comercial.",
      style: "muted" as const,
    },
    { kind: "text" as const, text: `Resumo: ${n.resumo}`, style: "body" as const },
    { kind: "text" as const, text: `Destaques: ${n.destaques.join("; ")}`, style: "body" as const },
    ...(n.atencao.length ? [{ kind: "text" as const, text: `Pontos de atenção: ${n.atencao.join("; ")}`, style: "body" as const }] : []),
    ...(n.proximos_passos.length
      ? [{ kind: "text" as const, text: `Próximos passos: ${n.proximos_passos.join("; ")}`, style: "body" as const }]
      : []),
  ];
}

/** Same document model used by the existing browser print/Save as PDF path. */
export function buildProposalReport(input: ProposalReportInput): ReportDocument {
  const d = input.draft;
  const isSample = d.origin === "amostra";
  const blocks: ReportDocument["blocks"] = [
    {
      kind: "text",
      text: "Como ler esta proposta",
      style: "heading",
    },
    {
      kind: "text",
      text: "Rascunho calculado por código a partir do catálogo e da tabela de preço informados. Nenhum envio, checkout ou pagamento foi executado. Valores ausentes não são preenchidos com zero.",
      style: "muted",
    },
    ...(isSample
      ? [
          { kind: "text" as const, text: "AMOSTRA — proposta ilustrativa, não é produto, preço ou venda real.", style: "heading" as const },
          {
            kind: "text" as const,
            text: "Os itens abaixo existem apenas para demonstrar o layout. Não representam oferta comercial.",
            style: "muted" as const,
          },
        ]
      : []),
    { kind: "space", points: 4 },
    { kind: "text", text: "1. Identificação", style: "heading" },
    {
      kind: "table",
      headers: ["campo", "valor"],
      rows: [
        ["id da proposta", d.id],
        ["cliente", d.customer_id],
        ["oportunidade", d.opportunity_id ?? "não informada"],
        ["versão", d.version],
        ["origem", isSample ? "AMOSTRA" : "real"],
        ["status", d.status],
        ["validade", d.valid_until],
        ["condição de pagamento", d.payment_terms],
      ],
    },
    { kind: "space", points: 6 },
    { kind: "text", text: "2. Itens", style: "heading" },
    {
      kind: "table",
      headers: ["item", "sku", "qtd", "preço unit.", "desc.", "imposto", "total"],
      rows: d.items.map((l) => [
        l.name,
        l.sku,
        l.qty,
        brl(l.unit_price_cents),
        pctText(l.discount_pct),
        brl(l.tax_cents),
        brl(l.total_cents),
      ]),
    },
    { kind: "space", points: 6 },
    { kind: "text", text: "3. Totais", style: "heading" },
    {
      kind: "table",
      headers: ["indicador", "valor"],
      rows: [
        ["subtotal", brl(d.subtotal_cents)],
        ["desconto", brl(d.discount_cents)],
        ["impostos", brl(d.tax_cents)],
        ["total", brl(d.total_cents)],
      ],
    },
    { kind: "space", points: 6 },
    { kind: "text", text: "4. Aprovação e limites", style: "heading" },
    {
      kind: "text",
      text: d.approval_required
        ? "A proposta depende de aprovação humana antes de qualquer uso externo."
        : "Sem aprovação pendente nos gates aplicados; ainda assim, qualquer uso externo depende de uma pessoa e de integração aprovada.",
      style: "body",
    },
    ...(d.notes ? [{ kind: "text" as const, text: `Observações: ${d.notes}`, style: "muted" as const }] : []),
    ...narrativeBlocks(input),
  ];
  return {
    title: isSample ? "Proposta (AMOSTRA)" : "Proposta comercial",
    subtitle: `CentralIA · versão ${d.version} · ${d.status}`,
    generatedAt: input.generatedAt,
    blocks,
  };
}

/** Convenience export for the browser print window; no automatic print here. */
export function proposalPrintHtml(input: ProposalReportInput): string {
  return renderPrintHtml(buildProposalReport(input));
}

// Re-exported formatter for callers that need the same BRL rules from cents.
export { formatBRLFromCents };
