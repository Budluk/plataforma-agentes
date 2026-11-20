import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Save, KeyRound, RefreshCw } from "lucide-react";
import { getSettings, saveSettings } from "@/lib/api/settings.functions";
import { runStudio } from "@/lib/api/studio.functions";
import { PageHeader, Outcome } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RuntimeSettings } from "@/lib/core/settings";

const settingsQuery = queryOptions({ queryKey: ["runtime-settings"], queryFn: () => getSettings() });
export const Route = createFileRoute("/_authenticated/_app/configuracoes")({
  head: () => ({ meta: [
    { title: "Configurações — CentralIA" }, { name: "description", content: "Configurações do Studio e da IA, exclusivas do operador." },
    { property: "og:title", content: "Configurações — CentralIA" }, { property: "og:description", content: "Conexão supervisionada e ajustes de IA da CentralIA." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery), component: SettingsPage,
});

function SettingsPage() {
  const { data } = useSuspenseQuery(settingsQuery);
  const [form, setForm] = useState(data.settings);
  const [hosts, setHosts] = useState(data.settings.studio_allowed_hosts.join("\n"));
  const [keyHelp, setKeyHelp] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(saveSettings);
  const studio = useServerFn(runStudio);
  const mutation = useMutation({ mutationFn: () => save({ data: RuntimeSettings.parse({ ...form, studio_allowed_hosts: hosts.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) }) }),
    onSuccess: async () => { await qc.invalidateQueries(); toast.success("Configurações salvas."); },
    onError: () => toast.error("Não foi possível salvar. Confira o endereço, os hosts e os limites."),
  });
  const probe = useMutation({ mutationFn: () => studio({ data: { text: "listar os apps do studio" } }) });
  return <>
    <PageHeader eyebrow="operador" title="Configurações" />
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
      <section className="space-y-4 border-b border-border pb-8">
        <h2 className="text-xl font-semibold">Conexão CloneStudio</h2>
        <div className="space-y-2"><Label htmlFor="base-url">Endereço do Studio</Label><Input id="base-url" type="url" required value={form.studio_base_url} onChange={(e) => setForm({ ...form, studio_base_url: e.target.value })} /></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="hosts">Hosts permitidos</Label><Textarea id="hosts" rows={4} required value={hosts} onChange={(e) => setHosts(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="timeout">Tempo máximo de espera (ms)</Label><Input id="timeout" type="number" min={1000} max={120000} required value={form.studio_timeout_ms} onChange={(e) => setForm({ ...form, studio_timeout_ms: Number(e.target.value) })} /></div>
        </div>
      </section>
      <section className="space-y-4 border-b border-border pb-8">
        <h2 className="text-xl font-semibold">Inteligência artificial</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="model">Modelo Groq</Label><Input id="model" required value={form.groq_model} onChange={(e) => setForm({ ...form, groq_model: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="tokens">Limite padrão de tokens</Label><Input id="tokens" type="number" required min={1} max={16000} value={form.llm_max_tokens} onChange={(e) => setForm({ ...form, llm_max_tokens: Number(e.target.value) })} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm"><KeyRound className="size-4 text-primary" /><span>Chave Groq: {data.groqConfigured ? "configurada" : "não configurada"}</span><Button type="button" variant="outline" size="sm" onClick={() => setKeyHelp(!keyHelp)}>Atualizar chave</Button></div>
        {keyHelp && <p className="text-sm text-muted-foreground">A chave é protegida pelo Lovable Cloud. No editor, abra Cloud → Secrets e atualize GROQ_API_KEY, ou peça “abrir campo seguro da chave Groq” no chat. A chave nunca é exibida neste painel.</p>}
      </section>
      <div className="flex flex-wrap gap-3"><Button type="submit" variant="signal" disabled={mutation.isPending}><Save className="size-4" />{mutation.isPending ? "Salvando…" : "Salvar configurações"}</Button><Button type="button" variant="outline" disabled={probe.isPending || mutation.isPending} onClick={() => probe.mutate()}><RefreshCw className="size-4" />{probe.isPending ? "Consultando…" : "Consultar apps no Studio"}</Button></div>
    </form>
    {mutation.isError && <p role="alert" className="mt-4 text-sm text-destructive">Configurações não salvas. Verifique os campos e se o host está permitido.</p>}
    {probe.isError && <p role="alert" className="mt-4 text-sm text-destructive">Não foi possível consultar o Studio.</p>}
    <Outcome result={probe.data} />
  </>;
}