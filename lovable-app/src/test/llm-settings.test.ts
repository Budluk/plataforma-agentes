import { afterEach, describe, expect, it, vi } from "vitest";
import { makeLlm } from "@/lib/server/llm.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Groq runtime preferences", () => {
  it("sends saved temperature and token ceiling to Groq", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-only-not-a-credential");
    let payload: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }));
    }));
    await makeLlm({ model: "openai/gpt-oss-20b", temperature: 0.1, maxTokens: 2500 }).complete("Contrato", "Pedido");
    expect(payload["temperature"]).toBe(0.1);
    expect(payload["max_tokens"]).toBe(2500);
  });
  it("reports network failure safely rather than reading an absent response", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-only-not-a-credential");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(makeLlm().complete("Contrato", "Pedido")).rejects.toThrow("erro de rede: TypeError");
  });
});