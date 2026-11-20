import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOperator } from "./operator";
import { ActionGateway, engageKill, humanDecide, killState, releaseKill, verifyChain } from "@/lib/server/control.server";
import { redact } from "@/lib/core/redact";
import { newRunId } from "@/lib/server/runtime.server";
import { toJson, type Json } from "@/lib/core/json";

const CONFIRM = "SIM";

export const listApprovals = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { status?: string }) => z.object({ status: z.enum(["pending", "approved", "denied", "expired", "used", "failed"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("approvals").select("*").order("id", { ascending: false }).limit(50);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows } = await q;
    const [engaged, reason] = await killState(context.supabase);
    return {
      kill: { engaged, reason },
      now: Date.now() / 1000,
      approvals: (rows ?? []).map((r) => {
        let params: Json = null;
        try {
          params = toJson(redact(JSON.parse(r.params_json)));
        } catch {
          params = "[ilegível]";
        }
        let result: Json = null;
        try {
          result = r.result_json ? toJson(JSON.parse(r.result_json)) : null;
        } catch {
          result = "[ilegível]";
        }
        return {
          id: r.id,
          action: r.action,
          status: r.status,
          actor: r.actor,
          created: r.created_ts,
          expires: r.expires_ts,
          decided_by: r.decided_by,
          decided_ts: r.decided_ts,
          params,
          full_caption: (() => {
            try {
              return String((JSON.parse(r.params_json) as { caption?: string }).caption ?? "");
            } catch {
              return "";
            }
          })(),
          params_hash: r.params_hash.slice(0, 12),
          result,
        };
      }),
    };
  });

/** Approving releases something, so it requires the person to type SIM, like the interactive terminal did. */
export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { id: number; approve: boolean; confirm?: string }) => z.object({ id: z.number().int().positive(), approve: z.boolean(), confirm: z.string().max(10).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.approve && (data.confirm ?? "").trim() !== CONFIRM) return { result: "not_confirmed" };
    return { result: await humanDecide(context.supabase, data.id, data.approve, context.operator) };
  });

export const executeApproval = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { id: number }) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const gw = new ActionGateway(context.supabase);
    try {
      const r = await gw.execute(data.id, "executor", `run-exec-${newRunId()}`);
      return { ok: true, result: toJson(r.result), error: null };
    } catch (e) {
      return { ok: false, result: null, error: (e as Error).message };
    }
  });

export const killSwitch = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { op: "engage" | "release"; reason?: string; confirm?: string }) =>
    z.object({ op: z.enum(["engage", "release"]), reason: z.string().max(200).optional(), confirm: z.string().max(10).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // stopping is always safe and needs no confirmation; releasing does
    if (data.op === "engage") {
      await engageKill(context.supabase, data.reason?.trim() || "acionado manualmente", context.operator);
      return { ok: true };
    }
    if ((data.confirm ?? "").trim() !== CONFIRM) return { ok: false };
    await releaseKill(context.supabase, context.operator);
    return { ok: true };
  });

export const getAudit = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { tail?: number }) => z.object({ tail: z.number().int().min(1).max(200).default(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const chain = await verifyChain(context.supabase);
    const { data: rows } = await context.supabase.from("audit_events").select("id, ts_exact, ts, run_id, actor, event, action, status, detail").order("id", { ascending: false }).limit(data.tail);
    return {
      chain,
      events: (rows ?? []).map((r) => {
        let detail: Json = r.detail;
        try {
          detail = toJson(JSON.parse(r.detail));
        } catch {
          /* keep text */
        }
        return { id: r.id, ts: Number(r.ts_exact ?? r.ts), run_id: r.run_id, actor: r.actor, event: r.event, action: r.action, status: r.status, detail };
      }),
    };
  });
