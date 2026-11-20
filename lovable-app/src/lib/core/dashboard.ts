// Local dashboard readings. Pure functions only: no I/O, no DB, no clock reads
// beyond an explicit `now`. Missing or incoherent data yields null/status —
// never a fabricated zero, never an extrapolation.

export type Bucket = "day" | "week" | "month";

export interface Stamped {
  ts?: number | string | null;
}

export interface RunLike extends Stamped {
  agent?: string | null;
  status?: string | null;
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const AWARE_STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Epoch seconds, epoch milliseconds, Date or timezone-aware ISO string. */
export function timestampMs(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return null;
    return v < 1e12 ? v * 1000 : v;
  }
  if (typeof v !== "string" || !AWARE_STAMP.test(v.trim())) return null;
  const ms = Date.parse(v.trim().replace(" ", "T"));
  return Number.isNaN(ms) ? null : ms;
}

export function bucketStart(ms: number, bucket: Bucket): number {
  if (!Number.isFinite(ms)) throw new Error("timestamp inválido");
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (bucket === "month") return Date.UTC(y, m, 1);
  if (bucket === "week") return Date.UTC(y, m, day - ((d.getUTCDay() + 6) % 7));
  return Date.UTC(y, m, day);
}

export function shiftBucket(start: number, bucket: Bucket, delta: number): number {
  if (!Number.isInteger(delta)) throw new Error("delta deve ser inteiro");
  const d = new Date(bucketStart(start, bucket));
  if (bucket === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
  if (bucket === "week")
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta * 7);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta);
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface PeriodCount {
  key: string;
  start: number;
  count: number;
}

export function periodCounts(rows: Stamped[], bucket: Bucket) {
  const counts = new Map<number, number>();
  let invalid = 0;
  for (const r of rows) {
    const ms = timestampMs(r.ts);
    if (ms === null) {
      invalid++;
      continue;
    }
    const start = bucketStart(ms, bucket);
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }
  const items: PeriodCount[] = [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([start, count]) => ({ key: dayKey(start), start, count }));
  return { bucket, items, invalid };
}

export type ComparisonStatus = "medido" | "sem_dados" | "sem_comparacao";

export interface PeriodComparison {
  bucket: Bucket;
  current_key: string;
  previous_key: string;
  current: number;
  previous: number;
  delta: number | null;
  pct: number | null;
  status: ComparisonStatus;
  reason: string;
}

export function periodComparison(
  rows: Stamped[],
  bucket: Bucket,
  now: Date | number,
): PeriodComparison {
  const nowMs = timestampMs(now);
  if (nowMs === null) throw new Error("now deve ser um timestamp válido");
  const currentStart = bucketStart(nowMs, bucket);
  const previousStart = shiftBucket(currentStart, bucket, -1);
  const { items } = periodCounts(rows, bucket);
  const current = items.find((i) => i.start === currentStart)?.count ?? 0;
  const previous = items.find((i) => i.start === previousStart)?.count ?? 0;
  const current_key = dayKey(currentStart);
  const previous_key = dayKey(previousStart);
  if (current === 0 && previous === 0)
    return {
      bucket,
      current_key,
      previous_key,
      current,
      previous,
      delta: null,
      pct: null,
      status: "sem_dados",
      reason: "Sem execuções nos dois períodos; nada a comparar.",
    };
  if (previous === 0)
    return {
      bucket,
      current_key,
      previous_key,
      current,
      previous,
      delta: null,
      pct: null,
      status: "sem_comparacao",
      reason: `Sem execuções em ${previous_key}; variação não é calculada para não inventar base.`,
    };
  const delta = current - previous;
  return {
    bucket,
    current_key,
    previous_key,
    current,
    previous,
    delta,
    pct: round2((delta / previous) * 100),
    status: "medido",
    reason: `${current} execução(ões) em ${current_key} contra ${previous} em ${previous_key}.`,
  };
}

export interface AgentSlice {
  agent: string;
  runs: number;
  share_pct: number;
}

export type Concentration =
  | {
      status: "sem_dados";
      top_pct: number;
      agent_count: 0;
      top_count: 0;
      share_pct: null;
      agents: AgentSlice[];
      reason: string;
    }
  | {
      status: "medido";
      top_pct: number;
      agent_count: number;
      top_count: number;
      share_pct: number;
      agents: AgentSlice[];
      reason: string;
    };

