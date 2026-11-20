import { auditCanon, auditHash, canonical, GENESIS_HASH, paramsHash } from "@/lib/core/canonical";
import { PUBLISH_ACTION, PUBLISH_LIMITS, PUBLISH_TTL_SECONDS, PublishPost } from "@/lib/core/content";
import { redact } from "@/lib/core/redact";
import type { DB } from "./runtime.server";
import type { z } from "zod";

export async function appendAudit(db: DB, runId: string, actor: string, event: string, action = "", status = "", detail: unknown = {}) {
  const ts = Date.now() / 1000;
  const det = canonical(redact(detail ?? {}));
  const e = { ts, run_id: runId, actor, event, action, status, detail: det };
  const { data, error } = await db.rpc("ctl_append_audit_exact", {
    p_ts: ts,
    p_run_id: runId,
    p_actor: actor,
    p_event: event,
    p_action: action,
    p_status: status,
    p_detail: det,
    p_canon: auditCanon(e),
  });
  if (error) throw new Error("falha ao gravar auditoria");
  return data;
}

/** Fail closed: an unreadable state counts as engaged. */
export async function killState(db: DB): Promise<[boolean, string]> {
  const { data, error } = await db.from("kill_switch").select("engaged, reason").eq("id", 1).maybeSingle();
  if (error) return [true, "estado do kill switch ilegível (falha fechada)"];
  if (!data) return [true, "estado do kill switch ausente (falha fechada)"];
  return [data.engaged, data.reason];
}

export class ActionRefused extends Error {
  override name = "ActionRefused";
  constructor(public code: string, message: string) {
    super(`${code}: ${message}`);
  }
}
export class ActionFailed extends Error {
  override name = "ActionFailed";
}

