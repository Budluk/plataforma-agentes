import { pageHead } from "@/lib/core/pageHead";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { runContentCycle, savePersona } from "@/lib/api/content.functions";
import { contentQuery, personasQuery } from "@/lib/queries";
import { PLATFORMS } from "@/lib/core/content";
import { fmtTs, PageHeader, Panel, Reasons } from "@/components/console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/conteudo")({
  head: () => pageHead("Conteúdo — CentralIA", "Rascunhos por persona e publicação somente com aprovação humana."),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(personasQuery), context.queryClient.ensureQueryData(contentQuery)]),
  component: Conteudo,
});

function Conteudo() {
  const { data: personas } = useSuspenseQuery(personasQuery);
  const { data: content } = useSuspenseQuery(contentQuery);
  const qc = useQueryClient();
  const cycle = useServerFn(runContentCycle);
  const save = useServerFn(savePersona);
  const [tema, setTema] = useState("");
  const [persona, setPersona] = useState(personas.find((p) => p.enabled)?.persona_id ?? personas[0]?.persona_id ?? "");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("instagram");

  const c = useMutation({
    mutationFn: () => cycle({ data: { tema, persona, platform } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (p: (typeof personas)[number]) => {
      const { updated_at: _u, ...rest } = p;
      return save({ data: { ...rest, enabled: !p.enabled } });
    },
    onSuccess: (r) => (r.ok ? toast.success("Persona atualizada.") : toast.error(r.error)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["personas"] }),
  });

  return (
    <>
      <PageHeader eyebrow="automação de conteúdo" title="Rascunho → aprovação → publicação" description="O redator escreve dentro do escopo da persona. Conteúdos aprovados podem ser liberados para o site; o envio às redes sociais continua simulado." />
      <Button asChild variant="outline" className="mb-6"><Link to="/publicacoes">Abrir publicações</Link></Button>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Panel title="novo ciclo">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); c.mutate(); }}>
            <div className="space-y-1">
              <Label htmlFor="tema">Tema</Label>
              <Input id="tema" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="ex.: produtividade com IA" />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <Label>Persona</Label>
                <div className="flex gap-1">
                  {personas.map((p) => (
                    <Button key={p.persona_id} type="button" size="sm" variant={persona === p.persona_id ? "signal" : "outline"} onClick={() => setPersona(p.persona_id)}>{p.persona_id}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Plataforma</Label>
                <div className="flex flex-wrap gap-1">
                  {PLATFORMS.map((p) => (
                    <Button key={p} type="button" size="sm" variant={platform === p ? "signal" : "outline"} onClick={() => setPlatform(p)}>{p}</Button>
                  ))}
                </div>
              </div>
            </div>
            <Button type="submit" variant="signal" disabled={c.isPending || tema.trim().length < 3}>{c.isPending ? "Escrevendo…" : "Gerar e pedir aprovação"}</Button>
          </form>
          {c.error ? <p className="mt-4 text-sm text-destructive">{(c.error as Error).message}</p> : null}
          {c.data && !c.data.ok ? <div className="mt-5"><Reasons reasons={c.data.reasons} /></div> : null}
          {c.data && c.data.ok ? (
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <div className="text-lg font-semibold">{c.data.draft.hook}</div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{c.data.draft.caption}</p>
              <div className="flex flex-wrap gap-1">{c.data.draft.hashtags.map((h: string) => <Badge key={h} variant="muted">{h}</Badge>)}</div>
              <p className="readout text-sm text-warning">
                Pedido #{String((c.data.proposal as { approval_id?: number }).approval_id ?? "?")} aguardando aprovação.{" "}
                <Link to="/aprovacoes" className="underline">Abrir aprovações</Link>
              </p>
            </div>
          ) : null}
        </Panel>
        <Panel title="personas">
          <div className="space-y-4">
            {personas.map((p) => (
              <div key={p.persona_id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="readout font-medium">{p.persona_id}</span>
                  <Switch checked={p.enabled} onCheckedChange={() => toggle.mutate(p)} aria-label={`ativar ${p.persona_id}`} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.niche} · {p.language}</div>
                <div className="mt-2 flex flex-wrap gap-1">{p.allowed_topics.map((t) => <Badge key={t} variant="success">{t}</Badge>)}</div>
                {p.forbidden_topics.length ? <div className="mt-1 flex flex-wrap gap-1">{p.forbidden_topics.map((t) => <Badge key={t} variant="danger">{t}</Badge>)}</div> : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="rascunhos">
          <div className="divide-y divide-border">
            {content.drafts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum rascunho ainda.</p> : null}
            {content.drafts.map((d) => (
              <details key={d.id} className="py-2">
                <summary className="flex cursor-pointer justify-between gap-2 text-sm"><span className="truncate">{d.hook}</span><span className="readout text-xs text-muted-foreground">{d.persona_id}</span></summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{d.caption}</p>
              </details>
            ))}
          </div>
        </Panel>
        <Panel title="publicador simulado">
          <div className="space-y-2">
            {content.dryrun.map((l) => (
              <div key={l.id} className={cn("readout break-all rounded border border-border bg-background/50 p-2 text-xs text-muted-foreground")}>
                <div className="text-foreground">{fmtTs(l.ts)}</div>
                {l.line}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
