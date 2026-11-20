import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runStudio } from "@/lib/api/studio.functions";
import { studioInfoQuery } from "@/lib/queries";
import { ACTIONS, type StudioAction } from "@/lib/core/studio";
import { Outcome, PageHeader, Panel, Reasons } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/_app/studio")({
  head: () => ({
    meta: [
      { title: "Studio — CentralIA" },
      { name: "description", content: "Criação e correção supervisionadas de apps no CloneStudio local, com análise de inspiração." },
    ],
  }),
  component: Studio,
});

const LABELS: Record<StudioAction, string> = {
  health: "estado do serviço",
  list: "listar apps",
  create: "criar app",
  status: "ver app",
  validate: "validar app",
  messages: "enviar instrução",
  fix: "corrigir app",
  fix_validation: "corrigir validação",
  rebuild: "recompilar",
  retry: "tentar de novo",
  import: "importar",
  versions: "versões",
  restore: "restaurar versão",
  inspiration: "analisar inspiração",
  inspiration_create: "criar a partir da inspiração",
};

type Field = "prompt" | "project_id" | "message" | "url" | "kind" | "version" | "inspiration_token";
const FIELDS: Record<StudioAction, Field[]> = {
  health: [],
  list: [],
  create: ["prompt"],
  status: ["project_id"],
  validate: ["project_id"],
  messages: ["project_id", "message"],
  fix: ["project_id"],
  fix_validation: ["project_id"],
  rebuild: ["project_id"],
  retry: ["project_id"],
  versions: ["project_id"],
  restore: ["project_id", "version"],
  import: ["kind", "url", "prompt"],
  inspiration: ["url"],
  inspiration_create: ["inspiration_token", "prompt"],
};

function Studio() {
  const studio = useServerFn(runStudio);
  const { data: info } = useQuery(studioInfoQuery);
  const [action, setAction] = useState<StudioAction>("health");
  const [values, setValues] = useState<Record<Field, string>>({
    prompt: "", project_id: "", message: "", url: "", kind: "site", version: "", inspiration_token: "",
  });
  const [text, setText] = useState("");
  const m = useMutation({ mutationFn: (d: Parameters<typeof studio>[0]["data"]) => studio({ data: d }) });

  const submit = () => {
    const request: Record<string, unknown> = { action };
    for (const f of FIELDS[action]) {
      const raw = values[f].trim();
      if (!raw) continue;
      request[f] = f === "version" ? Number(raw) : raw;
    }
    m.mutate({ request });
  };

  return (
    <>
      <PageHeader
        eyebrow="área · studio"
        title="Criação supervisionada de apps"
        description="O CloneStudio roda na sua máquina. A central só aceita ações fechadas, sempre confirma o serviço antes de qualquer mudança e devolve apenas um resumo — nunca arquivos, código, logs ou mensagens brutas."
      />

      <Panel title="Serviço local">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="readout">{info?.baseUrl ?? "—"}</span>
          {info?.ok ? (
            <span className="readout text-success">respondendo</span>
          ) : (
            <span className="readout text-warning">fora do ar</span>
          )}
          <Button size="sm" variant="outline" onClick={() => m.mutate({ text: "health" })} disabled={m.isPending}>
            Testar agora
          </Button>
        </div>
        {info?.allowedHosts?.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            hosts permitidos: <span className="readout">{info.allowedHosts.join(", ")}</span>
          </p>
        ) : null}
        <p className="mt-3 text-sm text-muted-foreground">
          Na sua máquina o endereço é http em 127.0.0.1 ou localhost. Fora dela, só um endereço https cujo host você tenha
          permitido antes. Se o serviço estiver desligado ou o host não estiver na lista, nada é tentado: o pedido falha fechado.
        </p>
        {info && !info.ok ? <div className="mt-3"><Reasons reasons={info.reasons} /></div> : null}
      </Panel>

      <Panel className="mt-6">
        <Tabs defaultValue="form">
          <TabsList className="mb-4">
            <TabsTrigger value="form">Ação</TabsTrigger>
            <TabsTrigger value="text">Linguagem natural</TabsTrigger>
          </TabsList>
          <TabsContent value="form">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="studio-action">Ação</Label>
                <Select value={action} onValueChange={(v) => setAction(v as StudioAction)}>
                  <SelectTrigger id="studio-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {FIELDS[action].includes("kind") ? (
                <div className="space-y-1">
                  <Label htmlFor="studio-kind">Tipo de importação</Label>
                  <Select value={values.kind} onValueChange={(v) => setValues((s) => ({ ...s, kind: v }))}>
                    <SelectTrigger id="studio-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="site">site</SelectItem>
                      <SelectItem value="github">repositório (github.com)</SelectItem>
                      <SelectItem value="app">app existente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {FIELDS[action].map((f) => (
                <div key={f} className="space-y-1">
                  <Label htmlFor={`studio-${f}`}>{PLACEHOLDERS[f].label}</Label>
                  <Input
                    id={`studio-${f}`}
                    value={values[f]}
                    onChange={(e) => setValues((s) => ({ ...s, [f]: e.target.value }))}
                    placeholder={PLACEHOLDERS[f].placeholder}
                    className="readout"
                  />
                </div>
              ))}
            </div>
            <Button className="mt-4" variant="signal" onClick={submit} disabled={m.isPending}>
              {m.isPending ? "Executando…" : "Executar"}
            </Button>
          </TabsContent>
          <TabsContent value="text">
            <Textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: criar um app de agenda de consultas; ou listar; ou analisar https://www.instagram.com/perfil"
            />
            <Button className="mt-3" variant="signal" disabled={m.isPending || !text.trim()} onClick={() => m.mutate({ text })}>
              {m.isPending ? "Executando…" : "Enviar"}
            </Button>
          </TabsContent>
        </Tabs>
        {m.error ? <p className="mt-4 text-sm text-destructive">{(m.error as Error).message}</p> : null}
        <Outcome result={m.data} />
      </Panel>
    </>
  );
}

const PLACEHOLDERS: Record<Field, { label: string; placeholder: string }> = {
  prompt: { label: "Descrição", placeholder: "o que o app deve fazer (mínimo 10 caracteres)" },
  project_id: { label: "ID do projeto", placeholder: "uuid" },
  message: { label: "Instrução", placeholder: "o que mudar no app" },
  url: { label: "URL", placeholder: "https://…" },
  kind: { label: "Tipo", placeholder: "site" },
  version: { label: "Versão", placeholder: "número da versão" },
  inspiration_token: { label: "Token da análise", placeholder: "uuid devolvido pela análise" },
};
