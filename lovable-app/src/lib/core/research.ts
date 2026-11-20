import { z } from "zod";

export const MAX_CHARS = 6000;
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "embed"]);
const BLOCK_TAGS = new Set(["p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "ul", "ol", "table", "title"]);
export const INJECTION_PATTERNS = [
  "ignore previous", "ignore all previous", "ignore as instruções", "ignore as regras", "desconsidere as instruções",
  "disregard", "system prompt", "you are now", "você agora é", "new instructions", "novas instruções",
  "run the following", "execute o comando",
];
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text extraction equivalent to the original HTMLParser-based extractor. */
export function htmlToText(html: string): string {
  try {
    const parts: string[] = [];
    let skip = 0;
    const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>|([^<]+|<)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (m[0].startsWith("<!--")) continue;
      if (m[2]) {
        const tag = m[2].toLowerCase();
        const closing = m[1] === "/";
        const selfClosing = m[3] === "/";
        if (SKIP_TAGS.has(tag)) {
          if (closing) skip = Math.max(0, skip - 1);
          else if (!selfClosing) skip++;
        } else if (BLOCK_TAGS.has(tag)) parts.push("\n");
        continue;
      }
      if (!skip) parts.push(decodeEntities(m[4] ?? m[0]));
    }
    return parts.join("");
  } catch {
    return "";
  }
}

export function cleanText(text: string, maxChars = MAX_CHARS): [string, boolean] {
  let t = text.replace(CONTROL, "");
  while (t.includes("<<<") || t.includes(">>>")) t = t.replaceAll("<<<", "").replaceAll(">>>", "");
  t = t.replace(/[ \t]+/g, " ");
  t = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  if (t.length > maxChars) return [t.slice(0, maxChars), true];
  return [t, false];
}

export const findInjection = (text: string) => {
  const low = text.toLowerCase();
  return INJECTION_PATTERNS.filter((p) => low.includes(p));
};

export function checkUrl(url: string, allowed: string[]): string[] {
  let p: URL;
  try {
    p = new URL(url);
  } catch {
    return ["URL inválida"];
  }
  const reasons: string[] = [];
  if (p.protocol !== "https:") reasons.push("somente https é permitido");
  const host = p.hostname.toLowerCase();
  if (!host) return [...reasons, "URL sem host"];
  if (p.username || p.password || /^[^/]*\/\/[^/]*@/.test(url)) reasons.push("URL com credenciais não é permitida");
  if (p.port && p.port !== "443") reasons.push(`porta ${p.port} não é permitida`);
  if (!allowed.some((d) => host === d || host.endsWith("." + d))) reasons.push(`domínio fora da lista permitida: ${host}`);
  return reasons;
}

export const MAX_SUMMARY_CHARS = 900;
export const MAX_KEY_POINTS = 5;

export const ResearchRequest = z.object({ url: z.string().min(10).max(300), question: z.string().min(3).max(300) }).strict();
export const ResearchSummary = z
  .object({
    summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
    key_points: z.array(z.string()).max(MAX_KEY_POINTS).default([]),
    answers_question: z.boolean(),
  })
  .strict();
export type ResearchSummary = z.infer<typeof ResearchSummary>;

const LINK = /https?:\/\/|www\./i;
export function checkSummary(s: ResearchSummary): string[] {
  return [s.summary, ...s.key_points].some((t) => LINK.test(t)) ? ["resumo contém link (possível isca vinda da página)"] : [];
}
