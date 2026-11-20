import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CentralIA — agentes de IA com freio de mão" },
      {
        name: "description",
        content:
          "Seis áreas de agentes, um roteador central, gates determinísticos, aprovação humana e auditoria que não pode ser apagada.",
      },
      { property: "og:title", content: "CentralIA — agentes de IA com freio de mão" },
      {
        property: "og:description",
        content:
          "Seis áreas de agentes, um roteador central, gates determinísticos, aprovação humana e auditoria que não pode ser apagada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const RULES = [
  ["O LLM nunca decide risco", "Um gate determinístico lê só dados validados e rejeita na dúvida."],
  [
    "Quem propõe não executa",
    "Ações irreversíveis esperam uma pessoa digitar SIM. Uso único, parâmetros amarrados por hash.",
  ],
  ["Conteúdo externo é dado", "Páginas, feeds e pedidos nunca viram instrução nem permissão."],
  [
    "Auditoria encadeada",
    "Cada evento carrega o hash do anterior. Editar ou apagar é proibido no banco.",
  ],
];

function RouteNode({
  label,
  sub,
  index,
  primary,
}: {
  label: string;
  sub: string;
  index?: string;
  primary?: boolean;
}) {
  return (
    <div className="flex min-w-[3.5rem] flex-col items-center gap-2 text-center">
      <div
        className={cn(
          "readout flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          primary
            ? "border-primary bg-primary text-primary-foreground shadow-glow"
            : "border-border bg-secondary/70 text-primary",
        )}
      >
        {index ?? <Zap className="size-3.5" />}
      </div>
      <div className="min-w-0">
        <div className="readout truncate text-[0.6875rem] uppercase tracking-wider text-foreground">
          {label}
        </div>
        <div className="hidden truncate text-[0.625rem] text-muted-foreground md:block">{sub}</div>
      </div>
    </div>
  );
}

function FlowDiagram() {
  return (
    <div className="panel bay scan-sweep overflow-hidden p-6">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div className="eyebrow">rota de um pedido · ao vivo</div>
        <div className="readout flex items-center gap-2 text-xs text-primary">
          <span className="signal-dot animate-signal" /> em trânsito
        </div>
      </div>

      <div className="flex items-start justify-between gap-1 md:gap-2">
        <RouteNode label="pedido" sub="linguagem natural" primary />
        <div className="route-track mt-4">
          <span className="route-traveler" />
        </div>
        <RouteNode label="contrato" sub="formato validado" index="01" />
        <div className="route-track mt-4">
          <span className="route-traveler" style={{ animationDelay: "1.1s" }} />
        </div>
        <RouteNode label="permissão" sub="gates + seu aval" index="02" />
        <div className="route-track mt-4">
          <span className="route-traveler" style={{ animationDelay: "2.2s" }} />
        </div>
        <RouteNode label="execução" sub="resultado auditado" index="03" primary />
      </div>

      <div className="mt-9 grid grid-cols-3 divide-x divide-border border-t border-border pt-4">
        {[
          ["gates", "03"],
          ["falha", "fechada"],
          ["auditoria", "encadeada"],
        ].map(([label, value]) => (
          <div key={label} className="px-2 text-center first:pl-0 last:pr-0">
            <div className="eyebrow truncate">{label}</div>
            <div className="readout mt-1 truncate text-sm text-primary">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div className="console-grid relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[620px]"
        style={{
          background:
            "radial-gradient(62% 52% at 74% 2%, oklch(0.88 0.2 108 / 9%), transparent 72%)",
        }}
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <Link to="/" className="readout text-lg font-semibold tracking-tight text-foreground">
          Central<span className="text-primary">IA</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="signal-dot text-success" />
            <span className="readout">sistema operante</span>
          </div>
          <Button asChild variant="signal" size="sm">
            <Link to="/painel">Abrir painel</Link>
          </Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <span className="signal-dot animate-signal text-primary" />
              central de operações · seis áreas · um roteador
            </div>
            <h1 className="mt-6 max-w-3xl font-display text-5xl font-semibold uppercase leading-[0.94] tracking-tight md:text-7xl">
              Agentes de IA que <span className="text-primary">pedem licença</span> antes de agir.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Economia, música, vendas, funil, pesquisa e código despachados na hora, por contratos
              que não negociam. O que passa, executa. O que não passa, para — e diz por quê.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild variant="signal" size="lg">
                <Link to="/painel">
                  Abrir painel <ArrowUpRight />
                </Link>
              </Button>
              <a
                href="#regras"
                className="readout px-2 py-2 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                ver as regras ↓
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-5">
              {[
                ["6", "áreas de agente"],
                ["1", "roteador central"],
                ["100%", "das execuções auditadas"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="readout text-xl text-primary">{value}</div>
                  <div className="eyebrow mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <FlowDiagram />
        </div>

        <section id="regras" className="mt-24 scroll-mt-24">
          <div className="mb-6 flex items-end justify-between gap-4 border-b border-border pb-4">
            <div>
              <div className="eyebrow">invariantes</div>
              <h2 className="mt-2 font-display text-3xl font-semibold uppercase tracking-tight">
                O que não muda
              </h2>
            </div>
            <span className="readout hidden text-xs text-muted-foreground sm:block">
              INV-01 → INV-04
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {RULES.map(([t, d], i) => (
              <div
                key={t}
                className="panel bay railed p-5 transition-colors hover:border-primary/40"
              >
                <div className="readout text-xs text-primary">
                  INV-{String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-2 text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
