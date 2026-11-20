import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Send, ShieldCheck, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { listPublications, publishSavedContent, requestSavedApproval } from "@/lib/api/publications.functions";
import { pageHead } from "@/lib/core/pageHead";
import { PageHeader } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const publicationsQuery = queryOptions({ queryKey: ["publications"], queryFn: () => listPublications() });
export const Route = createFileRoute("/_authenticated/_app/publicacoes")({
  head: () => pageHead("Publicações — CentralIA", "Conteúdos aprovados, etapas auditadas e liberação independente para o site."),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicationsQuery), component: Publications,
});
const STAGES: Record<string, string> = { research: "Pesquisa", summary: "Resumo", analysis: "Análise", content: "Conteúdo" };

function Publications() {
  const { data } = useSuspenseQuery(publicationsQuery);
  const qc = useQueryClient();
  const publish = useServerFn(publishSavedContent);
  const request = useServerFn(requestSavedApproval);
  const [filter, setFilter] = useState("approved");
  const [selected, setSelected] = useState<(typeof data.items)[number] | null>(null);
  const [confirm, setConfirm] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["publications"] }); qc.invalidateQueries({ queryKey: ["approvals"] }); qc.invalidateQueries({ queryKey: ["audit"] }); qc.invalidateQueries({ queryKey: ["site-publications"] }); };
  const send = useMutation({ mutationFn: () => {
    if (!selected?.approval) throw new Error("Selecione um conteúdo aprovado.");
    return publish({ data: { draftId: selected.draft.id, approvalId: selected.approval.id, confirm } });
  }, onSuccess: () => { setSelected(null); setConfirm(""); toast.success("Conteúdo liberado para o site e registrado na auditoria."); }, onError: (e) => toast.error(e.message), onSettled: refresh });
  const renew = useMutation({ mutationFn: (draftId: number) => request({ data: { draftId } }), onSuccess: (r) => toast.success(`Pedido #${r.approval_id} pronto para aprovação.`), onError: (e) => toast.error(e.message), onSettled: refresh });
  const items = data.items.filter((i) => filter === "all" || (filter === "published" ? !!i.publication : !i.publication && !!i.approval?.decided_by && ["approved", "used"].includes(i.approval.status)));
  return <>
    <PageHeader eyebrow="distribuição" title="Publicações" />
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {[["approved", "Aprovados"], ["published", "No site"], ["all", "Todos os conteúdos"]].map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? "signal" : "outline"} onClick={() => setFilter(value ?? "all")}>{label}</Button>)}
      <Button asChild variant="outline" size="sm"><Link to="/site"><ExternalLink />Abrir site</Link></Button>
      <Button variant="ghost" size="icon" aria-label="Atualizar publicações" title="Atualizar publicações" onClick={refresh}><RefreshCw /></Button>
    </div>
    {items.length === 0 && <p className="py-10 text-muted-foreground">Nenhum conteúdo nesta etapa.</p>}
    <div className="space-y-5">{items.map((item) => {
      const valid = item.approval?.status === "approved" && item.approval.expires_ts > Date.now() / 1000;
      const pending = item.approval?.status === "pending" && item.approval.expires_ts > Date.now() / 1000;
      return <article key={item.draft.id} className="min-w-0 rounded-md border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="readout text-xs text-muted-foreground">Conteúdo #{item.draft.id} · {item.draft.persona_id}</span><Badge variant={item.publication ? "success" : valid ? "success" : "muted"}>{item.publication ? "No site" : valid ? "Aprovado" : pending ? "Aguardando aprovação" : "Precisa de aprovação válida"}</Badge></div>
        <h2 className="mt-3 break-words text-xl font-semibold">{item.draft.hook}</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.draft.caption}</p>
        <details className="mt-3 text-sm"><summary className="cursor-pointer">Texto completo</summary><p className="mt-2 whitespace-pre-wrap break-words">{item.draft.script}</p></details>
        <ol className="my-5 flex flex-wrap gap-2">{item.stages.map((s) => <li key={s.id}><Badge variant="success">{STAGES[s.stage] ?? s.stage} · audit #{s.id}</Badge></li>)}{item.approval && <li><Badge variant="muted">Aprovação #{item.approval.id}</Badge></li>}{item.publication && <li><Badge variant="success">Publicação · audit #{item.publication.audit_id}</Badge></li>}</ol>
        {!item.stages.some((s) => s.stage === "analysis") && <p className="mb-4 text-xs text-muted-foreground">Pesquisa, resumo e análise sem vínculo registrado com este rascunho.</p>}
        <div className="flex flex-wrap gap-2">{!item.publication && (valid ? <Button variant="signal" onClick={() => { setSelected(item); setConfirm(""); }}><Send />Publicar no site</Button> : pending ? <Button asChild variant="outline"><Link to="/aprovacoes"><ShieldCheck />Aprovar conteúdo</Link></Button> : <Button variant="outline" disabled={renew.isPending} onClick={() => renew.mutate(item.draft.id)}><ShieldCheck />Pedir aprovação do conteúdo salvo</Button>)}{item.publication && <Button asChild variant="outline"><Link to="/site">Ver no site</Link></Button>}</div>
      </article>;
    })}</div>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !send.isPending) { setSelected(null); setConfirm(""); } }}><DialogContent><DialogHeader><DialogTitle>Publicar no site?</DialogTitle><DialogDescription>O conteúdo ficará visível aos visitantes. A aprovação será usada uma única vez. Digite SIM.</DialogDescription></DialogHeader><Input aria-label="Confirmar publicação" value={confirm} onChange={(e) => setConfirm(e.target.value)} /><DialogFooter><Button variant="outline" disabled={send.isPending} onClick={() => setSelected(null)}>Cancelar</Button><Button variant="signal" disabled={confirm !== "SIM" || send.isPending} onClick={() => send.mutate()}><Send />{send.isPending ? "Publicando…" : "Confirmar publicação"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}