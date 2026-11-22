// Pure assembly of the sales-area PDF report. It consumes results already
// computed in the session plus trend rows already saved by the app. No fetch,
// no clock read, no collection — absent data is reported as absent.

import type { ReportBlock, ReportDocument, ReportTableBlock } from "./report";
import type { SalesNarrative } from "./sales-narrative";

export interface OutcomeLike {
  ok: boolean;
  data?: unknown;
  reasons?: string[];
}

export interface TrendRowLike {
  topic: string;
  source?: string;
  metric?: string;
  observations?: number | null;
  observations_in_frame?: number | null;
  status?: string;
  reason?: string;
  delta_views?: number | null;
  growth_pct?: number | null;
  views_per_hour?: number | null;
}

export interface SalesParams {
  product: string;
  action: "margin" | "price" | "break_even";
  unit_cost: number | null;
  price: number | null;
  target_margin_pct: number | null;
  fixed_costs: number | null;
  competitor_prices: number[];
}

export interface SalesReportInput {
  generatedAt: string;
  sales: OutcomeLike | null;
  funnel: OutcomeLike | null;
  salesParams: SalesParams;
  trendRows: TrendRowLike[];
  trendObservationCount: number;
  /** Optional AI-written editorial layer. Null when the user did not request it. */
  narrative?: SalesNarrative | null;
  /** Set when the AI layer failed; the deterministic report is still emitted. */
  narrativeError?: string | null;
}

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function fmtNumber(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? nf.format(v) : "—";
}

export function fmtMoney(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? `R$ ${nf.format(v)}` : "—";
}

export function fmtPct(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? `${nf.format(v)}%` : "—";
}

const plain = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
};

type Field = [key: string, label: string, fmt: (v: unknown) => string];

const SALES_FIELDS: Field[] = [
  ["margin_pct", "Margem (%)", fmtPct],
  ["markup_pct", "Markup (%)", fmtPct],
  ["profit_per_unit", "Lucro por unidade", fmtMoney],
  ["suggested_price", "Preço sugerido", fmtMoney],
  ["units", "Unidades no equilíbrio", fmtNumber],
  ["revenue", "Receita no equilíbrio", fmtMoney],
];

const FUNNEL_FIELDS: Field[] = [
  ["revenue", "Receita bruta", fmtMoney],
  ["net_revenue", "Receita líquida", fmtMoney],
  ["profit", "Lucro", fmtMoney],
  ["roas", "ROAS", fmtNumber],
  ["breakeven_roas", "ROAS de equilíbrio", fmtNumber],
  ["cpa", "Custo por aquisição", fmtMoney],
  ["avg_ticket", "Ticket médio", fmtMoney],
  ["suggested_budget_change_pct", "Ajuste de verba sugerido (%)", fmtPct],
  ["decision", "Decisão", cell],
];

const RATE_FIELDS: Field[] = [
  ["visit_to_checkout_pct", "Visitante → checkout (%)", fmtPct],
  ["checkout_to_front_pct", "Checkout → venda (%)", fmtPct],
  ["bump_pct", "Order bump (%)", fmtPct],
  ["upsell_pct", "Upsell (%)", fmtPct],
];

function fieldsToRows(data: Record<string, unknown>, fields: Field[]): string[][] {
  return fields
    .filter(([key]) => data[key] !== undefined)
    .map(([key, label, fmt]) => [label, fmt(data[key])]);
}

function outcomeBlocks(
  outcome: OutcomeLike | null,
  emptyText: string,
  fields: Field[],
  nested?: { key: string; fields: Field[]; label: string },
): ReportBlock[] {
  if (!outcome) return [{ kind: "text", text: emptyText, style: "muted" }];
  if (!outcome.ok) {
    return [
      {
        kind: "text",
        text: "Resultado rejeitado pelos gates; nenhum número é apresentado.",
        style: "muted",
      },
      ...(outcome.reasons ?? []).map((r): ReportBlock => ({
        kind: "text",
        text: `- ${r}`,
        style: "muted",
      })),
    ];
  }
  const data = plain(outcome.data);
  if (!data)
    return [
      {
        kind: "text",
        text: "Resultado aprovado sem dados estruturados; nada é apresentado.",
        style: "muted",
      },
    ];

  const rows = fieldsToRows(data, fields);
  if (nested) {
    const inner = plain(data[nested.key]);
    if (inner)
      rows.push(
        ...fieldsToRows(inner, nested.fields).map(([label, value]): string[] => [
          `${nested.label} · ${label}`,
          value ?? "—",
        ]),
      );
  }
  const market = plain(data["market"]);
  if (market) {
    if (
      market["min"] !== undefined ||
      market["median"] !== undefined ||
      market["max"] !== undefined
    ) {
      rows.push([
        "Faixa dos concorrentes",
        `mín. ${fmtMoney(market["min"])} · mediana ${fmtMoney(market["median"])} · máx. ${fmtMoney(market["max"])}`,
      ]);
    }
    if (market["position"] !== undefined)
      rows.push(["Posição frente ao mercado", cell(market["position"])]);
  }
  if (!rows.length)
    return [
      {
        kind: "text",
        text: "Resultado aprovado, mas sem campos reconhecidos; nada é apresentado.",
        style: "muted",
      },
    ];

  const table: ReportTableBlock = { kind: "table", headers: ["indicador", "valor"], rows };
  const blocks: ReportBlock[] = [table];
  if (typeof data["note"] === "string" && data["note"].trim()) {
    blocks.push({ kind: "text", text: `Interpretação: ${data["note"]}`, style: "body" });
  }
  return blocks;
}