/** Adapted Pareto: what share of runs the busiest top_pct of agents concentrates. */
export function concentrationByAgent(rows: RunLike[], topPct = 20): Concentration {
  if (!Number.isFinite(topPct) || topPct <= 0 || topPct > 100)
    throw new Error("top_pct deve estar em (0, 100]");
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const agent = typeof r.agent === "string" ? r.agent.trim() : "";
    if (!agent) continue;
    counts.set(agent, (counts.get(agent) ?? 0) + 1);
    total++;
  }
  if (total === 0)
    return {
      status: "sem_dados",
      top_pct: topPct,
      agent_count: 0,
      top_count: 0,
      share_pct: null,
      agents: [],
      reason: "Sem agentes identificados na amostra.",
    };
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  const agents: AgentSlice[] = ranked.map(([agent, runs]) => ({
    agent,
    runs,
    share_pct: round2((runs / total) * 100),
  }));
  const topN = Math.min(ranked.length, Math.max(1, Math.ceil((ranked.length * topPct) / 100)));
  const topCount = ranked.slice(0, topN).reduce((sum, [, n]) => sum + n, 0);
  return {
    status: "medido",
    top_pct: topPct,
    agent_count: ranked.length,
    top_count: topCount,
    share_pct: round2((topCount / total) * 100),
    agents,
    reason: `${topN} de ${ranked.length} agente(s) respondem por ${topCount} de ${total} execução(ões) na amostra.`,
  };
}

const BLOCKED = new Set([
  "rejected",
  "denied",
  "failed",
  "error",
  "kill_switch",
  "no_handler",
  "timeout",
]);
const OK = new Set(["ok", "approved", "used", "success"]);

export interface QualitySnapshot {
  total: number;
  ok: number;
  blocked: number;
  blocked_pct: number | null;
  by_status: Record<string, number>;
  note: string;
}

/** Status-only health reading: free-text detail is never inspected. */
export function qualitySnapshot(rows: RunLike[]): QualitySnapshot {
  const by_status: Record<string, number> = {};
  let ok = 0;
  let blocked = 0;
  for (const r of rows) {
    const status = typeof r.status === "string" ? r.status.trim().toLowerCase() : "";
    if (!status) continue;
    by_status[status] = (by_status[status] ?? 0) + 1;
    if (OK.has(status)) ok++;
    if (BLOCKED.has(status)) blocked++;
  }
  const total = Object.values(by_status).reduce((sum, n) => sum + n, 0);
  return {
    total,
    ok,
    blocked,
    blocked_pct: total > 0 ? round2((blocked / total) * 100) : null,
    by_status,
    note: "Baseado somente no status das execuções; nenhum detalhe em texto livre é lido.",
  };
}

export interface WindowCounts {
  today: number;
  month: number;
  today_key: string;
  month_key: string;
  invalid: number;
}

export function windowCounts(rows: Stamped[], now: Date | number): WindowCounts {
  const nowMs = timestampMs(now);
  if (nowMs === null) throw new Error("now deve ser um timestamp válido");
  const today = bucketStart(nowMs, "day");
  const month = bucketStart(nowMs, "month");
  let todayCount = 0;
  let monthCount = 0;
  let invalid = 0;
  for (const r of rows) {
    const ms = timestampMs(r.ts);
    if (ms === null) {
      invalid++;
      continue;
    }
    if (ms >= month) monthCount++;
    if (ms >= today) todayCount++;
  }
  return {
    today: todayCount,
    month: monthCount,
    today_key: dayKey(today),
    month_key: dayKey(month),
    invalid,
  };
}

export interface TargetProgress {
  status: "medido" | "sem_meta" | "sem_dados";
  realized: number | null;
  target: number | null;
  pct: number | null;
  reason: string;
}

/** No target means no percentage — never treat a missing goal as zero. */
export function targetProgress(realized: number | null, target: number | null): TargetProgress {
  if (target === null || !Number.isFinite(target) || target <= 0)
    return {
      status: "sem_meta",
      realized,
      target: null,
      pct: null,
      reason: "Sem meta definida; nada é comparado.",
    };
  if (realized === null || !Number.isFinite(realized) || realized < 0)
    return {
      status: "sem_dados",
      realized: null,
      target,
      pct: null,
      reason: "Sem realização informada; nada é comparado.",
    };
  return {
    status: "medido",
    realized,
    target,
    pct: round2((realized / target) * 100),
    reason: `${realized} de ${target}.`,
  };
}
