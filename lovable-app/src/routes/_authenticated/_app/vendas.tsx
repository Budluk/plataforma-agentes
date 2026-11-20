import { pageHead } from "@/lib/core/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runFunnel, runSales } from "@/lib/api/agents.functions";
import { trendsQuery } from "@/lib/queries";
import { renderPrintHtml } from "@/lib/core/print-report";
import { buildSalesReport } from "@/lib/core/sales-report";
import { Outcome, PageHeader, Panel } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_app/vendas")({
  head: () =>
    pageHead(
      "Vendas e funil — CentralIA",
      "Margem, preço, ponto de equilíbrio e diagnóstico de funil.",
    ),
  component: Vendas,
});

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function Vendas() {
  const qc = useQueryClient();
  const sales = useServerFn(runSales);
  const funnel = useServerFn(runFunnel);
  const [action, setAction] = useState<"margin" | "price" | "break_even">("margin");
  const [f, setF] = useState({
    product: "produto",
    unit_cost: "12",
    price: "30",
    target_margin_pct: "40",
    fixed_costs: "1000",
    competitors: "",
  });
  const [salesText, setSalesText] = useState("");
  const [funnelText, setFunnelText] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const s = useMutation({
    mutationFn: (d: Parameters<typeof sales>[0]["data"]) => sales({ data: d }),
  });
  const fu = useMutation({ mutationFn: (t: string) => funnel({ data: { text: t } }) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const request = () => ({
    action,
    product: f.product,
    unit_cost: num(f.unit_cost),
    price: action === "price" ? null : num(f.price),
    target_margin_pct: action === "price" ? num(f.target_margin_pct) : null,
    fixed_costs: action === "break_even" ? num(f.fixed_costs) : null,
    competitor_prices: f.competitors
      .split(/[\s;]+/)
      .filter(Boolean)
      .map((x) => Number(x.replace(",", "."))),
  });

  const printReport = async () => {
    setPdfBusy(true);
    setPdfError(null);
    // Open synchronously with the click so popup blockers keep the user gesture.
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      setPdfError("Pop-up bloqueado. Libere pop-ups para este site e tente novamente.");
      setPdfBusy(false);
      return;
    }
    try {
      const trends = await qc.fetchQuery(trendsQuery("latest", 24));
      const html = renderPrintHtml(
        buildSalesReport({
          generatedAt: new Date().toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          }),
          sales: s.data ?? null,
          funnel: fu.data ?? null,
          salesParams: request(),
          trendRows: trends.rows,
          trendObservationCount: trends.observations.length,
        }),
      );
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try {
          win.print();
        } catch {
          setPdfError("Não foi possível abrir a impressão. Use o menu Imprimir da janela aberta.");
        }
      }, 200);
    } catch (e) {
      win.close();
      setPdfError((e as Error).message || "Não foi possível abrir a impressão.");
    } finally {
      setPdfBusy(false);
    }
  };

  const submit = () => s.mutate({ request: request() });

  return (
    <>
      <PageHeader
        eyebrow="área · vendas e funil"
        title="Contas determinísticas"
        description="A IA só interpreta o pedido; todo número é calculado por código. Campos ausentes falham fechado — nada é inventado."
        actions={
          <Button
            variant="outline"
            disabled={pdfBusy || (!s.data && !fu.data)}
            onClick={printReport}
          >
            {pdfBusy ? "Abrindo…" : "Imprimir PDF"}
          </Button>
        }
      />
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="vendas" className="min-w-0">
          <div className="mb-4 flex gap-1">
            {(["margin", "price", "break_even"] as const).map((a) => (
              <Button
                key={a}
                size="sm"
                variant={action === a ? "signal" : "outline"}
                onClick={() => setAction(a)}
              >
                {a === "margin" ? "margem" : a === "price" ? "preço" : "equilíbrio"}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Produto" value={f.product} onChange={set("product")} />
            <Field label="Custo unitário" value={f.unit_cost} onChange={set("unit_cost")} />
            {action !== "price" ? (
              <Field label="Preço" value={f.price} onChange={set("price")} />
            ) : (
              <Field
                label="Margem-alvo (%)"
                value={f.target_margin_pct}
                onChange={set("target_margin_pct")}
              />
            )}
            {action === "break_even" ? (
              <Field label="Custos fixos" value={f.fixed_costs} onChange={set("fixed_costs")} />
            ) : null}
            <Field
              label="Concorrentes (opcional)"
              value={f.competitors}
              onChange={set("competitors")}
              placeholder="25 29 35"
            />
          </div>
          <Button className="mt-4" variant="signal" onClick={submit} disabled={s.isPending}>
            Calcular
          </Button>
          <div className="mt-5 border-t border-border pt-4">
            <Label>Ou em linguagem natural</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                className="min-w-0"
                value={salesText}
                onChange={(e) => setSalesText(e.target.value)}
                placeholder="custo 12, quero margem de 40%"
              />
              <Button
                variant="outline"
                disabled={s.isPending || !salesText.trim()}
                onClick={() => s.mutate({ text: salesText })}
              >
                Enviar
              </Button>
            </div>
          </div>
          {s.error ? (
            <p className="mt-4 text-sm text-destructive">{(s.error as Error).message}</p>
          ) : null}
          <Outcome result={s.data} />
        </Panel>
        <Panel title="funil" className="min-w-0">
          <Label htmlFor="funnel">Cole o relatório da campanha</Label>
          <Textarea
            id="funnel"
            rows={8}
            className="mt-1.5 readout text-xs"
            value={funnelText}
            onChange={(e) => setFunnelText(e.target.value)}
            placeholder={
              "Produto: curso\nInvestimento: 2000\nVisitantes: 5000\nCheckouts: 300\nVendas: 80 a 197\nOrder bump: 20 a 47\nUpsell: 10 a 297"
            }
          />
          <Button
            className="mt-3"
            variant="signal"
            disabled={fu.isPending || !funnelText.trim()}
            onClick={() => fu.mutate(funnelText)}
          >
            {fu.isPending ? "Diagnosticando…" : "Diagnosticar"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            O relatório é dado não confiável: instruções escritas nele não são seguidas. Nenhuma
            campanha é alterada.
          </p>
          {fu.error ? (
            <p className="mt-4 text-sm text-destructive">{(fu.error as Error).message}</p>
          ) : null}
          <Outcome result={fu.data} />
        </Panel>
      </div>
      <Panel
        title="relatório para impressão"
        className="mt-6"
        aside={
          <span className="readout text-xs text-muted-foreground">
            vendas + funil + tendências salvas
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">
          Abre a impressão do navegador com os resultados calculados nesta sessão e as tendências já
          salvas no app. Escolha “Salvar como PDF” na janela que abrir. Nada é coletado na geração;
          se um cálculo não foi feito, o relatório diz que ele está ausente.
        </p>
        {pdfError ? <p className="mt-3 text-sm text-destructive">{pdfError}</p> : null}
        {!s.data && !fu.data ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Execute um cálculo de vendas ou um diagnóstico de funil para habilitar o botão “Imprimir
            PDF”.
          </p>
        ) : null}
      </Panel>
    </>
  );
}

function Field({ label, ...p }: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="min-w-0 space-y-1">
      <Label>{label}</Label>
      <Input className="readout" {...p} />
    </div>
  );
}
