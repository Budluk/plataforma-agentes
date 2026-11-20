// Trend observations: measurement only. Growth never means "viral".
export const KNOWN_METRICS = new Set(["views", "search_index", "approx_traffic", "outlier_ratio"]);
export const BEHAVIOR: Record<string, "contador" | "indice" | "faixa"> = {
  views: "contador",
  search_index: "indice",
  approx_traffic: "faixa",
  outlier_ratio: "indice",
};

export interface TrendCandidate {
  source: string;
  subject_id: string;
  topic: string;
  url: string;
  language: string;
  region: string;
  collected_at: Date;
  metric: string;
  views: number | null;
  published_at: Date | null;
}

const LIMITS: Record<string, number> = { source: 80, subject_id: 200, topic: 300, url: 2048, language: 35, region: 20 };

export function validateCandidate(c: TrendCandidate): TrendCandidate {
  for (const [name, limit] of Object.entries(LIMITS)) {
    const v = (c as unknown as Record<string, unknown>)[name];
    if (typeof v !== "string" || !v.trim()) throw new Error(`${name}: texto obrigatorio`);
    if (Array.from(v).length > limit) throw new Error(`${name}: tamanho excedido`);
  }
  let u: URL;
  try {
    u = new URL(c.url);
  } catch {
    throw new Error("url invalida");
  }
  if (c.url !== c.url.trim() || /\s/.test(c.url) || u.protocol !== "https:" || !u.hostname || u.username || u.password || (u.port && u.port !== "443"))
    throw new Error("url deve ser HTTPS sem credenciais");
  if (!(c.collected_at instanceof Date) || Number.isNaN(c.collected_at.getTime())) throw new Error("collected_at obrigatorio");
  if (c.published_at !== null && (!(c.published_at instanceof Date) || Number.isNaN(c.published_at.getTime())))
    throw new Error("published_at deve ser datetime");
  if (!c.metric || !c.metric.trim()) throw new Error("metric: texto obrigatorio");
  if (!KNOWN_METRICS.has(c.metric)) throw new Error(`metric desconhecida: '${c.metric}'`);
  if (c.views !== null && (!Number.isInteger(c.views) || c.views < 0)) throw new Error("views deve ser inteiro nao negativo");
  return c;
}

/** ISO timestamp that must carry a timezone (fail closed otherwise). */
export function parseAwareStamp(raw: string): Date {
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(v)) throw new Error("collected_at exige fuso horario");
    throw new Error(`collected_at invalido: '${v}'`);
  }
  const d = new Date(v.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) throw new Error(`collected_at invalido: '${v}'`);
  return d;
}

export type GrowthStatus = "measured" | "insufficient_data" | "inconsistent_data";
export interface GrowthResult {
  status: GrowthStatus;
  reason: string;
  elapsed_seconds: number;
  delta_views: number | null;
  growth_pct: number | null;
  views_per_hour: number | null;
}

export function compareGrowth(prev: TrendCandidate, cur: TrendCandidate, minIntervalSeconds = 300): GrowthResult {
  if (prev.metric !== cur.metric) throw new Error("Comparacao exige a mesma metrica; visualizacoes e indice nao sao a mesma grandeza");
  if (prev.subject_id !== cur.subject_id) throw new Error("Comparacao exige o mesmo subject_id");
  if (prev.source !== cur.source || prev.language !== cur.language || prev.region !== cur.region)
    throw new Error("Comparacao exige mesma fonte, idioma e regiao");
  if (!Number.isInteger(minIntervalSeconds) || minIntervalSeconds < 1) throw new Error("min_interval_seconds deve ser inteiro positivo");
  const elapsed = (cur.collected_at.getTime() - prev.collected_at.getTime()) / 1000;
  if (elapsed <= 0) throw new Error("A observacao atual deve ser posterior");
  const mode = BEHAVIOR[prev.metric] ?? "indice";
  const base = { elapsed_seconds: elapsed, delta_views: null, growth_pct: null, views_per_hour: null };
  if (prev.views === null || cur.views === null) return { ...base, status: "insufficient_data", reason: "Uma das observacoes nao possui valor" };
  const delta = cur.views - prev.views;
  if (mode === "contador" && delta < 0)
    return { ...base, status: "inconsistent_data", reason: "Contador diminuiu; verificar correcao ou troca de fonte" };
  if (elapsed < minIntervalSeconds) return { ...base, status: "insufficient_data", reason: "Intervalo entre observacoes abaixo do minimo" };
  const pct = prev.views > 0 ? (delta / prev.views) * 100 : null;
  if (mode === "faixa")
    return {
      status: "measured",
      reason: "Variacao de faixa aproximada; nao equivale a contagem exata de buscas",
      elapsed_seconds: elapsed,
      delta_views: delta,
      growth_pct: pct,
      views_per_hour: null,
    };
  return {
    status: "measured",
    reason: "Crescimento medido; nao implica tendencia viral",
    elapsed_seconds: elapsed,
    delta_views: delta,
    growth_pct: pct,
    views_per_hour: delta / (elapsed / 3600),
  };
}

