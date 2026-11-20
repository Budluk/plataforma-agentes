// Mirrors the original config/*.txt files. Absent entries mean "not allowed" (fail closed).
export const ALLOWED_ASSETS = ["BTCUSDT", "EURUSD", "ITUB4", "PETR4", "VALE3"] as const;
export type Asset = (typeof ALLOWED_ASSETS)[number];

export const ALLOWED_RESEARCH_DOMAINS = ["wikipedia.org", "docs.python.org", "developer.mozilla.org"];
export const MARKET_DATA_HOSTS = ["brapi.dev", "data-api.binance.vision", "api.frankfurter.dev"];
export const DEV_ALLOWED_IMPORTS = [
  "__future__", "math", "statistics", "random", "decimal", "fractions", "re", "json", "string", "textwrap",
  "datetime", "time", "uuid", "hashlib", "enum", "dataclasses", "typing", "abc", "collections", "itertools",
  "functools", "operator", "heapq", "bisect", "copy", "pprint", "argparse",
];
export const TRENDS_RSS_HOST = "trends.google.com";

export const AREAS = ["finance", "music", "sales", "funnel", "research", "dev", "studio"] as const;
export type Area = (typeof AREAS)[number];

// Studio (CloneStudio): the local loopback service by default (config/studio_hosts.txt).
// A remote destination is only reachable when the operator adds its host to STUDIO_ALLOWED_HOSTS.
export const STUDIO_BASE_URL_DEFAULT = "http://127.0.0.1:8787";
export const STUDIO_ALLOWED_HOSTS = ["127.0.0.1", "localhost", "::1"];
export const STUDIO_TIMEOUT_MS_DEFAULT = 30_000;

export const AREA_LABELS: Record<Area | "none", string> = {
  finance: "Economia",
  music: "Música",
  sales: "Vendas",
  funnel: "Funil low ticket",
  research: "Pesquisa",
  dev: "Desenvolvimento",
  studio: "Studio",
  none: "Nenhuma",
};
