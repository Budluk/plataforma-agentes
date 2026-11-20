import { pageHead } from "@/lib/core/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runDevReview, runDevWrite } from "@/lib/api/agents.functions";
import { devOutputsQuery } from "@/lib/queries";
import { DEV_ALLOWED_IMPORTS } from "@/lib/core/config";
import { fmtTs, Outcome, PageHeader, Panel } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_app/dev")({
  head: () => pageHead("Desenvolvimento — CentralIA", "Geração e revisão de código Python sem execução."),
  loader: ({ context }) => context.queryClient.ensureQueryData(devOutputsQuery),
  component: Dev,
});

function Dev() {
  const { data: outputs } = useSuspenseQuery(devOutputsQuery);
  const qc = useQueryClient();
  const write = useServerFn(runDevWrite);
  const review = useServerFn(runDevReview);
  const [task, setTask] = useState("");
  const [code, setCode] = useState("");
  const w = useMutation({ mutationFn: () => write({ data: { task } }), onSettled: () => qc.invalidateQueries({ queryKey: ["dev-outputs"] }) });
  const r = useMutation({ mutationFn: () => review({ data: { code } }) });
  return (
    <>
      <PageHeader eyebrow="área · desenvolvimento" title="Escrever e revisar Python" description="O código gerado nunca é executado. Só passa se for sintaticamente válido e importar apenas módulos da lista permitida." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="escrever">
          <div className="flex gap-2">
            <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="função que verifica se um número é primo" />
            <Button variant="signal" disabled={w.isPending || !task.trim()} onClick={() => w.mutate()}>{w.isPending ? "Gerando…" : "Gerar"}</Button>
          </div>
          <p className="readout mt-2 text-xs text-muted-foreground">imports permitidos: {DEV_ALLOWED_IMPORTS.join(", ")}</p>
          {w.error ? <p className="mt-4 text-sm text-destructive">{(w.error as Error).message}</p> : null}
          <Outcome result={w.data} />
        </Panel>
        <Panel title="revisar">
          <Textarea rows={8} value={code} onChange={(e) => setCode(e.target.value)} className="readout text-xs" placeholder="cole o código Python" />
          <Button className="mt-3" variant="signal" disabled={r.isPending || !code.trim()} onClick={() => r.mutate()}>{r.isPending ? "Revisando…" : "Revisar"}</Button>
          {r.error ? <p className="mt-4 text-sm text-destructive">{(r.error as Error).message}</p> : null}
          <Outcome result={r.data} />
        </Panel>
      </div>
      <Panel className="mt-6" title={`arquivos gerados (${outputs.length})`}>
        <div className="divide-y divide-border">
          {outputs.map((o) => (
            <details key={o.filename} className="py-2">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span className="readout">{o.filename}</span>
                <span className="readout text-xs text-muted-foreground">{fmtTs(o.created_at)}</span>
              </summary>
              <pre className="readout mt-2 max-h-80 overflow-auto rounded-md border border-border bg-background/60 p-3 text-xs">{o.code}</pre>
            </details>
          ))}
        </div>
      </Panel>
    </>
  );
}
