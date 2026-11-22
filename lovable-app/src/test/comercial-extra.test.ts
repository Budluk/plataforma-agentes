import { describe, it, expect } from "vitest";
import {
  decideAutonomy,
  checkCommercialTool,
  scoreLead,
  formatBRLFromCents,
  type AutonomyLevel,
  SENSIBLE_ACTIONS,
} from "@/lib/core/comercial";

describe("decideAutonomia — ações sensíveis sempre requerem aprovação", () => {
  const base = {
    action: "mover_oportunidade",
    autonomy: "autonomo_controlado" as const,
    grantActions: ["mover_oportunidade"],
  };

  for (const action of SENSIBLE_ACTIONS) {
    it(`bloqueia ${action} sem aprovação em autonomia controlada`, () => {
      const d = decideAutonomy({
        ...base,
        action,
        grantActions: [action],
      });
      expect(d.allowed).toBe(false);
      expect(d.requiresApproval).toBe(true);
      expect(d.reasons.length).toBeGreaterThan(0);
    });
  }

  it("bloqueia ação desconhecida", () => {
    const d = decideAutonomy({
      ...base,
      action: "acao_inexistente_xpto",
      grantActions: [],
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
    expect(d.reasons[0]).toContain("não concedida");
  });

  it("canonicaliza alias sensível no decideAutonomy", () => {
    const d = decideAutonomy({
      action: "enviar_mensagem",
      autonomy: "autonomo_controlado",
      grantActions: ["enviar_mensagem"],
    });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(true);
    expect(d.reasons[0]).toContain("aprovação");
  });

  it("kill switch desliga qualquer ação", () => {
    for (const autonomy of ["assistido", "semiautonomo", "autonomo_controlado"] as const) {
      const d = decideAutonomy({
        ...base,
        autonomy,
        killEngaged: true,
      });
      expect(d.allowed).toBe(false);
      expect(d.requiresApproval).toBe(false);
      expect(d.reasons[0]).toContain("kill switch");
    }
  });

  it("grant inativo não é aceito (não há grantActions suficientes)", () => {
    const d = decideAutonomy({
      ...base,
      action: "criar_proposta",
      grantActions: ["ler_pipeline"], // não inclui criar_proposta
    });
    expect(d.allowed).toBe(false);
    expect(d.reasons[0]).toContain("não concedida");
  });
});

describe("checkCommercialTool — hard gate", () => {
  it("rejeita nomes de ferramenta proibidos", () => {
    expect(checkCommercialTool("send_whatsapp").allowed).toBe(false);
    expect(checkCommercialTool("launch_campaign").allowed).toBe(false);
    expect(checkCommercialTool("checkout").allowed).toBe(false);
    expect(checkCommercialTool("payment").allowed).toBe(false);
    expect(checkCommercialTool("submit_form").allowed).toBe(false);
    expect(checkCommercialTool("deploy").allowed).toBe(false);
  });

  it("permite nomes de ferramenta de leitura", () => {
    expect(checkCommercialTool("compute_margin").allowed).toBe(true);
    expect(checkCommercialTool("suggest_price").allowed).toBe(true);
    expect(checkCommercialTool("break_even").allowed).toBe(true);
    expect(checkCommercialTool("analyze_funnel").allowed).toBe(true);
  });

  it("rejeita aliases PT-BR de ações sensíveis", () => {
    for (const tool of [
      "exportacao_dados",
      "enviar_mensagem",
      "envio_mensagem",
      "alteracao_permissoes",
      "pagamento",
      "campanha_em_massa",
    ]) {
      expect(checkCommercialTool(tool).allowed).toBe(false);
    }
  });
});

describe("scoreLead — pontuação de leads", () => {
  it("retorna sem_dados com menos de 2 sinais", () => {
    const r = scoreLead({ fit: 80 });
    expect(r.status).toBe("sem_dados");
    expect(r.score).toBeNull();
    expect(r.reason).toContain("evidência");
  });

  it("calcula score com 2 sinais", () => {
    const parsed = { fit: 100, interest: 0 } as const;
    const r = scoreLead(parsed as never);
    expect(r.status).toBe("medido");
    expect(r.score).toBe(54.55);
    expect(r.used).toEqual(["fit", "interest"]);
  });

  it("rejeita range inválido", () => {
    const r = scoreLead({ fit: 120 } as never);
    expect(r.status).toBe("sem_dados");
    expect(r.score).toBeNull();
  });
});

describe("formatBRLFromCents", () => {
  it("formata centavos em real brasileiro", () => {
    expect(formatBRLFromCents(123456)).toContain("R$");
    expect(formatBRLFromCents(123456)).toContain("1.234,56");
    expect(formatBRLFromCents(0)).toContain("0,00");
  });

  it("valor negativo resulta em sem_dados ou bloqueio", () => {
    const r = formatBRLFromCents(-1);
    expect(r).toContain("R$");
  });
});
