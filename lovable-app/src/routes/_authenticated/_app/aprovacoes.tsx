import { pageHead } from "@/lib/core/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { OctagonX, Play, ShieldCheck, ShieldAlert } from "lucide-react";
import { decideApproval, executeApproval, killSwitch } from "@/lib/api/control.functions";
import { approvalsQuery, auditQuery } from "@/lib/queries";
import { fmtTs, JsonView, PageHeader, Panel, StatusBadge } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/aprovacoes")({
  head: () => pageHead("Aprovações — CentralIA", "Aprovação humana, kill switch e auditoria encadeada."),
  loader: ({ context }) => context.queryClient.ensureQueryData(approvalsQuery("pending")),
  component: Aprovacoes,
});

const RESULT_TEXT: Record<string, string> = {
  approved: "Pedido aprovado. Ele já pode ser executado uma única vez.",
  denied: "Pedido negado.",
  expired: "O pedido venceu antes da decisão.",
  not_found: "Pedido não encontrado.",
  not_confirmed: "Nada foi aprovado: digite SIM para confirmar.",
};

function Aprovacoes() {
  const [tab, setTab] = useState<string>("pending");
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(approvalsQuery(tab === "all" ? undefined : tab));
  const audit = useQuery(auditQuery);
  const decide = useServerFn(decideApproval);
  const exec = useServerFn(executeApproval);
  const kill = useServerFn(killSwitch);
  const [confirming, setConfirming] = useState<null | { kind: "approve"; id: number } | { kind: "release" }>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const decideM = useMutation({
    mutationFn: (v: { id: number; approve: boolean; confirm?: string }) => decide({ data: v }),
    onSuccess: (r) => {
      const res = String(r.result);
      (res === "approved" || res === "denied" ? toast.success : toast.error)(RESULT_TEXT[res] ?? `Resultado: ${res}`);
    },
    onSettled: refresh,
  });
  const execM = useMutation({
    mutationFn: (id: number) => exec({ data: { id } }),
    onSuccess: (r) => (r.ok ? toast.success("Executado pelo publicador simulado: nada foi enviado.") : toast.error(r.error ?? "Execução recusada")),
    onSettled: refresh,
  });
  const killM = useMutation({
    mutationFn: (v: { op: "engage" | "release"; reason?: string; confirm?: string }) => kill({ data: v }),
    onSuccess: (r, v) => (r.ok ? toast.success(v.op === "engage" ? "Kill switch ACIONADO." : "Kill switch liberado.") : toast.error("O kill switch continua ativo.")),
    onSettled: refresh,
  });

  return (
    <>
      <PageHeader
        eyebrow="controle humano"
        title="Aprovações"
        description="Quem propõe nunca executa. Aprovar exige digitar SIM; a execução é de uso único e só passa se os parâmetros forem idênticos aos aprovados."
      />
      <Panel
        className={cn("mb-6", data.kill.engaged && "border-destructive/60")}
        title="kill switch"
        aside={<span className={cn("signal-dot", data.kill.engaged ? "animate-signal text-destructive" : "text-success")} />}
      >
        {data.kill.engaged ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="readout text-destructive">ATIVO</span> — nenhuma ação sensível será proposta nem executada. Motivo: {data.kill.reason || "—"}
            </p>
            <Button variant="outline" onClick={() => setConfirming({ kind: "release" })}>
              Liberar
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              killM.mutate({ op: "engage", reason });
            }}
          >
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="motivo (opcional)" maxLength={200} className="max-w-sm" />
            <Button type="submit" variant="halt">
              <OctagonX /> Acionar kill switch
            </Button>
            <span className="text-xs text-muted-foreground">Parar é sempre seguro e não pede confirmação.</span>
          </form>
        )}
      </Panel>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="approved">Aprovados</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        {data.approvals.length === 0 ? <Panel><p className="text-sm text-muted-foreground">Nenhum pedido aqui.</p></Panel> : null}
        {data.approvals.map((a) => {
          const expired = a.expires <= data.now;
          return (
            <Panel
              key={a.id}
              title={<span className="readout">#{a.id} · {a.action}</span>}
              aside={<StatusBadge status={a.status === "pending" && expired ? "expired" : a.status} />}
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="min-w-0 space-y-3">
                  {a.full_caption ? <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-background/50 p-3 text-sm">{a.full_caption}</p> : null}
                  <JsonView value={a.params} className="max-h-48" />
                  {a.result ? <JsonView value={a.result} className="max-h-40" /> : null}
                </div>
                <dl className="readout space-y-1.5 text-xs">
                  <Row k="proposto por" v={a.actor} />
                  <Row k="criado" v={fmtTs(a.created)} />
                  <Row k="expira" v={fmtTs(a.expires)} />
                  <Row k="decidido por" v={a.decided_by ?? "—"} />
                  <Row k="hash" v={a.params_hash} />
                  <div className="flex flex-wrap gap-2 pt-3">
                    {a.status === "pending" && !expired ? (
                      <>
                        <Button size="sm" variant="signal" onClick={() => setConfirming({ kind: "approve", id: a.id })}>
                          <ShieldCheck /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decideM.mutate({ id: a.id, approve: false })}>
                          Negar
                        </Button>
                      </>
                    ) : null}
                    {a.status === "approved" ? (
                      <Button size="sm" variant="signal" disabled={execM.isPending} onClick={() => execM.mutate(a.id)}>
                        <Play /> Executar (simulado)
                      </Button>
                    ) : null}
                  </div>
                </dl>
              </div>
            </Panel>
          );
        })}
      </div>

      <Panel
        className="mt-8"
        title="auditoria encadeada"
        aside={
          audit.data ? (
            <span className={cn("readout flex items-center gap-1.5 text-xs", audit.data.chain.ok ? "text-success" : "text-destructive")}>
              {audit.data.chain.ok ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
              {audit.data.chain.ok ? `ÍNTEGRA · ${audit.data.chain.count} eventos` : `ADULTERADA no evento ${audit.data.chain.badId}`}
            </span>
          ) : null
        }
      >
        <div className="divide-y divide-border">
          {audit.data?.events.map((e) => (
            <details key={e.id} className="py-2">
              <summary className="grid cursor-pointer grid-cols-2 items-center gap-2 text-xs md:grid-cols-[3rem_9rem_7rem_7rem_1fr_auto]">
                <span className="readout text-muted-foreground">#{e.id}</span>
                <span className="readout text-muted-foreground">{fmtTs(e.ts)}</span>
                <span className="readout">{e.event}</span>
                <span className="readout truncate">{e.actor}</span>
                <span className="readout truncate text-muted-foreground">{e.action}</span>
                <StatusBadge status={e.status} />
              </summary>
              <JsonView value={e.detail} className="mt-2 max-h-48" />
            </details>
          ))}
        </div>
      </Panel>

      <Dialog open={!!confirming} onOpenChange={(o) => { if (!o) { setConfirming(null); setTyped(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming?.kind === "release" ? "Liberar o kill switch?" : `Aprovar o pedido #${confirming && "id" in confirming ? confirming.id : ""}?`}</DialogTitle>
            <DialogDescription>Esta ação libera algo. Digite SIM para confirmar.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SIM" className="readout" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirming(null); setTyped(""); }}>Cancelar</Button>
            <Button
              variant="signal"
              disabled={typed.trim() !== "SIM"}
              onClick={() => {
                if (confirming?.kind === "approve") decideM.mutate({ id: confirming.id, approve: true, confirm: typed });
                if (confirming?.kind === "release") killM.mutate({ op: "release", confirm: typed });
                setConfirming(null);
                setTyped("");
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate text-right">{v}</dd>
    </div>
  );
}
