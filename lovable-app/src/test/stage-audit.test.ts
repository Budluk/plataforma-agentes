import { describe, it, expect, vi } from "vitest";
import { Runtime, type DB } from "@/lib/server/runtime.server";

describe("pipeline audit stages", () => {
  for (const stage of ["research", "summary", "analysis", "content"]) {
    it(`appends ${stage} through the audit function with a run ID`, async () => {
      const rpc = vi.fn().mockResolvedValue({ data: 123, error: null });
      const rt = new Runtime({ rpc } as unknown as DB, "research", "operator");
      await rt.auditStage({ run_id: "verified-run", history: [] }, "research_agent", stage, { source_url: "https://docs.python.org/3/" });
      expect(rpc).toHaveBeenCalledWith("ctl_append_audit_exact", expect.objectContaining({ p_run_id: "verified-run", p_event: "stage_completed", p_action: stage, p_status: "ok" }));
    });
  }
  it("does not confirm completion when audit persistence fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const rt = new Runtime({ rpc } as unknown as DB, "content", "operator");
    await expect(rt.auditStage({ run_id: "failed-run", history: [] }, "content_agent", "content", {})).rejects.toThrow("falha ao gravar auditoria");
  });
});