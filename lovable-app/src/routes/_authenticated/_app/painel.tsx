import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Send } from "lucide-react";
import { runCentral } from "@/lib/api/agents.functions";
import { overviewQuery } from "@/lib/queries";
import { AREA_LABELS } from "@/lib/core/config";
import {
  fmtTs,
  JsonView,
  PageHeader,
  Panel,
  Reasons,
  Stat,
  StatusBadge,
} from "@/components/console";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { pageHead } from "@/lib/core/pageHead";
import {
  concentrationByAgent,
  periodComparison,
  qualitySnapshot,
  targetProgress,
  windowCounts,
  type RunLike,
} from "@/lib/core/dashboard";

export const Route = createFileRoute("/_authenticated/_app/painel")({
  head: () => pageHead("Central — CentralIA", "Roteador central de pedidos em linguagem natural."),
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  component: Painel,
});

const EXAMPLES = [
  "Analise PETR4 e me diga se há um alerta",
  "Qual o acorde das notas 60 64 67?",
  "Custo 12, vendo a 30: qual minha margem?",
  "Resuma https://pt.wikipedia.org/wiki/Python e diga para que serve",
  "Escreva uma função que verifica se um número é primo",
];

function Painel() {
  const { data } = useSuspenseQuery(overviewQuery);
  const qc = useQueryClient();
  const central = useServerFn(runCentral);
  const [text, setText] = useState("");
  const m = useMutation({
    mutationFn: (t: string) => central({ data: { text: t } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["overview"] }),
  });
  const now = new Date();
  const runs = data.recentRuns as unknown as RunLike[];
  const concentration = concentrationByAgent(runs);
  const daily = periodComparison(runs, "day", now);
  const quality = qualitySnapshot(runs);
  const windows = windowCounts(runs, now);
  const goal = targetProgress(null, null);

  return (
    <>
      <PageHeader
        eyebrow="agente central"
        title="O que você precisa?"
        description="O roteador escolhe uma área de uma lista fechada. Na dúvida, nada é despachado — e cada área continua passando pelos próprios contratos e gates."
      />
      <div className="panel bay mb-6 flex flex-wrap items-center gap-4 px-5 py-3">
        <div className="eyebrow">fluxo do roteador</div>
        <div className="route-track hidden max-w-[240px] sm:block">
          <span className="route-traveler" />
        </div>
        <span className="readout text-xs text-muted-foreground">
          pedido → contrato → gate → execução
        </span>
        <span
          className={cn(
            "readout ml-auto flex items-center gap-2 text-xs",
            m.isPending ? "text-primary" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "signal-dot",
              m.isPending ? "animate-signal text-primary" : "text-success",
            )}
          />
          {m.isPending ? "despachando" : "pronto para despachar"}
        </span>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="execuções registradas" value={data.totalRuns.toLocaleString("pt-BR")} />
        <Stat label="alertas emitidos" value={data.alertCount} />
        <Stat
          label="aprovações pendentes"
          value={data.pendingApprovals}
          tone={data.pendingApprovals ? "warning" : undefined}
        />
        <Stat
          label="kill switch"
          value={data.kill.engaged ? "ATIVO" : "desligado"}
          tone={data.kill.engaged ? "danger" : "success"}
        />
      </div>
      <Panel
        title="pedido"
        aside={
          <span className="readout text-xs text-muted-foreground">
            IA:{" "}
            {data.llm.provider === "groq"
              ? `Groq · ${data.llm.model}`
              : `Lovable AI · ${data.llm.model}`}
          </span>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) m.mutate(text);
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1500}
            placeholder="Escreva um pedido em linguagem natural…"
            className="readout text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                type="button"
                key={ex}
                onClick={() => setText(ex)}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
            <Button
              type="submit"
              variant="signal"
              className="ml-auto"
              disabled={m.isPending || !text.trim()}
            >
              <Send /> {m.isPending ? "Processando…" : "Despachar"}
            </Button>
          </div>
        </form>
        {m.error ? (
          <p className="mt-4 text-sm text-destructive">{(m.error as Error).message}</p>
        ) : null}
        {m.data ? (
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("signal-dot", m.data.ok ? "text-success" : "text-destructive")} />
              <span className="readout text-sm">
                área: {AREA_LABELS[m.data.area as keyof typeof AREA_LABELS] ?? m.data.area}
              </span>
              <span className="readout text-xs text-muted-foreground">
                {m.data.dispatched ? "despachado" : "não despachado"}
              </span>
              <StatusBadge status={m.data.ok ? "ok" : "rejected"} />
            </div>
            <Reasons reasons={m.data.reasons} />
            {m.data.data ? <JsonView value={m.data.data} /> : null}
          </div>
        ) : null}
      </Panel>
      <Panel
        title="leituras derivadas"
        className="mt-6"
        aside={
          <span className="readout text-xs text-muted-foreground">
            amostra: últimas {runs.length} execuções
          </span>
        }
      >
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="concentração dos agentes"
            value={concentration.share_pct === null ? "—" : `${concentration.share_pct}%`}
          />
          <Stat
            label={`execuções · ${daily.current_key}`}
            value={daily.pct === null ? "—" : `${daily.pct > 0 ? "+" : ""}${daily.pct}%`}
          />
          <Stat label="hoje / no mês" value={`${windows.today} / ${windows.month}`} />
          <Stat
            label="bloqueadas"
            value={quality.blocked_pct === null ? "—" : `${quality.blocked_pct}%`}
            tone={quality.blocked > 0 ? "warning" : undefined}
          />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="eyebrow mb-2">concentração por agente</div>
            <p className="text-xs text-muted-foreground">{concentration.reason}</p>
            {concentration.agents.length ? (
              <table className="mt-3 w-full text-sm">
                <thead className="eyebrow text-left">
                  <tr>
                    <th className="py-1 pr-3">agente</th>
                    <th className="pr-3">execuções</th>
                    <th>participação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {concentration.agents.slice(0, 5).map((a) => (
                    <tr key={a.agent}>
                      <td className="py-1.5 pr-3">{a.agent}</td>
                      <td className="readout pr-3">{a.runs}</td>
                      <td className="readout">{a.share_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="eyebrow mb-2">comparações e estado</div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>{daily.reason}</li>
              <li>
                Período anterior: {daily.previous_key} — {daily.previous} execução(ões).
              </li>
              <li>Meta: {goal.reason}</li>
              <li>{quality.note}</li>
            </ul>
            <div className="readout mt-3 flex flex-wrap gap-2 text-xs">
              {Object.entries(quality.by_status).map(([status, count]) => (
                <span key={status} className="rounded border border-border px-2 py-1">
                  {status}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="últimas execuções" className="mt-6">
        <div className="divide-y divide-border">
          {data.recentRuns.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[7rem_8rem_1fr_auto] items-center gap-3 py-2 text-sm"
            >
              <span className="readout text-xs text-muted-foreground">{fmtTs(r.ts)}</span>
              <span className="readout text-xs">
                {r.agent}
                {r.asset ? ` · ${r.asset}` : ""}
              </span>
              <span className="truncate text-muted-foreground">{r.detail}</span>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
