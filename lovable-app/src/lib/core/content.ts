import { z } from "zod";

export const ContentDraft = z
  .object({
    hook: z.string().min(3).max(120),
    script: z.string().min(20).max(1500),
    caption: z.string().min(3).max(2200),
    hashtags: z.array(z.string()).max(10).default([]),
    language: z.string().min(2).max(10),
  })
  .strict()
  .superRefine((d, ctx) => {
    const text = [d.hook, d.script, d.caption].join(" ").toLowerCase();
    if (text.includes("http") || text.includes("www.")) ctx.addIssue({ code: "custom", message: "texto gerado contem link" });
    for (const tag of d.hashtags)
      if (!tag.startsWith("#") || tag.includes(" ")) ctx.addIssue({ code: "custom", message: `hashtag fora do formato: '${tag}'` });
  });
export type ContentDraft = z.infer<typeof ContentDraft>;

export const Persona = z
  .object({
    schema_version: z.number().int().min(1).default(1),
    credential_reference: z.string().max(200).nullable().default(null),
    persona_id: z.string().min(1).max(40),
    enabled: z.boolean().default(false),
    language: z.string().min(2).max(10),
    niche: z.string().max(200),
    editorial_identity: z.string().max(200),
    style: z.string().max(300),
    allowed_topics: z.array(z.string()).max(50).default([]),
    forbidden_topics: z.array(z.string()).max(50).default([]),
    accounts: z.array(z.string()).max(50).default([]),
    require_sources_for_factual_claims: z.boolean().default(true),
  })
  .strict();
export type Persona = z.infer<typeof Persona>;

export class PersonaInvalida extends Error {
  override name = "PersonaInvalida";
}

export function requireActivePersona(p: Persona): void {
  if (!p.enabled) throw new PersonaInvalida(`persona '${p.persona_id}' esta desabilitada`);
  if (!p.accounts.length) throw new PersonaInvalida(`persona '${p.persona_id}' sem conta autorizada`);
}

export function topicAllowed(p: Persona, tema: string): boolean {
  const alvo = tema.toLowerCase();
  if (p.forbidden_topics.some((f) => alvo.includes(f.toLowerCase()))) return false;
  if (!p.allowed_topics.length) return true;
  return p.allowed_topics.some((a) => alvo.includes(a.toLowerCase()));
}

export const PLATFORMS = ["tiktok", "instagram", "youtube", "facebook", "x", "linkedin"] as const;
const ACCOUNT_ID = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const HASH = /^[0-9a-f]{64}$/;

export const PublishPost = z
  .object({
    platform: z.string().min(1).max(20),
    account_id: z.string().min(2).max(40),
    persona_id: z.string().min(1).max(40),
    content_hash: z.string().min(64).max(64),
    media_hash: z.string().min(64).max(64),
    caption: z.string().max(2200),
    scheduled_for: z.string().max(40).nullable().default(null),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!(PLATFORMS as readonly string[]).includes(p.platform)) ctx.addIssue({ code: "custom", path: ["platform"], message: "plataforma nao suportada" });
    if (!ACCOUNT_ID.test(p.account_id)) ctx.addIssue({ code: "custom", path: ["account_id"], message: "account_id fora do formato" });
    if (!HASH.test(p.content_hash)) ctx.addIssue({ code: "custom", path: ["content_hash"], message: "content_hash deve ser sha256 em hex" });
    if (!HASH.test(p.media_hash)) ctx.addIssue({ code: "custom", path: ["media_hash"], message: "media_hash deve ser sha256 em hex" });
    if (!p.caption.trim()) ctx.addIssue({ code: "custom", path: ["caption"], message: "caption obrigatoria" });
  });
export type PublishPost = z.infer<typeof PublishPost>;

export const PUBLISH_ACTION = "publish.post";
export const PUBLISH_LIMITS = { max_proposals: 20, max_executions: 3, window_seconds: 3600 };
export const PUBLISH_TTL_SECONDS = 900;
export const NO_MEDIA_SEED = "sem-midia-neste-teste";
