import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  Code2,
  FileSearch,
  Gauge,
  History,
  Megaphone,
  Music2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  ShoppingCart,
  Settings,
  Bot,
} from "lucide-react";
import { accessQuery, overviewQuery } from "@/lib/queries";
import { useSignOut } from "@/hooks/use-sign-out";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app")({
  loader: ({ context }) => context.queryClient.ensureQueryData(accessQuery),
  component: AppShell,
});

const NAV = [
  { to: "/painel", label: "Central", icon: Gauge },
  { to: "/economia", label: "Economia", icon: Banknote },
  { to: "/musica", label: "Música", icon: Music2 },
  { to: "/vendas", label: "Vendas e funil", icon: ShoppingCart },
  { to: "/pesquisa", label: "Pesquisa", icon: FileSearch },
  { to: "/dev", label: "Desenvolvimento", icon: Code2 },
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/conteudo", label: "Conteúdo", icon: Megaphone },
  { to: "/publicacoes", label: "Publicações", icon: Megaphone },
  { to: "/tendencias", label: "Tendências", icon: TrendingUp },
  { to: "/aprovacoes", label: "Aprovações", icon: ShieldCheck },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/agentes", label: "Agentes", icon: Bot },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function TelemetryStrip() {
  const { data } = useQuery({ ...overviewQuery, refetchInterval: 30_000 });
  const engaged = data?.kill.engaged;
  return (
    <div className="sticky top-0 z-20 flex h-12 items-center gap-4 border-b border-border bg-background/92 px-4 backdrop-blur md:px-6">
      <Link
        to="/painel"
        className="readout shrink-0 text-sm font-semibold text-foreground md:hidden"
      >
        Central<span className="text-primary">IA</span>
      </Link>
      <div className="hidden items-center gap-2 md:flex">
        <span className="eyebrow">telemetria</span>
        <span className="h-3 w-px bg-border" />
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn("signal-dot", engaged ? "animate-signal text-destructive" : "text-success")}
        />
        <span
          className={cn(
            "readout text-xs uppercase tracking-wider",
            engaged ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {engaged ? "kill ativo" : "operando"}
        </span>
      </div>
      <div className="readout ml-auto flex items-center gap-4 text-xs text-muted-foreground sm:gap-6">
        <span className="hidden sm:inline">
          exec{" "}
          <span className="text-foreground">
            {data ? data.totalRuns.toLocaleString("pt-BR") : "—"}
          </span>
        </span>
        <span className="hidden lg:inline">
          alertas <span className="text-foreground">{data?.alertCount ?? "—"}</span>
        </span>
        <span>
          pend{" "}
          <span className={data?.pendingApprovals ? "text-warning" : "text-foreground"}>
            {data?.pendingApprovals ?? "—"}
          </span>
        </span>
        <span className="hidden xl:inline">
          IA{" "}
          <span className="text-primary">
            {data ? (data.llm.provider === "groq" ? "Groq" : "Lovable") : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}

function AppShell() {
  const { data: access } = useQuery(accessQuery);
  const signOut = useSignOut();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (access && !access.isOperator) {
    return (
      <div className="console-grid flex min-h-screen items-center justify-center px-4">
        <div className="panel bay railed max-w-md p-7 text-center">
          <div className="eyebrow">acesso negado</div>
          <h1 className="mt-3 font-display text-3xl font-semibold uppercase tracking-tight">
            Esta central já tem operador
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Sua conta ({access.email}) entrou, mas não tem permissão para ver ou acionar os agentes.
          </p>
          <Button variant="outline" className="mt-6" onClick={signOut}>
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TelemetryStrip />
      <div className="flex">
        <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="px-5 py-5">
            <Link
              to="/painel"
              className="readout text-lg font-semibold tracking-tight text-sidebar-foreground"
            >
              Central<span className="text-primary">IA</span>
            </Link>
            <KillIndicator />
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
            {NAV.map(({ to, label, icon: Icon }, i) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-3 rounded-[3px] px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  path === to &&
                    "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--color-primary)]",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                <span className="truncate">{label}</span>
                <span className="readout ml-auto text-[0.625rem] text-muted-foreground/50">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-4">
            <div className="truncate readout text-xs text-muted-foreground">{access?.email}</div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="sticky top-12 z-10 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:hidden">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "readout whitespace-nowrap rounded-[3px] px-2.5 py-1 text-xs text-muted-foreground",
                  path === to &&
                    "bg-primary/15 text-primary shadow-[inset_0_-2px_0_var(--color-primary)]",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function KillIndicator() {
  const { data } = useQuery({ ...overviewQuery, refetchInterval: 30_000 });
  if (!data) return <div className="mt-3 h-5" />;
  return (
    <Link
      to="/aprovacoes"
      className="mt-4 flex items-center gap-2 border-t border-sidebar-border pt-4 text-xs"
    >
      <span
        className={cn(
          "signal-dot",
          data.kill.engaged ? "animate-signal text-destructive" : "text-success",
        )}
      />
      <span
        className={cn(
          "readout uppercase tracking-wider",
          data.kill.engaged ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {data.kill.engaged ? "kill switch ativo" : "sistema operante"}
      </span>
      <Activity className="ml-auto size-3 text-muted-foreground" />
    </Link>
  );
}
