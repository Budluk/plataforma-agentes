// Byte-compatible port of Python json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).
// Keeps audit hashes and params hashes identical to the ones produced by the original platform.

export function pyFloat(n: number): string {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? "NaN" : n > 0 ? "Infinity" : "-Infinity";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e16)) {
    const [mant = "", exp = "+0"] = n.toExponential().split("e");
    const sign = exp.startsWith("-") ? "-" : "+";
    const digits = exp.replace(/^[-+]/, "").padStart(2, "0");
    return `${mant}e${sign}${digits}`;
  }
  const s = String(n);
  return Number.isInteger(n) ? `${s}.0` : s;
}

const NAMED: Record<number, string> = { 0x22: '\\"', 0x5c: "\\\\", 0x0a: "\\n", 0x0d: "\\r", 0x09: "\\t", 0x08: "\\b", 0x0c: "\\f" };

export function pyStr(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const named = NAMED[c];
    if (named) out += named;
    else if (c < 0x20 || c > 0x7e) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += s[i];
  }
  return out + '"';
}

/** Integers print as Python ints; other numbers as Python floats. */
export function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) && Math.abs(value) < 1e16 ? String(value) : pyFloat(value);
  if (typeof value === "string") return pyStr(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return "{" + entries.map(([k, v]) => pyStr(k) + ":" + canonical(v)).join(",") + "}";
  }
  return pyStr(String(value));
}

export async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const paramsHash = (params: unknown) => sha256hex(canonical(params));

export const GENESIS_HASH = "0".repeat(64);

/** canonical([ts, run_id, actor, event, action, status, detail]) with ts as a Python float. */
export function auditCanon(e: { ts: number; run_id: string; actor: string; event: string; action: string; status: string; detail: string }): string {
  return `[${pyFloat(e.ts)},${[e.run_id, e.actor, e.event, e.action, e.status, e.detail].map(pyStr).join(",")}]`;
}

export async function auditHash(prev: string, e: Parameters<typeof auditCanon>[0]): Promise<string> {
  return sha256hex(prev + auditCanon(e));
}
