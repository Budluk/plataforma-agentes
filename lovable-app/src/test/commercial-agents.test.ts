import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_AGENTS,
  COMMERCIAL_AGENT_IDS,
  COMMERCIAL_ACTIONS,
  COMMERCIAL_ACTION_TOOL,
  actionsForAgent,
  agentsForAction,
  authorizeCommercialAction,
  checkCommercialProposal,
  commercialAgentSystem,
  commercialToolAllowed,
  validateCommercialRegistry,
} from "@/lib/core/commercial-agents";
import { ToolMonitor } from "@/lib/core/toolMonitor";

describe("commercial agent roster", () => {
  it("defines exactly nine agents with unique ids and bounded specs", () => {
    expect(COMMERCIAL_AGENT_IDS).toHaveLength(9);
    expect(new Set(COMMERCIAL_AGENT_IDS).size).toBe(9);
    expect(COMMERCIAL_AGENTS.map((a) => a.id)).toEqual([...COMMERCIAL_AGENT_IDS]);
    expect(COMMERCIAL_AGENTS.every((a) => a.actions.length > 0 && a.name.length > 0)).toBe(true);
  });

  it("keeps the whole matrix internally consistent and free of sensitive actions", () => {
    const check = validateCommercialRegistry();
    expect(check.issues).toEqual([]);
    expect(check.ok).toBe(true);
    expect(COMMERCIAL_ACTIONS.every((a) => agentsForAction(a).length > 0)).toBe(true);
  });

  it("reuses existing sales and funnel tools instead of duplicating them", () => {
    expect(COMMERCIAL_ACTION_TOOL.calcular_margem).toBe("compute_margin");
    expect(COMMERCIAL_ACTION_TOOL.sugerir_preco).toBe("suggest_price");
    expect(COMMERCIAL_ACTION_TOOL.calcular_break_even).toBe("break_even");
    expect(COMMERCIAL_ACTION_TOOL.ler_funil).toBe("analyze_funnel");
    expect(agentsForAction("calcular_margem")).toEqual(["sales_agent"]);
    expect(agentsForAction("ler_funil")).toEqual(["funnel_agent"]);
  });

  it("maps each action to exactly one responsible role for the new tools", () => {
    expect(agentsForAction("preparar_lead")).toEqual(["prospector_agent"]);
    expect(agentsForAction("previsualizar_merge")).toEqual(["crm_steward_agent"]);
    expect(agentsForAction("mover_oportunidade")).toEqual(["pipeline_agent"]);
    expect(agentsForAction("preparar_proposta")).toEqual(["proposal_agent"]);
    expect(agentsForAction("rascunhar_resposta")).toEqual(["followup_agent"]);
    expect(agentsForAction("gerar_leitura")).toEqual(["insights_agent"]);
    expect(actionsForAgent("qualifier_agent")).toEqual(["calcular_score", "qualificar_lead"]);
  });
});

describe("commercial tool gate", () => {
  it("accepts registered preparation tools and rejects vetoed execution names", () => {
    expect(commercialToolAllowed("preparar_lead").allowed).toBe(true);
    expect(commercialToolAllowed("mover_oportunidade").allowed).toBe(true);
    expect(commercialToolAllowed("compute_margin").allowed).toBe(true);
    expect(commercialToolAllowed("send_whatsapp").allowed).toBe(false);
    expect(commercialToolAllowed("launch_campaign").allowed).toBe(false);
    expect(commercialToolAllowed("checkout").allowed).toBe(false);
    expect(commercialToolAllowed("ferramenta_inexistente").allowed).toBe(false);
  });

  it("passes new commercial tools through the existing ToolMonitor", () => {
    const monitor = new ToolMonitor();
    expect(
      monitor.check({ agent: "followup_agent", tool: "rascunhar_resposta", params: {} }, [])
        .allowed,
    ).toBe(true);
    expect(
      monitor.check({ agent: "followup_agent", tool: "send_whatsapp", params: {} }, []).head,
    ).toBe("veto");
  });
});

