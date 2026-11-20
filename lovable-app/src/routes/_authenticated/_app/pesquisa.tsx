import { pageHead } from "@/lib/core/pageHead";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runResearch } from "@/lib/api/agents.functions";
import { ALLOWED_RESEARCH_DOMAINS } from "@/lib/core/config";
import { Outcome, PageHeader, Panel } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/_app/pesquisa")({
  head: () => pageHead("Pesquisa — CentralIA", "Pesquisa em domínios permitidos com citação verificada."),
  component: Pesquisa,
});

function Pesquisa() {
  const research = useServerFn(runResearch);
  const [url, setUrl] = useState("https://pt.wikipedia.org/wiki/Python");
  const [question, setQuestion] = useState("Quem criou a linguagem e quando?");
  const m = useMutation({ mutationFn: () => research({ data: { url, question } }) });
  return (
    <>
      <PageHeader eyebrow="área · pesquisa" title="Ler, citar, conferir" description="Busca só em domínios permitidos e trata a página como dado não confiável. Cada afirmação precisa de um trecho literal que exista no texto." />
      <Panel>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1">
            <Label htmlFor="url">Endereço (https)</Label>
            <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} className="readout" />
            <p className="readout text-xs text-muted-foreground">permitidos: {ALLOWED_RESEARCH_DOMAINS.join(" · ")}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="q">Pergunta</Label>
            <Input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div><Button type="submit" variant="signal" disabled={m.isPending}>{m.isPending ? "Lendo…" : "Pesquisar"}</Button></div>
        </form>
        {m.error ? <p className="mt-4 text-sm text-destructive">{(m.error as Error).message}</p> : null}
        <Outcome result={m.data} />
      </Panel>
    </>
  );
}
