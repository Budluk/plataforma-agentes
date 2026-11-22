import { describe, expect, it } from "vitest";
import {
  IntelligenceNarrativeSchema,
  buildIntelligenceReport,
  consolidateIntelligence,
  intelligencePrintHtml,
  redactIntelligenceAudit,
} from "@/lib/core/inteligencia";

const AS_OF = "2026-11-21T12:00:00.000Z";

const DASHBOARD = {
  id: "f-dashboard",
  modulo: "dashboard" as const,
  fonte: "buildCommercialOverview",
  status: "medido" as const,
  organizationId: "org-1",
  asOf: AS_OF,
  amostra: false,
  metricas: [
    {
      key: "realizedRevenueCents",
      label: "Receita realizada",
      status: "medido" as const,
      valor: "R$ 1.900,00",
      unidade: "centavos" as const,
      severidade: "alta" as const,
    },
    {
      key: "conversionRatePct",
      label: "Conversão",
      status: "medido" as const,
      valor: "12,5%",
      unidade: "percentual" as const,
      severidade: "media" as const,
    },
  ],
  reasons: [],
};

const CRM = {
  id: "f-crm",
  modulo: "crm" as const,
  fonte: "buildCommercialSeries",
  status: "medido" as const,
  organizationId: "org-1",
  asOf: AS_OF,
  amostra: false,
  metricas: [
    {
      key: "qualifiedLeads",
      label: "Leads qualificados",
      status: "sem_dados" as const,
      valor: null,
      unidade: "contagem" as const,
      severidade: "baixa" as const,
    },
  ],
  reasons: [],
};

const NARRATIVE = IntelligenceNarrativeSchema.parse({
  resumo: "Leitura editorial sem numeros inventados sobre os achados informados.",
  observacoes: [{ achadoId: "A1", texto: "Valor informado pela fonte, sem recalculo." }],
  limites: ["Nenhuma acao externa foi executada nesta leitura."],
});

const RUN = {
  organizationId: "org-1",
  asOf: AS_OF,
  leituras: [DASHBOARD, CRM],
  grantActions: ["ler_dashboard", "gerar_leitura"],
  autonomy: "autonomo_controlado" as const,
};

describe("intelligence consolidation", () => {
  it("consolidates supplied readings into a deterministic read-only leitura", async () => {
    const r = await consolidateIntelligence(RUN);
    expect(r.status).toBe("parcial");
    expect(r.organization_id).toBe("org-1");
    expect(r.timezone).toBe("America/Sao_Paulo");
    expect(r.as_of).toBe(AS_OF);
    expect(r.canSend).toBe(false);
    expect(r.canExecute).toBe(false);
    expect(r.reading_id).toHaveLength(64);
    expect(r.cobertura_pct).toBe(66.67);
    expect(r.achados).toHaveLength(2);
    expect(r.lacunas).toHaveLength(1);
    expect(r.achados[0]).toMatchObject({ id: "A1", severidade: "alta", valor: "R$ 1.900,00" });
    expect(r.achados[0]?.reason).toContain("não recalculado");
    expect((await consolidateIntelligence(RUN)).reading_id).toBe(r.reading_id);
  });

  it("reports fully measured bases without inventing gaps", async () => {
    const r = await consolidateIntelligence({ ...RUN, leituras: [DASHBOARD] });
    expect(r.status).toBe("medido");
    expect(r.cobertura_pct).toBe(100);
    expect(r.lacunas).toEqual([]);
    expect(r.divergencias).toEqual([]);
  });

  it("returns sem_dados instead of a fabricated reading when nothing is informed", async () => {
    const r = await consolidateIntelligence({ ...RUN, leituras: [] });
    expect(r.status).toBe("sem_dados");
    expect(r.cobertura_pct).toBeNull();
    expect(r.achados).toEqual([]);
    expect(r.reasons.some((x) => x.includes("nenhuma leitura"))).toBe(true);
  });

  it("keeps sample sources explicitly labelled and never as real achados", async () => {
    const sample = {
      ...DASHBOARD,
      id: "f-amostra",
      amostra: true,
      organizationId: "org-1",
    };
    const r = await consolidateIntelligence({ ...RUN, leituras: [sample] });
    expect(r.status).toBe("sem_dados");
    expect(r.achados).toEqual([]);
    expect(r.amostras).toEqual([
      { fonteId: "f-amostra", rotulo: expect.stringContaining("AMOSTRA") },
    ]);
  });

  it("sorts achados by declared severity and caps the output", async () => {
    const many = Array.from({ length: 4 }, (_, i) => ({
      ...DASHBOARD,
      id: `f-${i}`,
      metricas: [
        {
          key: `m-${i}`,
          label: `Métrica ${i}`,
          status: "medido" as const,
          valor: `valor ${i}`,
          severidade: (i === 3 ? "alta" : "informativa") as "alta" | "informativa",
        },
      ],
    }));
    const r = await consolidateIntelligence({ ...RUN, leituras: many, maxAchados: 2 });
    expect(r.achados.map((a) => a.severidade)).toEqual(["alta", "informativa"]);
    expect(r.achados).toHaveLength(2);
  });
});

