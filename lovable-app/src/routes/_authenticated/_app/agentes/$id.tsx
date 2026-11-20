import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Save, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { agentSettingsQuery } from "@/lib/queries";
import { getAgentLogs, saveAgentSettings } from "@/lib/api/settings.functions";
import { fmtTs, JsonView } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_app/agentes/$id")({
  beforeLoad: async ({ params, context }) => {
    const data = await context.queryClient.ensureQueryData(agentSettingsQuery);
    if (!data.some((a) => a.id === params.id)) throw redirect({ to: "/agentes" });
  },
  component: AgentDetail,
});

type Agent = Awaited<ReturnType<NonNullable<typeof agentSettingsQuery.queryFn>>>[number];

function AgentDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(agentSettingsQuery);
  const agent = data.find((a) => a.id === id);
  if (!agent) {
    return (
      <div className="panel bay railed p-6">
        <p className="text-sm text-muted-foreground">
          Este agente não está disponível ou foi removido.
        </p>
        <Link to="/agentes" className="mt-3 inline-block text-sm text-primary underline">
          Voltar para Agentes
        </Link>
      </div>
    );
  }
  return <AgentEditor key={id} agent={agent} />;
}

function AgentEditor({ agent }: { agent: Agent }) {
  const [prompt, setPrompt] = useState(agent.prompt);
  const [temperature, setTemperature] = useState(agent.temperature);
  const [tokens, setTokens] = useState(agent.max_tokens);
  const [page, setPage] = useState(0);
  const save = useServerFn(saveAgentSettings);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => save({ data: { agent: agent.id, prompt, temperature, max_tokens: tokens } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["agent-settings"] });
      toast.success("Agente atualizado.");
    },
    onError: () => toast.error("Não foi possível salvar o agente."),
  });
  const logs = useQuery({
    queryKey: ["agent-logs", agent.id, page],
    queryFn: () => getAgentLogs({ data: { agent: agent.id, page } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-8">
      {agent.basePrompt ? (
        <form
          className="space-y-5 border-b border-border pb-8"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt complementar</Label>
            <Textarea
              id="prompt"
              rows={6}
              maxLength={12000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Contrato e regras fixas
            </summary>
            <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {agent.basePrompt}
            </pre>
          </details>
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperatura</Label>
              <Input
                id="temperature"
                type="number"
                required
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-tokens">Limite de tokens</Label>
              <Input
                id="agent-tokens"
                type="number"
                required
                min={1}
                max={16000}
                value={tokens}
                onChange={(e) => setTokens(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="signal" disabled={mutation.isPending}>
              <Save className="size-4" />
              {mutation.isPending ? "Salvando…" : "Salvar agente"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPrompt("");
                setTemperature(0);
                setTokens(agent.tokens);
              }}
            >
              <RotateCcw className="size-4" /> Restaurar padrões
            </Button>
          </div>
        </form>
      ) : (
        <div className="border-b border-border pb-6">
          <h2 className="text-xl font-semibold">Regras determinísticas</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Este agente não usa prompts, temperatura ou tokens. Seus controles de segurança
            permanecem fixos.
          </p>
        </div>
      )}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Logs de execução{" "}
            <span className="text-sm text-muted-foreground">({logs.data?.total ?? 0})</span>
          </h2>
          <Button
            variant="outline"
            size="icon"
            title="Atualizar registros"
            aria-label="Atualizar registros"
            onClick={() => logs.refetch()}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
        {logs.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os registros.</p>
        ) : logs.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando registros…</p>
        ) : !logs.data?.rows.length ? (
          <p className="text-sm text-muted-foreground">
            Nenhum evento registrado para este agente.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {logs.data.rows.map((l) => (
              <details key={l.id} className="py-3">
                <summary className="flex cursor-pointer flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span className="text-muted-foreground">{fmtTs(l.ts)}</span>
                  <span className="readout text-primary">{l.event}</span>
                  <span className="readout text-xs text-muted-foreground">{l.run_id}</span>
                </summary>
                <JsonView value={l.fields} className="mt-3" />
              </details>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">{page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * 30 >= (logs.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      </section>
    </div>
  );
}
