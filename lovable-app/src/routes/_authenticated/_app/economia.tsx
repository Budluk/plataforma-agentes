import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { checkMarket, runFinance, setPortfolio } from "@/lib/api/agents.functions";
import { financeQuery } from "@/lib/queries";
import { ALLOWED_ASSETS } from "@/lib/core/config";
import { MAX_DAILY_LOSS_PCT, MAX_STOP_DISTANCE_PCT, MIN_REWARD_RISK } from "@/lib/core/hardGate";
import { fmtTs, JsonView, PageHeader, Panel, Reasons } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { pageHead } from "@/lib/core/pageHead";

export const Route = createFileRoute("/_authenticated/_app/economia")({
  head: () => pageHead("Economia — CentralIA", "Analista, gestor de risco, hard gate e alertas."),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQuery),
  component: Economia,
});

function parseNumber(text: string): number {
  const s = text.trim();
  if (s.includes(",") && s.includes(".")) throw new Error("use só um separador decimal (ponto ou vírgula)");
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("número inválido");
  return n;
}

function Economia() {
  const { data } = useSuspenseQuery(financeQuery);
  const qc = useQueryClient();
  const finance = useServerFn(runFinance);
  const market = useServerFn(checkMarket);
  const savePf = useServerFn(setPortfolio);
  const [asset, setAsset] = useState<string>("PETR4");
  const [equity, setEquity] = useState(String(data.portfolio?.equity ?? ""));
  const [pnl, setPnl] = useState(String(data.portfolio?.daily_pnl_pct ?? "0"));
  const [consistent, setConsistent] = useState(data.portfolio?.equity_snapshot_consistent ?? true);

  const run = useMutation({ mutationFn: (a: string) => finance({ data: { asset: a } }), onSettled: () => qc.invalidateQueries({ queryKey: ["finance"] }) });
  const mk = useMutation({ mutationFn: () => market() });
  const pf = useMutation({
    mutationFn: () => savePf({ data: { equity: parseNumber(equity), daily_pnl_pct: parseNumber(pnl), consistent } }),
    onSuccess: () => toast.success("Portfólio gravado."),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });

  return (
    <>
      <PageHeader
        eyebrow="área · economia"
        title="Analista → risco → gate → alerta"
        description="Somente análise e alerta: nenhuma ordem é executada, nem existe ferramenta para isso. Preços reais de fontes gratuitas; se a fonte falhar, a análise é rejeitada."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="analisar ativo">
          <div className="flex flex-wrap gap-2">
            {ALLOWED_ASSETS.map((a) => (
              <button key={a} onClick={() => setAsset(a)} className={cn("readout rounded-md border px-3 py-1.5 text-sm", asset === a ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                {a}
              </button>
            ))}
            <Button variant="signal" className="ml-auto" disabled={run.isPending} onClick={() => run.mutate(asset)}>
              {run.isPending ? "Analisando…" : "Rodar análise"}
            </Button>
          </div>
          {data.problem ? <p className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">Aviso sobre o portfólio: {data.problem}</p> : null}
          {run.error ? <p className="mt-4 text-sm text-destructive">{(run.error as Error).message}</p> : null}
          {run.data ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className={cn("signal-dot", run.data.approved ? "text-success" : "text-destructive")} />
                <span className="readout text-sm">{run.data.approved ? `alerta emitido: ${run.data.alert?.message}` : "rejeitado pelo pipeline"}</span>
              </div>
              <Reasons reasons={run.data.reasons} />
              {run.data.alert ? <JsonView value={run.data.alert} /> : null}
            </div>
          ) : null}
          <div className="mt-6 border-t border-border pt-4">
            <div className="eyebrow mb-2">regras do hard gate</div>
            <ul className="readout grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              <li>perda diária ≤ −{MAX_DAILY_LOSS_PCT}% rejeita</li>
              <li>stop a mais de {MAX_STOP_DISTANCE_PCT}% da entrada rejeita</li>
              <li>retorno/risco abaixo de {MIN_REWARD_RISK} rejeita</li>
              <li>entrada a mais de 2% do mercado rejeita</li>
              <li>LONG: stop &lt; entrada &lt; alvo; SHORT inverso</li>
              <li>portfólio ausente, antigo (&gt;24 h) ou inconsistente rejeita</li>
            </ul>
          </div>
        </Panel>
        <Panel title="portfólio (você mantém)">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              pf.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="eq">Equity</Label>
              <Input id="eq" inputMode="decimal" value={equity} onChange={(e) => setEquity(e.target.value)} className="readout" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pnl">Resultado do dia (%)</Label>
              <Input id="pnl" inputMode="decimal" value={pnl} onChange={(e) => setPnl(e.target.value)} className="readout" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="cons">Snapshot consistente</Label>
              <Switch id="cons" checked={consistent} onCheckedChange={setConsistent} />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={pf.isPending}>
              Gravar portfólio
            </Button>
            <p className="text-xs text-muted-foreground">Atualizado: {fmtTs(data.portfolio?.updated_at)}. O gate só é tão confiável quanto estes números.</p>
          </form>
        </Panel>
      </div>
      <Panel className="mt-6" title="cotações (somente leitura)" aside={<Button size="sm" variant="outline" disabled={mk.isPending} onClick={() => mk.mutate()}>{mk.isPending ? "Consultando…" : "Consultar agora"}</Button>}>
        {mk.data ? (
          <div className="grid gap-2 md:grid-cols-5">
            {mk.data.map((q) => (
              <div key={q.asset} className="rounded-md border border-border p-3">
                <div className="readout text-xs text-muted-foreground">{q.asset}</div>
                {q.ok ? (
                  <>
                    <div className="readout text-lg">{q.price}</div>
                    <div className="text-xs text-muted-foreground">{q.source} · {fmtTs(q.as_of ?? null)}</div>
                  </>
                ) : (
                  <div className="text-xs text-destructive">{q.error}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">brapi.dev (B3), Binance (BTC) e Frankfurter (taxa de referência do BCE, não é cotação de negociação).</p>
        )}
      </Panel>
      <Panel className="mt-6" title={`alertas (${data.alerts.length})`}>
        <div className="divide-y divide-border">
          {data.alerts.map((a) => {
            const p = a.payload as Record<string, unknown>;
            return (
              <div key={a.id} className="grid grid-cols-[8rem_5rem_1fr_auto] items-center gap-3 py-2 text-sm">
                <span className="readout text-xs text-muted-foreground">{fmtTs(a.ts)}</span>
                <span className="readout">{a.asset}</span>
                <span className="readout text-xs text-muted-foreground">
                  entrada {String(p["entry_price"])} · stop {String(p["stop_price"])} · alvo {String(p["target_price"])}
                </span>
                <span className="readout text-xs text-primary">{String(p["message"])}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
