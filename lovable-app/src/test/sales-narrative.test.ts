import { describe, it, expect } from "vitest";
import { parseLlmObject } from "@/lib/core/llmjson";
import {
  buildNarrativeFacts,
  NarrativeFactsSchema,
  SalesNarrativeSchema,
} from "@/lib/core/sales-narrative";

const source = {
  sales: { ok: true, data: { margin_pct: 60 }, reasons: [] },
  funnel: null,
  salesParams: {
    product: "curso",
    action: "margin" as const,
    unit_cost: 12,
    price: 30,
    target_margin_pct: null,
    fixed_costs: null,
    competitor_prices: [25, 35],
  },
  trendRows: [{ topic: "café", status: "ok" }],
  trendObservationCount: 3,
  sampleTiles: [
    {
      code: "CD-014",
      name: "Caderno capa dura",
      note: "amostra de papelaria",
      price: "R$ 34,90",
      priceNote: "sample · preço ilustrativo",
      category: "Produtos",
    },
  ],
};

describe("sales narrative contract", () => {
  it("labels the storefront as sample and bounds the prompt facts", () => {
    const facts = buildNarrativeFacts({
      ...source,
      trendRows: Array.from({ length: 30 }, (_, i) => ({ topic: `assunto ${i}` })),
      sampleTiles: Array.from({ length: 30 }, () => source.sampleTiles[0]!),
    });
    const parsed = NarrativeFactsSchema.parse(facts);
    expect(parsed.sampleCatalogue.label).toContain("AMOSTRA");
    expect(parsed.sampleCatalogue.tiles).toHaveLength(20);
    expect(parsed.trends.rows).toHaveLength(12);
    expect(parsed.sales?.ok).toBe(true);
    expect(parsed.funnel).toBeNull();
  });

  it("masks sensitive free-form data and bounds what is sent to the LLM", () => {
    const facts = buildNarrativeFacts({
      ...source,
      sales: {
        ok: true,
        data: { cpf: "123.456.789-00", token: "gsk_abcdefghijklmnop", note: "x".repeat(5000) },
        reasons: [],
      },
    });
    const json = JSON.stringify(facts);
    expect(json).not.toContain("123.456.789-00");
    expect(json).not.toContain("gsk_abcdefghijklmnop");
    expect(json.length).toBeLessThan(4_000);

    const huge = buildNarrativeFacts({
      ...source,
      funnel: { ok: true, data: Array.from({ length: 50 }, () => "y".repeat(300)), reasons: [] },
    });
    expect(huge.funnel?.data).toBe("[dados omitidos: excede o limite]");
    expect(NarrativeFactsSchema.safeParse(huge).success).toBe(true);
  });

  it("accepts a fenced JSON object with the exact sections", () => {
    const good = {
      resumo: "Leitura curta e objetiva dos dados aprovados nesta sessão.",
      destaques: ["Margem aprovada pelo gate"],
      atencao: ["Funil ausente"],
      proximos_passos: ["Rodar o funil"],
    };
    const raw = `\`\`\`json\n${JSON.stringify(good)}\n\`\`\``;
    const parsed = parseLlmObject(
      raw,
      SalesNarrativeSchema,
      "SalesNarrativeInvalid",
      "leitura da IA",
    );
    expect(parsed.resumo).toBe(good.resumo);
  });

  it("rejects extra keys and empty summaries", () => {
    const base = {
      resumo: "Leitura curta e objetiva dos dados aprovados nesta sessão.",
      destaques: ["Margem aprovada pelo gate"],
      atencao: [] as string[],
      proximos_passos: [] as string[],
    };
    expect(() =>
      parseLlmObject(
        JSON.stringify({ ...base, lucro_garantido: 999 }),
        SalesNarrativeSchema,
        "SalesNarrativeInvalid",
        "leitura da IA",
      ),
    ).toThrow();
    expect(SalesNarrativeSchema.safeParse({ ...base, resumo: "" }).success).toBe(false);
  });
});
