// Deferred analytics primitives. Pure functions only; no data source is wired
// because transaction tables do not exist yet (schema is owned by Lovable).
// Results are deterministic and fail closed when the base is missing.

import { round2, timestampMs } from "./dashboard";

const DAY_MS = 86_400_000;

// ---------------- RFM ----------------

export interface Transaction {
  customer_id: string;
  ts: number | string | Date | null;
  amount: number;
}

export interface RfmRow {
  customer_id: string;
  recency_days: number;
  frequency: number;
  monetary: number;
  r: number;
  f: number;
  m: number;
  segment: string;
}

export interface RfmResult {
  status: "medido" | "sem_dados";
  as_of: string;
  customers: RfmRow[];
  invalid: number;
  reason: string;
}

/** Equal values get equal scores; the score is a quintile of the observed base. */
function quintile(value: number, sorted: number[], lowerIsBetter: boolean): number {
  let atOrBetter = 0;
  for (const v of sorted) if (lowerIsBetter ? v >= value : v <= value) atOrBetter++;
  const p = atOrBetter / sorted.length;
  return Math.min(5, Math.max(1, Math.ceil(p * 5)));
}

function rfmSegment(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return "campeão";
  if (r <= 2 && (f >= 4 || m >= 4)) return "em risco";
  if (f >= 4 && r >= 3) return "fiel";
  if (r >= 4 && f <= 2) return "novo";
  if (r <= 2 && f <= 2) return "adormecido";
  return "regular";
}

export function rfm(transactions: Transaction[], asOf: number | string | Date): RfmResult {
  const nowMs = timestampMs(asOf);
  if (nowMs === null) throw new Error("as_of deve ser um timestamp válido");
  type Acc = { last: number; frequency: number; monetary: number };
  const byCustomer = new Map<string, Acc>();
  let invalid = 0;
  for (const t of transactions) {
    const id = typeof t.customer_id === "string" ? t.customer_id.trim() : "";
    const ms = timestampMs(t.ts);
    if (!id || ms === null || ms > nowMs || !Number.isFinite(t.amount) || t.amount < 0) {
      invalid++;
      continue;
    }
    const acc = byCustomer.get(id) ?? { last: ms, frequency: 0, monetary: 0 };
    acc.last = Math.max(acc.last, ms);
    acc.frequency++;
    acc.monetary += t.amount;
    byCustomer.set(id, acc);
  }
  const as_of = new Date(nowMs).toISOString();
  if (!byCustomer.size)
    return {
      status: "sem_dados",
      as_of,
      customers: [],
      invalid,
      reason: "Sem transações válidas até a data informada.",
    };
  const raw = [...byCustomer].map(([customer_id, a]) => ({
    customer_id,
    recency_days: Math.floor((nowMs - a.last) / DAY_MS),
    frequency: a.frequency,
    monetary: round2(a.monetary),
  }));
  const recencies = raw.map((r) => r.recency_days);
  const frequencies = raw.map((r) => r.frequency);
  const monetarys = raw.map((r) => r.monetary);
  const customers: RfmRow[] = raw
    .map((r) => {
      const scoreR = quintile(r.recency_days, recencies, true);
      const scoreF = quintile(r.frequency, frequencies, false);
      const scoreM = quintile(r.monetary, monetarys, false);
      return { ...r, r: scoreR, f: scoreF, m: scoreM, segment: rfmSegment(scoreR, scoreF, scoreM) };
    })
    .sort((a, b) => b.monetary - a.monetary || a.customer_id.localeCompare(b.customer_id, "pt-BR"));
  return {
    status: "medido",
    as_of,
    customers,
    invalid,
    reason: `${customers.length} cliente(s) com transações válidas; ${invalid} registro(s) descartado(s).`,
  };
}

export interface TopCustomer {
  customer_id: string;
  monetary: number;
  share_pct: number;
}

export function topByMonetary(customers: RfmRow[], limit = 5) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit deve ser inteiro positivo");
  const total = customers.reduce((sum, c) => sum + c.monetary, 0);
  if (!(total > 0))
    return {
      status: "sem_dados" as const,
      rows: [] as TopCustomer[],
      share_pct: null,
      reason: "Sem receita para ranquear.",
    };
  const rows: TopCustomer[] = [...customers]
    .sort((a, b) => b.monetary - a.monetary || a.customer_id.localeCompare(b.customer_id, "pt-BR"))
    .slice(0, limit)
    .map((c) => ({
      customer_id: c.customer_id,
      monetary: c.monetary,
      share_pct: round2((c.monetary / total) * 100),
    }));
  const share_pct = round2((rows.reduce((sum, c) => sum + c.monetary, 0) / total) * 100);
  return {
    status: "medido" as const,
    rows,
    share_pct,
    reason: `${rows.length} cliente(s) respondem por ${share_pct}% do valor.`,
  };
}

// ---------------- PVM (price / volume / mix) ----------------

export interface ProductFlow {
  product_id: string;
  quantity: number;
  price: number;
}

export interface PvmProduct {
  product_id: string;
  q0: number;
  p0: number | null;
  q1: number;
  p1: number | null;
  revenue0: number;
  revenue1: number;
}

export interface PvmResult {
  status: "medido" | "sem_dados";
  revenue_base: number;
  revenue_current: number;
  delta: number;
  price_effect: number;
  volume_effect: number;
  mix_effect: number;
  products: PvmProduct[];
  reason: string;
}

type Aggregated = { q: number; revenue: number };

