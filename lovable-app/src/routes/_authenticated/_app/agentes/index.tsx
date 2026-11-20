import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { agentSettingsQuery } from "@/lib/queries";
import { Panel } from "@/components/console";

export const Route = createFileRoute("/_authenticated/_app/agentes/")({
  component: AgentsIndex,
});

function AgentsIndex() {
  const { data } = useSuspenseQuery(agentSettingsQuery);
  const withIa = data.filter((a) => Boolean(a.prompt)).length;

  return (
    <div className="space-y-5">
      <Panel
        title="mapa dos agentes"
        aside={
          <span className="readout text-xs text-muted-foreground">{data.length} no registro</span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((a, i) => (
            <Link
              key={a.id}
              to="/agentes/$id"
              params={{ id: a.id }}
              className="panel bay railed group flex items-start justify-between gap-3 p-4 transition-colors hover:border-primary/50"
            >
              <div className="min-w-0">
                <div className="readout text-[0.625rem] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")} · {a.stream}
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">{a.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {a.prompt ? "prompt complementar habilitado" : "regras determinísticas fixas"}
                </div>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </Panel>
      <Panel title="como funciona">
        <div className="grid gap-4 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
          <p>
            Os controles de cada agente são complementares: o contrato e os gates permanecem fixos
            no código, e as preferências do operador não podem substituí-los.
          </p>
          <p>
            {withIa} agentes usam chamada de IA; os demais operam por regras determinísticas.
            Ajustes e execuções ficam registrados na área individual de cada um.
          </p>
        </div>
      </Panel>
    </div>
  );
}
