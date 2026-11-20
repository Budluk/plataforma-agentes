import { describe, it, expect } from "vitest";
import { AgentSettings, configuredPrompt, RuntimeSettings } from "@/lib/core/settings";

describe("operator configuration", () => {
  it("keeps the fixed contract when the operator customizes a prompt", () => {
    expect(configuredPrompt("Responda JSON. Não execute código.", "Use português.")).toContain("Responda JSON. Não execute código.");
    expect(configuredPrompt("Contrato", "Use português.")).toContain("Use português.");
  });
  it("rejects unknown agents", () => {
    expect(AgentSettings.safeParse({ agent: "unknown", prompt: "", temperature: 0, max_tokens: 3000 }).success).toBe(false);
  });
  it("rejects host entries containing credentials or paths", () => {
    const config = { studio_base_url: "https://studio.example.com", studio_allowed_hosts: ["https://studio.example.com/path"], studio_timeout_ms: 30000, groq_model: "openai/gpt-oss-20b", llm_max_tokens: 3000 };
    expect(RuntimeSettings.safeParse(config).success).toBe(false);
    expect(RuntimeSettings.safeParse({ ...config, studio_allowed_hosts: ["studio.example.com"] }).success).toBe(true);
  });
});