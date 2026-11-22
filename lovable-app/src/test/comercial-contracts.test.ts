import { describe, it, expect } from "vitest";
import {
  AUTONOMY_LEVELS,
  AgentGrant,
  Forecast,
  LeadSignals,
  checkCommercialTool,
  decideAutonomy,
  formatBRLFromCents,
  scoreLead,
} from "@/lib/core/comercial";

describe("commercial autonomy gate", () => {
  it("blocks everything when the kill switch is engaged", () => {
    const d = decideAutonomy({
      action: "mover_oportunidade",
      autonomy: "autonomo_controlado",
      grantActions: ["mover_oportunidade"],
      killEngaged: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
    expect(d.reasons[0]).toContain("kill switch");
  });

  it("requires approval for sensible actions at every autonomy level", () => {
    for (const autonomy of AUTONOMY_LEVELS) {
      const d = decideAutonomy({
        action: "campanha_em_massa",
        autonomy,
        grantActions: ["campanha_em_massa"],
      });
      expect(d.allowed).toBe(false);
      expect(d.requiresApproval).toBe(true);
    }
  });

  it("rejects actions absent from the agent grant", () => {
    const d = decideAutonomy({
      action: "criar_proposta",
      autonomy: "autonomo_controlado",
      grantActions: ["ler_pipeline"],
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
    expect(d.reasons[0]).toContain("não concedida");
  });

  it("requires approval outside the authorised price table", () => {
    const d = decideAutonomy({
      action: "criar_proposta",
      autonomy: "autonomo_controlado",
      grantActions: ["criar_proposta"],
      discountPct: 15,
      withinPriceTable: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(true);
    expect(d.reasons[0]).toContain("desconto");
  });

  it("allows only controlled autonomy for non-sensitive granted actions", () => {
    const base = {
      action: "mover_oportunidade",
      grantActions: ["mover_oportunidade"],
    };
    expect(decideAutonomy({ ...base, autonomy: "assistido" }).requiresApproval).toBe(true);
    expect(decideAutonomy({ ...base, autonomy: "semiautonomo" }).requiresApproval).toBe(true);
    expect(decideAutonomy({ ...base, autonomy: "autonomo_controlado" }).allowed).toBe(true);
  });

  it("reuses the hard gate for forbidden tool names", () => {
    expect(checkCommercialTool("send_whatsapp").allowed).toBe(false);
    expect(checkCommercialTool("launch_campaign").allowed).toBe(false);
    expect(checkCommercialTool("compute_margin").allowed).toBe(true);
  });

  it("validates agent grants with bounded discount", () => {
    expect(
      AgentGrant.safeParse({
        organization_id: "org-1",
        agent_id: "sales_agent",
        actions: ["mover_oportunidade"],
        autonomy: "autonomo_controlado",
        max_discount_pct: 10,
        active: true,
      }).success,
    ).toBe(true);
    expect(
      AgentGrant.safeParse({
        organization_id: "org-1",
        agent_id: "sales_agent",
        actions: [],
        autonomy: "todo_poderoso",
        max_discount_pct: 10,
        active: true,
      }).success,
    ).toBe(false);
  });
});

describe("lead scoring and forecasts", () => {
  it("fails closed with fewer than two signals", () => {
    const r = scoreLead({ fit: 80 });
    expect(r.status).toBe("sem_dados");
    expect(r.score).toBeNull();
  });

  it("computes a bounded weighted score from present evidence only", () => {
    const parsed = LeadSignals.parse({ fit: 100, interest: 0 });
    const r = scoreLead(parsed);
    expect(r.status).toBe("medido");
    expect(r.score).toBe(54.55);
    expect(r.used).toEqual(["fit", "interest"]);
    expect(r.reason).toContain("2 evidência(s)");
  });

  it("rejects invalid signal ranges", () => {
    expect(LeadSignals.safeParse({ fit: 120 }).success).toBe(false);
  });

  it("requires confidence, inputs and limitations on forecasts", () => {
    const good = {
      scope: "funil",
      period: "2026-11",
      value_cents: 123456,
      confidence: 0.62,
      inputs: ["30 oportunidades"],
      limitations: ["sem sazonalidade calculada"],
    };
    expect(Forecast.safeParse(good).success).toBe(true);
    expect(Forecast.safeParse({ ...good, limitations: [] }).success).toBe(false);
    expect(formatBRLFromCents(123456)).toContain("R$");
  });
});
