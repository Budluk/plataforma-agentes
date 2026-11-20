import { z } from "zod";

const money = () => z.number().finite().gt(0).lte(1e9);
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export { round2 };

// Product name: words separated by a single space. `\s` accepted newlines and tabs,
// and `$` accepted a trailing break; anchoring keeps the field on one line, without
// borders or repeated spaces.
export const SAFE_TEXT = /^[\p{L}\p{N}_\-./]+(?: [\p{L}\p{N}_\-./]+)*$/u;
export const MAX_TARGET_MARGIN_PCT = 95;

export const SalesRequest = z
  .object({
    action: z.enum(["margin", "price", "break_even"]),
    product: z.string().min(1).max(60),
    unit_cost: money(),
    price: money().nullable().default(null),
    target_margin_pct: z.number().finite().min(0).lt(MAX_TARGET_MARGIN_PCT).nullable().default(null),
    fixed_costs: z.number().finite().min(0).lte(1e9).nullable().default(null),
    competitor_prices: z.array(money()).max(20).default([]),
  })
  .strict();
export type SalesRequest = z.infer<typeof SalesRequest>;

export function checkSalesRequest(req: SalesRequest): string[] {
  const reasons: string[] = [];
  if (!SAFE_TEXT.test(req.product)) reasons.push("nome do produto contém caracteres não permitidos");
  if (req.action === "margin") {
    if (req.price === null) reasons.push("preço ausente (falha fechada)");
    else if (req.price < req.unit_cost) reasons.push("preço abaixo do custo (venda com prejuízo)");
  } else if (req.action === "price") {
    if (req.target_margin_pct === null) reasons.push("margem-alvo ausente (falha fechada)");
  } else {
    if (req.price === null || req.fixed_costs === null) reasons.push("preço ou custos fixos ausentes (falha fechada)");
    else if (req.price <= req.unit_cost) reasons.push("preço não supera o custo unitário; não há ponto de equilíbrio");
  }
  return reasons;
}

export const marginPct = (cost: number, price: number) => ((price - cost) / price) * 100;
export const markupPct = (cost: number, price: number) => ((price - cost) / cost) * 100;
export function priceForMargin(cost: number, margin: number): number {
  if (!(margin >= 0 && margin < 100)) throw new Error("margem-alvo deve estar em [0, 100)");
  return cost / (1 - margin / 100);
}
export function breakEvenUnits(fixed: number, cost: number, price: number): number {
  const unit = price - cost;
  if (unit <= 0) throw new Error("preço não supera o custo unitário");
  return Math.ceil(Math.round((fixed / unit) * 1e9) / 1e9);
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const hi = s[m] ?? 0;
  return s.length % 2 ? hi : ((s[m - 1] ?? hi) + hi) / 2;
}
export function marketPosition(price: number, competitors: number[]) {
  if (!competitors.length) return null;
  const lo = Math.min(...competitors);
  const hi = Math.max(...competitors);
  return { min: round2(lo), median: round2(median(competitors)), max: round2(hi), position: price < lo ? "abaixo" : price > hi ? "acima" : "dentro" };
}

export const SALES_TOOL_BY_ACTION = { margin: "compute_margin", price: "suggest_price", break_even: "break_even" } as const;

// ---------------- funnel ----------------
const pct = () => z.number().finite().min(0).lte(50);
const count = () => z.number().int().min(0).lte(1_000_000_000);
const price0 = () => z.number().finite().min(0).lte(1e9);

export const FunnelRequest = z
  .object({
    product: z.string().min(1).max(60),
    ad_spend: money(),
    visitors: z.number().int().min(1).lte(1_000_000_000),
    checkouts_started: count(),
    front_sales: count(),
    bump_sales: count().default(0),
    upsell_sales: count().default(0),
    front_price: money(),
    bump_price: price0().default(0),
    upsell_price: price0().default(0),
    platform_fee_pct: pct(),
    tax_pct: pct(),
    variable_cost_per_order: price0().default(0),
    scale_roas: z.number().finite().gt(0).lte(50).default(1.8),
    scale_step_pct: z.number().finite().gt(0).lte(50).default(20),
    min_sales_for_decision: z.number().int().min(1).lte(10000).default(10),
  })
  .strict();
