import { describe, it, expect } from "vitest";
import { paramsHash, sha256hex } from "@/lib/core/canonical";
import { validatePublication } from "@/lib/core/publications";

async function fixture() {
  const draft = { hook: "Python", script: "Conteúdo salvo do funil", caption: "Aprenda Python", persona_id: "ativa", content_hash: await sha256hex("PythonConteúdo salvo do funilAprenda Python") };
  const params = { platform: "instagram", account_id: "conta-1", persona_id: "ativa", content_hash: draft.content_hash, media_hash: "a".repeat(64), caption: draft.caption, scheduled_for: null };
  return { draft, approval: { action: "publish.post", status: "approved", expires_ts: 200, params_json: JSON.stringify(params), params_hash: await paramsHash(params) } };
}
describe("release saved approved content", () => {
  it("reuses the saved content without another funnel execution", async () => { const f = await fixture(); expect((await validatePublication(f.draft, f.approval, 100)).content_hash).toBe(f.draft.content_hash); });
  it("rejects unapproved content", async () => { const f = await fixture(); await expect(validatePublication(f.draft, { ...f.approval, status: "pending" }, 100)).rejects.toThrow("Aprovação"); });
  it("rejects an already used approval", async () => { const f = await fixture(); await expect(validatePublication(f.draft, { ...f.approval, status: "used" }, 100)).rejects.toThrow("Aprovação"); });
  it("rejects an expired approval", async () => { const f = await fixture(); await expect(validatePublication(f.draft, f.approval, 200)).rejects.toThrow("Aprovação"); });
  it("rejects edited saved text", async () => { const f = await fixture(); await expect(validatePublication({ ...f.draft, script: "Texto alterado" }, f.approval, 100)).rejects.toThrow("conteúdo"); });
  it("rejects a different parameters hash", async () => { const f = await fixture(); await expect(validatePublication(f.draft, { ...f.approval, params_hash: "b".repeat(64) }, 100)).rejects.toThrow("Parâmetros"); });
  it("rejects unreadable or out-of-contract approval parameters", async () => {
    const f = await fixture();
    await expect(validatePublication(f.draft, { ...f.approval, params_json: "{" }, 100)).rejects.toThrow("ilegíveis");
    const outOfContract = JSON.stringify({ ...JSON.parse(f.approval.params_json), platform: "fake" });
    await expect(validatePublication(f.draft, { ...f.approval, params_json: outOfContract }, 100)).rejects.toThrow("fora do contrato");
  });
});