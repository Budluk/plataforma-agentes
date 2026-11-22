// Strict contract and prompt facts for the optional AI-written section of the
// sales PDF. Pure module: no I/O, no clock, no network.

import { z } from "zod";

const SHORT = z.string().trim().min(1).max(300);
const LIST_ITEM = z.string().trim().min(4).max(240);

export const SalesNarrativeSchema = z
  .object({
    resumo: z.string().trim().min(20).max(800),
    destaques: z.array(LIST_ITEM).min(1).max(5),
    atencao: z.array(LIST_ITEM).max(5),
    proximos_passos: z.array(LIST_ITEM).max(5),
  })
  .strict();

export type SalesNarrative = z.infer<typeof SalesNarrativeSchema>;

const OutcomeFacts = z
  .object({
    ok: z.boolean(),
    data: z.unknown().nullable(),
    reasons: z.array(SHORT).max(8),
  })
  .strict();

export const NarrativeFactsSchema = z
  .object({
    sales: OutcomeFacts.nullable(),
    funnel: OutcomeFacts.nullable(),
    salesParams: z
      .object({
        product: SHORT,
        action: z.enum(["margin", "price", "break_even"]),
        unit_cost: z.number().finite().nullable(),
        price: z.number().finite().nullable(),
        target_margin_pct: z.number().finite().nullable(),
        fixed_costs: z.number().finite().nullable(),
        competitor_prices: z.array(z.number().finite()).max(20),
      })
      .strict(),
    trends: z
      .object({
        observationCount: z.number().int().min(0).max(1_000_000),
        rows: z
          .array(
            z
              .object({
                topic: SHORT,
                metric: SHORT.optional(),
                status: SHORT.optional(),
                reason: SHORT.optional(),
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    sampleCatalogue: z
      .object({
        label: z.literal("AMOSTRA — dados ilustrativos, não são produtos, preços ou vendas reais"),
        tiles: z
          .array(
            z
              .object({
                code: SHORT,
                name: SHORT,
                note: SHORT,
                price: SHORT,
                priceNote: SHORT.optional(),
                category: SHORT,
              })
              .strict(),
          )
          .max(20),
      })
      .strict(),
  })
  .strict();

export type NarrativeFacts = z.infer<typeof NarrativeFactsSchema>;

export interface NarrativeFactsSource {
  sales: { ok: boolean; data?: unknown; reasons?: string[] } | null;
  funnel: { ok: boolean; data?: unknown; reasons?: string[] } | null;
  salesParams: {
    product: string;
    action: "margin" | "price" | "break_even";
    unit_cost: number | null;
    price: number | null;
    target_margin_pct: number | null;
    fixed_costs: number | null;
    competitor_prices: number[];
  };
  trendRows: readonly {
    topic: string;
    metric?: string;
    status?: string;
    reason?: string;
  }[];
  trendObservationCount: number;
  sampleTiles: readonly {
    code: string;
    name: string;
    note: string;
    price: string;
    priceNote?: string;
    category: string;
  }[];
}

const short = (v: string | undefined) => (v ?? "").trim().slice(0, 300);

/** Builds the bounded, explicitly labelled fact bundle sent to the LLM. */
export function buildNarrativeFacts(source: NarrativeFactsSource): NarrativeFacts {
  const outcome = (o: NarrativeFactsSource["sales"]) =>
    o
      ? {
          ok: o.ok,
          data: o.data ?? null,
          reasons: (o.reasons ?? []).slice(0, 8).map((r) => short(r)),
        }
      : null;

  return {
    sales: outcome(source.sales),
    funnel: outcome(source.funnel),
    salesParams: {
      product: short(source.salesParams.product) || "produto",
      action: source.salesParams.action,
      unit_cost: source.salesParams.unit_cost,
      price: source.salesParams.price,
      target_margin_pct: source.salesParams.target_margin_pct,
      fixed_costs: source.salesParams.fixed_costs,
      competitor_prices: source.salesParams.competitor_prices.slice(0, 20),
    },
    trends: {
      observationCount: Math.max(0, Math.min(1_000_000, source.trendObservationCount)),
      rows: source.trendRows.slice(0, 12).map((r) => ({
        topic: short(r.topic) || "assunto",
        metric: r.metric ? short(r.metric) : undefined,
        status: r.status ? short(r.status) : undefined,
        reason: r.reason ? short(r.reason) : undefined,
      })),
    },
    sampleCatalogue: {
      label: "AMOSTRA — dados ilustrativos, não são produtos, preços ou vendas reais",
      tiles: source.sampleTiles.slice(0, 20).map((t) => ({
        code: short(t.code),
        name: short(t.name),
        note: short(t.note),
        price: short(t.price),
        priceNote: t.priceNote ? short(t.priceNote) : undefined,
        category: short(t.category),
      })),
    },
  };
}
