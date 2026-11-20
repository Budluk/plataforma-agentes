import type { DB } from "./runtime.server";
import { RuntimeSettings, type RuntimeConfig } from "@/lib/core/settings";
import { studioAllowedHosts, studioBaseUrl, studioTimeoutMs, parseBaseUrl } from "./studio.server";

export async function loadRuntimeSettings(db: DB): Promise<RuntimeConfig> {
  const { data, error } = await db.from("runtime_settings").select("*").eq("id", "global").maybeSingle();
  if (error) throw new Error("Não foi possível ler as configurações.");
  const settings = data ? RuntimeSettings.parse({
    studio_base_url: data.studio_base_url, studio_allowed_hosts: data.studio_allowed_hosts,
    studio_timeout_ms: data.studio_timeout_ms, groq_model: data.groq_model, llm_max_tokens: data.llm_max_tokens,
  }) : RuntimeSettings.parse({
    studio_base_url: studioBaseUrl(), studio_allowed_hosts: studioAllowedHosts(), studio_timeout_ms: studioTimeoutMs(),
    groq_model: process.env["GROQ_MODEL"]?.trim() || "openai/gpt-oss-20b",
    llm_max_tokens: Number(process.env["LLM_MAX_TOKENS"] || 3000),
  });
  parseBaseUrl(settings.studio_base_url, settings.studio_allowed_hosts);
  return settings;
}