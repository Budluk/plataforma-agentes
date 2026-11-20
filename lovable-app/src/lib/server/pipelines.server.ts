import { z } from "zod";
import { extractAsset, extractResearch, parseRoute, prepareRequest } from "@/lib/core/central";
import { canonical, sha256hex } from "@/lib/core/canonical";
import { ALLOWED_ASSETS, ALLOWED_RESEARCH_DOMAINS, DEV_ALLOWED_IMPORTS, MARKET_DATA_HOSTS, type Area } from "@/lib/core/config";
import { ContentDraft, NO_MEDIA_SEED, Persona, PersonaInvalida, PUBLISH_ACTION, PublishPost, requireActivePersona, topicAllowed } from "@/lib/core/content";
import { AlertEvent, AnalystProposal, PortfolioState, type ComputedRisk, type RiskDecision } from "@/lib/core/contracts";
import { analyzeSource, CODE_HEADER, DEV_MAX_TOKENS, MAX_CHARS as MAX_CODE_CHARS, MAX_TASK_CHARS, RESERVED, SAFE_NAME } from "@/lib/core/devCheck";
import { computeRisk, evaluateRisk } from "@/lib/core/hardGate";
import { ContractError, issueFields, parseLlmObject } from "@/lib/core/llmjson";
import { ageSeconds, checkEntryVsMarket, checkQuote, KIND, MarketDataError, parseFor, Quote, ROUTES } from "@/lib/core/market";
import { checkMusicRequest, identifyChord, MUSIC_TOOL_BY_ACTION, MusicRequest, noteName, toGuitarTab, transpose } from "@/lib/core/music";
import * as prompts from "@/lib/core/prompts";
import { checkSummary, checkUrl, cleanText, findInjection, htmlToText, ResearchRequest, ResearchSummary } from "@/lib/core/research";
import { analyzeFunnel, breakEvenUnits, checkFunnelRequest, checkSalesRequest, FunnelRequest, marginPct, marketPosition, markupPct, priceForMargin, round2, SALES_TOOL_BY_ACTION, SalesRequest } from "@/lib/core/sales";
import { checkStudioRequest, parseStudioText, StudioRequest, type StudioCall } from "@/lib/core/studio";
import { studioActionTool } from "@/lib/core/toolRegistry";
import { runStudioCall, StudioClient, StudioError, studioAllowedHosts, studioBaseUrl, studioTimeoutMs } from "./studio.server";
import { ActionGateway } from "./control.server";
import { fetchPage, getMarketJson, FetchError } from "./fetchers.server";
import { LLMError } from "./llm.server";
import { describeError, newCtx, ToolBlocked, type DB, type Runtime, type RunCtx, type Tools } from "./runtime.server";
import { loadRuntimeSettings } from "./settings.server";

export interface Outcome {
  ok: boolean;
  data: Record<string, unknown> | null;
  reasons: string[];
}

const isExpected = (e: unknown) =>
  e instanceof ContractError || e instanceof LLMError || e instanceof ToolBlocked || e instanceof MarketDataError || e instanceof FetchError || e instanceof Error;

async function reject(rt: Runtime, ctx: RunCtx, agent: string, asset: string | null, reasons: string[]): Promise<Outcome> {
  rt.log("rejection", { run_id: ctx.run_id, agent, asset, reasons });
  const warning = await rt.recordRun(agent, asset, "rejected", reasons.join("; ").slice(0, 500));
  return { ok: false, data: null, reasons: warning ? [...reasons, warning] : reasons };
}

async function llmCall(
  rt: Runtime,
  ctx: RunCtx,
  agent: string,
  system: string,
  user: string,
  extra: Record<string, unknown> = {},
  maxTokens?: number,
) {
  rt.log("llm_request", { run_id: ctx.run_id, agent, ...extra });
  const raw = await rt.complete(agent, system, user, maxTokens);
  rt.log("llm_response", { run_id: ctx.run_id, agent, chars: raw.length, ...extra });
  return raw;
}

// ---------------- finance ----------------
const USER_AGENT_MARKET = "plataforma-agentes/0.1 (dados de mercado somente leitura)";

