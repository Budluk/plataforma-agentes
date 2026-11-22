// Pure commercial intelligence contracts for Fase 9. No I/O, no clock, no
// database, no network and no execution tools. This module only consolidates
// readings ALREADY computed by other pure modules and supplied by the caller.
// It never recomputes a metric, never fills a missing value and never presents
// an illustrative source as real data.

import { z } from "zod";
import { canonical, sha256hex } from "./canonical";
import {
  AUTONOMY_LEVELS,
  checkCommercialTool,
  formatBRLFromCents,
  type AutonomyLevel,
} from "./comercial";
import { authorizeCommercialAction } from "./commercial-agents";
import { round2, timestampMs } from "./dashboard";
import { renderPrintHtml } from "./print-report";
import type { ReportDocument } from "./report";

export const INTELLIGENCE_TIMEZONE = "America/Sao_Paulo";
export const INTELLIGENCE_SAMPLE_LABEL =
  "AMOSTRA — dado ilustrativo, não é produto, preço, cliente, venda ou tendência real";

export const READING_STATUSES = ["medido", "parcial", "sem_dados"] as const;
export const SEVERITIES = ["alta", "media", "baixa", "informativa"] as const;
export type Severity = (typeof SEVERITIES)[number];

const ID = z.string().trim().min(1).max(64);
const LABEL = z.string().trim().min(1).max(160);
const SHORT = z.string().trim().min(1).max(300);
const MODULES = ["dashboard", "series", "funil", "analytics", "tendencias", "propostas", "crm"] as const;

/** Editorial prose cannot carry digits: no invented amount, date or percentage. */
const NO_DIGITS = z.string().trim().min(8).max(500).regex(/^[^0-9]+$/, "texto editorial não pode conter números");

export const MetricReading = z
  .object({
    key: ID,
    label: LABEL,
    status: z.enum(["medido", "sem_dados"]),
    /** Already formatted by the caller; never reinterpreted or recalculated. */
    valor: z.string().trim().max(160).nullable(),
    unidade: z.enum(["centavos", "reais", "contagem", "percentual", "dias", "texto"]).default("texto"),
    severidade: z.enum(SEVERITIES).default("informativa"),
  })
  .strict();
export type MetricReading = z.infer<typeof MetricReading>;

export const SupplyReading = z
  .object({
    id: ID,
    modulo: z.enum(MODULES),
    fonte: LABEL,
    status: z.enum(["medido", "sem_dados"]),
    /** Optional per-source tenant/instant; when present they must match exactly. */
    organizationId: z.string().trim().min(1).max(64).nullable().default(null),
    asOf: z.union([z.string().trim().min(1).max(60), z.number().positive(), z.coerce.date()]).nullable().default(null),
    amostra: z.boolean().default(false),
    metricas: z.array(MetricReading).min(1).max(40),
    reasons: z.array(SHORT).max(8).default([]),
  })
  .strict();
export type SupplyReading = z.infer<typeof SupplyReading>;

/** Monetary claims are declared by the caller as representing the same concept. */
export const MoneyClaim = z
  .object({
    conceito: z.enum(["receita_realizada", "valor_pipeline", "ticket_medio", "receita_rfm"]),
    cents: z.number().int().nonnegative(),
    fonteId: ID,
  })
  .strict();
export type MoneyClaim = z.infer<typeof MoneyClaim>;

export const IntelligenceNarrativeSchema = z
  .object({
    resumo: NO_DIGITS,
    observacoes: z
      .array(
        z
          .object({
            achadoId: ID,
            texto: NO_DIGITS.max(240),
          })
          .strict(),
      )
      .max(5)
      .default([]),
    limites: z.array(NO_DIGITS.max(200)).max(5).default([]),
  })
  .strict();
export type IntelligenceNarrative = z.infer<typeof IntelligenceNarrativeSchema>;

