/**
 * Studio area contract, deterministic gate and free-text router.
 * Port of the source `agents/studio/contracts.py`, `agents/studio/gate.py`
 * and the text routing of `pipelines/studio_pipeline.py`.
 * Pure logic: no I/O, so it is unit-testable and shared by client and server.
 */
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTIONS = [
  "health", "list", "create", "status", "validate", "messages", "fix", "fix_validation",
  "rebuild", "retry", "import", "versions", "restore", "inspiration", "inspiration_create",
] as const;
export type StudioAction = (typeof ACTIONS)[number];
export const IMPORT_KINDS = ["site", "github", "app"] as const;

export const StudioRequest = z
  .object({
    action: z.enum(ACTIONS),
    prompt: z.string().min(10).max(2000).nullish(),
    project_id: z
      .string()
      .regex(UUID_RE, "project_id precisa ser um UUID")
      .nullish(),
    message: z.string().min(2).max(2000).nullish(),
    url: z.string().min(12).max(2048).nullish(),
    kind: z.enum(IMPORT_KINDS).nullish(),
    version: z.number().int().min(1).max(1_000_000).nullish(),
    inspiration_token: z
      .string()
      .regex(UUID_RE, "token precisa ser um UUID")
      .min(36)
      .max(36)
      .nullish(),
  })
  .strict();
export type StudioRequest = z.infer<typeof StudioRequest>;

// ---------------- URL checks ----------------
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi;
// Deliberately matches control characters so free text cannot smuggle separators.
// eslint-disable-next-line no-control-regex
const _CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const LABELS: Record<string, string> = { prompt: "descrição", message: "mensagem", url: "URL", inspiration_token: "token" };

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa"];
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const SOCIAL_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be", "tiktok.com", "instagram.com", "facebook.com", "fb.com", "m.facebook.com"]);
const SOCIAL_SUFFIXES = [".youtube.com", ".tiktok.com", ".instagram.com", ".facebook.com"];

const ID_ACTIONS = new Set(["status", "validate", "fix", "fix_validation", "rebuild", "retry", "versions"]);

const v4 = (host: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map((x) => Number(x));
  return parts.every((p) => p <= 255) ? parts : null;
};

/** Fail closed: anything that is not a clearly public address is treated as private. */
function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(h);
  if (mapped) return isPrivateAddress(mapped[1] ?? "");
  const a = v4(h);
  if (a) {
    const [o1, o2] = a as [number, number, number, number];
    if (o1 === 127 || o1 === 0) return true; // loopback / unspecified
    if (o1 === 10) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 === 169 && o2 === 254) return true; // link-local
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // CGNAT
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;
    if (o1 === 192 && o2 === 0 && (a[2] === 2 || a[2] === 3)) return true;
    if (o1 === 198 && o2 === 51 && a[2] === 100) return true;
    if (o1 === 203 && o2 === 0 && a[2] === 113) return true;
    if (o1 >= 224) return true; // multicast + reserved
    return false;
  }
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (/^fe[89ab]/i.test(h)) return true; // link-local
    if (/^f[cd]/i.test(h)) return true; // unique local
    if (/^ff/i.test(h)) return true; // multicast
    return false;
  }
  return false;
}

export function isSocialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return SOCIAL_HOSTS.has(h) || SOCIAL_SUFFIXES.some((s) => h.endsWith(s));
}

function hostOf(raw: string): string {
  try {
    return (new URL(raw).hostname || "").toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function checkStudioUrl(raw: string): string[] {
  const reasons: string[] = [];
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) return ["URL precisa usar http ou https"];
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return ["URL inválida"];
  }
  const scheme = u.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") reasons.push("URL precisa usar http ou https");
  if (u.username || u.password) reasons.push("URL não pode conter usuário/senha");
  if (u.hash) reasons.push("URL não pode conter fragmento");
  const host = (u.hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) reasons.push("URL sem host");
  else {
    if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) reasons.push("URL local ou privada não é permitida");
    else if (isPrivateAddress(host)) reasons.push("URL local ou privada não é permitida");
  }
  if (u.port) {
    const p = Number(u.port);
    if (!(p > 0 && p < 65536)) reasons.push("porta da URL inválida");
  }
  return reasons;
}

