import { generateChatCompletion, GatewayError } from "@lovable.dev/ai-gateway";

export class LLMError extends Error {
  override name = "LLMError";
}

export interface LLM {
  provider: "groq" | "lovable";
  model: string;
  /** Default per-call token ceiling (explicit call argument > env > default). */
  maxTokens: number;
  complete(system: string, user: string, opts?: { maxTokens?: number }): Promise<string>;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const LOVABLE_MODEL = "openai/gpt-6-astra";
const DEFAULT_MAX_TOKENS = 3000;
const MAX_TOKENS_ENV = "LLM_MAX_TOKENS";
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

/** Per-call ceiling: explicit argument > env > default, always validated. */
function resolveMaxTokens(value: number | undefined, env: Record<string, string | undefined>): number {
  if (value === undefined) {
    const raw = (env[MAX_TOKENS_ENV] ?? "").trim();
    if (!raw) return DEFAULT_MAX_TOKENS;
    return parsePositiveInt(raw, MAX_TOKENS_ENV);
  }
  return parsePositiveInt(value, "max_tokens");
}

function parsePositiveInt(raw: number | string, source: string): number {
  const n = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (!Number.isInteger(n) || n < 1) throw new LLMError(`${source} precisa ser um inteiro positivo`);
  return n;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Groq when GROQ_API_KEY is configured (as in the original); otherwise the built-in Lovable AI.
 * Short retries only for 429/5xx and network errors: 4xx and invalid JSON fail immediately.
 * Call inside handlers only.
 */
export function makeLlm(config?: { model: string; maxTokens: number; temperature: number }): LLM {
  const key = (process.env["GROQ_API_KEY"] ?? "").trim();
  const model = config?.model ?? ((process.env["GROQ_MODEL"] ?? "").trim() || "openai/gpt-oss-20b");
  const maxTokens = config?.maxTokens ?? resolveMaxTokens(undefined, process.env);

  if (key) {
    return {
      provider: "groq",
      model,
      maxTokens,
      async complete(system, user, opts) {
        const limit = opts?.maxTokens === undefined ? maxTokens : resolveMaxTokens(opts.maxTokens, {});
        let last = "tentativa não executada";
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          let r: Response | undefined;
          try {
            r = await fetch(GROQ_URL, {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model,
                temperature: config?.temperature ?? 0,
                max_tokens: limit,
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: user },
                ],
              }),
              signal: AbortSignal.timeout(30_000),
            });
          } catch (e) {
            // the response body never enters the message: it can echo the request
            last = `erro de rede: ${(e as Error)?.name ?? "Error"}`;
          }
          if (!r) {
            if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
            continue;
          }
          const status = r.status;
          if (status === 200) {
            try {
              const j = (await r.json()) as { choices: { finish_reason?: string; message: { content: string | null } }[] };
              const choice = j.choices[0];
              if (!choice) throw new LLMError("resposta sem conteúdo");
              if (choice.finish_reason === "length") {
                throw new LLMError(`resposta cortada pelo limite de tokens (finish_reason=length, max_tokens=${limit})`);
              }
              return choice.message.content ?? "";
            } catch (e) {
              if (e instanceof LLMError) throw e;
              throw new LLMError("resposta fora do formato esperado");
            }
          }
          last = `HTTP ${status}`;
          if (!RETRY_STATUS.has(status)) throw new LLMError(last);
          if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        }
        throw new LLMError(last);
      },
    };
  }

  return {
    provider: "lovable",
    model: LOVABLE_MODEL,
    maxTokens,
    async complete(system, user, opts) {
      const limit = opts?.maxTokens === undefined ? maxTokens : resolveMaxTokens(opts.maxTokens, {});
      let last = "tentativa não executada";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await generateChatCompletion({
            model: LOVABLE_MODEL,
            max_completion_tokens: limit,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          });
          const choice = res.choices?.[0];
          if (!choice) throw new LLMError("resposta fora do formato esperado");
          if (choice.finish_reason === "length") {
            throw new LLMError(`resposta cortada pelo limite de tokens (finish_reason=length, max_tokens=${limit})`);
          }
          const content = choice.message?.content;
          return typeof content === "string" ? content : "";
        } catch (e) {
          if (e instanceof LLMError) throw e;
          if (e instanceof GatewayError) {
            console.error("AI gateway error", e.code, e.httpStatus);
            if (e.httpStatus === 402) throw new LLMError("créditos de IA esgotados no workspace");
            const status = e.httpStatus ?? 0;
            last = `falha na IA (${e.code})`;
            if (status !== 429 && !(status >= 500 && status < 600)) throw new LLMError(last);
          } else {
            last = `erro de rede: ${(e as Error)?.name ?? "Error"}`;
          }
          if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }
      throw new LLMError(last);
    },
  };
}
