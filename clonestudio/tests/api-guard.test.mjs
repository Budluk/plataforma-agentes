import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, guardApiRequest, parseApiToken, parseRateLimit, tokenMatches } from '../server/api-guard.mjs';

test('parseApiToken aceita vazio e recusa token curto', () => {
  assert.equal(parseApiToken(''), '');
  assert.equal(parseApiToken(undefined), '');
  assert.equal(parseApiToken('  token-longo-oito-ou-mais  '), 'token-longo-oito-ou-mais');
  assert.throws(() => parseApiToken('curto'), /16 caracteres/);
});

test('parseRateLimit usa padrao e recusa valores invalidos', () => {
  assert.equal(parseRateLimit('', 120), 120);
  assert.equal(parseRateLimit('45'), 45);
  for (const value of ['0', '-1', '1.5', 'abc']) {
    assert.throws(() => parseRateLimit(value), /inteiro positivo/, value);
  }
});

test('tokenMatches compara sem vazar o valor esperado', () => {
  const expected = 'token-longo-oito-ou-mais';
  assert.equal(tokenMatches(expected, expected), true);
  assert.equal(tokenMatches('token-longo-oito-ou-me', expected), false);
  assert.equal(tokenMatches('', ''), true);
});

test('RateLimiter respeita a janela e libera depois do reset', () => {
  const limiter = new RateLimiter(2, 1_000);
  assert.equal(limiter.check('ip', 0).allowed, true);
  assert.equal(limiter.check('ip', 500).allowed, true);
  const blocked = limiter.check('ip', 900);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 1);
  assert.equal(limiter.check('ip', 1_001).allowed, true);
  assert.equal(limiter.check('outro', 1_001).allowed, true);
  limiter.hits.set('antigo', { start: 0, count: 1 });
  limiter.prune(20_000);
  assert.equal(limiter.hits.has('antigo'), false);
});

test('guardApiRequest libera sem configuracao e exige Bearer quando ha token', () => {
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(guardApiRequest(req), null);
  const denied = guardApiRequest(req, { apiToken: 'token-longo-oito-ou-mais' });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers['www-authenticate'], 'Bearer');
  const ok = guardApiRequest(
    { headers: { authorization: 'Bearer token-longo-oito-ou-mais' }, socket: { remoteAddress: '127.0.0.1' } },
    { apiToken: 'token-longo-oito-ou-mais' },
  );
  assert.equal(ok, null);
});

test('guardApiRequest bloqueia e informa retry-after quando o limite estoura', () => {
  const limiter = new RateLimiter(1, 1_000);
  const req = { headers: { authorization: 'Bearer token-longo-oito-ou-mais' }, socket: { remoteAddress: '127.0.0.1' } };
  const opts = { apiToken: 'token-longo-oito-ou-mais', limiter, now: 0 };
  assert.equal(guardApiRequest(req, opts), null);
  const denied = guardApiRequest(req, { ...opts, now: 100 });
  assert.equal(denied.status, 429);
  assert.equal(denied.extra.code, 'rate_limited');
  assert.equal(denied.headers['retry-after'], '1');
});

test('RateLimiter limita o numero de chaves e abre espaco para novos clientes', () => {
  const limiter = new RateLimiter(5, 1_000, 3);
  for (let index = 0; index < 3; index += 1) {
    assert.equal(limiter.check(`ip-${index}`, 0).allowed, true);
  }
  assert.equal(limiter.hits.size, 3);
  assert.equal(limiter.check('ip-novo', 0).allowed, true);
  assert.equal(limiter.hits.size, 3);
  assert.equal(limiter.hits.has('ip-0'), false);
  assert.equal(limiter.hits.has('ip-novo'), true);
});
