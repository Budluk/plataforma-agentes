import type { z } from "zod";

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export class ContractError extends Error {
  constructor(public kind: string, message: string) {
    super(message);
    this.name = kind;
  }
}

/** Same steps as every parse_* in the original: strip fence, JSON, must be an object, strict contract. */
export function parseLlmObject<S extends z.ZodTypeAny>(raw: string, schema: S, kind: string, what: string, listFields = false): z.output<S> {
  let text = raw.trim();
  const m = FENCE.exec(text);
  if (m) text = m[1] ?? "";
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ContractError(kind, `resposta do LLM não é JSON válido`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new ContractError(kind, "JSON do LLM não é um objeto");
  const r = schema.safeParse(data);
  if (!r.success)
    throw new ContractError(kind, listFields ? `${what} falhou na validação: ${issueFields(r.error)}` : `${what} falhou na validação (${r.error.issues.length} erro(s))`);
  return r.data as z.output<S>;
}

export function issueFields(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".")}(${i.code})`).join(", ");
}