export async function loadPortfolio(db: DB, maxAgeHours = 24): Promise<Record<string, unknown>> {
  const { data } = await db.from("portfolio").select("*").eq("id", 1).maybeSingle();
  if (!data) return {};
  const out: Record<string, unknown> = { equity: data.equity, daily_pnl_pct: data.daily_pnl_pct, equity_snapshot_consistent: data.equity_snapshot_consistent };
  if (Date.now() - new Date(data.updated_at).getTime() > maxAgeHours * 3600_000) out["equity_snapshot_consistent"] = false;
  return out;
}

export async function describePortfolioProblem(db: DB, maxAgeHours = 24): Promise<string | null> {
  const { data } = await db.from("portfolio").select("*").eq("id", 1).maybeSingle();
  if (!data) return "portfólio não cadastrado (preencha na página Economia)";
  if (data.equity === null || data.daily_pnl_pct === null) return "faltam equity e/ou daily_pnl_pct";
  if (Date.now() - new Date(data.updated_at).getTime() > maxAgeHours * 3600_000)
    return `portfólio com mais de ${maxAgeHours} h; o gate o trata como inconsistente`;
  return null;
}

async function liveQuote(asset: string): Promise<Quote> {
  const route = ROUTES[asset];
  if (!route || !(ALLOWED_ASSETS as readonly string[]).includes(asset)) throw new MarketDataError(`ativo sem rota de dados: '${asset}'`);
  const [provider, url] = route;
  const [price, asOf] = parseFor(provider, asset, await getMarketJson(url, MARKET_DATA_HOSTS, USER_AGENT_MARKET));
  const q = Quote.safeParse({ asset, price, as_of: asOf, source: provider, kind: KIND[provider] });
  if (!q.success) throw new MarketDataError("cotação falhou na validação");
  const reasons = checkQuote(q.data, new Date());
  if (reasons.length) throw new MarketDataError(reasons.join("; "));
  return q.data;
}

export async function quoteFor(asset: string) {
  return liveQuote(asset);
}

function financeTools(rt: Runtime, portfolio: Record<string, unknown>, holder: { quote?: Quote }): Tools {
  return {
    get_market_data: async ({ asset }) => {
      const a = String(asset);
      if (!(ALLOWED_ASSETS as readonly string[]).includes(a)) throw new Error(`ativo não permitido: '${a}'`);
      let q: Quote;
      try {
        q = await liveQuote(a);
      } catch (e) {
        throw new Error(`dados de mercado indisponíveis: ${(e as Error).message}`);
      }
      if (q.asset !== a) throw new Error("cotação de outro ativo (falha fechada)");
      holder.quote = q;
      // only numbers and fixed labels reach the LLM; no free text from the provider
      return { asset: q.asset, price: q.price, source: q.source, kind: q.kind, age_minutes: Math.max(0, Math.floor(ageSeconds(q, new Date()) / 60)) };
    },
    read_portfolio: () => ({ ...portfolio }),
    write_research_note: async ({ asset, text }) => {
      const a = String(asset);
      if (!(ALLOWED_ASSETS as readonly string[]).includes(a)) throw new Error(`ativo não permitido: '${a}'`);
      const body = String(text);
      const { data: rows } = await rt.db.from("research_notes").select("name").eq("asset", a);
      let highest = 0;
      for (const r of rows ?? []) {
        const m = /^([A-Z0-9]+)_([1-9][0-9]{0,8})\.md$/.exec(String(r["name"] ?? ""));
        if (m && m[1] === a) highest = Math.max(highest, Number(m[2]));
      }
      let number = highest + 1;
      for (let i = 0; i < 1000; i++) {
        const name = `${a}_${number}.md`;
        const { error } = await rt.db.from("research_notes").insert({ asset: a, name, body });
        // a note is never overwritten: if the number was taken, reserve the next free one
        if (!error) return name;
        number += 1;
      }
      throw new Error("não foi possível reservar um nome livre para a nota");
    },
    emit_alert: async ({ alert }) => {
      const ev = AlertEvent.parse(alert);
      await rt.saveAlert(ev.asset, ev);
      return ev;
    },
  };
}

