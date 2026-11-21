import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { previewOriginFor } from '../server/preview-origin.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function rawGet(port, hostHeader, pathname = '/api/health', extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'GET',
        headers: { Host: hostHeader, ...extraHeaders },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function waitForServer(port, timeoutMs, getLogs, headers = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = 'sem resposta';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { headers });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await delay(200);
  }
  throw new Error(`O servidor não respondeu na porta ${port} (${last}).\n${getLogs()}`);
}

test('previewOriginFor ignora Host não confiável e preserva a configuração do operador', () => {
  assert.equal(
    previewOriginFor({ configured: 'https://preview.example.com/', hostHeader: 'evil.example.com' }),
    'https://preview.example.com',
  );
  assert.equal(previewOriginFor({ hostHeader: '127.0.0.1:8787', previewPort: 8788 }), 'http://127.0.0.1:8788');
  assert.equal(previewOriginFor({ hostHeader: 'localhost:8787', previewPort: 8788 }), 'http://localhost:8788');
  assert.equal(previewOriginFor({ hostHeader: 'evil.example.com', previewPort: 8788 }), 'http://127.0.0.1:8788');
  assert.equal(previewOriginFor({ hostHeader: '0.0.0.0:8787', previewPort: 8788 }), 'http://127.0.0.1:8788');
  assert.equal(
    previewOriginFor({ hostHeader: '[::1]:8787', bindHost: '::1', previewPort: 8788 }),
    'http://[::1]:8788',
  );
  assert.equal(
    previewOriginFor({
      hostHeader: 'studio.interna.example.com',
      publicHost: 'studio.interna.example.com',
      previewPort: 8788,
    }),
    'http://studio.interna.example.com:8788',
  );
  assert.equal(
    previewOriginFor({
      hostHeader: 'outro.example.com',
      publicHost: 'studio.interna.example.com',
      previewPort: 8788,
    }),
    'http://127.0.0.1:8788',
  );
});

test('todas as rotas /api/ validam o Host, inclusive GET', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-api-host-'));
  const port = await freePort();
  const previewPort = await freePort();
  const logs = [];
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATA_DIR: temp,
      HOST: '127.0.0.1',
      PORT: String(port),
      PREVIEW_PORT: String(previewPort),
      PREVIEW_PUBLIC_URL: '',
      CLONESTUDIO_PUBLIC_HOST: '',
      CLONESTUDIO_API_TOKEN: '',
      CLONESTUDIO_SSE_ENABLED: '0',
      CONTEXT7_ENABLED: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  const getLogs = () => logs.join('').trim() || '(sem saída do servidor)';

  t.after(async () => {
    if (!server.killed) server.kill();
    await Promise.race([once(server, 'exit'), delay(4000)]).catch(() => {});
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  await waitForServer(port, 20000, getLogs);

  const hostileHealth = await rawGet(port, 'evil.example.com');
  assert.equal(hostileHealth.status, 403, getLogs());
  assert.match(hostileHealth.body, /Host não permitido/);

  const hostileConfig = await rawGet(port, 'evil.example.com', '/api/config');
  assert.equal(hostileConfig.status, 403, getLogs());

  const healthy = await rawGet(port, `127.0.0.1:${port}`);
  assert.equal(healthy.status, 200, getLogs());
  const health = JSON.parse(healthy.body);
  assert.equal(health.ok, true);
  assert.equal(health.buildIsolation, 'off');
  assert.equal(health.auth.enabled, false);
  assert.equal(health.auth.rateLimitEnabled, false);
  assert.equal(health.auth.publicHostConfigured, false);
  assert.equal(typeof health.queue.queued, 'number');
  assert.equal(typeof health.queue.running, 'number');
  assert.equal(typeof health.queue.history, 'number');
  assert.equal(typeof health.uptimeMs, 'number');
  assert.ok(health.uptimeMs >= 0);
  assert.equal(typeof health.uptimeSeconds, 'number');
  assert.ok(health.uptimeSeconds >= 0);
  assert.equal(typeof health.lock, 'object');
  assert.notEqual(health.lock, null);
  assert.equal(typeof health.lock.acquires, 'number');
  assert.equal(healthy.headers['x-frame-options'], 'DENY');

  const configLoopback = await rawGet(port, `127.0.0.1:${port}`, '/api/config');
  assert.equal(configLoopback.status, 200, getLogs());
  assert.equal(JSON.parse(configLoopback.body).previewBase, `http://127.0.0.1:${previewPort}`);

  const configLocalhost = await rawGet(port, `localhost:${port}`, '/api/config');
  assert.equal(configLocalhost.status, 200, getLogs());
  assert.equal(JSON.parse(configLocalhost.body).previewBase, `http://localhost:${previewPort}`);

  const page = await rawGet(port, 'evil.example.com', '/');
  assert.equal(page.status, 200, getLogs());
  const csp = String(page.headers['content-security-policy'] || '');
  assert.ok(!csp.includes('evil.example.com'), 'CSP não deve refletir Host não confiável');
  assert.match(csp, new RegExp(`frame-src http://127\\.0\\.0\\.1:${previewPort}\\b`));
});

test('health informa auth e isolamento sem revelar o token', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-health-'));
  const port = await freePort();
  const previewPort = await freePort();
  const token = 'health-token-1234567890';
  const headers = { Authorization: `Bearer ${token}` };
  const logs = [];
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATA_DIR: temp,
      HOST: '127.0.0.1',
      PORT: String(port),
      PREVIEW_PORT: String(previewPort),
      PREVIEW_PUBLIC_URL: '',
      CLONESTUDIO_PUBLIC_HOST: '',
      CLONESTUDIO_API_TOKEN: token,
      CLONESTUDIO_RATE_LIMIT_ENABLED: '1',
      CLONESTUDIO_RATE_LIMIT_PER_MIN: '20',
      CLONESTUDIO_SSE_ENABLED: '0',
      CONTEXT7_ENABLED: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  const getLogs = () => logs.join('').trim() || '(sem saída do servidor)';

  t.after(async () => {
    if (!server.killed) server.kill();
    await Promise.race([once(server, 'exit'), delay(4000)]).catch(() => {});
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  await waitForServer(port, 20000, getLogs, headers);

  const unauthenticated = await rawGet(port, `127.0.0.1:${port}`);
  assert.equal(unauthenticated.status, 401, getLogs());

  const authorized = await rawGet(port, `127.0.0.1:${port}`, '/api/health', headers);
  assert.equal(authorized.status, 200, getLogs());
  const health = JSON.parse(authorized.body);
  assert.equal(health.auth.enabled, true);
  assert.equal(health.auth.rateLimitEnabled, true);
  assert.equal(health.auth.rateLimitPerMin, 20);
  assert.equal(health.auth.publicHostConfigured, false);
  assert.equal(health.buildIsolation, 'off');
  assert.ok(!authorized.body.includes(token));
});
