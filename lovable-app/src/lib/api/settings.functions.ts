import { createServerFn } from "@tanstack/react-start";
import { requireOperator } from "./operator";
import { AGENT_DEFINITIONS, AgentSettings, RuntimeSettings } from "@/lib/core/settings";
import { loadRuntimeSettings } from "@/lib/server/settings.server";
import { parseBaseUrl } from "@/lib/server/studio.server";
import { z } from "zod";

export const getSettings = createServerFn({ method: "GET" }).middleware([requireOperator]).handler(async ({ context }) => ({
  settings: await loadRuntimeSettings(context.supabase),
  groqConfigured: Boolean(process.env["GROQ_API_KEY"]),
}));

export const saveSettings = createServerFn({ method: "POST" }).middleware([requireOperator])
  .inputValidator((data: unknown) => RuntimeSettings.parse(data)).handler(async ({ data, context }) => {
    const url = parseBaseUrl(data.studio_base_url, data.studio_allowed_hosts);
    const { error } = await context.supabase.from("runtime_settings").upsert({ id: "global", ...data, studio_base_url: url });
    if (error) throw new Error("Não foi possível salvar as configurações.");
    return { ok: true };
  });

export const getAgentSettings = createServerFn({ method: "GET" }).middleware([requireOperator]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("agent_settings").select("*");
  if (error) throw new Error("Não foi possível ler os ajustes dos agentes.");
  return AGENT_DEFINITIONS.map((a) => {
    const saved = data?.find((s) => s.agent === a.id);
    return { ...a, basePrompt: a.prompt, prompt: saved?.prompt ?? "", temperature: saved?.temperature ?? 0, max_tokens: saved?.max_tokens ?? a.tokens };
  });
});

export const saveAgentSettings = createServerFn({ method: "POST" }).middleware([requireOperator])
  .inputValidator((data: unknown) => AgentSettings.parse(data)).handler(async ({ data, context }) => {
    const def = AGENT_DEFINITIONS.find((a) => a.id === data.agent);
    if (!def?.prompt) throw new Error("Este agente usa regras fixas, sem chamada de IA.");
    const { error } = await context.supabase.from("agent_settings").upsert(data);
    if (error) throw new Error("Não foi possível salvar o agente.");
    return { ok: true };
  });

export const getAgentLogs = createServerFn({ method: "GET" }).middleware([requireOperator])
  .inputValidator((data: unknown) => z.object({ agent: z.string(), page: z.number().int().min(0).default(0) }).parse(data))
  .handler(async ({ data, context }) => {
    const def = AGENT_DEFINITIONS.find((a) => a.id === data.agent);
    if (!def) throw new Error("Agente desconhecido.");
    const { data: rows, count, error } = await context.supabase.from("event_logs").select("*", { count: "exact" })
      .eq("stream", def.stream).eq("fields->>agent", data.agent).order("id", { ascending: false }).range(data.page * 30, data.page * 30 + 29);
    if (error) throw new Error("Não foi possível ler os registros.");
    return { rows: rows ?? [], total: count ?? 0 };
  });