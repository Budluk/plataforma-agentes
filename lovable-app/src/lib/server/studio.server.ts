/**
 * Supervised HTTP client for the local CloneStudio service.
 * Port of the source `agents/studio/client.py`.
 *
 * Server-only: it is the one place that talks to the local service. No redirect,
 * no environment proxy, a hard response ceiling and a timeout; every answer is
 * reduced to known fields before leaving this file (never `files`, `buildLog`,
 * `messages` or `prompt`).
 */
import { lookup } from "node:dns/promises";
import {
  STUDIO_ALLOWED_HOSTS,
  STUDIO_BASE_URL_DEFAULT,
  STUDIO_TIMEOUT_MS_DEFAULT,
} from "@/lib/core/config";
import { isPrivateAddress, normalizeHost } from "@/lib/core/studioNet";
import type { StudioCall } from "@/lib/core/studio";

export const MAX_RESPONSE_BYTES = 64_000;
export const MAX_LIST_ITEMS = 20;
export const MAX_VERSIONS = 30;
export const MAX_TEXT = 200;

export class StudioError extends Error {
  override name = "StudioError";
}

const LOOPBACK_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOOPBACK_NAMES.has(h)) return true;
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(h);
  const target = mapped ? (mapped[1] ?? "") : h;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(target);
  if (v4) return Number(v4[1]) === 127;
  if (target.includes(":")) return target === "::1";
  return false;
}

/**
 * Accepts http://loopback[:port] or https://<host>[:port] for a host the operator allowed.
 * Cleartext http is only accepted on loopback; a remote address must be https.
 * No path, query, fragment or credentials in any case.
 */
export function parseBaseUrl(raw: string, allowedHosts: string[] = STUDIO_ALLOWED_HOSTS): string {
  const value = (raw ?? "").trim();
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new StudioError("STUDIO_BASE_URL inválida");
  }
  const scheme = u.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https")
    throw new StudioError("STUDIO_BASE_URL precisa usar http ou https");
  if (u.username || u.password)
    throw new StudioError("STUDIO_BASE_URL não pode conter credenciais");
  if (u.search) throw new StudioError("STUDIO_BASE_URL não pode conter query nem fragmento");
  if (u.hash) throw new StudioError("STUDIO_BASE_URL não pode conter query nem fragmento");
  if (u.pathname !== "" && u.pathname !== "/")
    throw new StudioError("STUDIO_BASE_URL não pode conter caminho");
  // WHATWG URL keeps the brackets on IPv6 hosts (e.g. "[::1]"); the allowlist
  // stores bare addresses, so both sides must be normalized before comparing.
  const host = normalizeHost(u.hostname);
  if (!host) throw new StudioError("STUDIO_BASE_URL sem host");
  const loopback = isLoopbackHost(host);
  if (scheme === "http" && !loopback)
    throw new StudioError("endereço fora da sua máquina só é aceito com https");
  if (!allowedHosts.includes(host))
    throw new StudioError(`host '${host}' não está na lista de hosts do studio`);
  const suffix = u.port ? `:${u.port}` : "";
  const wrapped = host.includes(":") ? `[${host}]` : host;
  return `${scheme}://${wrapped}${suffix}`;
}

export const studioBaseUrl = () =>
  (process.env["STUDIO_BASE_URL"] ?? "").trim() || STUDIO_BASE_URL_DEFAULT;

/** Loopback is always allowed; anything else must be listed in STUDIO_ALLOWED_HOSTS (comma separated). */
export function studioAllowedHosts(): string[] {
  const raw = (process.env["STUDIO_ALLOWED_HOSTS"] ?? "").trim();
  if (!raw) return [...STUDIO_ALLOWED_HOSTS];
  const extra = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...STUDIO_ALLOWED_HOSTS, ...extra])];
}
export const studioTimeoutMs = () => {
  const raw = Number((process.env["STUDIO_TIMEOUT_MS"] ?? "").trim() || STUDIO_TIMEOUT_MS_DEFAULT);
  return Number.isFinite(raw) && raw > 0 ? raw : STUDIO_TIMEOUT_MS_DEFAULT;
};

/**
 * Optional Bearer token for a tunneled Studio service. The value stays in a
 * Cloud Secret and is attached only to the exact host named by STUDIO_TOKEN_HOST.
 * Without that binding the token is never sent (fail closed).
 */