describe("intelligence gates and boundaries", () => {
  it("blocks when the read grant is missing and requires approval at assisted level", async () => {
    const blocked = await consolidateIntelligence({ ...RUN, grantActions: [] });
    expect(blocked.status).toBe("sem_dados");
    expect(blocked.requiresApproval).toBe(false);
    expect(blocked.reasons.some((x) => x.includes("não concedida"))).toBe(true);

    const assisted = await consolidateIntelligence({ ...RUN, autonomy: "assistido" });
    expect(assisted.requiresApproval).toBe(true);
    expect(assisted.achados).toHaveLength(2);
    expect(assisted.canExecute).toBe(false);
  });

  it("stops everything on the kill switch", async () => {
    const r = await consolidateIntelligence({ ...RUN, killEngaged: true });
    expect(r.status).toBe("sem_dados");
    expect(r.achados).toEqual([]);
    expect(r.reasons[0]).toContain("kill switch");
    expect(r.requiresApproval).toBe(false);
  });

  it("refuses tenant mismatch, instant mismatch and duplicated sources", async () => {
    await expect(
      consolidateIntelligence({ ...RUN, leituras: [{ ...DASHBOARD, organizationId: "org-2" }] }),
    ).rejects.toThrow("outro tenant");
    await expect(
      consolidateIntelligence({
        ...RUN,
        leituras: [{ ...DASHBOARD, asOf: "2026-11-20T12:00:00.000Z" }],
      }),
    ).rejects.toThrow("instante divergente");
    await expect(
      consolidateIntelligence({ ...RUN, leituras: [DASHBOARD, DASHBOARD] }),
    ).rejects.toThrow("fonte duplicada");
    await expect(consolidateIntelligence({ ...RUN, asOf: "agora" })).rejects.toThrow("asOf");
  });
});

describe("declared monetary divergences", () => {
  const claims = [
    { conceito: "receita_realizada" as const, cents: 190000, fonteId: "f-dashboard" },
    { conceito: "receita_realizada" as const, cents: 180000, fonteId: "f-crm" },
  ];

  it("reports divergence without choosing a winner", async () => {
    const r = await consolidateIntelligence({ ...RUN, claims });
    expect(r.status).toBe("parcial");
    expect(r.divergencias).toEqual([
      expect.objectContaining({
        conceito: "receita_realizada",
        status: "divergente",
        fonteIds: ["f-dashboard", "f-crm"],
      }),
    ]);
    expect(r.divergencias[0]?.valores).toHaveLength(2);
    expect(r.divergencias[0]?.reason).toContain("nenhum valor foi escolhido");
  });

  it("stays silent when equivalent claims agree and rejects unknown sources", async () => {
    const same = claims.map((c) => ({ ...c, cents: 190000 }));
    expect((await consolidateIntelligence({ ...RUN, claims: same })).divergencias).toEqual([]);
    await expect(
      consolidateIntelligence({
        ...RUN,
        claims: [{ conceito: "receita_realizada", cents: 1, fonteId: "inexistente" }],
      }),
    ).rejects.toThrow("fonte não informada");
  });
});