export async function financeRun(rt: Runtime, asset: string, portfolio: Record<string, unknown>) {
  const ctx = newCtx();
  const holder: { quote?: Quote } = {};
  const tools = financeTools(rt, portfolio, holder);
  const fail = async (reasons: string[]) => {
    rt.log("rejection", { run_id: ctx.run_id, asset, reasons });
    await rt.recordRun("pipeline", asset, "rejected", reasons.join("; "));
    return { approved: false, alert: null as AlertEvent | null, reasons, risk: null as ComputedRisk | null };
  };
  try {
    // Analyst
    if (!(ALLOWED_ASSETS as readonly string[]).includes(asset)) throw new Error(`ativo fora da lista permitida: '${asset}'`);
    const data = await rt.callTool("analyst", ctx, tools, "get_market_data", { asset });
    rt.log("llm_request", { run_id: ctx.run_id, agent: "analyst", asset });
    const raw = await rt.complete("analyst", prompts.ANALYST_SYSTEM, `Ativo: ${asset}. Dados de mercado: ${JSON.stringify(data)}`);
    rt.log("llm_response", { run_id: ctx.run_id, agent: "analyst", asset, chars: raw.length });
    const proposal = parseLlmObject(raw, AnalystProposal, "ProposalInvalid", "proposta");
    if (proposal.asset !== asset) throw new ContractError("ProposalInvalid", "ativo da proposta difere do solicitado");
    const quote = holder.quote;
    if (!quote) return fail(["cotação ausente (falha fechada)"]);
    const now = new Date();
    const qr = [...checkQuote(quote, now), ...checkEntryVsMarket(proposal, quote)];
    if (qr.length) return fail(qr);
    // Risk manager
    const rawPf = await rt.callTool("risk_manager", ctx, tools, "read_portfolio", {});
    let invalid = "";
    let pf: PortfolioState;
    const parsed = PortfolioState.safeParse(rawPf);
    if (parsed.success) pf = parsed.data;
    else {
      pf = { equity: null, daily_pnl_pct: null, equity_snapshot_consistent: false };
      invalid = issueFields(parsed.error);
    }
    const risk = computeRisk(proposal);
    let decision: RiskDecision = evaluateRisk(risk, pf);
    if (invalid) decision = { approved: false, reasons: [`portfólio inválido (campos: ${invalid})`, ...decision.reasons] };
    rt.log("risk_decision", { run_id: ctx.run_id, asset, approved: decision.approved, reasons: decision.reasons });
    if (!decision.approved) return fail(decision.reasons);
    const alert: AlertEvent = {
      asset: proposal.asset,
      direction: proposal.direction,
      entry_price: proposal.entry_price,
      stop_price: proposal.stop_price,
      target_price: proposal.target_price,
      reward_risk_ratio: risk.reward_risk_ratio,
      message: `${proposal.direction} ${proposal.asset}: R/R ${risk.reward_risk_ratio.toFixed(2)}`,
      data_source: quote.source,
      data_age_minutes: Math.max(0, Math.floor(ageSeconds(quote, now) / 60)),
    };
    await rt.callTool("pipeline", ctx, tools, "emit_alert", { alert });
    await rt.recordRun("pipeline", asset, "alert_emitted", alert.message);
    return { approved: true, alert, reasons: [] as string[], risk };
  } catch (e) {
    if (isExpected(e)) return fail([describeError(e)]);
    throw e;
  }
}

// ---------------- music ----------------
const musicTools: Tools = {
  identify_chord: ({ notes }) => ({ chord: identifyChord(notes as number[]) }),
  transpose_notes: ({ notes, semitones }) => {
    const out = transpose(notes as number[], semitones as number);
    return { notes: out, names: out.map(noteName) };
  },
  to_guitar_tab: ({ notes }) => ({ tab: toGuitarTab(notes as number[]) }),
};

export async function musicExecute(rt: Runtime, req: MusicRequest, ctx = newCtx()): Promise<Outcome> {
  const reasons = checkMusicRequest(req);
  if (reasons.length) return reject(rt, ctx, "music_agent", null, reasons);
  const params: Record<string, unknown> = { notes: [...req.notes] };
  if (req.action === "transpose") params["semitones"] = req.semitones;
  try {
    const data = (await rt.callTool("music_agent", ctx, musicTools, MUSIC_TOOL_BY_ACTION[req.action], params)) as Record<string, unknown>;
    await rt.recordRun("music_agent", null, "ok", req.action);
    return { ok: true, data, reasons: [] };
  } catch (e) {
    return reject(rt, ctx, "music_agent", null, [describeError(e)]);
  }
}

