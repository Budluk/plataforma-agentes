import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { ToolCall } from "@/lib/core/contracts";
import { redact } from "@/lib/core/redact";
import { ToolMonitor } from "@/lib/core/toolMonitor";
import { makeLlm, type LLM } from "./llm.server";
import { loadRuntimeSettings } from "./settings.server";
import { configuredPrompt } from "@/lib/core/settings";
import { appendAudit } from "./control.server";

export type DB = SupabaseClient<Database>;

export const newRunId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

export class ToolBlocked extends Error {
  override name = "ToolBlocked";
  constructor(public tool: string, public head: string, public reason: string) {
    super(`ferramenta '${tool}' bloqueada [${head}]: ${reason}`);
  }
}

export interface RunCtx {
  run_id: string;
  history: string[];
}
export const newCtx = (): RunCtx => ({ run_id: newRunId(), history: [] });

type ToolFn = (params: Record<string, unknown>) => unknown | Promise<unknown>;
export type Tools = Record<string, ToolFn>;

/** Per-request runtime: logger (buffered, flushed once), memory, permissions, monitor, LLM. */
export class Runtime {
  private logs: Database["public"]["Tables"]["event_logs"]["Insert"][] = [];
  private caps: Set<string> | null = null;
  readonly monitor = new ToolMonitor();
  private _llm: LLM | null = null;

  constructor(public db: DB, public stream: string, public operator: string) {}

  get llm(): LLM {
    if (!this._llm) this._llm = makeLlm();
    return this._llm;
  }

  async complete(agent: string, system: string, user: string, defaultTokens?: number) {
    const [settings, result] = await Promise.all([
      loadRuntimeSettings(this.db),
      this.db.from("agent_settings").select("*").eq("agent", agent).maybeSingle(),
    ]);
    if (result.error) throw new Error("Não foi possível ler os ajustes do agente.");
    const custom = result.data;
    const llm = makeLlm({ model: settings.groq_model, maxTokens: settings.llm_max_tokens, temperature: custom?.temperature ?? 0 });
    return llm.complete(configuredPrompt(system, custom?.prompt ?? ""), user, { maxTokens: custom?.max_tokens ?? defaultTokens ?? settings.llm_max_tokens });
  }

  log(event: string, fields: Record<string, unknown> = {}) {
    const { run_id, ...rest } = fields;
    this.logs.push({
      ts: new Date().toISOString(),
      stream: this.stream,
      event,
      run_id: typeof run_id === "string" ? run_id : null,
      fields: redact(rest) as Json,
    });
  }

  async flush() {
    if (!this.logs.length) return;
    const batch = this.logs;
    this.logs = [];
    const { error } = await this.db.from("event_logs").insert(batch);
    if (error) console.error("event_logs insert failed", error.message);
  }

  async auditStage(ctx: RunCtx, agent: string, stage: string, result: Record<string, unknown>) {
    await appendAudit(this.db, ctx.run_id, this.operator, "stage_completed", stage, "ok", { agent, stream: this.stream, result });
    this.log("stage_completed", { run_id: ctx.run_id, agent, stage });
  }

  /**
   * Records the run without turning an audit failure into an action failure.
   * The action already happened when this is called: a database failure must become a
   * warning in the result — never an exception that suggests the caller repeat the action.
   */
  async recordRun(agent: string, asset: string | null, status: string, detail = ""): Promise<string | null> {
    const { error } = await this.db.from("agent_runs").insert({ agent, asset, status, detail: detail.slice(0, 2000) });
    if (!error) return null;
    const warning = "aviso: auditoria indisponível";
    this.log("audit_degraded", { agent, status, error: error.message });
    return warning;
  }

  async saveAlert(asset: string, payload: Record<string, unknown>) {
    const { data, error } = await this.db.from("alerts").insert({ asset, payload: payload as Json }).select("id").single();
    if (error) throw new Error("falha ao gravar alerta");
    return data.id;
  }

  /** Fail closed: unreadable capabilities mean "not allowed". */
  async isAllowed(agent: string, tool: string): Promise<boolean> {
    if (!this.caps) {
      const { data, error } = await this.db.from("capabilities").select("agent, tool");
      if (error || !data) return false;
      this.caps = new Set(data.map((r) => `${r.agent}\u0000${r.tool}`));
    }
    return this.caps.has(`${agent}\u0000${tool}`);
  }

  /** The single door to every tool: log first, contract, 5-head monitor, permissions, registry. */
  async callTool(agent: string, ctx: RunCtx, tools: Tools, tool: string, params: Record<string, unknown> = {}) {
    this.log("tool_call_attempt", { run_id: ctx.run_id, agent, tool, params });
    const parsed = ToolCall.safeParse({ agent, tool, params });
    if (!parsed.success) return this.block(ctx, agent, tool, "contract", "chamada inválida");
    const verdict = this.monitor.check(parsed.data, ctx.history);
    if (!verdict.allowed) return this.block(ctx, agent, tool, verdict.head, verdict.reason);
    if (!(await this.isAllowed(agent, tool))) return this.block(ctx, agent, tool, "permissions", `agente '${agent}' sem permissão`);
    const fn = tools[tool];
    if (!fn) return this.block(ctx, agent, tool, "registry", "ferramenta não implementada");
    ctx.history.push(tool);
    let result: unknown;
    try {
      result = await fn(params);
    } catch (exc) {
      // The tool's error is the original error: a failure while auditing it must not
      // replace it nor stop the rethrow to the upper layer.
      try {
        this.log("tool_error", {
          run_id: ctx.run_id,
          agent,
          tool,
          error_type: (exc as Error)?.name ?? "Error",
          error: String((exc as Error)?.message ?? exc).replace(/\s+/g, " ").slice(0, 300),
        });
      } catch {
        /* the audit log of the failure never takes down the answer */
      }
      throw exc;
    }
    this.log("tool_ok", { run_id: ctx.run_id, agent, tool });
    return result;
  }

  private block(ctx: RunCtx, agent: string, tool: string, head: string, reason: string): never {
    this.log("tool_blocked", { run_id: ctx.run_id, agent, tool, head, reason });
    throw new ToolBlocked(tool, head, reason);
  }
}

/** "Name: message", like the original `f"{type(exc).__name__}: {exc}"`. */
export const describeError = (e: unknown) => (e instanceof Error ? `${e.name === "Error" ? "ValueError" : e.name}: ${e.message}` : String(e));
