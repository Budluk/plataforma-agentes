import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Replaces the Windows scheduled task (run_trends.ps1, 06:00 and 20:00): computes the growth
// report and keeps a log entry of it. Read-only over trends; nothing is published.
export const Route = createFileRoute("/api/public/jobs/trends-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { reportFor } = await import("@/lib/server/trends.server");
        try {
          const rows = await reportFor(supabaseAdmin, "latest", 24);
          const measured = rows.filter((r) => r.status === "measured").length;
          await supabaseAdmin.from("event_logs").insert({
            stream: "trends",
            event: "trend_report",
            run_id: "agendado",
            fields: {
              conteudos: rows.length,
              medidos: measured,
              pendencias: rows.filter((r) => r.status !== "measured").map((r) => `${r.topic.slice(0, 40)}: ${r.reason}`).slice(0, 20),
              top: rows.slice(0, 10).map((r) => ({ pauta: r.topic.slice(0, 60), por_hora: r.views_per_hour, aumento: r.delta_views, situacao: r.status })),
            },
          });
          return Response.json({ ok: true, rows: rows.length });
        } catch (e) {
          console.error("trend report job failed", e);
          await supabaseAdmin.from("event_logs").insert({ stream: "trends", event: "trend_report_failed", run_id: "agendado", fields: { erro: (e as Error).name } });
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