export type WindowMode = "latest" | "window" | "full";
export interface Frame<T> {
  mode: WindowMode;
  previous: T;
  current: T;
  observations: number;
  observations_in_frame: number;
}

export function selectFrame<T extends { collected_at: Date }>(rows: T[], mode: WindowMode = "latest", windowHours = 24): Frame<T> | null {
  if (!["latest", "window", "full"].includes(mode)) throw new Error("mode deve ser latest, window ou full");
  if (!Number.isInteger(windowHours) || windowHours < 1) throw new Error("window_hours deve ser inteiro positivo");
  const ordered = [...rows].sort((a, b) => a.collected_at.getTime() - b.collected_at.getTime());
  const total = ordered.length;
  const first = ordered[0];
  const penultimate = ordered[total - 2];
  const last = ordered[total - 1];
  if (total < 2 || !first || !penultimate || !last) return null;
  if (mode === "latest") return { mode, previous: penultimate, current: last, observations: total, observations_in_frame: 2 };
  if (mode === "full") return { mode, previous: first, current: last, observations: total, observations_in_frame: total };
  const limit = last.collected_at.getTime() - windowHours * 3600 * 1000;
  const inside = ordered.filter((r) => r.collected_at.getTime() >= limit);
  const inFirst = inside[0];
  const inLast = inside[inside.length - 1];
  if (inside.length < 2 || !inFirst || !inLast) return null;
  return { mode, previous: inFirst, current: inLast, observations: total, observations_in_frame: inside.length };
}

export interface ReportRow {
  topic: string;
  url: string;
  source: string;
  subject_id: string;
  metric: string;
  observations: number;
  observations_in_frame: number;
  mode: WindowMode;
  recorte: string;
  status: string;
  reason: string;
  delta_views: number | null;
  growth_pct: number | null;
  views_per_hour: number | null;
}