export interface Finding {
  id: string;
  fonteId: string;
  fonte: string;
  modulo: string;
  metricKey: string;
  label: string;
  valor: string;
  unidade: string;
  severidade: Severity;
  status: "medido";
  reason: string;
}

export interface Gap {
  fonteId: string;
  fonte: string;
  metricKey: string;
  label: string;
  status: "sem_dados";
  reason: string;
}

export interface Divergence {
  conceito: string;
  fonteIds: string[];
  valores: string[];
  status: "divergente";
  reason: string;
}

export interface IntelligenceAuditRecord {
  organization_id: string;
  as_of: string;
  status: "medido" | "parcial" | "sem_dados";
  fonte_count: number;
  achado_count: number;
  lacuna_count: number;
  divergencia_count: number;
  amostra_count: number;
  reasons: string[];
}

export interface IntelligenceReading {
  organization_id: string;
  as_of: string;
  timezone: string;
  reading_id: string;
  status: "medido" | "parcial" | "sem_dados";
  /** Counts only: medido metrics over non-sample metrics. Null when no base. */
  cobertura_pct: number | null;
  fontes: { id: string; modulo: string; fonte: string; status: string; amostra: boolean }[];
  achados: Finding[];
  lacunas: Gap[];
  divergencias: Divergence[];
  amostras: { fonteId: string; rotulo: string }[];
  narrativa: {
    status: "sem_camada" | "gerada" | "falhou" | "sem_permissao";
    reason: string;
    dados: IntelligenceNarrative | null;
  };
  /** Always false: this phase has no send, campaign, checkout or payment tool. */
  canSend: false;
  canExecute: false;
  requiresApproval: boolean;
  reasons: string[];
  audit: IntelligenceAuditRecord;
}

export interface ConsolidateInput {
  organizationId: string;
  asOf: Date | number | string;
  leituras: unknown[];
  /** Optional; only monetary claims the caller declares comparable. */
  claims?: unknown[];
  grantActions: readonly string[];
  autonomy: AutonomyLevel;
  killEngaged?: boolean;
  /** Read-only editorial layer; numbers are forbidden inside the prose. */
  narrative?: unknown;
  narrativeError?: string | null;
  maxAchados?: number;
}

const AUTHORIZED_TOOLS = ["ler_dashboard", "gerar_leitura"] as const;
const SEVERITY_RANK: Record<Severity, number> = { alta: 0, media: 1, baixa: 2, informativa: 3 };

/** Ids, counts and statuses only: no prose, no customer ids, no values. */
export function redactIntelligenceAudit(
  reading: Pick<
    IntelligenceReading,
    | "organization_id"
    | "as_of"
    | "status"
    | "fontes"
    | "achados"
    | "lacunas"
    | "divergencias"
    | "amostras"
    | "reasons"
  >,
): IntelligenceAuditRecord {
  return {
    organization_id: reading.organization_id,
    as_of: reading.as_of,
    status: reading.status,
    fonte_count: reading.fontes.length,
    achado_count: reading.achados.length,
    lacuna_count: reading.lacunas.length,
    divergencia_count: reading.divergencias.length,
    amostra_count: reading.amostras.length,
    reasons: reading.reasons.slice(0, 8).map((r) => r.slice(0, 200)),
  };
}

function findLabel(cents: number): string {
  return formatBRLFromCents(cents);
}

/**
 * Consolidates supplied readings into one deterministic, read-only leitura.
 * Returns null-like `sem_dados` shapes instead of throwing on absent data;
 * throws only on invalid tenant, instant, schema or authorization inputs.
 */