export async function musicRun(rt: Runtime, text: string): Promise<Outcome> {
  const ctx = newCtx();
  try {
    const raw = await llmCall(rt, ctx, "music_agent", prompts.MUSIC_SYSTEM, text);
    return musicExecute(rt, parseLlmObject(raw, MusicRequest, "MusicRequestInvalid", "pedido"), ctx);
  } catch (e) {
    return reject(rt, ctx, "music_agent", null, [describeError(e)]);
  }
}

// ---------------- sales ----------------
const salesTools: Tools = {
  compute_margin: ({ unit_cost, price }) => {
    const c = unit_cost as number, p = price as number;
    return { margin_pct: round2(marginPct(c, p)), markup_pct: round2(markupPct(c, p)), profit_per_unit: round2(p - c) };
  },
  suggest_price: ({ unit_cost, target_margin_pct, competitor_prices }) => {
    const price = priceForMargin(unit_cost as number, target_margin_pct as number);
    return { suggested_price: round2(price), market: marketPosition(price, competitor_prices as number[]) };
  },
  break_even: ({ unit_cost, price, fixed_costs }) => {
    const units = breakEvenUnits(fixed_costs as number, unit_cost as number, price as number);
    return { units, revenue: round2(units * (price as number)) };
  },
  analyze_funnel: (params) => analyzeFunnel(params as Omit<FunnelRequest, "product">),
};

export async function salesExecute(rt: Runtime, req: SalesRequest, ctx = newCtx()): Promise<Outcome> {
  const reasons = checkSalesRequest(req);
  if (reasons.length) return reject(rt, ctx, "sales_agent", null, reasons);
  const params =
    req.action === "margin"
      ? { unit_cost: req.unit_cost, price: req.price }
      : req.action === "price"
        ? { unit_cost: req.unit_cost, target_margin_pct: req.target_margin_pct, competitor_prices: [...req.competitor_prices] }
        : { unit_cost: req.unit_cost, price: req.price, fixed_costs: req.fixed_costs };
  try {
    const data = (await rt.callTool("sales_agent", ctx, salesTools, SALES_TOOL_BY_ACTION[req.action], params)) as Record<string, unknown>;
    await rt.recordRun("sales_agent", null, "ok", req.action);
    return { ok: true, data, reasons: [] };
  } catch (e) {
    return reject(rt, ctx, "sales_agent", null, [describeError(e)]);
  }
}

export async function salesRun(rt: Runtime, text: string): Promise<Outcome> {
  const ctx = newCtx();
  try {
    const raw = await llmCall(rt, ctx, "sales_agent", prompts.SALES_SYSTEM, text);
    return salesExecute(rt, parseLlmObject(raw, SalesRequest, "SalesRequestInvalid", "pedido"), ctx);
  } catch (e) {
    return reject(rt, ctx, "sales_agent", null, [describeError(e)]);
  }
}

export async function funnelExecute(rt: Runtime, req: FunnelRequest, ctx = newCtx()): Promise<Outcome> {
  const reasons = checkFunnelRequest(req);
  if (reasons.length) return reject(rt, ctx, "funnel_agent", null, reasons);
  const { product, ...params } = req;
  try {
    const data = (await rt.callTool("funnel_agent", ctx, salesTools, "analyze_funnel", params)) as Record<string, unknown>;
    await rt.auditStage(ctx, "funnel_agent", "analysis", { product, ...data });
    const warning = await rt.recordRun("funnel_agent", null, "ok", `funnel:${String(data["decision"])}`);
    return { ok: true, data, reasons: warning ? [warning] : [] };
  } catch (e) {
    return reject(rt, ctx, "funnel_agent", null, [describeError(e)]);
  }
}

export async function funnelRun(rt: Runtime, text: string): Promise<Outcome> {
  const ctx = newCtx();
  try {
    const raw = await llmCall(rt, ctx, "funnel_agent", prompts.FUNNEL_SYSTEM, text);
    return funnelExecute(rt, parseLlmObject(raw, FunnelRequest, "FunnelRequestInvalid", "relatório"), ctx);
  } catch (e) {
    return reject(rt, ctx, "funnel_agent", null, [describeError(e)]);
  }
}

