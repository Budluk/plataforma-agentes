import { describe, it, expect } from "vitest";
import {
  buildCommercialOverview,
  buildCommercialSeries,
  COMMERCIAL_TIMEZONE,
  type CommercialInput,
} from "@/lib/core/crm-dashboard";

const AS_OF = "2026-11-21T12:00:00Z";

const EMPTY: CommercialInput = {
  leads: [],
  opportunities: [],
  activities: [],
  orders: [],
  asOf: AS_OF,
};

const INPUT: CommercialInput = {
  asOf: AS_OF,
  revenueTargetCents: 600_000,
  leads: [
    { id: "l1", created_at: "2026-11-21T10:00:00Z", status: "qualificado", source: "site" },
    { id: "l2", created_at: "2026-11-21T09:00:00Z", status: "novo", source: "site" },
    { id: "l3", created_at: "2026-11-20T10:00:00Z", status: "em negociação", source: "indicacao" },
  ],
  opportunities: [
    {
      id: "o1",
      created_at: "2026-11-01T12:00:00Z",
      stage: "negociacao",
      amount_cents: 100_000,
      owner: "Ana",
    },
    {
      id: "o2",
      created_at: "2026-11-02T12:00:00Z",
      stage: "venda_ganha",
      amount_cents: 200_000,
      owner: "Ana",
    },
    {
      id: "o3",
      created_at: "2026-11-03T12:00:00Z",
      stage: "venda_perdida",
      amount_cents: 300_000,
      owner: "Bruno",
      lost_at: "2026-11-10T12:00:00Z",
      loss_reason: "preco",
    },
    {
      id: "o4",
      created_at: "2026-11-04T12:00:00Z",
      stage: "primeiro_contato",
      amount_cents: 50_000,
    },
  ],
  activities: [
    { id: "a1", kind: "follow_up", due_at: "2026-11-20T12:00:00Z" },
    { id: "a2", kind: "ligacao", due_at: "2026-11-22T12:00:00Z" },
    {
      id: "a3",
      kind: "email",
      due_at: "2026-11-19T12:00:00Z",
      completed_at: "2026-11-19T13:00:00Z",
    },
  ],
  orders: [
    {
      id: "v1",
      created_at: "2026-11-01T12:00:00Z",
      won_at: "2026-11-11T12:00:00Z",
      amount_cents: 100_000,
      product: "Consultoria",
      owner: "Ana",
      customer_id: "c1",
    },
    {
      id: "v2",
      created_at: "2026-11-05T12:00:00Z",
      won_at: "2026-11-15T12:00:00Z",
      amount_cents: 200_000,
      product: "Consultoria",
      owner: "Bruno",
      customer_id: "c2",
    },
    { id: "v3", created_at: "sem fuso", amount_cents: -5 },
  ],
};