function checkImport(req: StudioRequest): string[] {
  const reasons: string[] = [];
  if (!req.kind) return ["importação exige kind (site, github ou app)"];
  if (req.kind === "app") {
    if (!req.project_id) reasons.push("importação de app exige project_id de origem");
    if (req.url != null) reasons.push("importação de app não aceita URL");
    if (req.prompt != null) reasons.push("importação de app não aceita descrição");
    return reasons;
  }
  if (req.project_id != null) reasons.push("importação de site/repositório não aceita project_id");
  if (req.url == null) reasons.push("importação exige URL (falha fechada)");
  else {
    reasons.push(...checkStudioUrl(req.url));
    const host = hostOf(req.url);
    if (req.kind === "github" && !GITHUB_HOSTS.has(host)) reasons.push("importação de repositório aceita apenas github.com");
  }
  if (req.kind === "github" && req.prompt != null) reasons.push("importação de repositório não aceita descrição");
  return reasons;
}

function checkInspiration(req: StudioRequest): string[] {
  const reasons: string[] = [];
  if (req.url == null) return ["análise de inspiração exige URL (falha fechada)"];
  reasons.push(...checkStudioUrl(req.url));
  if (!isSocialHost(hostOf(req.url))) reasons.push("análise de inspiração aceita apenas YouTube, TikTok, Instagram ou Facebook");
  if (req.project_id != null) reasons.push("análise de inspiração não aceita project_id");
  if (req.prompt != null) reasons.push("análise de inspiração não aceita descrição");
  if (req.message != null) reasons.push("análise de inspiração não aceita mensagem");
  if (req.kind != null) reasons.push("análise de inspiração não aceita kind");
  if (req.inspiration_token != null) reasons.push("análise de inspiração não aceita token");
  return reasons;
}

function checkInspirationCreate(req: StudioRequest): string[] {
  const reasons: string[] = [];
  if (req.inspiration_token == null) reasons.push("criação por inspiração exige o token da análise (falha fechada)");
  if (req.project_id != null) reasons.push("criação por inspiração não aceita project_id");
  if (req.message != null) reasons.push("criação por inspiração não aceita mensagem");
  if (req.url != null) reasons.push("criação por inspiração não aceita URL; use o token da análise");
  if (req.kind != null) reasons.push("criação por inspiração não aceita kind");
  return reasons;
}

/** Deterministic gate of the studio area. Any doubt rejects. */
export function checkStudioRequest(req: StudioRequest): string[] {
  const reasons: string[] = [];
  for (const [name, label] of Object.entries(LABELS)) {
    const value = (req as Record<string, unknown>)[name];
    if (typeof value === "string" && _CONTROL.test(value)) reasons.push(`${label} contém caractere de controle`);
  }

  if (req.action !== "restore" && req.version != null) reasons.push(`${req.action} não aceita version`);

  if (req.action === "create") {
    if (req.project_id != null) reasons.push("criação não aceita project_id");
    if (req.message != null || req.url != null || req.kind != null) reasons.push("criação aceita apenas a descrição");
    if (req.inspiration_token != null) reasons.push("criação não aceita token de inspiração");
    if (!(req.prompt ?? "").trim()) reasons.push("descrição ausente (falha fechada)");
    else if (/https?:\/\/|www\./i.test(req.prompt ?? "")) reasons.push("descrição não pode conter URL; use a importação para sites e repositórios");
  } else if (ID_ACTIONS.has(req.action)) {
    if (req.project_id == null) reasons.push("project_id ausente (falha fechada)");
    if (req.prompt != null || req.message != null || req.url != null || req.kind != null) reasons.push(`${req.action} não aceita outros parâmetros`);
    if (req.inspiration_token != null) reasons.push(`${req.action} não aceita token de inspiração`);
  } else if (req.action === "messages") {
    if (req.project_id == null) reasons.push("project_id ausente (falha fechada)");
    if (req.message == null) reasons.push("mensagem ausente (falha fechada)");
    if (req.prompt != null || req.url != null || req.kind != null) reasons.push("messages aceita apenas project_id e mensagem");
    if (req.inspiration_token != null) reasons.push("messages não aceita token de inspiração");
  } else if (req.action === "import") {
    reasons.push(...checkImport(req));
    if (req.inspiration_token != null) reasons.push("import não aceita token; use inspiration_create");
  } else if (req.action === "restore") {
    if (req.project_id == null) reasons.push("project_id ausente (falha fechada)");
    if (req.version == null) reasons.push("restauração exige o número da versão (falha fechada)");
    if (req.prompt != null || req.message != null || req.url != null || req.kind != null) reasons.push("restore aceita apenas project_id e version");
    if (req.inspiration_token != null) reasons.push("restore não aceita token de inspiração");
  } else if (req.action === "inspiration") {
    reasons.push(...checkInspiration(req));
  } else if (req.action === "inspiration_create") {
    reasons.push(...checkInspirationCreate(req));
  } else {
    // health, list
    if (["prompt", "project_id", "message", "url", "kind", "inspiration_token"].some((n) => (req as Record<string, unknown>)[n] != null)) {
      reasons.push(`${req.action} não aceita parâmetros`);
    }
  }
  return reasons;
}

