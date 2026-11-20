import { ALLOWED_ASSETS } from "./config";
import { RouteDecision } from "./contracts";
import { cleanText } from "./research";
import { ContractError } from "./llmjson";

export const MAX_REQUEST_CHARS = 1500;
const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function parseRoute(raw: string) {
  let text = raw.trim();
  const m = FENCE.exec(text);
  if (m) text = m[1] ?? "";
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ContractError("RouteInvalid", "resposta do roteador não é JSON válido");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ContractError("RouteInvalid", "JSON do roteador não é um objeto");
  const obj = { ...(data as Record<string, unknown>) };
  if (typeof obj["area"] === "string") obj["area"] = obj["area"].trim().toLowerCase();
  const r = RouteDecision.safeParse(obj);
  if (!r.success) throw new ContractError("RouteInvalid", `decisão falhou na validação (${r.error.issues.length} erro(s))`);
  return r.data;
}

export function prepareRequest(text: string): { ok: true; cleaned: string } | { ok: false; reason: string } {
  const [cleaned, cut] = cleanText(text ?? "", MAX_REQUEST_CHARS);
  if (!cleaned.trim()) return { ok: false, reason: "pedido vazio" };
  if (cut) return { ok: false, reason: `pedido longo demais (máximo ${MAX_REQUEST_CHARS} caracteres)` };
  return { ok: true, cleaned };
}

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export function extractResearch(text: string): { url: string; question: string } | { error: string } {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return { error: "nenhuma URL encontrada no pedido" };
  const url = m[0].replace(/[.,;:!?)\]}]+$/, "");
  let question = text.replace(URL_RE, "").trim().slice(0, 300);
  if (question.length < 3) question = "Resuma esta página.";
  return { url, question };
}

export function extractAsset(text: string): { asset: string } | { error: string } {
  const found = [...ALLOWED_ASSETS].sort().filter((a) => new RegExp(`\\b${a}\\b`, "i").test(text));
  if (!found.length) return { error: "nenhum ativo permitido encontrado no pedido" };
  if (found.length > 1) return { error: "mais de um ativo no pedido; peça um por vez" };
  return { asset: found[0] ?? "" };
}
