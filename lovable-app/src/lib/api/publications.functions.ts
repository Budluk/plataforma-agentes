import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOperator } from "./operator";
import { auditCanon, canonical, sha256hex } from "@/lib/core/canonical";
import { NO_MEDIA_SEED, PUBLISH_ACTION } from "@/lib/core/content";
import { validatePublication } from "@/lib/core/publications";
import { ActionGateway } from "@/lib/server/control.server";
import type { Database } from "@/integrations/supabase/types";

export const listPublications = createServerFn({ method: "GET" }).middleware([requireOperator]).handler(async ({ context }) => {
  const [drafts, approvals, publications, audit] = await Promise.all([
    context.supabase.from("content_drafts").select("*").order("id", { ascending: false }),
    context.supabase.from("approvals").select("*").eq("action", PUBLISH_ACTION).order("id", { ascending: false }),
    context.supabase.from("site_publications").select("*"),
    context.supabase.from("audit_events").select("id,run_id,action,detail").eq("event", "stage_completed").order("id"),
  ]);
  if (drafts.error || approvals.error || publications.error || audit.error) throw new Error("Não foi possível ler as publicações.");
  return { now: Date.now() / 1000, items: drafts.data.map((draft) => {
    const matches = approvals.data.filter((a) => { try { const p = JSON.parse(a.params_json); return p.content_hash === draft.content_hash && p.persona_id === draft.persona_id; } catch { return false; } });
    const publication = publications.data.find((p) => p.draft_id === draft.id) ?? null;
    const approval = matches.find((a) => a.status === "approved" && a.expires_ts > Date.now() / 1000) ?? matches[0] ?? null;
    const content = audit.data.find((e) => { try { return e.action === "content" && JSON.parse(e.detail).result?.draft_id === draft.id; } catch { return false; } });
    // Only attribute stages linked by an exact run ID. Never infer prior stages from proximity.
    const stages = content ? audit.data.filter((e) => e.run_id === content.run_id).map((e) => ({ id: e.id, stage: e.action })) : [];
    return { draft, approval, publication, stages };
  }) };
});

export const requestSavedApproval = createServerFn({ method: "POST" }).middleware([requireOperator])
  .inputValidator((data: { draftId: number }) => z.object({ draftId: z.number().int().positive() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: draft, error } = await context.supabase.from("content_drafts").select("*").eq("id", data.draftId).single();
    if (error || !draft || await sha256hex(draft.hook + draft.script + draft.caption) !== draft.content_hash) throw new Error("Rascunho ausente ou alterado.");
    const { data: previous, error: previousError } = await context.supabase.from("approvals").select("*").eq("action", PUBLISH_ACTION).order("id", { ascending: false });
    if (previousError) throw new Error("Não foi possível consultar a aprovação anterior.");
    const match = previous.find((a) => { try { const p = JSON.parse(a.params_json); return p.content_hash === draft.content_hash && p.persona_id === draft.persona_id; } catch { return false; } });
    if (match && ["pending", "approved"].includes(match.status) && match.expires_ts > Date.now() / 1000) return { approval_id: match.id };
    const { data: persona, error: personaError } = await context.supabase.from("personas").select("accounts,enabled").eq("persona_id", draft.persona_id).single();
    if (personaError || !persona?.enabled || !persona.accounts[0]) throw new Error("Persona sem conta ativa.");
    let platform = "instagram";
    if (match) { try { platform = JSON.parse(match.params_json).platform; } catch { /* fall back */ } }
    const params = { platform, account_id: persona.accounts[0], persona_id: draft.persona_id, content_hash: draft.content_hash, media_hash: await sha256hex(NO_MEDIA_SEED), caption: draft.caption.slice(0, 2200), scheduled_for: null };
    const result = await new ActionGateway(context.supabase).propose(PUBLISH_ACTION, params, context.operator, crypto.randomUUID());
    return { approval_id: result.approval_id };
  });

export const publishSavedContent = createServerFn({ method: "POST" }).middleware([requireOperator])
  .inputValidator((data: { draftId: number; approvalId: number; confirm: string }) => z.object({ draftId: z.number().int().positive(), approvalId: z.number().int().positive(), confirm: z.literal("SIM") }).parse(data))
  .handler(async ({ data, context }) => {
    const [d, a] = await Promise.all([
      context.supabase.from("content_drafts").select("*").eq("id", data.draftId).single(),
      context.supabase.from("approvals").select("*").eq("id", data.approvalId).single(),
    ]);
    if (d.error || a.error || !d.data || !a.data) throw new Error("Conteúdo ou aprovação ausente.");
    const ts = Date.now() / 1000;
    await validatePublication(d.data, a.data, ts);
    const runId = crypto.randomUUID();
    const detail = canonical({ draft_id: data.draftId, approval_id: data.approvalId, content_hash: d.data.content_hash, destination: "site" });
    const { data: id, error } = await context.supabase.rpc("ctl_publish_site", {
      p_draft_id: data.draftId, p_approval_id: data.approvalId, p_params_hash: a.data.params_hash, p_confirm: data.confirm,
      p_ts: ts, p_run_id: runId, p_actor: context.operator, p_detail: detail,
      p_canon: auditCanon({ ts, run_id: runId, actor: context.operator, event: "stage_completed", action: "publication", status: "ok", detail }),
    });
    if (error || !id) throw new Error("Publicação recusada. Confira aprovação, validade e kill switch; nada foi liberado.");
    return { id };
  });

// Public read-only endpoint: only the deliberately released copy is readable, never private drafts or approvals.
export const readSitePublications = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) throw new Error("Site indisponível.");
  const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  } } });
  const { data, error } = await db.from("site_publications").select("id,hook,script,caption,hashtags,language,published_at").order("id", { ascending: false });
  if (error) throw new Error("Não foi possível carregar os conteúdos.");
  return data;
});