// ---------------- research ----------------
export async function researchRun(rt: Runtime, url: string, question: string): Promise<Outcome> {
  const ctx = newCtx();
  const req = ResearchRequest.safeParse({ url, question });
  if (!req.success) return reject(rt, ctx, "research_agent", null, ["pedido inválido (url ou pergunta fora do formato)"]);
  const reasons = checkUrl(req.data.url, ALLOWED_RESEARCH_DOMAINS);
  if (reasons.length) return reject(rt, ctx, "research_agent", null, reasons);
  const ua = (process.env["RESEARCH_USER_AGENT"] ?? "").trim() || "plataforma-agentes/0.1 (pesquisa somente leitura)";
  const tools: Tools = {
    fetch_page: async ({ url: u }) => {
      let page;
      try {
        page = await fetchPage(String(u), ALLOWED_RESEARCH_DOMAINS, ua);
      } catch (e) {
        throw new Error(`falha ao buscar página: ${(e as Error).message}`);
      }
      const rawText = page.content_type === "text/html" ? htmlToText(page.text) : page.text;
      const [text, cut] = cleanText(rawText);
      return { url: page.url, text, truncated: page.truncated || cut, injection_flags: findInjection(text) };
    },
  };
  let page: { url: string; text: string; truncated: boolean; injection_flags: string[] };
  try {
    page = (await rt.callTool("research_agent", ctx, tools, "fetch_page", { url: req.data.url })) as typeof page;
  } catch (e) {
    return reject(rt, ctx, "research_agent", null, [describeError(e)]);
  }
  if (page.injection_flags.length) rt.log("injection_suspected", { run_id: ctx.run_id, url: page.url, patterns: page.injection_flags });
  if (!page.text.trim()) return reject(rt, ctx, "research_agent", null, ["página sem texto útil"]);
  try {
    await rt.auditStage(ctx, "research_agent", "research", { source_url: page.url, question: req.data.question, chars: page.text.length, truncated: page.truncated });
  } catch (e) {
    return reject(rt, ctx, "research_agent", null, [describeError(e)]);
  }
  let summary: ResearchSummary;
  try {
    const raw = await llmCall(rt, ctx, "research_agent", prompts.RESEARCH_SYSTEM, `Pergunta: ${req.data.question}\n<<<PAGINA\n${page.text}\nPAGINA>>>`, { url: page.url });
    summary = parseLlmObject(raw, ResearchSummary, "ResearchSummaryInvalid", "resumo", true);
  } catch (e) {
    return reject(rt, ctx, "research_agent", null, [describeError(e)]);
  }
  const sr = checkSummary(summary);
  if (sr.length) return reject(rt, ctx, "research_agent", null, sr);
  try {
    await rt.auditStage(ctx, "research_agent", "summary", { source_url: page.url, summary: summary.summary, points: summary.key_points, answers_question: summary.answers_question });
  } catch (e) {
    return reject(rt, ctx, "research_agent", null, [describeError(e)]);
  }
  await rt.recordRun("research_agent", null, "ok", page.url);
  return {
    ok: true,
    reasons: [],
    data: {
      source_url: page.url,
      summary: summary.summary,
      key_points: summary.key_points,
      answers_question: summary.answers_question,
      injection_suspected: page.injection_flags.length > 0,
      truncated: page.truncated,
    },
  };
}

// ---------------- dev ----------------
const DevProposal = z
  .object({
    filename: z.string().regex(/^[A-Za-z0-9_-]{1,40}\.py$/),
    code: z.string().min(1).max(MAX_CODE_CHARS),
    explanation: z.string().max(600).default(""),
  })
  .strict();

function devTools(rt: Runtime, holder: { code: string; approved: boolean }): Tools {
  return {
    analyze_code: () => {
      const report = analyzeSource(holder.code, DEV_ALLOWED_IMPORTS);
      holder.approved = report.ok;
      return { approved: report.ok, findings: report.findings, warnings: report.warnings, metrics: report.metrics };
    },
    save_code_file: async ({ filename }) => {
      if (!holder.approved) throw new Error("código não aprovado pela análise estática; nada foi salvo");
      const fn = String(filename);
      if (!SAFE_NAME.test(fn) || RESERVED.has(fn.slice(0, -3).toLowerCase())) throw new Error("nome de arquivo inválido");
      const stem = fn.slice(0, -3);
      const { data: existing } = await rt.db.from("dev_outputs").select("filename").like("filename", `${stem}%.py`);
      const taken = new Set((existing ?? []).map((r) => r.filename));
      let target = fn;
      let n = 2;
      while (taken.has(target)) target = `${stem}_${n++}.py`;
      const { error } = await rt.db.from("dev_outputs").insert({ filename: target, code: CODE_HEADER + holder.code.replace(/\n+$/, "") + "\n" });
      if (error) throw new Error("falha ao salvar arquivo");
      return { filename: target, path: `dev_output/${target}`, executed: false };
    },
  };
}