export function studioAuthHeaders(targetHost: string): Record<string, string> {
  const token = (process.env["STUDIO_API_TOKEN"] ?? "").trim();
  const tokenHost = normalizeHost(process.env["STUDIO_TOKEN_HOST"] ?? "");
  if (!token || !tokenHost || normalizeHost(targetHost) !== tokenHost) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Resolves the destination before connecting and refuses private addresses on
 * remote hosts. Loopback is the target-A service and stays allowed. DNS can
 * still be rebound between this check and connect; the host allowlist and TLS
 * are the primary controls, this is defense in depth.
 */
export async function assertDnsSafeHost(host: string): Promise<void> {
  const normalized = normalizeHost(host);
  if (!normalized) throw new StudioError("host do studio ausente");
  if (isLoopbackHost(normalized)) return;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(normalized, { all: true });
  } catch {
    throw new StudioError("não foi possível resolver o host do studio");
  }
  if (addresses.length === 0) throw new StudioError("host do studio sem endereços");
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new StudioError("host do studio resolve para endereço privado");
  }
}

// ---------------- response reducers ----------------
const text = (v: unknown, limit = MAX_TEXT): string =>
  typeof v === "string" ? v.trim().slice(0, limit) : "";
const int = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) ? v : 0);
const optInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;
const optNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const textList = (v: unknown, maxItems = 8, limit = 40): string[] =>
  Array.isArray(v)
    ? v
        .slice(0, maxItems)
        .filter((x): x is string => typeof x === "string")
        .map((x) => text(x, limit))
    : [];

function summary(p: Record<string, unknown>) {
  return {
    id: text(p["id"], 36),
    name: text(p["name"], 80),
    status: text(p["status"], 20),
    stage: text(p["stage"], 120),
    fileCount: int(p["fileCount"]),
    currentVersion: int(p["currentVersion"]),
    updatedAt: text(p["updatedAt"], 40),
  };
}

function validation(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const value = v as Record<string, unknown>;
  const counts = (
    value["counts"] && typeof value["counts"] === "object" ? value["counts"] : {}
  ) as Record<string, unknown>;
  return {
    status: text(value["status"], 20),
    blank: !!value["blank"],
    navigationError: text(value["navigationError"], MAX_TEXT),
    counts: Object.fromEntries(
      ["console", "page", "requests", "http", "images", "total"].map((k) => [k, int(counts[k])]),
    ),
  };
}

function detail(p: Record<string, unknown>) {
  return {
    ...summary(p),
    error: text(p["error"], MAX_TEXT),
    previewUrl: text(p["previewUrl"], 300),
    validation: validation(p["validation"]),
  };
}

function version(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const value = v as Record<string, unknown>;
  const number = int(value["version"]);
  if (number < 1) return null;
  return {
    version: number,
    label: text(value["label"], 80),
    kind: text(value["kind"], 20),
    createdAt: text(value["createdAt"], 40),
    fileCount: int(value["fileCount"]),
  };
}

function inspiration(report: unknown) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const r = report as Record<string, unknown>;
  const platform = text(r["platform"], 20);
  if (!["youtube", "tiktok", "instagram", "facebook"].includes(platform)) return null;
  const obj = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const metrics = obj(r["metrics"]);
  const audience = obj(r["audience"]);
  const reach = obj(r["reach"]);
  const content = obj(r["content"]);
  return {
    platform,
    platformLabel: text(r["platformLabel"], 40),
    url: text(r["url"], 500),
    title: text(r["title"], 160),
    description: text(r["description"], 600),
    handle: text(r["handle"], 80),
    metrics: {
      followers: optInt(metrics["followers"]),
      following: optInt(metrics["following"]),
      posts: optInt(metrics["posts"]),
      totalViews: optInt(metrics["totalViews"]),
      totalLikes: optInt(metrics["totalLikes"]),
      totalComments: optInt(metrics["totalComments"]),
      engagementRate: optNumber(metrics["engagementRate"]),
    },
    audience: {
      size: text(audience["size"], 40),
      sizeLabel: text(audience["sizeLabel"], 80),
      summary: text(audience["summary"], 400),
      signals: textList(audience["signals"], 6, 60),
    },
    reach: { level: text(reach["level"], 40), summary: text(reach["summary"], 400) },
    content: {
      themes: textList(content["themes"], 6, 60),
      format: text(content["format"], 80),
      hashtags: textList(content["hashtags"], 12, 40),
      pillars: textList(content["pillars"], 6, 60),
    },
    hashtags: textList(r["hashtags"], 12, 40),
    limitations: textList(r["limitations"], 8, 240),
    fetchedAt: text(r["fetchedAt"], 40),
  };
}