// ---------------- free-text router (central entry) ----------------
// Unicode-aware word boundaries: JS \b is ASCII-only and would miss accented words.
const WB_L = "(?<![\\p{L}\\p{N}_])";
const WB_R = "(?![\\p{L}\\p{N}_])";
const w = (body: string) => new RegExp(`${WB_L}(?:${body})${WB_R}`, "iu");

const UUID_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const UUID_CLASS = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const LIST = /^\s*(listar|lista|list|meus apps|meus aplicativos)\b/iu;
const CREATE = /^\s*(?:por favor,?\s+)?(?:criar|crie|cria|faça|faca|fazer|gere|gerar|quero|montar|monte)\b/iu;
const VALIDATE = w("validar|valide|validação|validacao|verificar|verifique");
const HEALTH = /^\s*(status|saúde|saude|health|ping)\s*[.!?]?\s*$/iu;
const IMPORT = /^\s*(importar|importe|import)\b\s*(.*)$/isu;
// The id is taken as a whole UUID: a greedy \S+ would swallow the ':' that separates it from the text.
const MESSAGE = new RegExp(`^\\s*(?:mensagem|alterar|altere|mudar|mude|ajustar|ajuste)\\s+(${UUID_CLASS})\\s*[:\\-]?\\s*(.+)$`, "isu");
const FIX_VALIDATION = /fix[-\s]?validation|corrigir\s+(?:a\s+)?valida(?:ção|cao)|corrigir\s+o\s+preview/iu;
const REBUILD = w("recompilar|recompile|rebuild");
const RETRY = w("retry|tentar\\s+de\\s+novo|tentar\\s+novamente|repetir");
const RESTORE = w("restaurar|restaure|restore|voltar\\s+para");
const VERSIONS = w("vers(?:ão|oes|ao)|hist(?:óo)rico|versions");
const VERSION_NUMBER = /(?:vers(?:ão|ao)|v)\s*#?\s*(\d{1,6})/iu;
const FIX = w("corrigir|corrija|fix");
const URL_ONLY = /^https?:\/\/\S+$/iu;
const INSPIRATION = w("inspira(?:ção|cao|r)|analis(?:ar|e)\\s+(?:o\\s+)?(?:canal|perfil|p[áa]gina)|p[úu]blico\\s+(?:d[oa]|e)\\s+(?:canal|perfil|p[áa]gina)");
const INSPIRATION_CREATE = /^\s*(?:criar|crie|recriar|recrie)\b[^\n]{0,80}\binspira(?:ção|cao)\b/iu;