describe("editorial layer", () => {
  it("accepts digit-free prose bound to an existing achado", async () => {
    const r = await consolidateIntelligence({ ...RUN, narrative: NARRATIVE });
    expect(r.narrativa.status).toBe("gerada");
    expect(r.narrativa.dados?.observacoes[0]?.achadoId).toBe("A1");
  });

  it("refuses invented numbers, unknown achado ids and model failures", async () => {
    const withDigits = await consolidateIntelligence({
      ...RUN,
      narrative: { ...NARRATIVE, resumo: "Receita de R$ 1.900,00 informada pela fonte." },
    });
    expect(withDigits.narrativa.status).toBe("falhou");
    expect(withDigits.narrativa.dados).toBeNull();

    const unknown = await consolidateIntelligence({
      ...RUN,
      narrative: {
        ...NARRATIVE,
        observacoes: [{ achadoId: "A99", texto: "Valor informado pela fonte, sem recalculo." }],
      },
    });
    expect(unknown.narrativa.status).toBe("falhou");

    const failed = await consolidateIntelligence({ ...RUN, narrativeError: "modelo indisponível" });
    expect(failed.narrativa.status).toBe("falhou");
    expect(failed.narrativa.reason).toContain("modelo indisponível");
    expect(failed.achados).toHaveLength(2);
  });

  it("keeps deterministic achados when the editorial grant is absent", async () => {
    const r = await consolidateIntelligence({
      ...RUN,
      grantActions: ["ler_dashboard"],
      narrative: NARRATIVE,
    });
    expect(r.narrativa.status).toBe("sem_permissao");
    expect(r.achados).toHaveLength(2);
  });
});

describe("audit and report", () => {
  it("redacts labels, values and reasons from the audit record", async () => {
    const r = await consolidateIntelligence(RUN);
    const serialized = JSON.stringify(r.audit);
    expect(r.audit.fonte_count).toBe(2);
    expect(r.audit.achado_count).toBe(2);
    expect(r.audit.lacuna_count).toBe(1);
    expect(serialized).not.toContain("Receita realizada");
    expect(serialized).not.toContain("R$ 1.900,00");
    expect(serialized).not.toContain("org-2");
    expect(
      redactIntelligenceAudit({ ...r, achados: [], lacunas: [], divergencias: [] }).achado_count,
    ).toBe(0);
  });

  it("renders the report model and the existing browser print renderer", async () => {
    const r = await consolidateIntelligence(RUN);
    const doc = buildIntelligenceReport({ reading: r, generatedAt: "21/11/2026 12:00" });
    expect(doc.title).toBe("Leitura comercial");
    expect(JSON.stringify(doc.blocks)).toContain("R$ 1.900,00");
    expect(JSON.stringify(doc.blocks)).toContain("Nenhuma divergência declarada");
    const html = intelligencePrintHtml({ reading: r, generatedAt: "21/11/2026 12:00" });
    expect(html.startsWith('<!doctype html>\n<html lang="pt-BR">')).toBe(true);
    expect(html).toContain("Leitura comercial");
    expect(html).toContain("Somente leitura");
  });

  it("labels sample sources in the report", async () => {
    const r = await consolidateIntelligence({
      ...RUN,
      leituras: [{ ...DASHBOARD, id: "f-amostra", amostra: true }],
    });
    const doc = buildIntelligenceReport({ reading: r, generatedAt: "21/11/2026 12:00" });
    expect(JSON.stringify(doc.blocks)).toContain("AMOSTRA");
    expect(JSON.stringify(doc.blocks)).toContain("não é produto, preço, cliente, venda ou tendência real");
  });
});