export async function devWrite(rt: Runtime, task: string): Promise<Outcome> {
  const ctx = newCtx();
  if (typeof task !== "string" || task.length < 10 || task.length > MAX_TASK_CHARS) return reject(rt, ctx, "dev_agent", null, ["pedido inválido (tarefa fora do formato)"]);
  if (!task.trim()) return reject(rt, ctx, "dev_agent", null, ["tarefa ausente (falha fechada)"]);
  let proposal: z.infer<typeof DevProposal>;
  try {
    const raw = await llmCall(rt, ctx, "dev_agent", prompts.devSystem(), task, {}, DEV_MAX_TOKENS);
    proposal = parseLlmObject(raw, DevProposal, "DevProposalInvalid", "proposta");
  } catch (e) {
    return reject(rt, ctx, "dev_agent", null, [describeError(e)]);
  }
  const holder = { code: proposal.code, approved: false };
  const tools = devTools(rt, holder);
  try {
    const report = (await rt.callTool("dev_agent", ctx, tools, "analyze_code", {})) as { approved: boolean; findings: string[]; warnings: string[]; metrics: Record<string, unknown> };
    if (!report.approved) return reject(rt, ctx, "dev_agent", null, ["análise estática reprovou o código", ...report.findings]);
    const saved = (await rt.callTool("dev_agent", ctx, tools, "save_code_file", { filename: proposal.filename })) as { filename: string; path: string };
    await rt.db.from("dev_outputs").update({ explanation: proposal.explanation, warnings: report.warnings, metrics: report.metrics as never }).eq("filename", saved.filename);
    await rt.recordRun("dev_agent", null, "ok", saved.filename);
    return {
      ok: true,
      reasons: [],
      data: { filename: saved.filename, path: saved.path, executed: false, explanation: proposal.explanation, warnings: report.warnings, metrics: report.metrics, code: proposal.code },
    };
  } catch (e) {
    return reject(rt, ctx, "dev_agent", null, [describeError(e)]);
  }
}

export async function devReview(rt: Runtime, code: string): Promise<Outcome> {
  const ctx = newCtx();
  if (typeof code !== "string" || code.length > MAX_CODE_CHARS) return reject(rt, ctx, "dev_agent", null, ["pedido inválido (código acima do limite)"]);
  if (!code.trim()) return reject(rt, ctx, "dev_agent", null, ["código ausente para revisão (falha fechada)"]);
  const holder = { code, approved: false };
  try {
    const report = (await rt.callTool("dev_agent", ctx, devTools(rt, holder), "analyze_code", {})) as { approved: boolean; findings: string[]; warnings: string[]; metrics: Record<string, unknown> };
    await rt.recordRun("dev_agent", null, "ok", `review:${report.approved ? "aprovado" : "reprovado"}`);
    return { ok: true, reasons: [], data: { ...report, executed: false } };
  } catch (e) {
    return reject(rt, ctx, "dev_agent", null, [describeError(e)]);
  }
}

// ---------------- studio (CloneStudio local) ----------------
function studioToolsFor(client: StudioClient, call: StudioCall, tool: string): Tools {
  const tools: Tools = {
    studio_health: async () => (await client.health()) as unknown as Record<string, unknown>,
  };
  if (tool !== "studio_health") tools[tool] = async () => runStudioCall(client, call);
  return tools;
}

function studioParams(call: StudioCall): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(call)) if (v != null) out[k] = v;
  return out;
}