function aggregateFlows(flows: ProductFlow[]): Map<string, Aggregated> {
  const out = new Map<string, Aggregated>();
  for (const f of flows) {
    const id = typeof f.product_id === "string" ? f.product_id.trim() : "";
    if (
      !id ||
      !Number.isInteger(f.quantity) ||
      f.quantity < 0 ||
      !Number.isFinite(f.price) ||
      f.price < 0
    )
      throw new Error(
        "fluxo de produto inválido: id, quantidade inteira e preço não negativo são obrigatórios",
      );
    const acc = out.get(id) ?? { q: 0, revenue: 0 };
    acc.q += f.quantity;
    acc.revenue += f.quantity * f.price;
    out.set(id, acc);
  }
  return out;
}

/** Exact decomposition: price and volume use products present in both periods;
 *  entries, exits and composition changes land in the residual mix effect. */
export function pvm(baseFlows: ProductFlow[], currentFlows: ProductFlow[]): PvmResult {
  const base = aggregateFlows(baseFlows);
  const current = aggregateFlows(currentFlows);
  const revenueBase = [...base.values()].reduce((s, a) => s + a.revenue, 0);
  const revenueCurrent = [...current.values()].reduce((s, a) => s + a.revenue, 0);
  const delta = revenueCurrent - revenueBase;
  if (!base.size && !current.size)
    return {
      status: "sem_dados",
      revenue_base: 0,
      revenue_current: 0,
      delta: 0,
      price_effect: 0,
      volume_effect: 0,
      mix_effect: 0,
      products: [],
      reason: "Sem produtos nos dois períodos.",
    };
  let price = 0;
  let volume = 0;
  for (const [id, b] of base) {
    const c = current.get(id);
    if (!c || b.q === 0 || c.q === 0) continue;
    const p0 = b.revenue / b.q;
    const p1 = c.revenue / c.q;
    price += (p1 - p0) * c.q;
    volume += (c.q - b.q) * p0;
  }
  const price_effect = round2(price);
  const volume_effect = round2(volume);
  const products: PvmProduct[] = [...new Set([...base.keys(), ...current.keys()])]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((id) => {
      const b = base.get(id);
      const c = current.get(id);
      return {
        product_id: id,
        q0: b?.q ?? 0,
        p0: b && b.q > 0 ? round2(b.revenue / b.q) : null,
        q1: c?.q ?? 0,
        p1: c && c.q > 0 ? round2(c.revenue / c.q) : null,
        revenue0: round2(b?.revenue ?? 0),
        revenue1: round2(c?.revenue ?? 0),
      };
    });
  return {
    status: "medido",
    revenue_base: round2(revenueBase),
    revenue_current: round2(revenueCurrent),
    delta: round2(delta),
    price_effect,
    volume_effect,
    mix_effect: round2(delta - price_effect - volume_effect),
    products,
    reason:
      "Efeito preço e volume usam produtos presentes nos dois períodos; entradas, saídas e composição ficam no mix.",
  };
}

// ---------------- P&L ----------------

export interface PnlInput {
  period: string;
  revenue: number;
  cogs: number;
  operating_expenses: number;
  taxes: number;
}

export interface PnlRow extends PnlInput {
  gross_profit: number;
  operating_profit: number;
  net_profit: number;
  gross_margin_pct: number | null;
  net_margin_pct: number | null;
}

export interface PnlResult {
  status: "medido" | "sem_dados";
  rows: PnlRow[];
  totals: Omit<PnlRow, "period">;
  reason: string;
}

function pnlRow(input: PnlInput): PnlRow {
  const period = typeof input.period === "string" ? input.period.trim() : "";
  if (!period) throw new Error("period é obrigatório");
  for (const key of ["revenue", "cogs", "operating_expenses", "taxes"] as const) {
    const v = input[key];
    if (!Number.isFinite(v) || v < 0) throw new Error(`${key} deve ser número não negativo`);
  }
  const gross_profit = input.revenue - input.cogs;
  const operating_profit = gross_profit - input.operating_expenses;
  const net_profit = operating_profit - input.taxes;
  const margins =
    input.revenue > 0
      ? {
          gross_margin_pct: round2((gross_profit / input.revenue) * 100),
          net_margin_pct: round2((net_profit / input.revenue) * 100),
        }
      : { gross_margin_pct: null, net_margin_pct: null };
  return {
    period,
    revenue: round2(input.revenue),
    cogs: round2(input.cogs),
    operating_expenses: round2(input.operating_expenses),
    taxes: round2(input.taxes),
    gross_profit: round2(gross_profit),
    operating_profit: round2(operating_profit),
    net_profit: round2(net_profit),
    ...margins,
  };
}

export function buildPnl(inputs: PnlInput[]): PnlResult {
  if (!inputs.length) throw new Error("P&L exige ao menos um período");
  const rows = inputs.map(pnlRow).sort((a, b) => a.period.localeCompare(b.period, "pt-BR"));
  const sum = (
    key:
      | "revenue"
      | "cogs"
      | "operating_expenses"
      | "taxes"
      | "gross_profit"
      | "operating_profit"
      | "net_profit",
  ) => round2(rows.reduce((acc, r) => acc + r[key], 0));
  const revenue = sum("revenue");
  const gross_profit = sum("gross_profit");
  const net_profit = sum("net_profit");
  const totals: Omit<PnlRow, "period"> = {
    revenue,
    cogs: sum("cogs"),
    operating_expenses: sum("operating_expenses"),
    taxes: sum("taxes"),
    gross_profit,
    operating_profit: sum("operating_profit"),
    net_profit,
    gross_margin_pct: revenue > 0 ? round2((gross_profit / revenue) * 100) : null,
    net_margin_pct: revenue > 0 ? round2((net_profit / revenue) * 100) : null,
  };
  return {
    status: "medido",
    rows,
    totals,
    reason: "Margens são nulas quando a receita do recorte é zero; nenhum período é inventado.",
  };
}