// ---------------- client ----------------
export class StudioClient {
  baseUrl: string;
  timeoutMs: number;

  constructor(
    baseUrl: string,
    allowedHosts: string[] = STUDIO_ALLOWED_HOSTS,
    timeoutMs = STUDIO_TIMEOUT_MS_DEFAULT,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl, allowedHosts);
    this.timeoutMs = timeoutMs;
  }

  private async request(
    method: string,
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    const url = new URL(`${this.baseUrl}${path}`);
    await assertDnsSafeHost(url.hostname);
    const headers: Record<string, string> = { ...studioAuthHeaders(url.hostname) };
    if (payload) {
      headers["Content-Type"] = "application/json";
    }
    const init: RequestInit = {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
    if (payload) {
      init.body = JSON.stringify(payload);
    }
    try {
      res = await fetch(url.toString(), init);
    } catch (e) {
      throw new StudioError(`erro de rede: ${(e as Error)?.name ?? "Error"}`);
    }
    if (res.status >= 300 && res.status < 400)
      throw new StudioError("CloneStudio respondeu com redirecionamento; recusado");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            size += value.length;
            if (size > MAX_RESPONSE_BYTES)
              throw new StudioError("resposta do CloneStudio grande demais");
            chunks.push(value);
          }
        }
      }
    } catch (e) {
      if (e instanceof StudioError) throw e;
      throw new StudioError(`erro de rede: ${(e as Error)?.name ?? "Error"}`);
    }
    if (res.status >= 400) throw new StudioError(`CloneStudio respondeu HTTP ${res.status}`);
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(concat(chunks)));
    } catch {
      throw new StudioError("resposta do CloneStudio não é JSON válido");
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new StudioError("resposta do CloneStudio não é um objeto");
    return data as Record<string, unknown>;
  }

  private asProject(data: Record<string, unknown>, what = "projeto"): Record<string, unknown> {
    const project = data["project"];
    if (!project || typeof project !== "object" || Array.isArray(project))
      throw new StudioError(`resposta sem ${what}`);
    return project as Record<string, unknown>;
  }

  async health() {
    const data = await this.request("GET", "/api/health");
    if (data["ok"] !== true) throw new StudioError("CloneStudio não confirmou saúde");
    return {
      ok: true,
      name: text(data["name"], 80),
      version: text(data["version"], 40),
      providers: textList(data["providers"]),
    };
  }

  async listApps() {
    const data = await this.request("GET", "/api/projects");
    const projects = data["projects"];
    if (!Array.isArray(projects)) throw new StudioError("resposta sem lista de projetos");
    const list = projects
      .slice(0, MAX_LIST_ITEMS)
      .filter(
        (p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p),
      );
    return { count: projects.length, projects: list.map(summary) };
  }

  async create(prompt: string) {
    const data = await this.request("POST", "/api/projects", { prompt });
    const project = this.asProject(data, "projeto criado");
    return { ...summary(project), previewUrl: text(project["previewUrl"], 300) };
  }

  async status(projectId: string) {
    const data = await this.request(
      "GET",
      `/api/projects/${encodeURIComponent(projectId)}?files=0`,
    );
    return detail(this.asProject(data));
  }

  async validate(projectId: string) {
    const data = await this.request(
      "POST",
      `/api/projects/${encodeURIComponent(projectId)}/validate`,
    );
    return {
      project: summary(this.asProject(data, "projeto validado")),
      validation: validation(data["validation"]),
    };
  }

  private async action(projectId: string, action: string, payload?: Record<string, unknown>) {
    const data = await this.request(
      "POST",
      `/api/projects/${encodeURIComponent(projectId)}/${action}`,
      payload,
    );
    return detail(this.asProject(data, `projeto após ${action}`));
  }

  sendMessage(projectId: string, content: string) {
    return this.action(projectId, "messages", { content });
  }

  fix(projectId: string) {
    return this.action(projectId, "fix");
  }

  fixValidation(projectId: string) {
    return this.action(projectId, "fix-validation");
  }

  rebuild(projectId: string) {
    return this.action(projectId, "rebuild");
  }

  retry(projectId: string) {
    return this.action(projectId, "retry");
  }

  async versions(projectId: string) {
    const data = await this.request(
      "GET",
      `/api/projects/${encodeURIComponent(projectId)}/versions`,
    );
    const raw = data["versions"];
    if (!Array.isArray(raw)) throw new StudioError("resposta sem lista de versões");
    const list = raw
      .slice(0, MAX_VERSIONS)
      .map(version)
      .filter((v): v is NonNullable<typeof v> => v !== null);
    return { currentVersion: int(data["currentVersion"]), count: list.length, versions: list };
  }

  async restore(projectId: string, version: number) {
    const data = await this.request(
      "POST",
      `/api/projects/${encodeURIComponent(projectId)}/restore`,
      { version },
    );
    const out = detail(this.asProject(data, "projeto após restore"));
    const meta = versionOf(data["version"]);
    return { ...out, restoredVersion: meta ?? version };
  }

  async analyzeInspiration(url: string) {
    const data = await this.request("POST", "/api/inspiration/analyze", { url });
    const report = inspiration(data["inspiration"]);
    if (!report) throw new StudioError("resposta sem análise de inspiração válida");
    const token = text(data["token"], 64);
    if (token.length < 32) throw new StudioError("resposta sem token de inspiração");
    return { token, inspiration: report };
  }

  async createInspiration(inspirationToken: string, prompt?: string | null) {
    const payload: Record<string, unknown> = {
      kind: "inspiration",
      inspirationToken: inspirationToken,
    };
    if (prompt) payload["prompt"] = prompt;
    const data = await this.request("POST", "/api/import", payload);
    const project = this.asProject(data, "projeto inspirado");
    if (text(data["kind"], 20) !== "inspiration")
      throw new StudioError("resposta não confirma criação por inspiração");
    return { ...detail(project), kind: "inspiration" };
  }

  private async import(payload: Record<string, unknown>) {
    const data = await this.request("POST", "/api/import", payload);
    const project = this.asProject(data, "projeto importado");
    return { ...detail(project), kind: text(data["kind"], 20) };
  }

  importSite(url: string, prompt?: string | null) {
    const payload: Record<string, unknown> = { kind: "site", url };
    if (prompt) payload["prompt"] = prompt;
    return this.import(payload);
  }

  importGithub(url: string) {
    return this.import({ kind: "github", url });
  }

  importApp(projectId: string) {
    return this.import({ kind: "app", projectId });
  }
}

