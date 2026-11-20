import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOperator } from "./operator";
import { StudioRequest, type StudioCall } from "@/lib/core/studio";
import { toJson } from "@/lib/core/json";
import { Runtime } from "@/lib/server/runtime.server";
import { studioExecute, studioRun } from "@/lib/server/pipelines.server";
import { loadRuntimeSettings } from "@/lib/server/settings.server";

/** Free text or an explicit closed action; both go through contract, gate, monitor and permissions. */
export const runStudio = createServerFn({ method: "POST" })
  .middleware([requireOperator])
  .inputValidator((d: { text?: string; request?: unknown }) =>
    z.object({ text: z.string().max(4000).optional(), request: z.unknown().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rt = new Runtime(context.supabase, "studio", context.operator);
    try {
      if (data.text) {
        const r = await studioRun(rt, data.text);
        return { ok: r.ok, data: toJson(r.data), reasons: r.reasons };
      }
      const req = StudioRequest.safeParse(data.request);
      if (!req.success) return { ok: false, data: null, reasons: ["pedido inválido (ação ou parâmetro fora do formato)"] };
      const r = await studioExecute(rt, req.data as unknown as StudioCall);
      return { ok: r.ok, data: toJson(r.data), reasons: r.reasons };
    } finally {
      await rt.flush();
    }
  });

/** Where the CloneStudio service is expected, which hosts may be used, and whether it answered the health probe. */
export const getStudioInfo = createServerFn({ method: "GET" })
  .middleware([requireOperator])
  .handler(async ({ context }) => {
    const rt = new Runtime(context.supabase, "studio", context.operator);
    try {
      const r = await studioRun(rt, "health");
      const settings = await loadRuntimeSettings(context.supabase);
      return { baseUrl: settings.studio_base_url, allowedHosts: settings.studio_allowed_hosts, ok: r.ok, data: toJson(r.data), reasons: r.reasons };
    } finally {
      await rt.flush();
    }
  });
