/* Auditoria estruturada do painel: JSONL com redacao de segredos e rotacao.
 *
 * Nao registra corpo de requisicao, prompt nem resposta bruta do modelo:
 * apenas hashes, tamanhos e metadados. O padrao de redacao espelha
 * core/logger.py da plataforma Python para manter as duas areas alinhadas.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './env.mjs';
import { currentRequestId } from './request-context.mjs';

export const SENSITIVE = [
  'key', 'token', 'secret', 'password', 'authorization', 'cookie', 'credential',
];

const SECRET_PATTERNS = [
  /\b(?:bearer)\s+[A-Za-z0-9._-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
];

export const DEFAULT_MAX_BYTES = 5_000_000;
export const DEFAULT_BACKUPS = 3;
export const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const EXPIRE_INTERVAL_MS = 60 * 60_000;

/** Remove segredos mesmo quando aparecem dentro de texto livre. */
export function scrub(text) {
  let result = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '***');
  return result;
}

/** Redacao recursiva de objetos, com protecao contra referencias circulares. */
export function redact(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((item) => redact(item, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE.some((term) => key.toLowerCase().includes(term)) ? '***' : redact(item, seen),
      ]),
    );
  }
  return typeof value === 'string' ? scrub(value) : value;
}

/** Hash curto e determinstico: identifica o conteudo sem revela-lo. */
export function hashText(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
}

export function auditFilePath() {
  const configured = String(process.env.CLONESTUDIO_AUDIT_PATH || '').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'), 'audit.jsonl');
}

function envInt(name, fallback, minimum) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? Math.floor(value) : fallback;
}

/**
 * Mantem linhas sem timestamp identificavel (fail closed contra perda de dados)
 * e descarta apenas registros com ts explicitamente mais antigo que o corte.
 */
export function filterFreshLines(text, cutoffIso) {
  const cutoff = Date.parse(cutoffIso);
  if (!Number.isFinite(cutoff)) return { text: String(text ?? ''), removed: 0 };
  const kept = [];
  let removed = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (!line) continue;
    let ts;
    try {
      ts = JSON.parse(line)?.ts;
    } catch {
      ts = undefined;
    }
    const time = typeof ts === 'string' ? Date.parse(ts) : NaN;
    if (Number.isFinite(time) && time < cutoff) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  return { text: kept.length ? `${kept.join('\n')}\n` : '', removed };
}

/** Campos seguros para uma resposta rejeitada pelo validador de geracao. */
export function rejectionFields(label, result = {}, error, promptVersion = '') {
  const text = String(result?.text || '');
  return {
    label,
    promptVersion,
    provider: result?.provider || null,
    model: result?.model || null,
    chars: text.length,
    sha256: hashText(text),
    reason: scrub(String(error?.message || '').slice(0, 500)),
  };
}

export class JsonlAudit {
  constructor({
    filePath = auditFilePath(),
    maxBytes = envInt('CLONESTUDIO_AUDIT_MAX_BYTES', DEFAULT_MAX_BYTES, 1),
    backups = envInt('CLONESTUDIO_AUDIT_BACKUPS', DEFAULT_BACKUPS, 0),
    retentionDays = envInt('CLONESTUDIO_AUDIT_RETENTION_DAYS', DEFAULT_RETENTION_DAYS, 0),
  } = {}) {
    this.path = path.resolve(filePath);
    this.dir = path.dirname(this.path);
    this.maxBytes = maxBytes;
    this.backups = backups;
    this.retentionDays = retentionDays;
    this.lastExpireAt = 0;
    fs.mkdirSync(this.dir, { recursive: true });

    // Expiracao por idade roda em janela propria para nao bloquear log() no request.
    if (this.retentionDays > 0) {
      const runExpire = () => {
        const now = Date.now();
        this.lastExpireAt = now;
        try {
          this.expire(now);
        } catch (error) {
          console.error('[audit] Nao foi possivel aplicar retencao por idade:', error.message);
        }
      };
      setImmediate(runExpire);
      const timer = setInterval(runExpire, EXPIRE_INTERVAL_MS);
      timer.unref?.();
    }
  }

  /** Remove registros antigos do arquivo atual e dos backups, por timestamp. */
  expire(now = Date.now()) {
    if (this.retentionDays <= 0) return 0;
    const cutoff = new Date(now - this.retentionDays * DAY_MS).toISOString();
    let removed = 0;
    for (let index = 0; index <= this.backups; index += 1) {
      const file = index === 0 ? this.path : `${this.path}.${index}`;
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const result = filterFreshLines(text, cutoff);
      if (!result.removed) continue;
      removed += result.removed;
      if (!result.text && index > 0) {
        fs.rmSync(file, { force: true });
        continue;
      }
      const tmp = `${file}.${process.pid}.expire.tmp`;
      fs.writeFileSync(tmp, result.text, 'utf8');
      try {
        fs.renameSync(tmp, file);
      } catch (error) {
        fs.rmSync(tmp, { force: true });
        throw error;
      }
    }
    return removed;
  }

  rotate() {
    let size = 0;
    try {
      size = fs.statSync(this.path).size;
    } catch {
      return;
    }
    if (size < this.maxBytes) return;
    if (this.backups === 0) {
      fs.rmSync(this.path, { force: true });
      return;
    }
    // .1 e o backup mais recente; .N, o mais antigo.
    for (let index = this.backups; index >= 1; index -= 1) {
      const source = index === 1 ? this.path : `${this.path}.${index - 1}`;
      const target = `${this.path}.${index}`;
      if (!fs.existsSync(source)) continue;
      try {
        fs.renameSync(source, target);
      } catch {
        // OneDrive/antivirus podem travar o rename; a proxima escrita tenta de novo.
      }
    }
  }

  log(event, fields = {}) {
    const requestId = currentRequestId();
    const record = {
      ts: new Date().toISOString(),
      event,
      ...(requestId ? { requestId } : {}),
      ...redact(fields),
    };
    const line = `${JSON.stringify(record, (_key, value) =>
      value instanceof Error ? scrub(value.message) : value)}\n`;
    this.rotate();
    fs.appendFileSync(this.path, line, 'utf8');
  }
}

let defaultAudit = null;

export function getAudit() {
  if (!defaultAudit) defaultAudit = new JsonlAudit();
  return defaultAudit;
}

export function logAudit(event, fields = {}) {
  getAudit().log(event, fields);
}