function versionOf(v: unknown): number | null {
  const meta = version(v);
  return meta ? meta.version : null;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Run one studio call through the client; the caller has already passed contract + gate. */
export async function runStudioCall(
  client: StudioClient,
  call: StudioCall,
): Promise<Record<string, unknown>> {
  const p = (name: string) => {
    const v = (call as Record<string, unknown>)[name];
    if (v == null) throw new StudioError(`${name} ausente (falha fechada)`);
    return v as string;
  };
  switch (call.action) {
    case "health":
      return client.health() as unknown as Record<string, unknown>;
    case "list":
      return client.listApps() as unknown as Record<string, unknown>;
    case "create":
      return client.create(p("prompt")) as unknown as Record<string, unknown>;
    case "status":
      return client.status(p("project_id")) as unknown as Record<string, unknown>;
    case "validate":
      return client.validate(p("project_id")) as unknown as Record<string, unknown>;
    case "messages":
      return client.sendMessage(p("project_id"), p("message")) as unknown as Record<
        string,
        unknown
      >;
    case "fix":
      return client.fix(p("project_id")) as unknown as Record<string, unknown>;
    case "fix_validation":
      return client.fixValidation(p("project_id")) as unknown as Record<string, unknown>;
    case "rebuild":
      return client.rebuild(p("project_id")) as unknown as Record<string, unknown>;
    case "retry":
      return client.retry(p("project_id")) as unknown as Record<string, unknown>;
    case "versions":
      return client.versions(p("project_id")) as unknown as Record<string, unknown>;
    case "restore":
      return client.restore(p("project_id"), Number(call.version ?? 0)) as unknown as Record<
        string,
        unknown
      >;
    case "import": {
      const kind = call.kind;
      if (kind === "app")
        return client.importApp(p("project_id")) as unknown as Record<string, unknown>;
      if (kind === "github")
        return client.importGithub(p("url")) as unknown as Record<string, unknown>;
      return client.importSite(p("url"), call.prompt ?? null) as unknown as Record<string, unknown>;
    }
    case "inspiration":
      return client.analyzeInspiration(p("url")) as unknown as Record<string, unknown>;
    case "inspiration_create":
      return client.createInspiration(
        p("inspiration_token"),
        call.prompt ?? null,
      ) as unknown as Record<string, unknown>;
    default:
      throw new StudioError("ação não implementada");
  }
}