interface Spec {
  name: string;
  schema: z.ZodType<Record<string, unknown>>;
  limits: { max_proposals: number; max_executions: number; window_seconds: number };
  ttl: number;
  handler: (db: DB, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

/** Simulated publisher: records the intent and returns "publicado: false". Nothing is sent. */
async function dryRunPublisher(db: DB, p: Record<string, unknown>) {
  const line = [p["platform"], p["account_id"], p["persona_id"], String(p["content_hash"]).slice(0, 12), String(p["media_hash"]).slice(0, 12), Array.from(String(p["caption"])).length].join("|");
  const { error } = await db.from("publish_dryrun").insert({ line });
  if (error) throw new Error("OSError");
  return { simulado: true, publicado: false, plataforma: p["platform"], conta: p["account_id"], motivo: "handler simulado, nada foi enviado" };
}

const SPECS: Record<string, Spec> = {
  [PUBLISH_ACTION]: {
    name: PUBLISH_ACTION,
    schema: PublishPost as unknown as z.ZodType<Record<string, unknown>>,
    limits: PUBLISH_LIMITS,
    ttl: PUBLISH_TTL_SECONDS,
    handler: dryRunPublisher,
  },
};

function fields(err: z.ZodError) {
  return err.issues.map((i) => `${i.path.join(".")}(${i.code})`);
}

/**
 * The only door for sensitive actions. Whoever proposes never executes: a proposal is pending until a
 * person approves it; execution needs a valid single-use approval, identical params, kill switch off and rate limits.
 */
export class ActionGateway {
  constructor(private db: DB) {}

  private async refuse(runId: string, actor: string, action: string, code: string, message: string, detail: Record<string, unknown> = {}): Promise<never> {
    await appendAudit(this.db, runId, actor, "refused", action.slice(0, 40), code, { message, ...detail });
    throw new ActionRefused(code, message);
  }

  private async checkKill(runId: string, actor: string, action: string) {
    const [engaged, why] = await killState(this.db);
    if (engaged) await this.refuse(runId, actor, action, "kill_switch", why || "kill switch ativo");
  }

  async propose(action: string, params: unknown, actor: string, runId: string) {
    await this.checkKill(runId, actor, action);
    const spec = SPECS[action];
    if (!spec) return this.refuse(runId, actor, action, "unknown_action", "ação desconhecida");
    const v = spec.schema.safeParse(params);
    if (!v.success) return this.refuse(runId, actor, action, "invalid_params", "parâmetros inválidos", { fields: fields(v.error) });
    const validated = v.data;
    const ok = await this.db.rpc("ctl_try_record_call", { p_action: action, p_kind: "proposal", p_limit: spec.limits.max_proposals, p_window: spec.limits.window_seconds });
    if (ok.error) throw new Error("falha no limite de frequência");
    if (!ok.data) return this.refuse(runId, actor, action, "rate_limited", "limite de propostas atingido");
    const { data: row, error } = await this.db.rpc("ctl_create_approval", {
      p_action: action,
      p_params_json: canonical(validated),
      p_params_hash: await paramsHash(validated),
      p_actor: actor,
      p_run_id: runId,
      p_ttl: spec.ttl,
    });
    if (error || !row) throw new Error("falha ao criar pedido de aprovação");
    await appendAudit(this.db, runId, actor, "proposed", action, "pending", { approval_id: row.id, params: validated });
    return { approval_id: row.id, action, params: validated, expires_ts: row.expires_ts };
  }

  async execute(approvalId: number, actor: string, runId: string) {
    await this.checkKill(runId, actor, "");
    const { data: row } = await this.db.from("approvals").select("*").eq("id", approvalId).maybeSingle();
    if (!row) return this.refuse(runId, actor, "", "not_found", "pedido de aprovação inexistente", { approval_id: approvalId });
    const action = row.action;
    const spec = SPECS[action];
    if (!spec) return this.refuse(runId, actor, action, "unknown_action", "ação desconhecida", { approval_id: approvalId });
    let stored: unknown;
    try {
      stored = JSON.parse(row.params_json);
    } catch {
      return this.refuse(runId, actor, action, "tampered", "parâmetros guardados não passam mais na validação", { approval_id: approvalId });
    }
    const v = spec.schema.safeParse(stored);
    if (!v.success) return this.refuse(runId, actor, action, "tampered", "parâmetros guardados não passam mais na validação", { approval_id: approvalId });
    const params = v.data;
    if ((await paramsHash(params)) !== row.params_hash)
      return this.refuse(runId, actor, action, "tampered", "parâmetros diferentes dos aprovados", { approval_id: approvalId });
    if (row.status !== "approved" || row.expires_ts <= Date.now() / 1000)
      return this.refuse(runId, actor, action, "not_approved", `pedido não está aprovado e válido (estado: ${row.status})`, { approval_id: approvalId });
    const ok = await this.db.rpc("ctl_try_record_call", { p_action: action, p_kind: "execution", p_limit: spec.limits.max_executions, p_window: spec.limits.window_seconds });
    if (ok.error) throw new Error("falha no limite de frequência");
    if (!ok.data) return this.refuse(runId, actor, action, "rate_limited", "limite de execuções atingido", { approval_id: approvalId });
    const consumed = await this.db.rpc("ctl_consume", { p_id: approvalId });
    if (consumed.error || !consumed.data) return this.refuse(runId, actor, action, "not_approved", "aprovação já usada ou vencida", { approval_id: approvalId });
    await appendAudit(this.db, runId, actor, "executing", action, "started", { approval_id: approvalId });
    const [engaged, why] = await killState(this.db);
    if (engaged) {
      await this.db.rpc("ctl_finish", { p_id: approvalId, p_ok: false, p_result_json: canonical({ error: "kill_switch" }) });
      return this.refuse(runId, actor, action, "kill_switch", why || "kill switch ativo", { approval_id: approvalId });
    }
    let result: Record<string, unknown>;
    try {
      result = await spec.handler(this.db, params);
    } catch (e) {
      const name = (e as Error)?.name ?? "Error";
      await this.db.rpc("ctl_finish", { p_id: approvalId, p_ok: false, p_result_json: canonical({ error: name }) });
      await appendAudit(this.db, runId, actor, "executed", action, "failed", { approval_id: approvalId, error: name });
      throw new ActionFailed(`${action} falhou: ${name}`);
    }
    await this.db.rpc("ctl_finish", { p_id: approvalId, p_ok: true, p_result_json: canonical(redact(result)) });
    await appendAudit(this.db, runId, actor, "executed", action, "ok", { approval_id: approvalId, result });
    return { approval_id: approvalId, action, result };
  }
}

export async function humanDecide(db: DB, approvalId: number, approve: boolean, by: string) {
  const { data, error } = await db.rpc("ctl_human_decide", { p_id: approvalId, p_approve: approve, p_by: by });
  if (error) throw new Error("falha ao registrar decisão");
  await appendAudit(db, "human", by, "decision", "approvals", data, { approval_id: approvalId, approve });
  return data;
}

export async function engageKill(db: DB, reason: string, by: string) {
  const r = redact(reason) as string;
  const { error } = await db.rpc("ctl_kill_engage", { p_reason: r.slice(0, 200), p_by: by });
  if (error) throw new Error("falha ao acionar o kill switch");
  await appendAudit(db, "human", by, "kill_switch", "kill_switch", "engaged", { reason });
}

export async function releaseKill(db: DB, by: string) {
  const { error } = await db.rpc("ctl_kill_release", { p_by: by });
  if (error) throw new Error("falha ao liberar o kill switch");
  await appendAudit(db, "human", by, "kill_switch", "kill_switch", "released", {});
}

export async function verifyChain(db: DB): Promise<{ ok: boolean; count: number; badId: number | null }> {
  let prev = GENESIS_HASH;
  let n = 0;
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await db.from("audit_events").select("*").order("id").range(from, from + page - 1);
    if (error) throw new Error("falha ao ler auditoria");
    for (const r of data) {
      if (r.prev_hash !== prev || r.hash !== (await auditHash(prev, { ...r, ts: Number(r.ts_exact ?? r.ts) }))) return { ok: false, count: n, badId: r.id };
      prev = r.hash;
      n++;
    }
    if (data.length < page) break;
    from += page;
  }
  return { ok: true, count: n, badId: null };
}