/** One summary per subject (source + subject_id + language + region), sorted by views/hour. */
export function buildReport(all: TrendCandidate[], mode: WindowMode = "latest", windowHours = 24): ReportRow[] {
  const groups = new Map<string, TrendCandidate[]>();
  const sorted = [...all].sort((a, b) => a.collected_at.getTime() - b.collected_at.getTime());
  for (const r of sorted) {
    const key = [r.source, r.subject_id, r.language, r.region].join("\u0000");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const results: ReportRow[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    if (!first) continue;
    const common = { topic: first.topic, url: first.url, source: first.source, subject_id: first.subject_id, metric: first.metric, observations: rows.length };
    const frame = selectFrame(rows, mode, windowHours);
    if (!frame) {
      results.push({
        ...common,
        observations_in_frame: 0,
        mode,
        recorte: `${mode} (0/${rows.length})`,
        status: "insufficient_history",
        reason: "Menos de duas observacoes no recorte escolhido",
        delta_views: null,
        growth_pct: null,
        views_per_hour: null,
      });
      continue;
    }
    let g: GrowthResult;
    try {
      g = compareGrowth(frame.previous, frame.current);
    } catch (e) {
      results.push({ ...common, observations_in_frame: frame.observations_in_frame, mode, recorte: `${mode} (${frame.observations_in_frame}/${rows.length})`, status: "inconsistent_data", reason: (e as Error).message, delta_views: null, growth_pct: null, views_per_hour: null });
      continue;
    }
    results.push({
      ...common,
      observations_in_frame: frame.observations_in_frame,
      mode: frame.mode,
      recorte: `${frame.mode} (${frame.observations_in_frame}/${rows.length})`,
      status: g.status,
      reason: g.reason,
      delta_views: g.delta_views,
      growth_pct: g.growth_pct,
      views_per_hour: g.views_per_hour,
    });
  }
  results.sort((a, b) => Number(a.views_per_hour === null) - Number(b.views_per_hour === null) || (b.views_per_hour ?? 0) - (a.views_per_hour ?? 0));
  return results;
}

export function filterByTopics<T extends { topic: string }>(cands: T[], allowed: string[], forbidden: string[] = []): T[] {
  for (const [name, list] of [["permitidos", allowed], ["proibidos", forbidden]] as const)
    for (const item of list) if (typeof item !== "string" || !item.trim()) throw new Error(`${name}: item vazio ou nao textual`);
  const block = forbidden.map((p) => p.trim().toLowerCase());
  const pass = allowed.map((p) => p.trim().toLowerCase());
  return cands.filter((c) => {
    const t = c.topic.toLowerCase();
    if (block.some((p) => t.includes(p))) return false;
    if (pass.length && !pass.some((p) => t.includes(p))) return false;
    return true;
  });
}

// ---------------- manual CSV import ----------------
export const CSV_COLUMNS = ["source", "topic", "url", "language", "region", "collected_at", "views"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const t = text.replace(/^\ufeff/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvParseResult {
  candidates: { line: number; candidate: TrendCandidate }[];
  rejected: [number, string][];
}

export function parseObservationsCsv(text: string): CsvParseResult {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("CSV sem cabecalho");
  const header = (rows[0] ?? []).map((h) => h.trim());
  if (header.join(",") !== CSV_COLUMNS.join(",")) throw new Error("cabecalho deve ser exatamente: " + CSV_COLUMNS.join(","));
  const out: CsvParseResult = { candidates: [], rejected: [] };
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    if (!r.some((v) => v.trim())) return;
    try {
      if (r.length !== CSV_COLUMNS.length) throw new Error("numero de colunas diferente do cabecalho");
      const f = Object.fromEntries(CSV_COLUMNS.map((k, i) => [k, r[i] ?? ""]));
      const get = (k: string) => (f[k] ?? "").trim();
      const collectedRaw = get("collected_at");
      if (!collectedRaw) throw new Error("collected_at obrigatorio");
      const collected = parseAwareStamp(collectedRaw);
      const vt = get("views");
      if (vt !== "" && !/^\d+$/.test(vt)) throw new Error("views deve ser inteiro nao negativo ou vazio");
      const source = get("source");
      const url = get("url");
      const cand = validateCandidate({
        source,
        subject_id: `${source}:${url}`,
        topic: get("topic"),
        url,
        language: get("language"),
        region: get("region"),
        collected_at: collected,
        metric: "views",
        views: vt === "" ? null : parseInt(vt, 10),
        published_at: null,
      });
      out.candidates.push({ line, candidate: cand });
    } catch (e) {
      let msg = (e as Error).message;
      if (msg.startsWith("url")) msg = `${msg}: '${(r[2] ?? "").trim()}'`;
      out.rejected.push([line, msg]);
    }
  });
  return out;
}

// ---------------- Google Trends RSS ----------------
export const TRENDS_BASE = "https://trends.google.com";
export const rssUrl = (region: string) => `${TRENDS_BASE}/trending/rss?geo=${region}`;

export function convertTraffic(raw: string): number {
  let s = raw.trim();
  if (s.endsWith("+")) s = s.slice(0, -1).trim();
  if (s.endsWith("+")) throw new Error(`trafego com mais de um sinal: '${raw}'`);
  const t = s.replaceAll(",", "").replaceAll(".", "");
  if (!/^\d+$/.test(t)) throw new Error(`trafego fora do formato: '${raw}'`);
  return parseInt(t, 10);
}

export function slug(text: string): string {
  let s = Array.from(text.trim().toLowerCase(), (c) => (/[\p{L}\p{N}]/u.test(c) ? c : "-")).join("");
  while (s.includes("--")) s = s.replaceAll("--", "-");
  return s.replace(/^-+|-+$/g, "");
}

export const rssIdentity = (term: string, region: string) => `google_trends_rss:${region.toLowerCase()}:${slug(term)}`;

const decodeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** Extracts feed items. A malformed item is dropped without taking down the rest. */
export function readRssItems(xml: string): { title: string; approx_traffic: string; pubDate: string | null }[] {
  if (!xml || !xml.trim()) throw new Error("resposta vazia");
  if (!/<rss[\s>]|<feed[\s>]|<channel[\s>]/.test(xml)) throw new Error("XML invalido");
  const items: { title: string; approx_traffic: string; pubDate: string | null }[] = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const body = (m[1] ?? "").replace(/<ht:news_item\b[\s\S]*?<\/ht:news_item>/g, "");
    const title = decodeXml(/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1] ?? "").trim();
    const traffic = decodeXml(/<(?:[\w-]+:)?approx_traffic\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?approx_traffic>/.exec(body)?.[1] ?? "").trim();
    const pub = /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/.exec(body)?.[1]?.trim() ?? null;
    if (!title) continue;
    items.push({ title, approx_traffic: traffic, pubDate: pub });
  }
  return items;
}

export function translateItem(item: { title: string; approx_traffic: string; pubDate: string | null }, region: string, collectedAt: Date): TrendCandidate {
  const title = item.title.trim();
  if (!title) throw new Error("item sem titulo");
  const views = convertTraffic(item.approx_traffic);
  let published: Date | null = null;
  if (item.pubDate) {
    const d = new Date(item.pubDate);
    published = Number.isNaN(d.getTime()) ? null : d;
  }
  return validateCandidate({
    source: "google_trends_rss",
    subject_id: rssIdentity(title, region),
    topic: title,
    url: rssUrl(region),
    language: "pt-BR",
    region,
    collected_at: collectedAt,
    published_at: published,
    metric: "approx_traffic",
    views,
  });
}