describe("commercial authorization", () => {
  it("fails closed when the tenant grant is not supplied", () => {
    const d = authorizeCommercialAction({
      agent: "pipeline_agent",
      action: "montar_kanban",
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
    expect(d.reasons[0]).toContain("não concedida");
    expect(d.tool).toBe("montar_kanban");
  });

  it("allows a granted read action only under controlled autonomy", () => {
    const base = {
      agent: "pipeline_agent" as const,
      action: "montar_kanban" as const,
      grantActions: ["montar_kanban"],
    };
    expect(authorizeCommercialAction({ ...base, autonomy: "assistido" }).requiresApproval).toBe(true);
    expect(authorizeCommercialAction({ ...base, autonomy: "semiautonomo" }).requiresApproval).toBe(true);
    expect(authorizeCommercialAction({ ...base, autonomy: "autonomo_controlado" }).allowed).toBe(true);
  });

  it("blocks everything when the kill switch is engaged", () => {
    const d = authorizeCommercialAction({
      agent: "insights_agent",
      action: "ler_dashboard",
      grantActions: ["ler_dashboard"],
      autonomy: "autonomo_controlado",
      killEngaged: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.reasons[0]).toContain("kill switch");
  });

  it("rejects an action outside the agent scope even with a grant", () => {
    const d = authorizeCommercialAction({
      agent: "followup_agent",
      action: "preparar_proposta",
      grantActions: ["preparar_proposta"],
      autonomy: "autonomo_controlado",
    });
    expect(d.allowed).toBe(false);
    expect(d.reasons[0]).toContain("fora do escopo");
  });

  it("requires approval for a discount outside the authorised price table", () => {
    const d = authorizeCommercialAction({
      agent: "proposal_agent",
      action: "preparar_proposta",
      grantActions: ["preparar_proposta"],
      autonomy: "autonomo_controlado",
      discountPct: 15,
      withinPriceTable: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(true);
    expect(d.reasons[0]).toContain("desconto");
  });
});

describe("commercial agent proposal validation", () => {
  const input = {
    agent: "prospector_agent" as const,
    action: "preparar_lead" as const,
    grantActions: ["preparar_lead"],
  };
  const proposal = {
    action: "preparar_lead",
    tool: "preparar_lead",
    summary: "Lead preparado para confirmação humana.",
    needs_approval: true,
    reasons: ["Fonte autorizada.", "Consentimento registrado."],
  };

  it("accepts a coherent proposal while keeping approval explicit", () => {
    const check = checkCommercialProposal(proposal, input);
    expect(check.valid).toBe(true);
    expect(check.authorization.requiresApproval).toBe(true);
    expect(check.reasons).toEqual([]);
  });

  it("rejects a proposal that hides required approval", () => {
    const check = checkCommercialProposal({ ...proposal, needs_approval: false }, input);
    expect(check.valid).toBe(false);
    expect(check.reasons.some((r) => r.includes("aprovação humana"))).toBe(true);
  });

  it("rejects a proposal that swaps its tool", () => {
    const check = checkCommercialProposal({ ...proposal, tool: "send_whatsapp" }, input);
    expect(check.valid).toBe(false);
    expect(check.reasons.some((r) => r.includes("ferramenta"))).toBe(true);
  });

  it("rejects malformed output and never falls back to execution", () => {
    const check = checkCommercialProposal({ action: "checkout", tool: "checkout" }, input);
    expect(check.valid).toBe(false);
    expect(check.authorization.allowed).toBe(false);
    expect(check.reasons.length).toBeGreaterThan(0);
  });
});

describe("commercial agent prompts", () => {
  it("includes only the actions and tools of the chosen agent", () => {
    const prompt = commercialAgentSystem("sales_agent");
    expect(prompt).toContain("sales_agent");
    expect(prompt).toContain("compute_margin");
    expect(prompt).toContain("suggest_price");
    expect(prompt).toContain("break_even");
    expect(prompt).not.toContain("send_whatsapp");
    expect(prompt).not.toContain("mover_oportunidade");
  });

  it("restates the no-invention, AMOSTRA and no-sending rules", () => {
    const prompt = commercialAgentSystem("prospector_agent");
    expect(prompt).toContain("AMOSTRA");
    expect(prompt).toContain("sem_dados");
    expect(prompt).toContain("não envia mensagens");
    expect(prompt).toContain("JSON");
  });
});
