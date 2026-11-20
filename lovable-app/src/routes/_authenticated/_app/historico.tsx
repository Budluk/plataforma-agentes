import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listEventLogs, listHistory } from "@/lib/api/agents.functions";
import { fmtTs, JsonView, PageHeader, Panel, StatusBadge } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageHead } from "@/lib/core/pageHead";

export const Route = createFileRoute("/_authenticated/_app/historico")({
  head: () => pageHead("Histórico — CentralIA", "Execuções e registros de eventos de todos os agentes."),
  component: Historico,
});

const AGENTS = ["", "risk_manager", "analyst", "music_agent", "sales_agent", "funnel_agent", "research_agent", "dev_writer", "dev_reviewer", "central", "trends_agent"];
const STREAMS = ["", "finance", "music", "sales", "funnel", "research", "dev", "central", "content", "trends"];

function Historico() {
  const [agent, setAgent] = useState("");
  const [page, setPage] = useState(0);
  const [stream, setStream] = useState("");
  const [logPage, setLogPage] = useState(0);
  const runs = useQuery({ queryKey: ["history", agent, page], queryFn: () => listHistory({ data: agent ? { agent, page } : { page } }), placeholderData: keepPreviousData });
  const logs = useQuery({ queryKey: ["logs", stream, logPage], queryFn: () => listEventLogs({ data: stream ? { stream, page: logPage } : { page: logPage } }), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader eyebrow="registro" title="Histórico" description="Tudo o que os agentes fizeram, incluindo o que foi importado da versão anterior." />
      <Tabs defaultValue="runs">
        <TabsList className="mb-4">
          <TabsTrigger value="runs">Execuções</TabsTrigger>
          <TabsTrigger value="logs">Eventos</TabsTrigger>
        </TabsList>
        <TabsContent value="runs">
          <Filters options={AGENTS} value={agent} onChange={(v) => { setAgent(v); setPage(0); }} />
          <Panel aside={<Pager page={page} total={runs.data?.total ?? 0} size={50} onPage={setPage} />} title={`${runs.data?.total ?? "…"} execuções`}>
            <div className="divide-y divide-border">
              {runs.data?.rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[8rem_9rem_1fr_auto] items-center gap-3 py-1.5 text-sm">
                  <span className="readout text-xs text-muted-foreground">{fmtTs(r.ts)}</span>
                  <span className="readout text-xs">{r.agent}{r.asset ? ` · ${r.asset}` : ""}</span>
                  <span className="truncate text-xs text-muted-foreground" title={r.detail ?? undefined}>{r.detail}</span>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="logs">
          <Filters options={STREAMS} value={stream} onChange={(v) => { setStream(v); setLogPage(0); }} />
          <Panel aside={<Pager page={logPage} total={logs.data?.total ?? 0} size={100} onPage={setLogPage} />} title={`${logs.data?.total ?? "…"} eventos`}>
            <div className="divide-y divide-border">
              {logs.data?.rows.map((l) => (
                <details key={l.id} className="py-1.5">
                  <summary className="grid cursor-pointer grid-cols-[9rem_6rem_10rem_1fr] gap-3 text-xs">
                    <span className="readout text-muted-foreground">{fmtTs(l.ts)}</span>
                    <span className="readout">{l.stream}</span>
                    <span className="readout">{l.event}</span>
                    <span className="readout truncate text-muted-foreground">{l.run_id}</span>
                  </summary>
                  <JsonView value={l.fields} className="mt-2 max-h-60" />
                </details>
              ))}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Filters({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1">
      {options.map((o) => (
        <Button key={o || "all"} size="sm" variant={value === o ? "signal" : "outline"} onClick={() => onChange(o)}>{o || "todos"}</Button>
      ))}
    </div>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>‹</Button>
      <span className="readout text-xs text-muted-foreground">{page + 1}/{last + 1}</span>
      <Button size="sm" variant="outline" disabled={page >= last} onClick={() => onPage(page + 1)}>›</Button>
    </div>
  );
}
