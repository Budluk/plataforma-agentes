import { MarketDataError } from "@/lib/core/market";
import { checkUrl } from "@/lib/core/research";

async function readLimited(r: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = r.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      chunks.push(value.slice(0, value.length - (total - maxBytes)));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return { bytes: out, truncated };
}

/** Read-only: GET only, https only, listed hosts only, no redirects, bounded response. */
export async function getMarketJson(url: string, allowedHosts: string[], userAgent: string): Promise<unknown> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !allowedHosts.includes(u.hostname)) throw new MarketDataError(`host fora da lista permitida: ${u.hostname}`);
  let r: Response;
  try {
    r = await fetch(url, { method: "GET", redirect: "manual", headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new MarketDataError(`erro de rede: ${(e as Error)?.name ?? "Error"}`);
  }
  if (r.status >= 300 && r.status < 400) throw new MarketDataError("redirecionamento não permitido");
  if (r.status !== 200) throw new MarketDataError(`HTTP ${r.status}`);
  if (!(r.headers.get("content-type") ?? "").toLowerCase().includes("json")) throw new MarketDataError("tipo de conteúdo não é JSON");
  const { truncated, bytes } = await readLimited(r, 200_000);
  if (truncated) throw new MarketDataError("resposta grande demais");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MarketDataError("resposta não é JSON válido");
  }
}

export class FetchError extends Error {
  override name = "FetchError";
}

export interface FetchedPage {
  url: string;
  content_type: string;
  text: string;
  truncated: boolean;
}

/** One page from an allowed domain. Each redirect hop is re-checked against the allowlist. */
export async function fetchPage(url: string, allowed: string[], userAgent: string, maxBytes = 200_000, maxRedirects = 3): Promise<FetchedPage> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const reasons = checkUrl(current, allowed);
    if (reasons.length) throw new FetchError(reasons.join("; "));
    let r: Response;
    try {
      r = await fetch(current, { method: "GET", redirect: "manual", headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new FetchError(`erro de rede: ${(e as Error)?.name ?? "Error"}`);
    }
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("location");
      if (!loc) throw new FetchError("redirecionamento sem destino");
      current = new URL(loc, current).toString();
      continue;
    }
    if (r.status !== 200) throw new FetchError(`HTTP ${r.status}`);
    const ctype = (r.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (ctype !== "text/html" && ctype !== "text/plain") throw new FetchError(`tipo de conteúdo não permitido: ${ctype || "desconhecido"}`);
    const charset = /charset=([^;]+)/i.exec(r.headers.get("content-type") ?? "")?.[1]?.trim() ?? "utf-8";
    const { bytes, truncated } = await readLimited(r, maxBytes);
    let text: string;
    try {
      text = new TextDecoder(charset).decode(bytes);
    } catch {
      text = new TextDecoder("utf-8").decode(bytes);
    }
    return { url: current, content_type: ctype, text, truncated };
  }
  throw new FetchError("redirecionamentos demais");
}

/** Google Trends RSS. GET only, no redirects, bounded response. */
export async function fetchRss(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "trends.google.com") throw new Error("host fora da lista permitida");
  let r: Response;
  try {
    r = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new Error(`erro de rede: ${(e as Error)?.name ?? "Error"}`);
  }
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const { bytes, truncated } = await readLimited(r, 200 * 1024);
  if (truncated) throw new Error("resposta acima do limite");
  return new TextDecoder().decode(bytes);
}
