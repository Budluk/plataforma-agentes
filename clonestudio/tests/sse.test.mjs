import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-sse-'));
process.env.DATA_DIR = dataDir;
process.env.CLONESTUDIO_AUDIT_PATH = path.join(dataDir, 'audit.jsonl');
process.env.CLONESTUDIO_SSE_MAX_CLIENTS = '20';

const { handleSse, sseEnabled, sseStatus } = await import('../server/sse.mjs');
const { publishChange } = await import('../server/change-events.mjs');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function waitForText(res, needle, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Texto ${needle} nao apareceu. Recebido: ${text.slice(0, 500)}`));
    }, timeoutMs);
    const onData = (chunk) => {
      text += chunk.toString();
      if (text.includes(needle)) {
        cleanup();
        resolve(text);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    function cleanup() {
      clearTimeout(timer);
      res.off('data', onData);
      res.off('error', onError);
    }
    res.on('data', onData);
    res.on('error', onError);
  });
}

test('flag desligada nao assume a resposta (fallback para polling)', () => {
  process.env.CLONESTUDIO_SSE_ENABLED = '0';
  assert.equal(sseEnabled(), false);
  let handled = false;
  const res = {
    writeHead() {
      handled = true;
    },
    end() {
      handled = true;
    },
  };
  assert.equal(handleSse({}, res), false);
  assert.equal(handled, false);

  process.env.CLONESTUDIO_SSE_ENABLED = '1';
  assert.equal(sseEnabled(), true);
});

test('fluxo SSE envia hello e avisos coalescidos sem dados sensiveis', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('x-request-id', 'test-request');
    if (!handleSse(req, res)) {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  const client = http.get({ host: '127.0.0.1', port, path: '/api/events' });
  try {
    const [res] = await once(client, 'response');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/event-stream/);
    assert.equal(res.headers['x-request-id'], 'test-request');
    assert.equal(sseStatus().sseClients, 1);

    const hello = await waitForText(res, 'event: hello');
    assert.match(hello, /"sse":true/);
    assert.match(hello, /"revision":/);

    // Tres publicacoes no mesmo tick: o mesmo projeto vira um unico aviso.
    publishChange('project', 'proj-1', 'segredo-nao-deve-vazar');
    publishChange('project', 'proj-1');
    publishChange('projects', 'proj-2');
    const text = await waitForText(res, 'event: change');
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    const payload = JSON.parse(dataLine.slice('data: '.length));
    assert.equal(payload.changes.length, 2);
    assert.deepEqual(
      payload.changes.map((change) => change.id).sort(),
      ['proj-1', 'proj-2'],
    );
    assert.ok(!text.includes('segredo-nao-deve-vazar'));
    assert.ok(!text.toLowerCase().includes('prompt'));

    client.destroy();
    res.destroy();
    await delay(50);
    assert.equal(sseStatus().sseClients, 0);
  } finally {
    client.destroy();
    server.close();
    await once(server, 'close').catch(() => {});
  }
});