export async function consolidateIntelligence(input: ConsolidateInput): Promise<IntelligenceReading> {
  const organizationId = input.organizationId.trim();
  if (!organizationId || organizationId.length > 64)
    throw new Error("organization_id inválido; nenhuma leitura foi consolidada");
  if (!(AUTONOMY_LEVELS as readonly string[]).includes(input.autonomy))
    throw new Error("nível de autonomia inválido; nenhuma leitura foi consolidada");
  if (!Array.isArray(input.leituras) || input.leituras.length > 20)
    throw new Error("leituras devem ser uma lista de até 20 itens");
  for (const tool of AUTHORIZED_TOOLS) {
    if (!checkCommercialTool(tool).allowed)
      throw new Error(`ferramenta '${tool}' vetada pelo hard gate; nenhuma leitura foi consolidada`);
  }

  const readAuth = authorizeCommercialAction({
    agent: "insights_agent",
    action: "ler_dashboard",
    grantActions: input.grantActions,
    autonomy: input.autonomy,
    ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
  });
  const reasons: string[] = [...readAuth.reasons];
  let requiresApproval = readAuth.requiresApproval;
  const base: Omit<IntelligenceReading, "reading_id"> = {
    organization_id: organizationId,
    as_of: new Date(0).toISOString(),
    timezone: INTELLIGENCE_TIMEZONE,
    status: "sem_dados" as const,
    cobertura_pct: null,
    fontes: [] as IntelligenceReading["fontes"],
    achados: [] as Finding[],
    lacunas: [] as Gap[],
    divergencias: [] as Divergence[],
    amostras: [] as IntelligenceReading["amostras"],
    narrativa: {
      status: "sem_camada" as const,
      reason: "Nenhuma camada editorial foi informada; a leitura permanece determinística.",
      dados: null,
    },
    canSend: false as const,
    canExecute: false as const,
    requiresApproval,
    reasons,
    audit: {
      organization_id: organizationId,
      as_of: new Date(0).toISOString(),
      status: "sem_dados" as const,
      fonte_count: 0,
      achado_count: 0,
      lacuna_count: 0,
      divergencia_count: 0,
      amostra_count: 0,
      reasons: [],
    },
  };
  const finish = async (value: Omit<IntelligenceReading, "reading_id">): Promise<IntelligenceReading> => {
    const audit = redactIntelligenceAudit(value);
    const readingId = await sha256hex(
      canonical({
        organization_id: value.organization_id,
        as_of: value.as_of,
        fontes: value.fontes.map((f) => f.id),
        achados: value.achados.map((a) => [a.id, a.fonteId, a.metricKey, a.valor]),
        lacunas: value.lacunas.map((g) => [g.fonteId, g.metricKey]),
        divergencias: value.divergencias.map((d) => [d.conceito, d.fonteIds, d.valores]),
        amostras: value.amostras.map((s) => s.fonteId),
      }),
    );
    return { ...value, reading_id: readingId, audit: { ...audit, as_of: value.as_of } };
  };

  if (input.killEngaged === true) {
    reasons.push("kill switch global ativo: nenhuma leitura foi consolidada");
    return finish({ ...base, requiresApproval: false, reasons });
  }
  if (!readAuth.allowed && !readAuth.requiresApproval)
    return finish({ ...base, requiresApproval: false, reasons });

  const asOfMs = timestampMs(input.asOf);
  if (asOfMs === null) throw new Error("asOf inválido; nenhuma leitura foi consolidada");
  const asOf = new Date(asOfMs).toISOString();

  const parsedReadings: SupplyReading[] = [];
  const sourceIds = new Set<string>();
  for (const raw of input.leituras) {
    const parsed = SupplyReading.safeParse(raw);
    if (!parsed.success) throw new Error("leitura inválida; nenhuma consolidação foi feita");
    const r = parsed.data;
    if (sourceIds.has(r.id)) throw new Error(`fonte duplicada: '${r.id}'`);
    sourceIds.add(r.id);
    if (r.organizationId && r.organizationId.trim() !== organizationId)
      throw new Error(`fonte '${r.id}' pertence a outro tenant; nenhuma consolidação foi feita`);
    if (r.asOf !== null) {
      const sourceMs = timestampMs(r.asOf);
      if (sourceMs === null || sourceMs !== asOfMs)
        throw new Error(`fonte '${r.id}' tem instante divergente; nenhuma consolidação mista foi feita`);
    }
    parsedReadings.push(r);
  }
  if (!parsedReadings.length) {
    reasons.push("nenhuma leitura informada; nada foi consolidado");
    return finish({ ...base, as_of: asOf, reasons });
  }

  const maxAchados = input.maxAchados ?? 20;
  if (!Number.isInteger(maxAchados) || maxAchados < 1 || maxAchados > 50)
    throw new Error("max_achados deve ser inteiro entre 1 e 50");

  const achados: Finding[] = [];
  const lacunas: Gap[] = [];
  const amostras: IntelligenceReading["amostras"] = [];
  let measuredMetrics = 0;
  let totalMetrics = 0;

  for (const r of parsedReadings) {
    if (r.amostra) {
      amostras.push({ fonteId: r.id, rotulo: INTELLIGENCE_SAMPLE_LABEL });
      continue;
    }
    for (const m of r.metricas) {
      totalMetrics++;
      if (m.status === "medido" && m.valor !== null) {
        measuredMetrics++;
        achados.push({
          id: `A${achados.length + 1}`,
          fonteId: r.id,
          fonte: r.fonte,
          modulo: r.modulo,
          metricKey: m.key,
          label: m.label,
          valor: m.valor,
          unidade: m.unidade,
          severidade: m.severidade,
          status: "medido",
          reason: `Valor informado por '${r.fonte}' e não recalculado nesta camada.`,
        });
      } else {
        lacunas.push({
          fonteId: r.id,
          fonte: r.fonte,
          metricKey: m.key,
          label: m.label,
          status: "sem_dados",
          reason: `A fonte informou 'sem_dados' para esta métrica; nenhum valor foi inferido.`,
        });
      }
    }
  }

  achados.sort(
    (a, b) =>
      SEVERITY_RANK[a.severidade] - SEVERITY_RANK[b.severidade] ||
      a.fonteId.localeCompare(b.fonteId, "pt-BR") ||
      a.metricKey.localeCompare(b.metricKey, "pt-BR"),
  );
  for (const [index, a] of achados.entries()) a.id = `A${index + 1}`;
  const keptAchados = achados.slice(0, maxAchados);

  const divergencias: Divergence[] = [];
  if (input.claims !== undefined) {
    if (!Array.isArray(input.claims) || input.claims.length > 40)
      throw new Error("claims devem ser uma lista de até 40 itens");
    const byConcept = new Map<string, MoneyClaim[]>();
    for (const raw of input.claims) {
      const claim = MoneyClaim.safeParse(raw);
      if (!claim.success) throw new Error("claim monetário inválido; nenhuma consolidação foi feita");
      if (!sourceIds.has(claim.data.fonteId))
        throw new Error(`claim refere-se a fonte não informada: '${claim.data.fonteId}'`);
      const list = byConcept.get(claim.data.conceito) ?? [];
      list.push(claim.data);
      byConcept.set(claim.data.conceito, list);
    }
    for (const [conceito, claims] of [...byConcept].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))) {
      if (claims.length < 2) continue;
      const valores = claims.map((c) => findLabel(c.cents));
      if (new Set(claims.map((c) => c.cents)).size === 1) continue;
      divergencias.push({
        conceito,
        fonteIds: claims.map((c) => c.fonteId),
        valores,
        status: "divergente",
        reason: `Fontes declaradas como equivalentes para '${conceito}' divergem; nenhum valor foi escolhido como correto.`,
      });
    }
  }

  const nonSampleSources = parsedReadings.filter((r) => !r.amostra);
  const status: IntelligenceReading["status"] =
    divergencias.length || lacunas.length || (amostras.length && nonSampleSources.length)
      ? "parcial"
      : keptAchados.length
        ? "medido"
        : "sem_dados";

  let narrativa: IntelligenceReading["narrativa"] = {
    status: "sem_camada",
    reason: "Nenhuma camada editorial foi informada; a leitura permanece determinística.",
    dados: null,
  };
  const hasNarrativeLayer = input.narrative !== undefined || input.narrativeError != null;
  if (hasNarrativeLayer) {
    const genAuth = authorizeCommercialAction({
      agent: "insights_agent",
      action: "gerar_leitura",
      grantActions: input.grantActions,
      autonomy: input.autonomy,
      ...(input.killEngaged === undefined ? {} : { killEngaged: input.killEngaged }),
    });
    if (genAuth.requiresApproval) requiresApproval = true;
    if (!genAuth.allowed && !genAuth.requiresApproval) {
      narrativa = {
        status: "sem_permissao",
        reason: "Sem permissão para gerar leitura editorial; os números determinísticos permanecem.",
        dados: null,
      };
      reasons.push(...genAuth.reasons);
    } else if (input.narrativeError) {
      narrativa = {
        status: "falhou",
        reason: `A IA não completou a leitura: ${input.narrativeError.slice(0, 200)}. Nenhum número foi alterado.`,
        dados: null,
      };
    } else {
      const parsedNarrative = IntelligenceNarrativeSchema.safeParse(input.narrative);
      if (!parsedNarrative.success) {
        narrativa = {
          status: "falhou",
          reason: "A saída da IA não passou no contrato rígido; nenhum texto foi publicado na leitura.",
          dados: null,
        };
      } else {
        const known = new Set(keptAchados.map((a) => a.id));
        if (parsedNarrative.data.observacoes.some((o) => !known.has(o.achadoId))) {
          narrativa = {
            status: "falhou",
            reason: "A IA referenciou um achado inexistente; nenhum texto foi publicado na leitura.",
            dados: null,
          };
        } else {
          narrativa = {
            status: "gerada",
            reason: "Texto editorial sem números, vinculado a achados existentes; não altera cálculos.",
            dados: parsedNarrative.data,
          };
        }
      }
    }
  }

  reasons.push(
    "Somente leituras já calculadas e informadas pelo chamador foram consolidadas; nenhum número foi inventado.",
    ...(divergencias.length ? ["Divergências monetárias permanecem sem resolução automática."] : []),
    ...amostras.map(() => INTELLIGENCE_SAMPLE_LABEL),
  );

  const value: IntelligenceReading = {
    organization_id: organizationId,
    as_of: asOf,
    timezone: INTELLIGENCE_TIMEZONE,
    reading_id: "",
    status,
    cobertura_pct: totalMetrics ? round2((measuredMetrics / totalMetrics) * 100) : null,
    fontes: parsedReadings.map((r) => ({
      id: r.id,
      modulo: r.modulo,
      fonte: r.fonte,
      status: r.status,
      amostra: r.amostra,
    })),
    achados: keptAchados,
    lacunas,
    divergencias,
    amostras,
    narrativa,
    canSend: false,
    canExecute: false,
    requiresApproval,
    reasons,
    audit: {
      organization_id: organizationId,
      as_of: asOf,
      status,
      fonte_count: parsedReadings.length,
      achado_count: keptAchados.length,
      lacuna_count: lacunas.length,
      divergencia_count: divergencias.length,
      amostra_count: amostras.length,
      reasons: [],
    },
  };
  return finish(value);
}

