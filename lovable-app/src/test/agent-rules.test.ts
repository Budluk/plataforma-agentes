import { describe, expect, it } from "vitest";
import { computeRisk, evaluateRisk, assertNoExecutionTool } from "@/lib/core/hardGate";
import { canonical, pyFloat } from "@/lib/core/canonical";
import { identifyChord, toGuitarTab } from "@/lib/core/music";
import { breakEvenUnits, checkSalesRequest, priceForMargin } from "@/lib/core/sales";
import { analyzeSource } from "@/lib/core/devCheck";
import { DEV_ALLOWED_IMPORTS } from "@/lib/core/config";

const okPortfolio = { equity: 10000, daily_pnl_pct: 0, equity_snapshot_consistent: true };
const longTrade = { direction: "LONG" as const, entry_price: 100, stop_price: 97, target_price: 106 };

const risk = (p: Partial<typeof longTrade>) => computeRisk({ asset: "PETR4", rationale: "x", ...longTrade, ...p } as never);

describe("finance hard gate", () => {
  it("approves a coherent LONG with stop 3% and reward/risk 2", () => {
    expect(evaluateRisk(risk({}), okPortfolio).approved).toBe(true);
  });
  it("rejects when the daily loss reaches -2%", () => {
    expect(evaluateRisk(risk({}), { ...okPortfolio, daily_pnl_pct: -2 }).approved).toBe(false);
  });
  it("rejects a stop more than 5% away from entry", () => {
    expect(evaluateRisk(risk({ stop_price: 94.9, target_price: 120 }), okPortfolio).approved).toBe(false);
  });
  it("rejects reward/risk below 1.5", () => {
    expect(evaluateRisk(risk({ target_price: 104 }), okPortfolio).approved).toBe(false);
  });
  it("fails closed when the portfolio is missing or inconsistent", () => {
    expect(evaluateRisk(risk({}), { equity: null, daily_pnl_pct: null, equity_snapshot_consistent: true }).approved).toBe(false);
    expect(evaluateRisk(risk({}), { ...okPortfolio, equity_snapshot_consistent: false }).approved).toBe(false);
  });
  it("vetoes order-execution tools", () => {
    expect(() => assertNoExecutionTool("broker.place_order")).toThrow();
  });
});

describe("audit canonical JSON matches Python json.dumps(sort_keys, compact)", () => {
  it("sorts keys, escapes non-ASCII and keeps float formatting", () => {
    expect(canonical({ b: 1, a: "ação", c: 2.5 })).toBe('{"a":"a\\u00e7\\u00e3o","b":1,"c":2.5}');
    expect(pyFloat(3)).toBe("3.0");
    expect(pyFloat(1e-5)).toBe("1e-05");
  });
});

describe("music", () => {
  it("identifies C major from 60 64 67", () => {
    expect(identifyChord([60, 64, 67])).toBe("C");
  });
  it("puts low E on the 6th string, open", () => {
    expect(toGuitarTab([40])[0]).toMatchObject({ string: 6, fret: 0 });
  });
});

describe("sales", () => {
  it("price for 40% margin on cost 12 is 20", () => {
    expect(priceForMargin(12, 40)).toBeCloseTo(20);
  });
  it("break-even rounds up to whole units", () => {
    expect(breakEvenUnits(1000, 12, 30)).toBe(56);
  });
  it("refuses a margin request priced below cost", () => {
    const reasons = checkSalesRequest({ action: "margin", product: "x", unit_cost: 12, price: 10, target_margin_pct: null, fixed_costs: null, competitor_prices: [] });
    expect(reasons.length).toBeGreaterThan(0);
  });
});

describe("generated code check (never executed)", () => {
  it("accepts allowed imports and rejects others", () => {
    expect(analyzeSource("import math\n\ndef f(x):\n    return math.sqrt(x)\n", DEV_ALLOWED_IMPORTS).ok).toBe(true);
    expect(analyzeSource("import os\nos.system('ls')\n", DEV_ALLOWED_IMPORTS).ok).toBe(false);
  });
  it("rejects eval and dunder escapes", () => {
    expect(analyzeSource("eval('1')\n", DEV_ALLOWED_IMPORTS).ok).toBe(false);
    expect(analyzeSource("x = ().__class__.__bases__\n", DEV_ALLOWED_IMPORTS).ok).toBe(false);
  });
});