export type FunnelRequest = z.infer<typeof FunnelRequest>;

export function checkFunnelRequest(req: FunnelRequest): string[] {
  const r: string[] = [];
  if (!SAFE_TEXT.test(req.product)) r.push("nome do produto contém caracteres não permitidos");
  if (req.checkouts_started > req.visitors) r.push("checkouts iniciados maiores que visitantes (dados incoerentes)");
  if (req.front_sales > req.checkouts_started) r.push("vendas do front maiores que checkouts iniciados (dados incoerentes)");
  if (req.bump_sales > req.front_sales) r.push("vendas de order bump maiores que vendas do front (dados incoerentes)");
  if (req.upsell_sales > req.front_sales) r.push("vendas de upsell maiores que vendas do front (dados incoerentes)");
  if (req.bump_sales > 0 && req.bump_price === 0) r.push("há vendas de order bump mas o preço do bump é 0");
  if (req.upsell_sales > 0 && req.upsell_price === 0) r.push("há vendas de upsell mas o preço do upsell é 0");
  if (req.platform_fee_pct + req.tax_pct >= 100) r.push("taxa da plataforma + imposto somam 100% ou mais");
  return r;
}

const pctOf = (a: number, b: number) => (b > 0 ? round2((a / b) * 100) : null);
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(x));

export type FunnelAnalysis = ReturnType<typeof analyzeFunnel>;
export function analyzeFunnel(p: Omit<FunnelRequest, "product">) {
  const revenue = p.front_sales * p.front_price + p.bump_sales * p.bump_price + p.upsell_sales * p.upsell_price;
  const net = revenue * (1 - (p.platform_fee_pct + p.tax_pct) / 100) - p.front_sales * p.variable_cost_per_order;
  const profit = net - p.ad_spend;
  const roas = revenue / p.ad_spend;
  const breakeven = net > 0 ? revenue / net : null;
  let decision: "dados_insuficientes" | "cortar" | "escalar" | "manter";
  let note: string;
  if (p.front_sales < p.min_sales_for_decision) {
    decision = "dados_insuficientes";
    note = `apenas ${p.front_sales} venda(s) no front; mínimo de ${p.min_sales_for_decision} para decidir. Mantenha e colete mais dados.`;
  } else if (profit < 0) {
    decision = "cortar";
    note = "lucro negativo com os números informados; pausar e revisar oferta e criativos.";
  } else if (roas >= p.scale_roas) {
    decision = "escalar";
    note = `ROAS ${roas.toFixed(2)} >= ${fmt(p.scale_roas)} com lucro positivo; considere +${fmt(p.scale_step_pct)}% de verba.`;
  } else {
    decision = "manter";
    note = "lucro positivo, mas ROAS abaixo do limite de escala.";
  }
  return {
    revenue: round2(revenue),
    net_revenue: round2(net),
    profit: round2(profit),
    roas: round2(roas),
    breakeven_roas: breakeven !== null ? round2(breakeven) : null,
    cpa: p.front_sales > 0 ? round2(p.ad_spend / p.front_sales) : null,
    avg_ticket: p.front_sales > 0 ? round2(revenue / p.front_sales) : null,
    rates: {
      visit_to_checkout_pct: pctOf(p.checkouts_started, p.visitors),
      checkout_to_front_pct: pctOf(p.front_sales, p.checkouts_started),
      bump_pct: pctOf(p.bump_sales, p.front_sales),
      upsell_pct: pctOf(p.upsell_sales, p.front_sales),
    },
    decision,
    note,
    suggested_budget_change_pct: decision === "escalar" ? p.scale_step_pct : 0,
  };
}