describe("commercial overview", () => {
  it("returns sem_dados for every metric when no rows are supplied", () => {
    const r = buildCommercialOverview(EMPTY);
    for (const key of [
      "totalLeads",
      "newLeadsToday",
      "qualifiedLeads",
      "inNegotiation",
      "convertedCustomers",
      "completedSales",
      "pipelineValueCents",
      "realizedRevenueCents",
      "conversionRatePct",
      "avgTicketCents",
      "avgConversionDays",
      "pendingActivities",
      "overdueFollowUps",
    ] as const) {
      expect(r[key].status).toBe("sem_dados");
      expect(r[key].value).toBeNull();
      expect(r[key].reason.length).toBeGreaterThan(0);
    }
    expect(r.goal.status).toBe("sem_meta");
    expect(r.generatedAt).toBe("2026-11-21T12:00:00.000Z");
    expect(r.timezone).toBe(COMMERCIAL_TIMEZONE);
    expect(r.reason).toContain("nenhum número foi inferido");
  });

  it("computes every headline from supplied rows and discards invalid money", () => {
    const r = buildCommercialOverview(INPUT);
    expect(r.totalLeads.value).toBe(3);
    expect(r.newLeadsToday.value).toBe(2);
    expect(r.qualifiedLeads.value).toBe(1);
    expect(r.inNegotiation.value).toBe(1);
    expect(r.convertedCustomers.value).toBe(2);
    expect(r.completedSales.value).toBe(2);
    expect(r.pipelineValueCents.value).toBe(150_000);
    expect(r.realizedRevenueCents.value).toBe(300_000);
    expect(r.conversionRatePct.value).toBe(66.67);
    expect(r.avgTicketCents.value).toBe(150_000);
    expect(r.avgConversionDays.value).toBe(10);
    expect(r.pendingActivities.value).toBe(2);
    expect(r.overdueFollowUps.value).toBe(1);
    expect(r.goal.status).toBe("medido");
    expect(r.goal.pct).toBe(50);
    expect(r.realizedRevenueCents.reason).toContain("1 valor(es) inválido(s) descartado(s)");
  });

  it("counts distinct customers and never treats a missing target as zero", () => {
    const sameCustomer: CommercialInput = {
      ...INPUT,
      orders: [
        { ...INPUT.orders[0]!, customer_id: "c1" },
        { ...INPUT.orders[1]!, customer_id: "c1" },
      ],
    };
    const r = buildCommercialOverview(sameCustomer);
    expect(r.convertedCustomers.value).toBe(1);
    expect(r.completedSales.value).toBe(2);

    expect(buildCommercialOverview({ ...INPUT, orders: [] }).goal.status).toBe("sem_dados");
    expect(buildCommercialOverview({ ...INPUT, revenueTargetCents: null }).goal.pct).toBeNull();
  });

  it("rejects a naive asOf instead of guessing a timezone", () => {
    expect(() => buildCommercialOverview({ ...EMPTY, asOf: "sem fuso" })).toThrow(
      "asOf deve ser um timestamp válido",
    );
  });
});

describe("commercial series", () => {
  it("builds chart data only from real rows and reports invalid timestamps", () => {
    const s = buildCommercialSeries(INPUT);
    expect(s.salesByPeriod.items.map((i) => [i.key, i.count])).toEqual([
      ["2026-11-01", 1],
      ["2026-11-05", 1],
    ]);
    expect(s.salesByPeriod.invalid).toBe(1);
    expect(s.monthlyRevenue.items).toHaveLength(1);
    expect(s.monthlyRevenue.items[0]?.key).toBe("2026-11-01");
    expect(Object.fromEntries(s.conversionByStage.map((x) => [x.name, x.count]))).toEqual({
      negociacao: 1,
      venda_ganha: 1,
      venda_perdida: 1,
      primeiro_contato: 1,
    });
    expect(s.leadsBySource.map((x) => [x.name, x.count])).toEqual([
      ["site", 2],
      ["indicacao", 1],
    ]);
    expect(s.lossReasons).toEqual([{ name: "preco", count: 1 }]);
    expect(s.topProducts).toEqual([{ name: "Consultoria", amount_cents: 300_000 }]);
    expect(s.agentPerformance.status).toBe("medido");
    expect(s.agentPerformance.rows).toEqual([
      { owner: "Ana", opportunities: 2, won: 1, revenue_cents: 100_000, conversion_pct: 50 },
      { owner: "Bruno", opportunities: 1, won: 1, revenue_cents: 200_000, conversion_pct: 100 },
    ]);
  });

  it("emits empty series with sem_dados when there is no basis", () => {
    const s = buildCommercialSeries(EMPTY);
    expect(s.salesByPeriod.items).toEqual([]);
    expect(s.monthlyRevenue.items).toEqual([]);
    expect(s.conversionByStage).toEqual([]);
    expect(s.leadsBySource).toEqual([]);
    expect(s.topProducts).toEqual([]);
    expect(s.lossReasons).toEqual([]);
    expect(s.agentPerformance.status).toBe("sem_dados");
  });
});
