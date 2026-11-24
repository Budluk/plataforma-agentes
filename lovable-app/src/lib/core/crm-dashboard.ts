// Commercial dashboard readings from rows supplied by the caller. Pure: no
// fetch, no clock, no random data. Missing base means sem_dados, never zero.

import {
  bucketStart,
  DASHBOARD_TIMEZONE,
  periodCounts,
  round2,
  targetProgress,
  timestampMs,
  type Bucket,
  type PeriodCount,
} from "./dashboard";

export const COMMERCIAL_TIMEZONE = DASHBOARD_TIMEZONE;

export interface LeadRow {
  id: string;
  created_at: string;
  status: string;
  source?: string | null;
  owner?: string | null;
}

export interface OpportunityRow {
  id: string;
  created_at: string;
  stage: string;
  amount_cents: number;
  probability?: number | null;
  owner?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  expected_close_date?: string | null;
  loss_reason?: string | null;
}

export interface ActivityRow {
  id: string;
  kind: string;
  due_at: string | null;
  completed_at?: string | null;
  owner?: string | null;
}

export interface OrderRow {
  id: string;
  created_at: string;
  amount_cents: number;
  product?: string | null;
  owner?: string | null;
  customer_id?: string | null;
  /** Closing instant of the sale; absent means no conversion time can be measured. */
  won_at?: string | null;
}

export interface CommercialInput {
  leads: readonly LeadRow[];
  opportunities: readonly OpportunityRow[];
  activities: readonly ActivityRow[];
  orders: readonly OrderRow[];
  /** Explicit instant supplied by the caller; the renderer never reads the clock. */
  asOf: Date | number | string;
  /** Revenue target in BRL cents. Null means there is no goal to compare. */
  revenueTargetCents?: number | null;
}

export type MetricStatus = "medido" | "sem_dados";

export interface Metric<T> {
  status: MetricStatus;
  value: T | null;
  reason: string;
}

const metric = <T>(value: T, reason: string): Metric<T> => ({ status: "medido", value, reason });
const empty = <T>(reason: string): Metric<T> => ({ status: "sem_dados", value: null, reason });

const QUALIFIED = new Set(["qualificado", "qualificada", "qualified", "qualificacao"]);
const NEGOTIATION = new Set(["negociacao", "negotiation", "negociação"]);
const OPEN_STAGES = new Set(["venda_ganha", "venda_perdida", "won", "lost"]);

const validCents = (v: number) => Number.isSafeInteger(v) && v >= 0;

export interface CommercialOverview {
  generatedAt: string;
  timezone: string;
  totalLeads: Metric<number>;
  newLeadsToday: Metric<number>;
  qualifiedLeads: Metric<number>;
  inNegotiation: Metric<number>;
  convertedCustomers: Metric<number>;
  completedSales: Metric<number>;
  pipelineValueCents: Metric<number>;
  realizedRevenueCents: Metric<number>;
  conversionRatePct: Metric<number>;
  avgTicketCents: Metric<number>;
  avgConversionDays: Metric<number>;
  pendingActivities: Metric<number>;
  overdueFollowUps: Metric<number>;
  goal: ReturnType<typeof targetProgress>;
  reason: string;
}

