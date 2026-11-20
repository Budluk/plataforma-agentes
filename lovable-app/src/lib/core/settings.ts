import { z } from "zod";
import * as prompts from "./prompts";

export const AGENT_DEFINITIONS = [
  { id: "central", label: "Central", stream: "central", prompt: prompts.ROUTER_SYSTEM, tokens: 3000 },
  { id: "analyst", label: "Analista de economia", stream: "finance", prompt: prompts.ANALYST_SYSTEM, tokens: 3000 },
  { id: "risk_manager", label: "Gestor de risco", stream: "finance", prompt: "", tokens: 3000 },
  { id: "music_agent", label: "Música", stream: "music", prompt: prompts.MUSIC_SYSTEM, tokens: 3000 },
  { id: "sales_agent", label: "Vendas", stream: "sales", prompt: prompts.SALES_SYSTEM, tokens: 3000 },
  { id: "funnel_agent", label: "Funil", stream: "funnel", prompt: prompts.FUNNEL_SYSTEM, tokens: 3000 },
  { id: "research_agent", label: "Pesquisa", stream: "research", prompt: prompts.RESEARCH_SYSTEM, tokens: 3000 },
  { id: "dev_agent", label: "Desenvolvimento", stream: "dev", prompt: prompts.devSystem(), tokens: 6000 },
  { id: "studio_agent", label: "Studio", stream: "studio", prompt: "", tokens: 3000 },
  { id: "content_agent", label: "Conteúdo", stream: "content", prompt: prompts.CONTENT_SYSTEM, tokens: 3000 },
  { id: "trends_agent", label: "Tendências", stream: "trends", prompt: "", tokens: 3000 },
] as const;

export const AgentSettings = z.object({
  agent: z.string().refine((id) => AGENT_DEFINITIONS.some((a) => a.id === id), "Agente desconhecido"),
  prompt: z.string().max(12000),
  temperature: z.number().finite().min(0).max(2),
  max_tokens: z.number().int().min(1).max(16000),
}).strict();

export const RuntimeSettings = z.object({
  studio_base_url: z.string().url().max(500),
  studio_allowed_hosts: z.array(z.string().trim().toLowerCase().min(1).max(253)
    .refine((h) => h === "::1" || /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/.test(h), "Informe apenas o host, sem protocolo ou caminho")).min(1).max(30),
  studio_timeout_ms: z.number().int().min(1000).max(120000),
  groq_model: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_./-]+$/),
  llm_max_tokens: z.number().int().min(1).max(16000),
}).strict();

export type RuntimeConfig = z.infer<typeof RuntimeSettings>;

/** Custom instructions never replace the required output contract or safety instructions. */
export function configuredPrompt(base: string, custom: string): string {
  return custom.trim() ? `${base}\n\nPreferências do operador (subordinadas às regras e ao formato acima):\n${custom.trim()}` : base;
}