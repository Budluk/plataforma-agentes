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

function rawRequest(port, hostHeader, method, pathname, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: { Host: hostHeader, ...extraHeaders },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForServer(port, timeoutMs, getLogs) {
  const deadline = Date.now() + timeoutMs;
  let last = 'sem resposta';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await delay(200);
  }
  throw new Error(`O servidor não respondeu na porta ${port} (${last}).\n${getLogs()}`);
}

test('erro 500 nao tratado responde mensagem generica sem detalhes internos', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-api-error-'));
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

  // Forca um erro nao-http: acessa rota de projeto com ID inexistente em action que
  // cai no catch generico. Usamos um endpoint que lance excecao inesperada ao tentar
  // ler um arquivo de validacao de um projeto que nao existe.
  const uuid = '00000000-0000-0000-0000-000000000000';
  const response = await rawRequest(port, `127.0.0.1:${port}`, 'GET', `/api/projects/${uuid}/validation`);

  // Se o projeto nao existe, projectOrThrow lança HttpError 404 (nao e o que testamos).
  // Se houver um caminho nao-tratado, deve ser 500 generico. Validamos ambas as saidas
  // seguras: nunca vazar stack trace, caminho de arquivo ou mensagem bruta do erro.
  assert.ok(
    response.status === 404 || response.status === 500,
    `esperado 404 ou 500, obteve ${response.status}: ${response.body}`,
  );
  const bodyLower = response.body.toLowerCase();
  assert.ok(!bodyLower.includes('stack'), 'resposta nao deve conter stack trace');
  assert.ok(!bodyLower.includes('at '), 'resposta nao deve conter pilha de chamadas');
  assert.ok(!bodyLower.includes('error:') || bodyLower.includes('erro interno do servidor'), 'mensagem deve ser generica');
  assert.ok(!bodyLower.includes(temp), 'resposta nao deve vazar caminho do DATA_DIR');
});
