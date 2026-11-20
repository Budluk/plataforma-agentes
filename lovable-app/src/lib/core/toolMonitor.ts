import type { MonitorVerdict, ToolCall } from "./contracts";
import { assertNoExecutionTool, ExecutionToolForbidden } from "./hardGate";
import { KNOWN_TOOLS, REGISTRY } from "./toolRegistry";

// Only fields that can become a file path get content validation.
// Free text (prompt, note, message) goes to the LLM or a data file, never to a shell.
const PATH_KEYS = new Set(["filename", "filepath", "path", "dir", "directory"]);
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$/;
const MAX_STR_LEN = 5000;
const MAX_DEPTH = 5;

/** unquote + NFKC, so traversal through Unicode characters or %-encoding is caught. */
function normalizePath(value: string): string {
  const nfkc = value.normalize("NFKC");
  try {
    return decodeURIComponent(nfkc);
  } catch {
    return nfkc;
  }
}

function scan(value: unknown, depth = 0, key?: string): string | null {
  if (depth > MAX_DEPTH) return "parâmetros aninhados demais";
  if (value === null || typeof value === "boolean" || typeof value === "number") return null;
  if (typeof value === "string") {
    if (value.length > MAX_STR_LEN) return "string de parâmetro longa demais";
    if (key !== undefined && PATH_KEYS.has(key)) {
      if (!SAFE_PATH.test(normalizePath(value))) return `caminho de parâmetro inválido: '${key}'`;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const r = scan(item, depth + 1, key);
      if (r) return r;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = scan(k, depth + 1) ?? scan(v, depth + 1, k);
      if (r) return r;
    }
    return null;
  }
  return `tipo de parâmetro não permitido: ${typeof value}`;
}

type Head = (call: ToolCall, history: string[]) => string | null;

/** Five heads in cascade. Any block or internal failure blocks. */
export class ToolMonitor {
  heads: [string, Head][];
  constructor(public maxCalls = 20) {
    this.heads = [
      ["veto", (c) => {
        try {
          assertNoExecutionTool(c.tool);
        } catch (e) {
          if (e instanceof ExecutionToolForbidden) return e.message;
          throw e;
        }
        return null;
      }],
      ["registry", (c) => (KNOWN_TOOLS.has(c.tool) ? null : `ferramenta desconhecida: '${c.tool}'`)],
      ["params", (c) => scan(c.params)],
      ["sequence", (c, h) => {
        const spec = REGISTRY[c.tool];
        if (spec) {
          for (const needed of spec.requires ?? []) {
            if (!h.includes(needed)) return `${c.tool} exige ${needed} antes na mesma execução`;
          }
        }
        if (h.length >= 2 && h[h.length - 1] === c.tool && h[h.length - 2] === c.tool) return `loop detectado: '${c.tool}' chamada 3 vezes seguidas`;
        return null;
      }],
      ["rate", (_c, h) => (h.length >= this.maxCalls ? `limite de ${this.maxCalls} chamadas por execução atingido` : null)],
    ];
  }

  check(call: ToolCall, history: string[]): MonitorVerdict {
    for (const [name, head] of this.heads) {
      let reason: string | null;
      try {
        reason = head(call, history);
      } catch (e) {
        return { allowed: false, head: name, reason: `cabeça falhou (${(e as Error)?.name ?? "Error"}); bloqueado por padrão` };
      }
      if (reason) return { allowed: false, head: name, reason };
    }
    return { allowed: true, head: "cascade", reason: "todas as cabeças aprovaram" };
  }
}