/** Most supervised area of the platform: closed contract -> deterministic gate -> monitor + permissions. */
export async function studioExecute(rt: Runtime, call: StudioCall, ctx = newCtx()): Promise<Outcome> {
  const parsed = StudioRequest.safeParse(call);
  if (!parsed.success) return reject(rt, ctx, "studio_agent", null, ["pedido inválido (ação ou parâmetro fora do formato)"]);
  const req = parsed.data;
  const reasons = checkStudioRequest(req);
  if (reasons.length) return reject(rt, ctx, "studio_agent", null, reasons);
  const tool = studioActionTool(req.action, req.kind ?? "");
  if (!tool) return reject(rt, ctx, "studio_agent", null, ["ação não implementada"]);
  let client: StudioClient;
  try {
    const settings = await loadRuntimeSettings(rt.db);
    client = new StudioClient(settings.studio_base_url, settings.studio_allowed_hosts, settings.studio_timeout_ms);
  } catch (e) {
    return reject(rt, ctx, "studio_agent", null, [describeError(e)]);
  }
  const asCall = req as unknown as StudioCall;
  const tools = studioToolsFor(client, asCall, tool);
  try {
    // health probe is mandatory before any other action (monitor sequence rule)
    if (req.action !== "health") await rt.callTool("studio_agent", ctx, tools, "studio_health", {});
    const data = (await rt.callTool("studio_agent", ctx, tools, tool, studioParams(asCall))) as Record<string, unknown>;
    const detail = String(data["id"] ?? data["count"] ?? data["status"] ?? data["platform"] ?? "").slice(0, 500);
    const warning = await rt.recordRun("studio_agent", null, "ok", detail);
    return { ok: true, data, reasons: warning ? [warning] : [] };
  } catch (e) {
    if (e instanceof StudioError || e instanceof ToolBlocked || e instanceof Error) return reject(rt, ctx, "studio_agent", null, [describeError(e)]);
    throw e;
  }
}

export async function studioRun(rt: Runtime, text: string): Promise<Outcome> {
  const ctx = newCtx();
  const parsed = parseStudioText(text);
  if (!parsed.ok) return reject(rt, ctx, "studio_agent", null, [parsed.reason]);
  return studioExecute(rt, parsed.call, ctx);
}

// ---------------- central ----------------
export async function centralHandle(rt: Runtime, text: string) {
  const ctx = newCtx();
  const finish = async (area: string, dispatched: boolean, ok: boolean, data: Record<string, unknown> | null, reasons: string[], status: string) => {
    rt.log("central_result", { run_id: ctx.run_id, area, dispatched, ok });
    if (!ok) rt.log("rejection", { run_id: ctx.run_id, agent: "central", reasons });
    await rt.recordRun("central", null, status, area);
    return { area, dispatched, ok, data, reasons };
  };
  const prep = prepareRequest(text);
  if (!prep.ok) return finish("none", false, false, null, [prep.reason], "none");
  let area: Area | "none";
  try {
    const raw = await llmCall(rt, ctx, "central", prompts.ROUTER_SYSTEM, `<<<PEDIDO\n${prep.cleaned}\nPEDIDO>>>`);
    const decision = parseRoute(raw);
    // the LLM's `reason` only goes to the log; it never reaches any area
    rt.log("route_decision", { run_id: ctx.run_id, agent: "central", area: decision.area, reason: decision.reason });
    area = decision.area;
  } catch (e) {
    if (e instanceof ContractError || e instanceof LLMError) return finish("none", false, false, null, [describeError(e)], "none");
    throw e;
  }
  if (area === "none") return finish("none", false, false, null, ["pedido fora do escopo ou ambíguo segundo o roteador"], "none");
  const t = prep.cleaned;
  try {
    let outcome: Outcome;
    if (area === "finance") {
      const a = extractAsset(t);
      if ("error" in a) outcome = { ok: false, data: null, reasons: [a.error] };
      else {
        const r = await financeRun(rt, a.asset, await loadPortfolio(rt.db));
        outcome = { ok: r.approved, data: r.alert as Record<string, unknown> | null, reasons: r.reasons };
      }
    } else if (area === "music") outcome = await musicRun(rt, t);
    else if (area === "sales") outcome = await salesRun(rt, t);
    else if (area === "funnel") outcome = await funnelRun(rt, t);
    else if (area === "research") {
      const r = extractResearch(t);
      outcome = "error" in r ? { ok: false, data: null, reasons: [r.error] } : await researchRun(rt, r.url, r.question);
    } else if (area === "studio") outcome = await studioRun(rt, t);
    else outcome = await devWrite(rt, t);
    return finish(area, true, outcome.ok, outcome.data, outcome.reasons, outcome.ok ? "ok" : "rejected");
  } catch (e) {
    // fail closed: an unexpected error never becomes success
    rt.log("handler_error", { run_id: ctx.run_id, area, error: (e as Error)?.name ?? "Error" });
    return finish(area, true, false, null, [`erro interno na área ${area}: ${(e as Error)?.name ?? "Error"}`], "error");
  }
}

