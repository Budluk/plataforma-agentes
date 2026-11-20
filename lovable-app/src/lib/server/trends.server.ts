import { filterByTopics, readRssItems, rssUrl, translateItem, buildReport, type TrendCandidate, type WindowMode } from "@/lib/core/trends";
import { fetchRss } from "./fetchers.server";
import type { DB } from "./runtime.server";
import { loadPersona } from "./pipelines.server";
import { requireActivePersona } from "@/lib/core/content";

export async function listCandidates(db: DB): Promise<TrendCandidate[]> {
  const { data, error } = await db.from("trend_observations").select("*").order("collected_at").limit(1000);
  if (error) throw new Error("falha ao ler observações");
  return data.map((r) => ({
    source: r.source,
    subject_id: r.subject_id,
    topic: r.topic,
    url: r.url,
    language: r.language,
    region: r.region,
    collected_at: new Date(r.collected_at),
    published_at: r.published_at ? new Date(r.published_at) : null,
    metric: r.metric,
    views: r.views,
  }));
}

/** Returns how many were new; duplicates (same identity and instant) are ignored. */
export async function saveCandidates(db: DB, cands: TrendCandidate[]): Promise<{ inserted: number; duplicates: number }> {
  if (!cands.length) return { inserted: 0, duplicates: 0 };
  const rows = cands.map((c) => ({
    source: c.source,
    subject_id: c.subject_id,
    topic: c.topic,
    url: c.url,
    language: c.language,
    region: c.region,
    collected_at: c.collected_at.toISOString(),
    published_at: c.published_at ? c.published_at.toISOString() : null,
    metric: c.metric,
    views: c.views,
  }));
  const { data, error } = await db
    .from("trend_observations")
    .upsert(rows, { onConflict: "source,subject_id,language,region,collected_at", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error("falha ao gravar observações");
  return { inserted: data.length, duplicates: rows.length - data.length };
}

export async function reportFor(db: DB, mode: WindowMode, windowHours: number) {
  return buildReport(await listCandidates(db), mode, windowHours);
}

/** Read-only collection from the Google Trends RSS feed. Nothing is published or proposed. */
export async function collectRss(db: DB, region: string, personaId: string | null, noFilter: boolean) {
  const reg = region.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(reg)) throw new Error("regiao obrigatoria (duas letras, ex.: BR)");
  let allowed: string[] = [];
  let forbidden: string[] = [];
  if (personaId && !noFilter) {
    const p = await loadPersona(db, personaId);
    requireActivePersona(p);
    allowed = p.allowed_topics;
    forbidden = p.forbidden_topics;
  }
  const xml = await fetchRss(rssUrl(reg));
  const items = readRssItems(xml);
  // one instant for the whole read: every observation of a collection shares the same collected_at
  const collectedAt = new Date();
  const raw: TrendCandidate[] = [];
  for (const it of items) {
    try {
      raw.push(translateItem(it, reg, collectedAt));
    } catch {
      /* malformed item dropped */
    }
  }
  const chosen = noFilter ? raw : filterByTopics(raw, allowed, forbidden);
  const { inserted, duplicates } = await saveCandidates(db, chosen);
  return {
    in_feed: raw.length,
    after_filter: chosen.length,
    inserted,
    duplicates,
    traffic_total: chosen.reduce((n, c) => n + (c.views ?? 0), 0),
    topics: chosen.map((c) => ({ topic: c.topic, views: c.views })),
  };
}
