import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { agentSettingsQuery } from "@/lib/queries";
import { PageHeader } from "@/components/console";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/agentes")({
  head: () => ({
    meta: [
      { title: "Agentes — CentralIA" },
      {
        name: "description",
        content: "Preferências e registros de execução dos agentes CentralIA.",
      },
      { property: "og:title", content: "Agentes — CentralIA" },
      {
        property: "og:description",
        content: "Ajustes supervisionados dos agentes e seus eventos de execução.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentSettingsQuery),
  component: AgentsLayout,
});

function AgentsLayout() {
  const { data } = useSuspenseQuery(agentSettingsQuery);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <PageHeader
        eyebrow="supervisão"
        title="Agentes"
        description="Cada agente tem sua própria área: contrato, preferências e registros de execução."
      />
      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="panel railed bay h-fit p-3" aria-label="Agentes">
          <div className="eyebrow mb-3 px-2">individual</div>
          <div className="space-y-0.5">
            <Link
              to="/agentes"
              className={cn(
                "readout flex items-center gap-2 rounded-[3px] px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                path === "/agentes" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--color-primary)]",
              )}
            >
              <span className="signal-dot !h-1 !w-1 text-primary" />
              Visão geral
            </Link>
            {data.map((a) => (
              <Link
                key={a.id}
                to="/agentes/$id"
                params={{ id: a.id }}
                className={cn(
                  "readout flex items-center gap-2 rounded-[3px] px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  path === `/agentes/${a.id}` &&
                    "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--color-primary)]",
                )}
              >
                <span
                  className={cn("signal-dot !h-1 !w-1", a.prompt ? "text-success" : "text-warning")}
                />
                <span className="truncate">{a.label}</span>
              </Link>
            ))}
          </div>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  );
}
