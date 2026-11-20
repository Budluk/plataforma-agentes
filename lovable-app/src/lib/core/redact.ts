const SENSITIVE_KEY = /key|token|secret|password|passwd|authorization|credential|cookie|private/i;
const PATTERNS: RegExp[] = [
  /gsk_[A-Za-z0-9]{16,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /bearer\s+[A-Za-z0-9._-]{16,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
];
export const MASK = "***";
const MAX_STR = 300;
const MAX_DEPTH = 6;
const MAX_ITEMS = 50;

export function redactText(text: string): string {
  let t = text;
  for (const p of PATTERNS) t = t.replace(p, MASK);
  const cps = Array.from(t);
  if (cps.length > MAX_STR) t = cps.slice(0, MAX_STR).join("") + "...[cortado]";
  return t;
}

/** Safe copy for logs and audit: masks by field name and by value pattern, bounds size and depth. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[profundo demais]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value ?? null;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ITEMS) out.push("[itens omitidos]");
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let i = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (i++ >= MAX_ITEMS) {
        out["..."] = "[itens omitidos]";
        break;
      }
      out[redactText(k)] = SENSITIVE_KEY.test(k) ? MASK : redact(v, depth + 1);
    }
    return out;
  }
  return `<${typeof value}>`;
}
