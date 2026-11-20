import { pageHead } from "@/lib/core/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { collectTrends, importTrendCsv } from "@/lib/api/content.functions";
import { personasQuery, trendsQuery } from "@/lib/queries";
import type { WindowMode } from "@/lib/core/trends";
import { fmtTs, PageHeader, Panel, StatusBadge } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/_app/tendencias")({
  head: () => pageHead("Tendências — CentralIA", "Coleta de tendências, importação de CSV e crescimento medido."),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(trendsQuery("latest", 24)), context.queryClient.ensureQueryData(personasQuery)]),
  component: Tendencias,
});

const MODES: { v: WindowMode; l: string }[] = [
  { v: "latest", l: "últimas duas" },
  { v: "window", l: "janela" },
  { v: "full", l: "histórico" },
];

function Tendencias() {
  const [mode, setMode] = useState<WindowMode>("latest");
  const [hours, setHours] = useState(24);
  const { data } = useSuspenseQuery(trendsQuery(mode, hours));
  const { data: personas } = useSuspenseQuery(personasQuery);
  const qc = useQueryClient();
  const collect = useServerFn(collectTrends);
  const importCsv = useServerFn(importTrendCsv);
  const [region, setRegion] = useState("BR");
  const [noFilter, setNoFilter] = useState(false);
  const active = personas.find((p) => p.enabled)?.persona_id ?? null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["trends"] });
  const col = useMutation({
    mutationFn: () => collect({ data: { region, persona: noFilter ? null : active, noFilter } }),
    onSuccess: (r) => (r.ok ? toast.success(`${"inserted" in r ? r.inserted : 0} novas observações`) : toast.error(r.error ?? "Falha na fonte")),
    onSettled: refresh,
  });
  const imp = useMutation({
    mutationFn: (csv: string) => importCsv({ data: { csv } }),
    onSuccess: (r) => {
      if (r.error) toast.error(r.error);
      else toast.success(`${r.inserted} gravadas, ${r.duplicates} duplicadas${r.rejected.length ? `, ${r.rejected.length} linhas rejeitadas` : ""}`);
    },
    onSettled: refresh,
  });

  return (
    <>
      <PageHeader eyebrow="automação de conteúdo · tendências" title="Crescimento medido, não chutado" description="Duas observações do mesmo assunto, na mesma métrica, com intervalo mínimo — senão o status diz que faltam dados. Sem extrapolação." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="coletar do Google Trends (RSS)">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="geo">Região</Label>
              <Input id="geo" value={region} onChange={(e) => setRegion(e.target.value.toUpperCase())} maxLength={5} className="readout w-24" />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="nf" checked={noFilter} onCheckedChange={setNoFilter} />
              <Label htmlFor="nf">sem filtro de persona</Label>
            </div>
            <Button variant="signal" disabled={col.isPending} onClick={() => col.mutate()}>{col.isPending ? "Coletando…" : "Coletar"}</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{noFilter ? "Gravando todos os termos do feed." : active ? `Filtrando pelos temas da persona ${active}.` : "Nenhuma persona ativa — ligue uma ou desative o filtro."}</p>
        </Panel>
        <Panel title="importar CSV">
          <Input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) imp.mutate(await f.text()); e.target.value = ""; }} />
          <p className="readout mt-2 text-xs text-muted-foreground">colunas: source, topic, url, language, region, collected_at, views</p>
        </Panel>
      </div>
      <Panel
        className="mt-6"
        title="relatório"
        aside={
          <div className="flex items-center gap-1">
            {MODES.map((m) => <Button key={m.v} size="sm" variant={mode === m.v ? "signal" : "outline"} onClick={() => setMode(m.v)}>{m.l}</Button>)}
            {mode === "window" ? <Input type="number" min={1} value={hours} onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 24))} className="readout ml-2 h-8 w-20" /> : null}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="eyebrow text-left">
              <tr><th className="py-2 pr-3">assunto</th><th className="pr-3">métrica</th><th className="pr-3">obs.</th><th className="pr-3">Δ</th><th className="pr-3">%</th><th className="pr-3">/hora</th><th>status</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((r) => (
                <tr key={r.source + r.subject_id}>
                  <td className="py-2 pr-3">{r.topic}<div className="readout text-xs text-muted-foreground">{r.source}</div></td>
                  <td className="readout pr-3 text-xs">{r.metric}</td>
                  <td className="readout pr-3">{r.observations_in_frame}/{r.observations}</td>
                  <td className="readout pr-3">{r.delta_views ?? "—"}</td>
                  <td className="readout pr-3">{r.growth_pct === null ? "—" : `${r.growth_pct}%`}</td>
                  <td className="readout pr-3">{r.views_per_hour ?? "—"}</td>
                  <td title={r.reason}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Sem dados neste recorte.</p> : null}
        </div>
      </Panel>
      <Panel className="mt-6" title="observações recentes">
        <div className="divide-y divide-border">
          {data.observations.slice(0, 30).map((o) => (
            <div key={o.id} className="grid grid-cols-[9rem_1fr_6rem_6rem] gap-3 py-1.5 text-xs">
              <span className="readout text-muted-foreground">{fmtTs(o.collected_at)}</span>
              <span className="truncate">{o.topic}</span>
              <span className="readout">{o.region}</span>
              <span className="readout text-right">{o.views ?? "—"}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
