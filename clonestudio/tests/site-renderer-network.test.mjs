import test from 'node:test';
import assert from 'node:assert/strict';

const renderer = await import('../server/site-renderer.mjs');

const PUBLIC_URL = 'https://example.com/page';
const PRIVATE_URLS = [
  'http://127.0.0.1/',
  'http://localhost:8787/',
  'http://10.0.0.5/',
  'http://172.20.1.1/',
  'http://192.168.0.1/',
  'http://[::1]/',
  'http://169.254.169.254/', // metadados de nuvem
];
const NON_HTTP_URLS = ['ftp://files.example.com/', 'file:///etc/passwd', 'data:text/html,<script>'];

test('isRouteAllowed permite destinos publicos HTTP(S)', async () => {
  const allowedHosts = new Map();
  assert.ok(await renderer.isRouteAllowed(PUBLIC_URL, allowedHosts));
  assert.ok(allowedHosts.has('example.com'));
});

test('isRouteAllowed bloqueia destinos locais e privados', async () => {
  const allowedHosts = new Map();
  for (const url of PRIVATE_URLS) {
    assert.ok(!(await renderer.isRouteAllowed(url, allowedHosts)), `deve bloquear ${url}`);
  }
  // Nenhum host privado deve ser adicionado ao cache.
  assert.equal(allowedHosts.size, 0);
});

test('isRouteAllowed bloqueia esquemas nao-HTTP', async () => {
  const allowedHosts = new Map();
  for (const url of NON_HTTP_URLS) {
    assert.ok(!(await renderer.isRouteAllowed(url, allowedHosts)), `deve bloquear ${url}`);
  }
  assert.equal(allowedHosts.size, 0);
});

test('isRouteAllowed cacheia host publico apos primeira validacao', async () => {
  const allowedHosts = new Map();
  assert.ok(await renderer.isRouteAllowed(PUBLIC_URL, allowedHosts));
  assert.ok(allowedHosts.has('example.com'));
  // Segunda chamada para o mesmo host nao deve lancar (usa cache).
  assert.ok(await renderer.isRouteAllowed('https://example.com/outro', allowedHosts));
});
