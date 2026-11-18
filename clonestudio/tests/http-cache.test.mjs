import test from 'node:test';
import assert from 'node:assert/strict';
import { isNotModified, staticCacheControl, weakEtag } from '../server/http-cache.mjs';

test('weakEtag muda com tamanho e mtime', () => {
  const first = weakEtag({ size: 10, mtimeMs: 1000.4 });
  const second = weakEtag({ size: 10, mtimeMs: 2000 });
  const third = weakEtag({ size: 11, mtimeMs: 1000.4 });
  assert.match(first, /^W\/"/);
  assert.notEqual(first, second);
  assert.notEqual(first, third);
  assert.equal(first, weakEtag({ size: 10, mtimeMs: 1000.9 }));
});

test('isNotModified entende If-None-Match simples, lista e curinga', () => {
  const etag = 'W/"a-b"';
  assert.equal(isNotModified({ headers: {} }, etag), false);
  assert.equal(isNotModified({ headers: { 'if-none-match': etag } }, etag), true);
  assert.equal(
    isNotModified({ headers: { 'if-none-match': `"outro", ${etag}` } }, etag),
    true,
  );
  assert.equal(isNotModified({ headers: { 'if-none-match': '*' } }, etag), true);
  assert.equal(isNotModified({ headers: { 'if-none-match': '"outro"' } }, etag), false);
  assert.equal(isNotModified({ headers: { 'if-none-match': etag } }, null), false);
});

test('staticCacheControl usa cache imutável só para assets com hash', () => {
  assert.equal(
    staticCacheControl('assets/index-Bx8s7a.js'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(
    staticCacheControl('/assets/index-Bx8s7a.css'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(staticCacheControl('index.html'), 'no-cache');
  assert.equal(staticCacheControl('logo.png'), 'no-cache');
});
