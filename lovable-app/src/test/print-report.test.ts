import { describe, it, expect } from "vitest";
import { renderPrintHtml } from "@/lib/core/print-report";
import type { ReportDocument } from "@/lib/core/report";
import {
  buildSalesReport,
  type SalesParams,
  type SalesReportInput,
  type TrendRowLike,
} from "@/lib/core/sales-report";

const params: SalesParams = {
  product: "curso",
  action: "margin",
  unit_cost: 12,
  price: 30,
  target_margin_pct: null,
  fixed_costs: null,
  competitor_prices: [25, 35],
};

const base = {
  generatedAt: "19/11/2026 23:10",
  sales: null,
  funnel: null,
  salesParams: params,
  trendRows: [] as TrendRowLike[],
  trendObservationCount: 0,
};

const htmlOf = (input: SalesReportInput) => renderPrintHtml(buildSalesReport(input));

describe("print renderer", () => {
  const doc: ReportDocument = {
    title: "Relatório <teste>",
    subtitle: "CentralIA & Cia",
    generatedAt: "hoje",
    blocks: [
      { kind: "text", text: '<script>alert(1)</script> & "aspas"', style: "body" },
      { kind: "text", text: "bruto", style: "estranho" as never },
      { kind: "space", points: 999 },
      { kind: "table", headers: ["<col>"], rows: [["valor", null]] },
    ],
  };

  it("emits a self-contained A4 page with an escaped title", () => {
    const html = renderPrintHtml(doc);
    expect(html.startsWith('<!doctype html>\n<html lang="pt-BR">')).toBe(true);
    expect(html).toContain("<title>Relatório &lt;teste&gt; — CentralIA</title>");
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("@page { size: A4; margin: 14mm; }");
    expect(html).toContain("<h1>Relatório &lt;teste&gt;</h1>");
    expect(html).toContain("CentralIA &amp; Cia");
    expect(html).toContain("Gerado em hoje");
  });

  it("escapes every dynamic value and whitelists style names", () => {
    const html = renderPrintHtml(doc);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;aspas&quot;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<p class="body">bruto</p>');
    expect(html).not.toContain('class="estranho"');
  });

  it("renders tables and clamps spacing", () => {
    const html = renderPrintHtml(doc);
    expect(html).toContain("<table><thead><tr><th>&lt;col&gt;</th></tr></thead>");
    expect(html).toContain("<td>valor</td><td>—</td>");
    expect(html).toContain('style="height:60px"');
  });
});

describe("sales print report model", () => {
  it("never fabricates values when nothing was calculated", () => {
    const html = htmlOf(base);
    expect(html).toContain("Nenhum cálculo de vendas executado nesta sessão");
    expect(html).toContain("Nenhum diagnóstico de funil executado nesta sessão");
    expect(html).toContain("Sem observações salvas no app");
    expect(html).toContain("nenhuma coleta ao vivo foi feita na geração");
    expect(html).not.toContain("R$ 0,00");
  });

  it("includes the sales result and the parameters used", () => {
    const html = htmlOf({
      ...base,
      sales: {
        ok: true,
        reasons: [],
        data: { margin_pct: 60, markup_pct: 150, profit_per_unit: 18 },
      },
    });
    expect(html).toContain("curso");
    expect(html).toContain("Margem (%)");
    expect(html).toContain("60%");
    expect(html).toContain("R$ 18");
    expect(html).toContain("25 · 35");
  });

  it("includes funnel results, nested rates and the interpretation note", () => {
    const html = htmlOf({
      ...base,
      funnel: {
        ok: true,
        reasons: [],
        data: {
          revenue: 1000,
          profit: 200,
          roas: 2.5,
          decision: "escalar",
          note: "ROAS acima do limite",
          rates: { visit_to_checkout_pct: 6, checkout_to_front_pct: 26 },
        },
      },
    });
    expect(html).toContain("Receita bruta");
    expect(html).toContain("R$ 1.000");
    expect(html).toContain("ROAS");
    expect(html).toContain("taxas · Visitante");
    expect(html).toContain("Interpretação: ROAS acima do limite");
  });

  it("shows rejection reasons and no numbers when a gate refused the result", () => {
    const html = htmlOf({
      ...base,
      sales: { ok: false, reasons: ["preço ausente (falha fechada)"], data: { margin_pct: 999 } },
    });
    expect(html).toContain("rejeitado pelos gates");
    expect(html).toContain("preço ausente (falha fechada)");
    expect(html).not.toContain("Margem (%)");
    expect(html).not.toContain("999");
  });

  it("uses saved trend rows without any live collection", () => {
    const rows: TrendRowLike[] = [
      {
        topic: "café",
        metric: "views",
        observations: 5,
        observations_in_frame: 2,
        status: "insufficient_history",
        reason: "Menos de duas observacoes no recorte escolhido",
        delta_views: null,
        growth_pct: null,
        views_per_hour: null,
      },
    ];
    const html = htmlOf({ ...base, trendRows: rows, trendObservationCount: 14 });
    expect(html).toContain("Tendências do momento");
    expect(html).toContain("café");
    expect(html).toContain("insufficient_history");
    expect(html).toContain("Menos de duas observacoes no recorte escolhido");
    expect(html).toContain("Observações já salvas no app: 14");
  });

  it("caps the trend table and states when rows were left out", () => {
    const rows: TrendRowLike[] = Array.from({ length: 40 }, (_, i) => ({
      topic: `assunto ${i}`,
      status: "ok",
    }));
    const html = htmlOf({ ...base, trendRows: rows, trendObservationCount: 40 });
    expect(html).toContain("Mostrando 30 de 40 assuntos");
    expect(html).not.toContain("assunto 35");
  });
});
