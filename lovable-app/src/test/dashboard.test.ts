import { describe, it, expect } from "vitest";
import {
  bucketStart,
  concentrationByAgent,
  periodComparison,
  periodCounts,
  qualitySnapshot,
  shiftBucket,
  targetProgress,
  timestampMs,
  windowCounts,
} from "@/lib/core/dashboard";

const sec = (iso: string) => new Date(iso).getTime() / 1000;
const NOW = new Date("2026-11-19T12:00:00Z");

describe("timestamp handling", () => {
  it("accepts epoch seconds, epoch milliseconds, Date and aware ISO", () => {
    const ms = Date.parse("2026-11-19T12:00:00Z");
    expect(timestampMs(ms / 1000)).toBe(ms);
    expect(timestampMs(ms)).toBe(ms);
    expect(timestampMs(new Date(ms))).toBe(ms);
    expect(timestampMs("2026-11-19T12:00:00Z")).toBe(ms);
    expect(timestampMs("2026-11-19 12:00:00-03:00")).toBe(Date.parse("2026-11-19T12:00:00-03:00"));
  });

  it("rejects naive stamps and junk instead of guessing a timezone", () => {
    for (const v of ["2026-11-19T12:00:00", "2026-11-19", "amanhã", 0, -1, Number.NaN, null, {}])
      expect(timestampMs(v)).toBeNull();
  });
});

describe("buckets", () => {
  it("starts the week on Monday in UTC", () => {
    expect(
      new Date(bucketStart(Date.parse("2026-11-22T23:00:00Z"), "week")).toISOString().slice(0, 10),
    ).toBe("2026-11-16");
    expect(
      new Date(bucketStart(Date.parse("2026-11-23T00:00:00Z"), "week")).toISOString().slice(0, 10),
    ).toBe("2026-11-23");
  });

  it("shifts day, week and month buckets without drifting the clock", () => {
    const start = Date.parse("2026-11-19T00:00:00Z");
    expect(new Date(shiftBucket(start, "day", -1)).toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(new Date(shiftBucket(start, "week", -1)).toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(new Date(shiftBucket(start, "month", -1)).toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("counts invalid timestamps separately", () => {
    const r = periodCounts(
      [{ ts: sec("2026-11-19T01:00:00Z") }, { ts: null }, { ts: "sem fuso" }],
      "day",
    );
    expect(r.items).toEqual([
      { key: "2026-11-19", start: Date.parse("2026-11-19T00:00:00Z"), count: 1 },
    ]);
    expect(r.invalid).toBe(2);
  });
});

describe("period comparison", () => {
  it("reports a measured variation with a real base", () => {
    const rows = [
      { ts: sec("2026-11-18T09:00:00Z") },
      { ts: sec("2026-11-19T08:00:00Z") },
      { ts: sec("2026-11-19T10:00:00Z") },
    ];
    const r = periodComparison(rows, "day", NOW);
    expect(r.status).toBe("medido");
    expect(r.current).toBe(2);
    expect(r.previous).toBe(1);
    expect(r.delta).toBe(1);
    expect(r.pct).toBe(100);
  });

  it("does not invent a base when the previous period is empty", () => {
    const r = periodComparison([{ ts: sec("2026-11-19T08:00:00Z") }], "day", NOW);
    expect(r.status).toBe("sem_comparacao");
    expect(r.pct).toBeNull();
    expect(r.delta).toBeNull();
    expect(r.reason).toContain("não é calculada");
  });

  it("distinguishes no data from no comparison", () => {
    expect(periodComparison([], "day", NOW).status).toBe("sem_dados");
  });

  it("compares calendar months, not rolling windows", () => {
    const rows = [{ ts: sec("2026-10-31T23:00:00Z") }, { ts: sec("2026-11-01T01:00:00Z") }];
    const r = periodComparison(rows, "month", NOW);
    expect(r.current).toBe(1);
    expect(r.previous).toBe(1);
    expect(r.previous_key).toBe("2026-10-01");
  });
});

describe("concentration", () => {
  const rows = [
    { agent: "central" },
    { agent: "central" },
    { agent: "central" },
    { agent: "vendas" },
    { agent: "vendas" },
    { agent: "pesquisa" },
  ];

  it("computes the share of the busiest agents", () => {
    const r = concentrationByAgent(rows, 50);
    expect(r.status).toBe("medido");
    expect(r.agent_count).toBe(3);
    expect(r.top_count).toBe(5);
    expect(r.share_pct).toBe(83.33);
    expect(r.agents[0]?.agent).toBe("central");
  });

  it("breaks ties alphabetically so the reading is stable", () => {
    const r = concentrationByAgent([
      { agent: "z" },
      { agent: "a" },
      { agent: "central" },
      { agent: "central" },
    ]);
    expect(r.agents.map((a) => a.agent)).toEqual(["central", "a", "z"]);
  });

  it("never divides by zero", () => {
    const r = concentrationByAgent([{ agent: "" }, { agent: null }]);
    expect(r.status).toBe("sem_dados");
    expect(r.share_pct).toBeNull();
  });

  it("rejects an out-of-range top percentage", () => {
    expect(() => concentrationByAgent(rows, 0)).toThrow();
    expect(() => concentrationByAgent(rows, 101)).toThrow();
  });
});

describe("quality snapshot", () => {
  it("counts blocked statuses without reading free-form detail", () => {
    const rows = [
      { status: "ok", detail: "texto livre sigiloso" },
      { status: "REJECTED", detail: "outro texto" },
      { status: "failed" },
      { status: "denied" },
      { status: "desconhecido" },
    ];
    const r = qualitySnapshot(rows);
    expect(r.total).toBe(5);
    expect(r.ok).toBe(1);
    expect(r.blocked).toBe(3);
    expect(r.blocked_pct).toBe(60);
    expect(r.by_status["rejected"]).toBe(1);
    expect(r.note).toContain("nenhum detalhe em texto livre");
  });

  it("returns null when there is no status to measure", () => {
    expect(qualitySnapshot([{ status: null }, {}]).blocked_pct).toBeNull();
  });
});

describe("window counts", () => {
  it("separates today from the rest of the month and flags invalid stamps", () => {
    const rows = [
      { ts: sec("2026-11-19T01:00:00Z") },
      { ts: sec("2026-11-01T00:00:00Z") },
      { ts: sec("2026-10-31T23:00:00Z") },
      { ts: "nao tem fuso" },
    ];
    const r = windowCounts(rows, NOW);
    expect(r.today).toBe(1);
    expect(r.month).toBe(2);
    expect(r.today_key).toBe("2026-11-19");
    expect(r.month_key).toBe("2026-11-01");
    expect(r.invalid).toBe(1);
  });
});

describe("target progress", () => {
  it("does not turn a missing goal into a percentage", () => {
    expect(targetProgress(10, null).status).toBe("sem_meta");
    expect(targetProgress(10, 0).pct).toBeNull();
    expect(targetProgress(-1, 10).status).toBe("sem_dados");
  });

  it("measures below and above the goal without clamping", () => {
    expect(targetProgress(30, 40).pct).toBe(75);
    expect(targetProgress(50, 40).pct).toBe(125);
  });
});