export type StudioCall = {
  action: StudioAction;
  prompt?: string | null;
  project_id?: string | null;
  message?: string | null;
  url?: string | null;
  kind?: (typeof IMPORT_KINDS)[number] | null;
  version?: number | null;
  inspiration_token?: string | null;
};

const stripTrailing = (s: string) => s.replace(/[.,;:!?)\]}"']+$/, "");

/** Which single studio action this free-text request means, or why it cannot tell. */
export function parseStudioText(text: string): { ok: true; call: StudioCall } | { ok: false; reason: string } {
  const cleaned = (text ?? "").trim();
  if (!cleaned) return { ok: false, reason: "pedido vazio" };

  const msg = MESSAGE.exec(cleaned);
  if (msg && UUID_RE.test(msg[1] ?? "")) {
    return { ok: true, call: { action: "messages", project_id: (msg[1] ?? "").toLowerCase(), message: (msg[2] ?? "").trim() } };
  }

  if (INSPIRATION_CREATE.test(cleaned)) {
    const token = UUID_TEXT.exec(cleaned);
    if (!token) return { ok: false, reason: "criação por inspiração exige o token da análise" };
    const idea = cleaned.slice((token.index ?? 0) + (token[0] ?? "").length).replace(/^[\s:-]+/, "").replace(/[\s:-]+$/, "");
    if (idea && idea.length < 10) return { ok: false, reason: "descrição da inspiração muito curta (mínimo 10 caracteres)" };
    return { ok: true, call: { action: "inspiration_create", inspiration_token: (token[0] ?? "").toLowerCase(), prompt: idea || null } };
  }

  const inText = URL_IN_TEXT.exec(cleaned);
  URL_IN_TEXT.lastIndex = 0;
  if (inText) {
    const candidate = stripTrailing(inText[0] ?? "");
    const host = hostOf(candidate);
    if (isSocialHost(host) && (INSPIRATION.test(cleaned) || URL_ONLY.test(candidate))) {
      return { ok: true, call: { action: "inspiration", url: candidate } };
    }
  }

  const imp = IMPORT.exec(cleaned);
  if (imp) {
    const urlMatch = /https?:\/\/[^\s<>"']+/i.exec(imp[2] ?? "");
    if (!urlMatch) return { ok: false, reason: "importação exige uma URL" };
    const url = stripTrailing(urlMatch[0] ?? "");
    const host = hostOf(url);
    if (isSocialHost(host)) return { ok: true, call: { action: "inspiration", url } };
    return { ok: true, call: { action: "import", url, kind: GITHUB_HOSTS.has(host) ? "github" : "site" } };
  }

  const id = UUID_TEXT.exec(cleaned);
  if (id) {
    const project_id = (id[0] ?? "").toLowerCase();
    if (RESTORE.test(cleaned)) {
      const number = VERSION_NUMBER.exec(cleaned);
      if (!number) return { ok: false, reason: "restauração exige o número da versão" };
      return { ok: true, call: { action: "restore", project_id, version: Number(number[1]) } };
    }
    if (VERSIONS.test(cleaned)) return { ok: true, call: { action: "versions", project_id } };
    if (FIX_VALIDATION.test(cleaned)) return { ok: true, call: { action: "fix_validation", project_id } };
    if (REBUILD.test(cleaned)) return { ok: true, call: { action: "rebuild", project_id } };
    if (RETRY.test(cleaned)) return { ok: true, call: { action: "retry", project_id } };
    if (VALIDATE.test(cleaned)) return { ok: true, call: { action: "validate", project_id } };
    if (FIX.test(cleaned)) return { ok: true, call: { action: "fix", project_id } };
    return { ok: true, call: { action: "status", project_id } };
  }

  if (LIST.test(cleaned)) return { ok: true, call: { action: "list" } };
  if (HEALTH.test(cleaned)) return { ok: true, call: { action: "health" } };
  if (CREATE.test(cleaned)) return { ok: true, call: { action: "create", prompt: cleaned } };
  return {
    ok: false,
    reason: "não entendi o pedido; comece com 'criar <descrição>' ou use 'listar', 'status', 'validar' ou um project_id",
  };
}
