import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOperator } from "./operator";
import { ALLOWED_ASSETS } from "@/lib/core/config";
import { FunnelRequest, SalesRequest } from "@/lib/core/sales";
import { MusicRequest } from "@/lib/core/music";
import { PortfolioState } from "@/lib/core/contracts";
import { Runtime, describeError, newCtx } from "@/lib/server/runtime.server";
import * as P from "@/lib/server/pipelines.server";
import { killState } from "@/lib/server/control.server";
import { outcomeDto } from "@/lib/core/json";
import { loadRuntimeSettings } from "@/lib/server/settings.server";
import { parseLlmObject } from "@/lib/core/llmjson";
import { NarrativeFactsSchema, SalesNarrativeSchema } from "@/lib/core/sales-narrative";
import { SALES_NARRATIVE_SYSTEM } from "@/lib/core/prompts";

async function withRuntime<T>(
  supabase: Runtime["db"],
  stream: string,
  operator: string,
  fn: (rt: Runtime) => Promise<T>,
): Promise<T> {
  const rt = new Runtime(supabase, stream, operator);
  try {
    return await fn(rt);
  } finally {
    await rt.flush();
  }
}

export const getAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isOperator: !!data, email: (context.claims as { email?: string }).email ?? null };
  });

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireOperator])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [kill, runs, pending, alerts, provider] = await Promise.all([
      killState(db),
      db.from("agent_runs").select("*").order("id", { ascending: false }).limit(12),
      db.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db.from("alerts").select("id", { count: "exact", head: true }),
      loadRuntimeSettings(db).then((s) =>
        (process.env["GROQ_API_KEY"] ?? "").trim()
          ? { provider: "groq", model: s.groq_model }
          : { provider: "lovable", model: "openai/gpt-6-astra" },
      ),
    ]);
    const { count: totalRuns } = await db
      .from("agent_runs")
      .select("id", { count: "exact", head: true });
    return {
      kill: { engaged: kill[0], reason: kill[1] },
      recentRuns: runs.data ?? [],
      pendingApprovals: pending.count ?? 0,
      alertCount: alerts.count ?? 0,
      totalRuns: totalRuns ?? 0,
      llm: provider,
    };
  });

export const runCentral = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { text: string }) => z.object({ text: z.string().max(5000) }).parse(d))
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "central", context.operator, async (rt) =>
      outcomeDto(await P.centralHandle(rt, data.text)),
    ),
  );

export const getFinanceState = createServerFn({ method: "GET" })
  .middleware([requireOperator])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [pf, alerts, notes] = await Promise.all([
      db.from("portfolio").select("*").eq("id", 1).maybeSingle(),
      db.from("alerts").select("*").order("id", { ascending: false }).limit(50),
      db.from("research_notes").select("*").order("id", { ascending: false }).limit(20),
    ]);
    return {
      portfolio: pf.data,
      problem: await P.describePortfolioProblem(db),
      alerts: alerts.data ?? [],
      notes: notes.data ?? [],
    };
  });

export const setPortfolio = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { equity: number; daily_pnl_pct: number; consistent: boolean }) =>
    z
      .object({
        equity: z.number().finite(),
        daily_pnl_pct: z.number().finite(),
        consistent: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const st = PortfolioState.parse({
      equity: data.equity,
      daily_pnl_pct: data.daily_pnl_pct,
      equity_snapshot_consistent: data.consistent,
    });
    if ((st.equity ?? 0) <= 0) throw new Error("equity deve ser positivo");
    const { error } = await context.supabase
      .from("portfolio")
      .upsert({
        id: 1,
        equity: st.equity,
        daily_pnl_pct: st.daily_pnl_pct,
        equity_snapshot_consistent: st.equity_snapshot_consistent,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error("falha ao gravar portfólio");
    return { ok: true };
  });

export const checkMarket = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .handler(async () => {
    const out: {
      asset: string;
      ok: boolean;
      price?: number;
      source?: string;
      kind?: string;
      as_of?: string;
      error?: string;
    }[] = [];
    for (const a of ALLOWED_ASSETS) {
      try {
        const q = await P.quoteFor(a);
        out.push({
          asset: a,
          ok: true,
          price: q.price,
          source: q.source,
          kind: q.kind,
          as_of: q.as_of.toISOString(),
        });
      } catch (e) {
        out.push({ asset: a, ok: false, error: (e as Error).message });
      }
    }
    return out;
  });

export const runFinance = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { asset: string }) => z.object({ asset: z.string().max(20) }).parse(d))
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "finance", context.operator, async (rt) => {
      const r = await P.financeRun(rt, data.asset.toUpperCase(), await P.loadPortfolio(rt.db));
      return { approved: r.approved, alert: r.alert, reasons: r.reasons, risk: r.risk };
    }),
  );

