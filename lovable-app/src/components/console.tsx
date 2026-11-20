import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
      <div className="max-w-3xl">
        <div className="eyebrow mb-2.5 flex items-center gap-2">
          <span className="inline-block h-px w-5 bg-primary" />
          {eyebrow}
        </div>
        <h1 className="font-display text-4xl font-semibold uppercase leading-[0.95] tracking-tight text-foreground md:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function Panel({
  title,
  children,
  className,
  aside,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section className={cn("panel railed bay p-5", className)}>
      {title ? (
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-border/70 pb-3">
          <h2 className="eyebrow flex items-center gap-2 text-foreground">
            <span className="signal-dot !h-1 !w-1 text-primary" />
            {title}
          </h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const STATUS: Record<string, "success" | "warning" | "danger" | "info" | "muted"> = {
  ok: "success",
  alert_emitted: "success",
  approved: "success",
  used: "info",
  measured: "success",
  pending: "warning",
  insufficient_history: "muted",
  insufficient_data: "muted",
  rejected: "danger",
  denied: "danger",
  failed: "danger",
  error: "danger",
  inconsistent_data: "danger",
  expired: "muted",
  none: "muted",
  no_handler: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS[status] ?? "muted"}>{status}</Badge>;
}

export function Reasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <ul className="space-y-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex gap-2 text-sm text-destructive">
          <span className="readout select-none text-destructive/70">✕</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        "readout max-h-96 overflow-auto rounded-md border border-border bg-background/70 p-3 text-xs leading-relaxed text-accent-foreground",
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Outcome({
  result,
}: {
  result: { ok: boolean; data?: unknown; reasons: string[] } | null | undefined;
}) {
  if (!result) return null;
  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn("signal-dot", result.ok ? "text-success" : "text-destructive")} />
        <span className="readout text-sm">{result.ok ? "aprovado pelos gates" : "rejeitado"}</span>
      </div>
      <Reasons reasons={result.reasons} />
      {result.ok && result.data ? <JsonView value={result.data} /> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "warning" | "danger" | "success" | undefined;
}) {
  return (
    <div className="panel bay min-w-0 px-4 py-3.5">
      <div className="eyebrow truncate">{label}</div>
      <div
        className={cn(
          "readout mt-1.5 truncate text-2xl text-primary",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export const fmtTs = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
};
