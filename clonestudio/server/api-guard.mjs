import crypto from 'node:crypto';

/** Token Bearer da API. Vazio desativa a autenticação; valor curto é recusado no boot. */
export function parseApiToken(raw) {
  const token = String(raw ?? '').trim();
  if (!token) return '';
  if (token.length < 16) throw new Error('CLONESTUDIO_API_TOKEN deve ter pelo menos 16 caracteres.');
  return token;
}

/** Limite por minuto. Vazio usa o padrão; valores inválidos quebram o boot. */
export function parseRateLimit(raw, fallback = 120) {
  const value = String(raw ?? '').trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('CLONESTUDIO_RATE_LIMIT_PER_MIN deve ser um inteiro positivo.');
  return parsed;
}

/** Compara hashes com tempo constante para não vazar o prefixo do token. */
export function tokenMatches(provided, expected) {
  if (!expected) return true;
  const a = crypto.createHash('sha256').update(String(provided ?? '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Chave do limite: endereço do socket, sem confiar em cabeçalhos enviados pelo cliente. */
export function clientKey(req) {
  const raw = String(req?.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();
  return raw || 'desconhecido';
}

/** Janela fixa de um minuto por chave, com limpeza periódica das entradas antigas. */
export class RateLimiter {
  constructor(limit, windowMs = 60_000) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limite deve ser um inteiro positivo.');
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  check(key, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: this.limit - 1, retryAfter: 0 };
    }
    if (entry.count >= this.limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.start + this.windowMs - now) / 1000));
      return { allowed: false, remaining: 0, retryAfter };
    }
    entry.count += 1;
    return { allowed: true, remaining: this.limit - entry.count, retryAfter: 0 };
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.hits) {
      if (now - entry.start >= this.windowMs * 10) this.hits.delete(key);
    }
  }
}

/**
 * Retorna null quando a requisição pode seguir, ou { status, message, extra, headers }
 * para ser convertido em resposta HTTP pelo chamador.
 */
export function guardApiRequest(req, { apiToken = '', limiter = null, now = Date.now() } = {}) {
  if (apiToken) {
    const match = /^Bearer\s+(.+)$/i.exec(String(req?.headers?.authorization || ''));
    if (!match || !tokenMatches(match[1].trim(), apiToken)) {
      return {
        status: 401,
        message: 'Token de API invalido ou ausente.',
        extra: { code: 'unauthorized' },
        headers: { 'www-authenticate': 'Bearer' },
      };
    }
  }
  if (limiter) {
    const result = limiter.check(clientKey(req), now);
    if (!result.allowed) {
      return {
        status: 429,
        message: 'Limite de requisicoes excedido.',
        extra: { code: 'rate_limited', retry_after_seconds: result.retryAfter },
        headers: { 'retry-after': String(result.retryAfter) },
      };
    }
  }
  return null;
}