export const runMusic = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { text?: string; request?: unknown }) =>
    z.object({ text: z.string().max(1500).optional(), request: z.unknown().optional() }).parse(d),
  )
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "music", context.operator, async (rt) => {
      if (data.text) return outcomeDto(await P.musicRun(rt, data.text));
      const req = MusicRequest.safeParse(data.request);
      if (!req.success)
        return { ok: false, data: null, reasons: ["pedido inválido (fora do contrato)"] };
      return outcomeDto(await P.musicExecute(rt, req.data));
    }),
  );

export const runSales = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { text?: string; request?: unknown }) =>
    z.object({ text: z.string().max(1500).optional(), request: z.unknown().optional() }).parse(d),
  )
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "sales", context.operator, async (rt) => {
      if (data.text) return outcomeDto(await P.salesRun(rt, data.text));
      const req = SalesRequest.safeParse(data.request);
      if (!req.success)
        return {
          ok: false,
          data: null,
          reasons: ["pedido inválido: " + req.error.issues.map((i) => i.path.join(".")).join(", ")],
        };
      return outcomeDto(await P.salesExecute(rt, req.data));
    }),
  );

export const runFunnel = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { text?: string; request?: unknown }) =>
    z.object({ text: z.string().max(4000).optional(), request: z.unknown().optional() }).parse(d),
  )
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "funnel", context.operator, async (rt) => {
      if (data.text) return outcomeDto(await P.funnelRun(rt, data.text));
      const req = FunnelRequest.safeParse(data.request);
      if (!req.success)
        return {
          ok: false,
          data: null,
          reasons: [
            "relatório inválido: " + req.error.issues.map((i) => i.path.join(".")).join(", "),
          ],
        };
      return outcomeDto(await P.funnelExecute(rt, req.data));
    }),
  );

/** AI-written editorial layer for the sales PDF. Never invents or collects data. */
export const writeSalesNarrative = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: unknown) => NarrativeFactsSchema.parse(d))
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "sales", context.operator, async (rt) => {
      const ctx = newCtx();
      try {
        const raw = await rt.complete(
          "sales_agent",
          SALES_NARRATIVE_SYSTEM,
          JSON.stringify(data),
          1200,
        );
        const narrative = parseLlmObject(
          raw,
          SalesNarrativeSchema,
          "SalesNarrativeInvalid",
          "leitura da IA",
          true,
        );
        await rt.auditStage(ctx, "sales_agent", "sales_narrative", {
          sections: 4,
          bullets:
            narrative.destaques.length +
            narrative.atencao.length +
            narrative.proximos_passos.length,
        });
        const warning = await rt.recordRun("sales_agent", null, "ok", "sales_narrative ok");
        return outcomeDto({ ok: true, data: narrative, reasons: warning ? [warning] : [] });
      } catch (e) {
        rt.log("sales_narrative_failed", {
          run_id: ctx.run_id,
          error: describeError(e).slice(0, 300),
        });
        const warning = await rt.recordRun("sales_agent", null, "error", "sales_narrative falhou");
        return outcomeDto({
          ok: false,
          data: null,
          reasons: [
            "A IA não respondeu dentro do contrato; o PDF determinístico segue disponível.",
            ...(warning ? [warning] : []),
          ],
        });
      }
    }),
  );

export const runResearch = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { url: string; question: string }) =>
    z.object({ url: z.string().max(2000), question: z.string().max(2000) }).parse(d),
  )
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "research", context.operator, async (rt) =>
      outcomeDto(await P.researchRun(rt, data.url, data.question)),
    ),
  );

export const runDevWrite = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { task: string }) => z.object({ task: z.string().max(2000) }).parse(d))
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "dev", context.operator, async (rt) =>
      outcomeDto(await P.devWrite(rt, data.task)),
    ),
  );

export const runDevReview = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().max(20000) }).parse(d))
  .handler(({ data, context }) =>
    withRuntime(context.supabase, "dev", context.operator, async (rt) =>
      outcomeDto(await P.devReview(rt, data.code)),
    ),
  );

export const listDevOutputs = createServerFn({ method: "GET" })
  .middleware([requireOperator])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("dev_outputs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const listHistory = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { agent?: string; status?: string; page?: number }) =>
    z
      .object({
        agent: z.string().max(40).optional(),
        status: z.string().max(40).optional(),
        page: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("agent_runs")
      .select("*", { count: "exact" })
      .order("id", { ascending: false });
    if (data.agent) q = q.eq("agent", data.agent);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, count } = await q.range(data.page * 50, data.page * 50 + 49);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const listEventLogs = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { stream?: string; runId?: string; page?: number }) =>
    z
      .object({
        stream: z.string().max(40).optional(),
        runId: z.string().max(40).optional(),
        page: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("event_logs")
      .select("*", { count: "exact" })
      .order("id", { ascending: false });
    if (data.stream) q = q.eq("stream", data.stream);
    if (data.runId) q = q.eq("run_id", data.runId);
    const { data: rows, count } = await q.range(data.page * 100, data.page * 100 + 99);
    return { rows: rows ?? [], total: count ?? 0 };
  });
