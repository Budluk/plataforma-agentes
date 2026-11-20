import { describe, it, expect } from "vitest";
import { buildPnl, pvm, rfm, topByMonetary, type RfmRow } from "@/lib/core/analytics";

const AS_OF = "2026-12-31T00:00:00Z";

describe("RFM", () => {
  const transactions = [
    { customer_id: "A", ts: "2026-12-30T00:00:00Z", amount: 100 },
    { customer_id: "A", ts: "2026-12-20T00:00:00Z", amount: 200 },
    { customer_id: "B", ts: "2026-11-01T00:00:00Z", amount: 50 },
    { customer_id: "C", ts: "2026-12-25T00:00:00Z", amount: 500 },
  ];

  it("computes recency, frequency and monetary with quintile scores", () => {
    const r = rfm(transactions, AS_OF);
    expect(r.status).toBe("medido");
    expect(r.customers.map((c) => c.customer_id)).toEqual(["C", "A", "B"]);
    const a = r.customers.find((c) => c.customer_id === "A");
    expect(a?.recency_days).toBe(1);
    expect(a?.frequency).toBe(2);
    expect(a?.monetary).toBe(300);
    expect(a?.r).toBe(5);
    const b = r.customers.find((c) => c.customer_id === "B");
    expect(b?.recency_days).toBe(60);
    expect(b?.r).toBe(2);
    expect(b?.segment).toBe("em risco");
  });

  it("gives equal scores to equal values", () => {
    const r = rfm(
      [
        { customer_id: "X", ts: "2026-12-01T00:00:00Z", amount: 10 },
        { customer_id: "Y", ts: "2026-12-01T00:00:00Z", amount: 10 },
      ],
      AS_OF,
    );
    const scores = r.customers.map((c) => `${c.r}${c.f}${c.m}`);
    expect(new Set(scores).size).toBe(1);
  });

  it("discards future, negative and naive-timestamp rows", () => {
    const r = rfm(
      [
        ...transactions,
        { customer_id: "Futuro", ts: "2027-01-02T00:00:00Z", amount: 10 },
        { customer_id: "Negativo", ts: "2026-12-01T00:00:00Z", amount: -10 },
        { customer_id: "", ts: "2026-12-01T00:00:00Z", amount: 10 },
        { customer_id: "SemFuso", ts: "2026-12-01", amount: 10 },
      ],
      AS_OF,
    );
    expect(r.invalid).toBe(4);
    expect(r.customers).toHaveLength(3);
  });

  it("does not invent customers when there is no valid history", () => {
    const r = rfm([], AS_OF);
    expect(r.status).toBe("sem_dados");
    expect(r.customers).toEqual([]);
    expect(() => rfm([], "sem fuso")).toThrow();
  });
});

describe("client ranking", () => {
  it("ranks by monetary value and reports the combined share", () => {
    const customers = rfm(
      [
        { customer_id: "A", ts: "2026-12-20T00:00:00Z", amount: 300 },
        { customer_id: "B", ts: "2026-12-20T00:00:00Z", amount: 50 },
        { customer_id: "C", ts: "2026-12-20T00:00:00Z", amount: 500 },
      ],
      AS_OF,
    ).customers;
    const r = topByMonetary(customers, 2);
    expect(r.rows.map((x) => x.customer_id)).toEqual(["C", "A"]);
    expect(r.rows[0]?.share_pct).toBe(58.82);
    expect(r.share_pct).toBe(94.12);
  });

  it("returns no share when there is no revenue", () => {
    const empty: RfmRow[] = [];
    expect(topByMonetary(empty).share_pct).toBeNull();
    expect(() => topByMonetary(empty, 0)).toThrow();
  });
});

describe("PVM", () => {
  it("isolates a pure price change", () => {
    const r = pvm(
      [{ product_id: "p1", quantity: 10, price: 10 }],
      [{ product_id: "p1", quantity: 10, price: 12 }],
    );
    expect(r.delta).toBe(20);
    expect(r.price_effect).toBe(20);
    expect(r.volume_effect).toBe(0);
    expect(r.mix_effect).toBe(0);
  });

  it("isolates a pure volume change", () => {
    const r = pvm(
      [{ product_id: "p1", quantity: 10, price: 10 }],
      [{ product_id: "p1", quantity: 15, price: 10 }],
    );
    expect(r.price_effect).toBe(0);
    expect(r.volume_effect).toBe(50);
    expect(r.mix_effect).toBe(0);
  });

  it("puts new products in the residual mix effect", () => {
    const r = pvm(
      [{ product_id: "p1", quantity: 10, price: 10 }],
      [{ product_id: "p2", quantity: 5, price: 4 }],
    );
    expect(r.delta).toBe(-80);
    expect(r.price_effect).toBe(0);
    expect(r.volume_effect).toBe(0);
    expect(r.mix_effect).toBe(-80);
  });

  it("keeps the three effects exactly equal to the delta at display precision", () => {
    const r = pvm(
      [
        { product_id: "a", quantity: 10, price: 10 },
        { product_id: "b", quantity: 2, price: 25 },
      ],
      [
        { product_id: "a", quantity: 14, price: 11 },
        { product_id: "c", quantity: 3, price: 7 },
      ],
    );
    expect(r.price_effect + r.volume_effect + r.mix_effect).toBe(r.delta);
    expect(r.products.map((p) => p.product_id)).toEqual(["a", "b", "c"]);
  });

  it("aggregates repeated products and rejects invalid flows", () => {
    const r = pvm(
      [
        { product_id: "a", quantity: 5, price: 10 },
        { product_id: "a", quantity: 5, price: 20 },
      ],
      [{ product_id: "a", quantity: 1, price: 30 }],
    );
    expect(r.revenue_base).toBe(150);
    expect(r.products[0]?.p0).toBe(15);
    expect(() => pvm([{ product_id: "a", quantity: 1.5, price: 10 }], [])).toThrow();
    expect(pvm([], []).status).toBe("sem_dados");
  });
});

describe("P&L", () => {
  it("computes margins and the net result", () => {
    const r = buildPnl([
      { period: "2026-11", revenue: 1000, cogs: 600, operating_expenses: 200, taxes: 50 },
    ]);
    expect(r.rows[0]?.gross_profit).toBe(400);
    expect(r.rows[0]?.operating_profit).toBe(200);
    expect(r.rows[0]?.net_profit).toBe(150);
    expect(r.rows[0]?.gross_margin_pct).toBe(40);
    expect(r.rows[0]?.net_margin_pct).toBe(15);
  });

  it("leaves margins null when revenue is zero", () => {
    const r = buildPnl([
      { period: "2026-11", revenue: 0, cogs: 0, operating_expenses: 10, taxes: 0 },
    ]);
    expect(r.rows[0]?.gross_margin_pct).toBeNull();
    expect(r.rows[0]?.net_profit).toBe(-10);
  });

  it("sorts periods and consolidates totals", () => {
    const r = buildPnl([
      { period: "2026-12", revenue: 200, cogs: 100, operating_expenses: 20, taxes: 10 },
      { period: "2026-11", revenue: 100, cogs: 50, operating_expenses: 10, taxes: 5 },
    ]);
    expect(r.rows.map((x) => x.period)).toEqual(["2026-11", "2026-12"]);
    expect(r.totals.revenue).toBe(300);
    expect(r.totals.net_profit).toBe(105);
  });

  it("rejects negative amounts and empty input", () => {
    expect(() =>
      buildPnl([{ period: "2026-11", revenue: -1, cogs: 0, operating_expenses: 0, taxes: 0 }]),
    ).toThrow();
    expect(() => buildPnl([])).toThrow();
  });
});
