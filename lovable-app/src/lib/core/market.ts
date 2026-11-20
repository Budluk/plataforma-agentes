import { z } from "zod";
import type { AnalystProposal } from "./contracts";

export const MAX_ENTRY_DEVIATION_PCT = 2.0;
export const FUTURE_TOLERANCE_SECONDS = 300;
export const MAX_AGE_SECONDS: Record<string, number> = { binance: 120, brapi: 5 * 86400, frankfurter: 5 * 86400 };

export const Quote = z
  .object({
    asset: z.string().min(1).max(20),
    price: z.number().finite().gt(0),
    as_of: z.date(),
    source: z.enum(["brapi", "binance", "frankfurter", "mock"]),
    kind: z.enum(["last_trade", "daily_reference", "mock"]),
  })
  .strict();
export type Quote = z.infer<typeof Quote>;

export class MarketDataError extends Error {
  override name = "MarketDataError";
}

export const ageSeconds = (q: Quote, now: Date) => (now.getTime() - q.as_of.getTime()) / 1000;

export function checkQuote(q: Quote, now: Date): string[] {
  if (q.source === "mock") return [];
  const reasons: string[] = [];
  const age = ageSeconds(q, now);
  if (age < -FUTURE_TOLERANCE_SECONDS) reasons.push("horário da cotação está no futuro");
  const limit = MAX_AGE_SECONDS[q.source];
  if (limit === undefined) reasons.push(`fonte sem limite de frescor definido: ${q.source}`);
  else if (age > limit) reasons.push(`cotação antiga demais: ${Math.floor(age / 60)} min (limite ${Math.floor(limit / 60)} min)`);
  return reasons;
}

export function checkEntryVsMarket(p: AnalystProposal, q: Quote): string[] {
  if (p.asset !== q.asset) return ["cotação de outro ativo (falha fechada)"];
  const deviation = (Math.abs(p.entry_price - q.price) / q.price) * 100;
  if (deviation > MAX_ENTRY_DEVIATION_PCT)
    return [`preço de entrada ${p.entry_price} está a ${deviation.toFixed(2)}% do preço de mercado ${q.price} (limite ${MAX_ENTRY_DEVIATION_PCT}%)`];
  return [];
}

function num(value: unknown, name: string): number {
  let x: number;
  if (typeof value === "boolean") throw new MarketDataError(`${name} inválido`);
  if (typeof value === "number") x = value;
  else if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) x = Number(value);
  else if (typeof value === "string") throw new MarketDataError(`${name} inválido`);
  else throw new MarketDataError(`${name} ausente ou inválido`);
  if (!Number.isFinite(x) || x <= 0) throw new MarketDataError(`${name} fora do intervalo válido`);
  return x;
}

function iso(value: unknown, name: string): Date {
  if (typeof value !== "string" || !value.trim()) throw new MarketDataError(`${name} ausente`);
  const v = value.trim();
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(v)) throw new MarketDataError(`${name} sem fuso horário (rejeitado)`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new MarketDataError(`${name} em formato inválido`);
  return d;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseBrapi(ticker: string, payload: unknown): [number, Date] {
  if (!isObj(payload)) throw new MarketDataError("resposta da brapi não é um objeto");
  const results = payload["results"];
  if (!Array.isArray(results) || results.length !== 1 || !isObj(results[0])) throw new MarketDataError("brapi: esperado exatamente um resultado");
  const r = results[0];
  if (r["symbol"] !== ticker) throw new MarketDataError("brapi: símbolo diferente do pedido");
  if ("requestedSymbol" in r && r["requestedSymbol"] !== ticker) throw new MarketDataError("brapi: cotação pertence a outro ticker");
  if (r["currency"] !== "BRL") throw new MarketDataError("brapi: moeda inesperada");
  return [num(r["regularMarketPrice"], "regularMarketPrice"), iso(r["regularMarketTime"], "regularMarketTime")];
}

export function parseBinance(symbol: string, payload: unknown): [number, Date] {
  if (!isObj(payload)) throw new MarketDataError("resposta da Binance não é um objeto");
  if (payload["symbol"] !== symbol) throw new MarketDataError("binance: símbolo diferente do pedido");
  const price = num(payload["lastPrice"], "lastPrice");
  const close = payload["closeTime"];
  if (typeof close !== "number" || !Number.isInteger(close) || close <= 0) throw new MarketDataError("closeTime ausente ou inválido");
  const d = new Date(close);
  if (Number.isNaN(d.getTime())) throw new MarketDataError("closeTime fora do intervalo");
  return [price, d];
}

export function parseFrankfurter(base: string, target: string, payload: unknown): [number, Date] {
  if (!isObj(payload)) throw new MarketDataError("resposta do Frankfurter não é um objeto");
  if (payload["base"] !== base) throw new MarketDataError("frankfurter: moeda base diferente do pedido");
  const rates = payload["rates"];
  if (!isObj(rates) || Object.keys(rates).length !== 1 || !(target in rates)) throw new MarketDataError("frankfurter: taxas diferentes do pedido");
  const price = num(rates[target], "taxa");
  const date = payload["date"];
  if (typeof date !== "string") throw new MarketDataError("data ausente");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new MarketDataError("data em formato inválido");
  // conservative: midnight UTC of the rate date only makes the age larger than the real one
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new MarketDataError("data em formato inválido");
  return [price, d];
}

// Fixed URLs: no user or LLM text ever enters the URL.
export const ROUTES: Record<string, ["brapi" | "binance" | "frankfurter", string]> = {
  PETR4: ["brapi", "https://brapi.dev/api/quote/PETR4"],
  VALE3: ["brapi", "https://brapi.dev/api/quote/VALE3"],
  ITUB4: ["brapi", "https://brapi.dev/api/quote/ITUB4"],
  BTCUSDT: ["binance", "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT"],
  EURUSD: ["frankfurter", "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD"],
};
export const KIND = { brapi: "last_trade", binance: "last_trade", frankfurter: "daily_reference" } as const;

export function parseFor(provider: "brapi" | "binance" | "frankfurter", asset: string, payload: unknown): [number, Date] {
  if (provider === "brapi") return parseBrapi(asset, payload);
  if (provider === "binance") return parseBinance(asset, payload);
  return parseFrankfurter(asset.slice(0, 3), asset.slice(3), payload);
}