/** Builds the headline dashboard. Every value is derived from supplied rows. */
export function buildCommercialOverview(input: CommercialInput): CommercialOverview {
  const nowMs = timestampMs(input.asOf);
  if (nowMs === null) throw new Error("asOf deve ser um timestamp válido");
  const generatedAt = new Date(nowMs).toISOString();
  const { leads, opportunities, activities, orders } = input;

  const totalLeads = leads.length
    ? metric(leads.length, `${leads.length} lead(s) na base informada.`)
    : empty<number>("Nenhum lead informado.");

  const today = bucketStart(nowMs, "day");
  const newToday = leads.filter((l) => {
    const ms = timestampMs(l.created_at);
    return ms !== null && ms >= today;
  }).length;
  const newLeadsToday = leads.length
    ? metric(newToday, `${newToday} lead(s) criados no dia informado.`)
    : empty<number>("Nenhum lead informado.");

  const qualified = leads.filter((l) => QUALIFIED.has(l.status.trim().toLowerCase())).length;
  const qualifiedLeads = leads.length
    ? metric(qualified, `${qualified} lead(s) qualificados na base informada.`)
    : empty<number>("Nenhum lead informado.");

  const negotiating = opportunities.filter((o) =>
    NEGOTIATION.has(o.stage.trim().toLowerCase()),
  ).length;
  const inNegotiation = opportunities.length
    ? metric(negotiating, `${negotiating} oportunidade(s) em negociação.`)
    : empty<number>("Nenhuma oportunidade informada.");

  const validOrders = orders.filter((o) => validCents(o.amount_cents));
  const ignoredOrders = orders.length - validOrders.length;
  const distinctCustomers = new Set(
    validOrders.map((o) => o.customer_id?.trim()).filter((v): v is string => Boolean(v)),
  ).size;
  const customerCount = distinctCustomers || validOrders.length;
  const convertedCustomers = validOrders.length
    ? metric(
        customerCount,
        `${customerCount} cliente(s) distinto(s) em ${validOrders.length} venda(s) concluída(s); sem customer_id, cada venda conta como um cliente.`,
      )
    : empty<number>("Nenhuma venda concluída informada.");
  const completedSales = validOrders.length
    ? metric(validOrders.length, `${validOrders.length} venda(s) concluída(s) com valor válido.`)
    : empty<number>("Nenhuma venda concluída informada.");
  const revenue = validOrders.reduce((s, o) => s + o.amount_cents, 0);
  const realizedRevenueCents = validOrders.length
    ? metric(
        revenue,
        `${validOrders.length} venda(s) somam ${revenue} centavos${ignoredOrders ? `; ${ignoredOrders} valor(es) inválido(s) descartado(s)` : ""}.`,
      )
    : empty<number>("Nenhuma venda com valor válido informada.");

  const open = opportunities.filter(
    (o) => !OPEN_STAGES.has(o.stage.trim().toLowerCase()) && validCents(o.amount_cents),
  );
  const pipeline = open.reduce((s, o) => s + o.amount_cents, 0);
  const pipelineValueCents = open.length
    ? metric(pipeline, `${open.length} oportunidade(s) aberta(s) somam ${pipeline} centavos.`)
    : empty<number>("Nenhuma oportunidade aberta com valor válido.");

  const conversionRatePct =
    leads.length && validOrders.length
      ? metric(
          round2((validOrders.length / leads.length) * 100),
          `${validOrders.length} venda(s) sobre ${leads.length} lead(s).`,
        )
      : empty<number>("Sem leads ou vendas suficientes para calcular conversão.");

  const avgTicketCents = validOrders.length
    ? metric(
        Math.round(revenue / validOrders.length),
        `Receita dividida por ${validOrders.length} venda(s).`,
      )
    : empty<number>("Sem vendas válidas para calcular ticket médio.");

  const durations = validOrders
    .map((o) => {
      const start = timestampMs(o.created_at);
      const end = o.won_at ? timestampMs(o.won_at) : null;
      return start !== null && end !== null && end >= start ? (end - start) / 86_400_000 : null;
    })
    .filter((d): d is number => d !== null);
  const avgConversionDays = durations.length
    ? metric(
        round2(durations.reduce((s, d) => s + d, 0) / durations.length),
        `${durations.length} intervalo(s) medido(s) entre criação e fechamento.`,
      )
    : empty<number>("Sem datas de criação e fechamento suficientes.");

  const pending = activities.filter((a) => !a.completed_at);
  const pendingActivities = activities.length
    ? metric(
        pending.length,
        `${pending.length} atividade(s) pendente(s) de ${activities.length} informada(s).`,
      )
    : empty<number>("Nenhuma atividade informada.");

  const overdue = pending.filter((a) => {
    const ms = a.due_at ? timestampMs(a.due_at) : null;
    return ms !== null && ms < nowMs;
  });
  const overdueFollowUps = activities.length
    ? metric(overdue.length, `${overdue.length} atividade(s) pendente(s) com prazo vencido.`)
    : empty<number>("Nenhuma atividade informada.");

  const goal = targetProgress(
    validOrders.length ? revenue : null,
    input.revenueTargetCents ?? null,
  );

  return {
    generatedAt,
    timezone: COMMERCIAL_TIMEZONE,
    totalLeads,
    newLeadsToday,
    qualifiedLeads,
    inNegotiation,
    convertedCustomers,
    completedSales,
    pipelineValueCents,
    realizedRevenueCents,
    conversionRatePct,
    avgTicketCents,
    avgConversionDays,
    pendingActivities,
    overdueFollowUps,
    goal,
    reason: `Leituras calculadas somente com as linhas informadas. Exibição em ${COMMERCIAL_TIMEZONE}; nenhum número foi inferido.`,
  };
}