// ---------------- content + publish proposal ----------------
export async function loadPersona(db: DB, personaId: string): Promise<Persona> {
  const { data } = await db.from("personas").select("*").eq("persona_id", personaId).maybeSingle();
  if (!data) throw new PersonaInvalida(`persona nao encontrada: ${personaId}`);
  const { updated_at, ...rest } = data;
  const r = Persona.safeParse(rest);
  if (!r.success) throw new PersonaInvalida(`persona fora do contrato: ${issueFields(r.error)}`);
  return r.data;
}

export async function contentCycle(rt: Runtime, tema: string, personaId: string, platform: string) {
  const ctx = newCtx();
  const fail = async (reasons: string[]) => {
    rt.log("rejection", { run_id: ctx.run_id, agent: "content_agent", reasons });
    await rt.recordRun("content_agent", null, "rejected", reasons.join("; "));
    return { ok: false as const, reasons };
  };
  let persona: Persona;
  try {
    persona = await loadPersona(rt.db, personaId);
    requireActivePersona(persona);
  } catch (e) {
    return fail([`Persona recusada: ${(e as Error).message}`]);
  }
  if (typeof tema !== "string" || tema.trim().length < 3) return fail(["tema curto demais"]);
  const t = tema.trim().slice(0, 300);
  if (!topicAllowed(persona, t)) return fail([`Tema fora do escopo desta persona. Permitidos: ${persona.allowed_topics.join(", ")}`]);
  let draft: ContentDraft;
  try {
    const raw = await llmCall(rt, ctx, "content_agent", prompts.CONTENT_SYSTEM, `<<<TEMA\n${t}\nTEMA>>>`);
    let text = raw.trim();
    const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
    if (m) text = m[1] ?? "";
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ContractError("ContentInvalid", "resposta do LLM nao e JSON valido");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ContractError("ContentInvalid", "JSON do LLM nao e um objeto");
    const r = ContentDraft.safeParse(data);
    if (!r.success) throw new ContractError("ContentInvalid", `conteudo fora do contrato: ${r.error.issues.map((i) => i.message).join("; ")}`);
    draft = r.data;
  } catch (e) {
    return fail([describeError(e)]);
  }
  await rt.recordRun("content_agent", null, "ok", t.slice(0, 80));
  const contentHash = await sha256hex(draft.hook + draft.script + draft.caption);
  const mediaHash = await sha256hex(NO_MEDIA_SEED);
  const { data: savedDraft, error: draftError } = await rt.db.from("content_drafts").insert({
    persona_id: persona.persona_id,
    tema: t,
    hook: draft.hook,
    script: draft.script,
    caption: draft.caption,
    hashtags: draft.hashtags,
    language: draft.language,
    content_hash: contentHash,
  }).select("id").single();
  if (draftError || !savedDraft) return fail(["não foi possível salvar o rascunho; nenhuma aprovação foi solicitada"]);
  try {
    await rt.auditStage(ctx, "content_agent", "content", { draft_id: savedDraft.id, persona_id: persona.persona_id, tema: t, content_hash: contentHash });
  } catch (e) {
    return fail([describeError(e)]);
  }
  const params = {
    platform,
    account_id: persona.accounts[0],
    persona_id: persona.persona_id,
    content_hash: contentHash,
    media_hash: mediaHash,
    caption: draft.caption.slice(0, 2200),
    scheduled_for: null,
  };
  const valid = PublishPost.safeParse(params);
  if (!valid.success) return fail([`parâmetros de publicação inválidos: ${issueFields(valid.error)}`]);
  const gw = new ActionGateway(rt.db);
  try {
    const proposal = await gw.propose(PUBLISH_ACTION, params, "cycle_live", `run-${ctx.run_id}`);
    return { ok: true as const, draft: { ...draft, tema: t, persona_id: persona.persona_id, content_hash: contentHash }, proposal };
  } catch (e) {
    return fail([describeError(e)]);
  }
}

export const canonicalPreview = canonical;
