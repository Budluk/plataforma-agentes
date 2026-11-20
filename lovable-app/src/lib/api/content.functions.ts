import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOperator } from "./operator";
import { Persona, PLATFORMS } from "@/lib/core/content";
import { parseObservationsCsv, type WindowMode } from "@/lib/core/trends";
import { Runtime } from "@/lib/server/runtime.server";
import { contentCycle } from "@/lib/server/pipelines.server";
import { toJson } from "@/lib/core/json";
import { collectRss, reportFor, saveCandidates } from "@/lib/server/trends.server";

export const listPersonas = createServerFn({ method: "GET" })
  .middleware([requireOperator])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("personas").select("*").order("persona_id");
    return data ?? [];
  });

export const savePersona = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: unknown) => d)
  .handler(async ({ data, context }) => {
    const r = Persona.safeParse(data);
    if (!r.success) return { ok: false, error: "persona fora do contrato: " + r.error.issues.map((i) => i.path.join(".")).join(", ") };
    const { error } = await context.supabase.from("personas").upsert({ ...r.data, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: "falha ao salvar persona" };
    return { ok: true, error: null };
  });

export const runContentCycle = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { tema: string; persona: string; platform: string }) =>
    z.object({ tema: z.string().max(1000), persona: z.string().min(1).max(40), platform: z.enum(PLATFORMS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rt = new Runtime(context.supabase, "content", context.operator);
    try {
      const r = await contentCycle(rt, data.tema, data.persona, data.platform);
      if (!r.ok) return { ok: false as const, reasons: r.reasons };
      return {
        ok: true as const,
        draft: { hook: r.draft.hook, caption: r.draft.caption, hashtags: [...r.draft.hashtags], tema: r.draft.tema, persona_id: r.draft.persona_id },
        proposal: toJson(r.proposal),
      };
    } finally {
      await rt.flush();
    }
  });

export const listContent = createServerFn({ method: "GET" })
  .middleware([requireOperator])
  .handler(async ({ context }) => {
    const [drafts, log] = await Promise.all([
      context.supabase.from("content_drafts").select("*").order("id", { ascending: false }).limit(20),
      context.supabase.from("publish_dryrun").select("*").order("id", { ascending: false }).limit(20),
    ]);
    return { drafts: drafts.data ?? [], dryrun: log.data ?? [] };
  });

export const getTrendReport = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { mode: WindowMode; windowHours: number }) => z.object({ mode: z.enum(["latest", "window", "full"]), windowHours: z.number().int().min(1).max(24 * 365) }).parse(d))
  .handler(async ({ data, context }) => {
    const [rows, obs, logs] = await Promise.all([
      reportFor(context.supabase, data.mode, data.windowHours),
      context.supabase.from("trend_observations").select("*").order("collected_at", { ascending: false }).limit(100),
      context.supabase.from("event_logs").select("*").eq("stream", "trends").order("id", { ascending: false }).limit(10),
    ]);
    return { rows, observations: obs.data ?? [], logs: logs.data ?? [] };
  });

export const importTrendCsv = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { csv: string }) => z.object({ csv: z.string().max(2_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    let parsed;
    try {
      parsed = parseObservationsCsv(data.csv);
    } catch (e) {
      return { ok: false, error: (e as Error).message, inserted: 0, duplicates: 0, rejected: [] as [number, string][] };
    }
    const { inserted, duplicates } = await saveCandidates(context.supabase, parsed.candidates.map((c) => c.candidate));
    return { ok: parsed.rejected.length === 0, error: null, inserted, duplicates, rejected: parsed.rejected };
  });

export const collectTrends = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { region: string; persona: string | null; noFilter: boolean }) =>
    z.object({ region: z.string().max(5), persona: z.string().max(40).nullable(), noFilter: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rt = new Runtime(context.supabase, "trends", context.operator);
    try {
      const r = await collectRss(context.supabase, data.region, data.persona, data.noFilter);
      rt.log("trends_collected", { run_id: "rss", gravadas: r.inserted, duplicadas: r.duplicates, no_feed: r.in_feed });
      await rt.recordRun("trends_agent", null, "ok", `${r.inserted} novas`);
      return { ok: true, error: null, ...r };
    } catch (e) {
      const msg = (e as Error).message;
      rt.log("rejection", { run_id: "rss", agent: "trends_agent", reasons: [msg] });
      await rt.recordRun("trends_agent", null, "rejected", `falha na fonte: ${msg}`);
      return { ok: false, error: msg };
    } finally {
      await rt.flush();
    }
  });