function paramsBlock(p: SalesParams): ReportBlock {
  const actionLabel =
    p.action === "margin" ? "margem" : p.action === "price" ? "preço sugerido" : "equilíbrio";
  const rows: string[][] = [
    ["produto", cell(p.product)],
    ["operação", actionLabel],
    ["custo unitário", fmtMoney(p.unit_cost)],
  ];
  if (p.action === "price") rows.push(["margem-alvo", fmtPct(p.target_margin_pct)]);
  else rows.push(["preço", fmtMoney(p.price)]);
  if (p.action === "break_even") rows.push(["custos fixos", fmtMoney(p.fixed_costs)]);
  rows.push([
    "concorrentes",
    p.competitor_prices.length ? p.competitor_prices.map(fmtNumber).join(" · ") : "não informados",
  ]);
  return { kind: "table", headers: ["parâmetro informado", "valor"], rows };
}

function trendsBlocks(input: SalesReportInput): ReportBlock[] {
  const total = input.trendObservationCount;
  const rows = input.trendRows.slice(0, 30);
  const blocks: ReportBlock[] = [
    {
      kind: "text",
      text:
        total > 0
          ? `Observações já salvas no app: ${fmtNumber(total)}. Recorte: últimas duas observações por assunto. Nenhuma coleta ao vivo foi feita na geração.`
          : "Sem observações salvas no app. Nenhuma tendência é inferida e nenhuma coleta ao vivo foi feita na geração.",
      style: "muted",
    },
  ];
  if (!rows.length) return blocks;

  blocks.push({
    kind: "table",
    headers: ["assunto", "métrica", "obs.", "dif.", "%", "/h", "status"],
    rows: rows.map((r) => [
      r.topic,
      cell(r.metric),
      `${fmtNumber(r.observations_in_frame)}/${fmtNumber(r.observations)}`,
      fmtNumber(r.delta_views),
      fmtPct(r.growth_pct),
      fmtNumber(r.views_per_hour),
      cell(r.status),
    ]),
  });
  const reasons = rows
    .filter((r) => r.reason && r.status !== "ok" && r.status !== "measured")
    .slice(0, 6);
  for (const r of reasons)
    blocks.push({ kind: "text", text: `${r.topic}: ${r.reason}`, style: "muted" });
  if (input.trendRows.length > rows.length) {
    blocks.push({
      kind: "text",
      text: `Mostrando ${rows.length} de ${input.trendRows.length} assuntos; os demais ficam fora deste PDF.`,
      style: "muted",
    });
  }
  return blocks;
}

function narrativeBlocks(input: SalesReportInput): ReportBlock[] {
  const heading: ReportBlock = { kind: "text", text: "4. Leitura por IA", style: "heading" };
  if (input.narrativeError) {
    return [
      heading,
      {
        kind: "text",
        text: `A IA não completou a leitura: ${input.narrativeError}. Os números acima permanecem determinísticos.`,
        style: "muted",
      },
    ];
  }
  const n = input.narrative;
  if (!n) return [];

  const blocks: ReportBlock[] = [
    heading,
    {
      kind: "text",
      text: "Texto editorial gerado pela IA somente a partir dos dados desta sessão; não é novo cálculo nem prova comercial.",
      style: "muted",
    },
    { kind: "text", text: `Resumo: ${n.resumo}`, style: "body" },
  ];

  const addList = (label: string, items: string[]) => {
    if (!items.length) return;
    blocks.push({ kind: "text", text: label, style: "heading" });
    for (const item of items) blocks.push({ kind: "text", text: `- ${item}`, style: "body" });
  };
  addList("Destaques", n.destaques);
  addList("Pontos de atenção", n.atencao);
  addList("Próximos passos", n.proximos_passos);
  return blocks;
}

/** Builds the document model consumed by `renderPrintHtml`. */
export function buildSalesReport(input: SalesReportInput): ReportDocument {
  const blocks: ReportBlock[] = [
    { kind: "text", text: "Como ler este relatório", style: "heading" },
    {
      kind: "text",
      text: "Todo número foi calculado por código a partir dos valores informados nesta sessão. Resultados não executados aparecem como ausentes — sem zeros inventados, sem projeções e sem coleta de RSS na geração. A seção opcional de IA é apenas leitura editorial desses mesmos fatos: se a IA falhar, o PDF traz o aviso e segue determinístico.",
      style: "muted",
    },
    { kind: "space", points: 4 },
    { kind: "text", text: "1. Vendas", style: "heading" },
    paramsBlock(input.salesParams),
    { kind: "space", points: 4 },
    ...outcomeBlocks(
      input.sales,
      "Nenhum cálculo de vendas executado nesta sessão. Nenhum valor é apresentado.",
      SALES_FIELDS,
    ),
    { kind: "space", points: 8 },
    { kind: "text", text: "2. Funil", style: "heading" },
    ...outcomeBlocks(
      input.funnel,
      "Nenhum diagnóstico de funil executado nesta sessão. Nenhum valor é apresentado.",
      FUNNEL_FIELDS,
      { key: "rates", fields: RATE_FIELDS, label: "taxas" },
    ),
    { kind: "space", points: 8 },
    { kind: "text", text: "3. Tendências do momento", style: "heading" },
    ...trendsBlocks(input),
    ...(input.narrative || input.narrativeError ? narrativeBlocks(input) : []),
  ];
  return {
    title: "Relatório de vendas",
    subtitle: "CentralIA · vendas, funil e tendências salvas",
    generatedAt: input.generatedAt,
    blocks,
  };
}