// ---------------- Series for charts ----------------

export interface NameCount {
  name: string;
  count: number;
}

export interface NameSum {
  name: string;
  amount_cents: number;
}

export interface CommercialSeries {
  salesByPeriod: { bucket: Bucket; items: PeriodCount[]; invalid: number };
  monthlyRevenue: { bucket: Bucket; items: PeriodCount[]; invalid: number };
  conversionByStage: NameCount[];
  leadsBySource: NameCount[];
  topProducts: NameSum[];
  agentPerformance: {
    status: MetricStatus;
    rows: {
      owner: string;
      opportunities: number;
      won: number;
      revenue_cents: number;
      conversion_pct: number;
    }[];
    reason: string;
  };
  lossReasons: NameCount[];
}

function countBy(values: readonly (string | null | undefined)[]): NameCount[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? "").trim() || "não informado";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
}

/** Chart-ready series. Empty bases produce empty arrays with explicit notes. */
export function buildCommercialSeries(
  input: CommercialInput,
  bucket: Bucket = "day",
): CommercialSeries {
  const salesByPeriod = periodCounts(
    input.orders.map((o) => ({ ts: o.created_at })),
    bucket,
  );
  const monthlyRevenue = periodCounts(
    input.orders.map((o) => ({ ts: o.created_at })),
    "month",
  );
  const conversionByStage = countBy(input.opportunities.map((o) => o.stage));
  const leadsBySource = countBy(input.leads.map((l) => l.source));
  const lossReasons = countBy(
    input.opportunities.filter((o) => o.lost_at).map((o) => o.loss_reason),
  );

  const productMap = new Map<string, number>();
  for (const o of input.orders) {
    if (!validCents(o.amount_cents)) continue;
    const name = (o.product ?? "").trim() || "não informado";
    productMap.set(name, (productMap.get(name) ?? 0) + o.amount_cents);
  }
  const topProducts = [...productMap]
    .map(([name, amount_cents]) => ({ name, amount_cents }))
    .sort((a, b) => b.amount_cents - a.amount_cents || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 10);

  const owners = new Set<string>();
  for (const o of input.opportunities) if (o.owner?.trim()) owners.add(o.owner.trim());
  for (const o of input.orders) if (o.owner?.trim()) owners.add(o.owner.trim());
  const rows = [...owners]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((owner) => {
      const opps = input.opportunities.filter((o) => o.owner?.trim() === owner);
      const won = input.orders.filter(
        (o) => o.owner?.trim() === owner && validCents(o.amount_cents),
      );
      const revenue_cents = won.reduce((s, o) => s + o.amount_cents, 0);
      return {
        owner,
        opportunities: opps.length,
        won: won.length,
        revenue_cents,
        conversion_pct: opps.length ? round2((won.length / opps.length) * 100) : 0,
      };
    });

  return {
    salesByPeriod,
    monthlyRevenue,
    conversionByStage,
    leadsBySource,
    topProducts,
    lossReasons,
    agentPerformance: rows.length
      ? {
          status: "medido",
          rows,
          reason: "Agrupado pelo responsável informado; vendas sem responsável não entram.",
        }
      : {
          status: "sem_dados",
          rows: [],
          reason: "Nenhum responsável informado em oportunidades ou vendas.",
        },
  };
}