// ---------------- Browser-printable report ----------------

export interface IntelligenceReportInput {
  reading: IntelligenceReading;
  generatedAt: string;
}

/** Same document model used by the sales and proposal PDF paths. */
export function buildIntelligenceReport(input: IntelligenceReportInput): ReportDocument {
  const r = input.reading;
  const blocks: ReportDocument["blocks"] = [
    { kind: "text", text: "Como ler esta leitura", style: "heading" },
    {
      kind: "text",
      text: "Consolidação de leituras já calculadas e informadas pelo chamador. Nenhum número foi recalculado, estimado ou preenchido com zero. Valores ausentes aparecem como lacunas.",
      style: "muted",
    },
    { kind: "space", points: 4 },
    { kind: "text", text: "1. Fontes e cobertura", style: "heading" },
    {
      kind: "table",
      headers: ["fonte", "módulo", "status", "amostra"],
      rows: r.fontes.map((f) => [f.fonte, f.modulo, f.status, f.amostra ? "sim" : "não"]),
    },
    {
      kind: "text",
      text: `Cobertura: ${r.cobertura_pct === null ? "sem base informada" : `${r.cobertura_pct}%`} de métricas medidas entre as fontes reais informadas.`,
      style: "muted",
    },
    { kind: "space", points: 6 },
    { kind: "text", text: "2. Achados com evidência", style: "heading" },
    {
      kind: "table",
      headers: ["id", "severidade", "fonte", "indicador", "valor"],
      rows: r.achados.length
        ? r.achados.map((a) => [a.id, a.severidade, a.fonte, a.label, a.valor])
        : [["—", "—", "—", "Nenhum achado medido", "—"]],
    },
    { kind: "space", points: 6 },
    { kind: "text", text: "3. Divergências", style: "heading" },
    {
      kind: "table",
      headers: ["conceito", "fontes", "valores"],
      rows: r.divergencias.length
        ? r.divergencias.map((d) => [d.conceito, d.fonteIds.join(", "), d.valores.join(" × ")])
        : [["—", "—", "Nenhuma divergência declarada"]],
    },
    { kind: "space", points: 6 },
    { kind: "text", text: "4. Lacunas sem dados", style: "heading" },
    {
      kind: "table",
      headers: ["fonte", "indicador", "motivo"],
      rows: r.lacunas.length
        ? r.lacunas.map((g) => [g.fonte, g.label, g.reason])
        : [["—", "—", "Nenhuma lacuna informada"]],
    },
    { kind: "space", points: 6 },
    { kind: "text", text: "5. AMOSTRA e limites", style: "heading" },
    ...(r.amostras.length
      ? r.amostras.map((s) => ({
          kind: "text" as const,
          text: `${s.fonteId}: ${s.rotulo}`,
          style: "muted" as const,
        }))
      : [{ kind: "text" as const, text: "Nenhuma fonte ilustrativa informada.", style: "muted" as const }]),
    {
      kind: "text",
      text: r.canSend || r.canExecute
        ? "Estado inválido: esta leitura não pode executar ações."
        : "Somente leitura: nenhum envio, campanha, checkout, pagamento ou alteração foi executado.",
      style: "body",
    },
    ...(r.narrativa.status === "gerada" && r.narrativa.dados
      ? [
          { kind: "text" as const, text: "6. Leitura editorial da IA", style: "heading" as const },
          {
            kind: "text" as const,
            text: "Texto sem números, gerado apenas a partir dos achados acima; não é novo cálculo nem promessa comercial.",
            style: "muted" as const,
          },
          { kind: "text" as const, text: r.narrativa.dados.resumo, style: "body" as const },
          ...r.narrativa.dados.observacoes.map((o) => ({
            kind: "text" as const,
            text: `${o.achadoId}: ${o.texto}`,
            style: "body" as const,
          })),
          ...r.narrativa.dados.limites.map((l) => ({
            kind: "text" as const,
            text: `Limite: ${l}`,
            style: "muted" as const,
          })),
        ]
      : [
          { kind: "text" as const, text: "6. Leitura editorial da IA", style: "heading" as const },
          { kind: "text" as const, text: r.narrativa.reason, style: "muted" as const },
        ]),
  ];
  return {
    title: "Leitura comercial",
    subtitle: `CentralIA · ${r.organization_id} · ${r.status}`,
    generatedAt: input.generatedAt,
    blocks,
  };
}

/** Convenience export for the browser print window; no automatic print here. */
export function intelligencePrintHtml(input: IntelligenceReportInput): string {
  return renderPrintHtml(buildIntelligenceReport(input));
}

export { formatBRLFromCents };
