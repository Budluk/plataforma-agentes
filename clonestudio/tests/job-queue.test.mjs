import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-jobs-'));
process.env.DATA_DIR = dataDir;
process.env.CLONESTUDIO_JOB_CONCURRENCY = '2';
const auditFile = path.join(dataDir, 'audit.jsonl');
process.env.CLONESTUDIO_AUDIT_PATH = auditFile;

const queue = await import('../server/job-queue.mjs');
const jobsFile = queue.JOBS_FILE;

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle() {
  for (let index = 0; index < 6; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  await queue.flushJobs();
}

function readJobs() {
  return JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
}

test.after(async () => {
  await settle();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('idempotencyKey e determinstica e enqueue deduplica por projeto', async () => {
  assert.equal(
    queue.idempotencyKey('p1', 'generation', { b: 2, a: 1 }),
    queue.idempotencyKey('p1', 'generation', { a: 1, b: 2 }),
  );
  assert.notEqual(
    queue.idempotencyKey('p1', 'generation', {}),
    queue.idempotencyKey('p2', 'generation', {}),
  );

  const gate = deferred();
  assert.equal(
    queue.enqueue({
      id: 'p1',
      kind: 'generation',
      options: { fresh: true },
      runner: () => gate.promise,
    }),
    true,
  );
  assert.equal(
    queue.enqueue({
      id: 'p1',
      kind: 'generation',
      options: { fresh: true },
      runner: () => gate.promise,
    }),
    false,
  );
  assert.equal(queue.isJobActive('p1'), true);

  gate.resolve();
  await settle();
  assert.equal(queue.isJobActive('p1'), false);

  const raw = readJobs();
  assert.equal(raw.jobs.length, 1);
  assert.equal(raw.jobs[0].id, 'p1');
  assert.equal(raw.jobs[0].state, 'succeeded');
  assert.equal(raw.jobs[0].attempts, 1);
  assert.match(raw.jobs[0].idempotencyKey, /^[0-9a-f]{16}$/);
});

test('respeita o limite de concorrencia e mantem excedente em queued', async () => {
  const gates = [deferred(), deferred(), deferred()];
  for (let index = 0; index < gates.length; index += 1) {
    assert.equal(
      queue.enqueue({
        id: `c${index}`,
        kind: 'generation',
        options: {},
        runner: () => gates[index].promise,
      }),
      true,
    );
  }
  await settle();
  const stats = queue.queueStats();
  assert.equal(stats.concurrency, 2);
  assert.equal(stats.running, 2);
  assert.equal(stats.queued, 1);
  assert.equal(stats.activeJobs, 3);

  const raw = readJobs();
  const waiting = raw.jobs.find((job) => job.id === 'c2');
  assert.equal(waiting.state, 'queued');
  assert.equal(waiting.attempts, 0);

  gates[0].resolve();
  await settle();
  assert.equal(queue.queueStats().running, 2);
  assert.equal(queue.queueStats().queued, 0);
  const afterPromotion = readJobs();
  assert.equal(afterPromotion.jobs.find((job) => job.id === 'c2').state, 'running');

  gates[1].resolve();
  gates[2].resolve();
  await settle();
  assert.equal(queue.queueStats().running, 0);
  assert.equal(queue.queueStats().activeJobs, 0);
});

test('persiste sucesso e falha com tentativas e erro', async () => {
  assert.equal(
    queue.enqueue({ id: 'ok', kind: 'rebuild', options: {}, runner: async () => {} }),
    true,
  );
  assert.equal(
    queue.enqueue({
      id: 'fail',
      kind: 'rebuild',
      options: {},
      runner: async () => {
        throw new Error('boom');
      },
    }),
    true,
  );
  await settle();

  const raw = readJobs();
  const ok = raw.jobs.find((job) => job.id === 'ok');
  const fail = raw.jobs.find((job) => job.id === 'fail');
  assert.equal(ok.state, 'succeeded');
  assert.equal(ok.attempts, 1);
  assert.ok(ok.finishedAt);
  assert.equal(ok.error, null);
  assert.equal(fail.state, 'failed');
  assert.equal(fail.error, 'boom');
  assert.ok(fail.finishedAt);
});

test('recuperacao cancela running e retoma queued em um novo processo', async () => {
  await settle();
  const now = new Date().toISOString();
  const base = {
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  fs.writeFileSync(
    jobsFile,
    JSON.stringify(
      {
        version: 1,
        jobs: [
          {
            ...base,
            id: 'r1',
            kind: 'generation',
            options: {},
            state: 'running',
            attempts: 1,
            startedAt: now,
            idempotencyKey: 'a'.repeat(16),
          },
          {
            ...base,
            id: 'r2',
            kind: 'generation',
            options: {},
            state: 'queued',
            idempotencyKey: 'b'.repeat(16),
          },
          {
            ...base,
            id: 'r3',
            kind: 'generation',
            options: {},
            state: 'succeeded',
            idempotencyKey: 'c'.repeat(16),
          },
        ],
      },
      null,
      2,
    ),
  );

  const moduleUrl = pathToFileURL(path.resolve('server/job-queue.mjs')).href;
  const script = `
    import fs from 'node:fs';
    const q = await import(${JSON.stringify(moduleUrl)});
    let ran = 0;
    const result = q.recover({ generation: async () => { ran += 1; } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await q.flushJobs();
    const jobs = JSON.parse(fs.readFileSync(q.JOBS_FILE, 'utf8')).jobs;
    console.log(JSON.stringify({ ...result, ran, jobs }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: dataDir, CLONESTUDIO_AUDIT_PATH: auditFile },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const result = JSON.parse(child.stdout.trim().split('\n').at(-1));

  assert.deepEqual(result.interruptedIds, ['r1']);
  assert.deepEqual(result.resumedIds, ['r2']);
  assert.equal(result.ran, 1);
  const byId = Object.fromEntries(result.jobs.map((job) => [job.id, job]));
  assert.equal(byId.r1.state, 'cancelled');
  assert.equal(byId.r1.error, 'Servidor reiniciado durante a execucao.');
  assert.equal(byId.r2.state, 'succeeded');
  assert.equal(byId.r3.state, 'succeeded');
});

test('mergeRecords unio registros de outro processo e prioriza updatedAt', () => {
  const local = [
    { id: 'a', kind: 'generation', state: 'running', updatedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'b', kind: 'rebuild', state: 'queued', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const disk = [
    { id: 'a', kind: 'generation', state: 'succeeded', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'c', kind: 'restore', state: 'queued', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  const merged = queue.mergeRecords(local, disk);
  assert.deepEqual(
    merged.map((record) => record.id),
    ['a', 'c', 'b'],
  );
  assert.equal(merged.find((record) => record.id === 'a').state, 'running');
  assert.deepEqual(queue.mergeRecords([], []), []);
});

test('lock de fila serializa secoes criticas', async () => {
  const lock = await import('../server/queue-lock.mjs');
  const dir = path.join(dataDir, 'lock-test');
  const events = [];
  const first = lock.withQueueLock(
    dir,
    async () => {
      events.push('in-1');
      await new Promise((resolve) => setTimeout(resolve, 60));
      events.push('out-1');
    },
    { timeoutMs: 2_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = lock.withQueueLock(
    dir,
    async () => {
      events.push('in-2');
      events.push('out-2');
    },
    { timeoutMs: 2_000 },
  );
  await Promise.all([first, second]);
  assert.deepEqual(events, ['in-1', 'out-1', 'in-2', 'out-2']);
  assert.equal(fs.existsSync(dir), false);
});

test('lock abandonado e recuperado apos o prazo de stale', async () => {
  const lock = await import('../server/queue-lock.mjs');
  const dir = path.join(dataDir, 'lock-stale');
  fs.mkdirSync(dir, { recursive: true });
  const old = new Date(Date.now() - 120_000).toISOString();
  fs.utimesSync(dir, new Date(old), new Date(old));

  await lock.withQueueLock(dir, async () => {}, { staleMs: 60_000, timeoutMs: 2_000 });
  assert.equal(fs.existsSync(dir), false);
});

test('dois processos gravando na mesma fila nao se sobrescrevem', async () => {
  const moduleUrl = pathToFileURL(path.resolve('server/job-queue.mjs')).href;
  const childIds = ['child-a', 'child-b'];
  const children = childIds.map((id) => {
    const script = `
      const q = await import(${JSON.stringify(moduleUrl)});
      q.enqueue({ id: ${JSON.stringify(id)}, kind: 'rebuild', options: {}, runner: async () => {} });
      await q.flushJobs();
    `;
    return spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: dataDir, CLONESTUDIO_AUDIT_PATH: auditFile },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  });
  const outputs = await Promise.all(
    children.map(async (child) => {
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });
      const [code] = await once(child, 'exit');
      return { code, output };
    }),
  );
  for (const { code, output } of outputs) assert.equal(code, 0, output);
  const ids = readJobs().jobs.map((job) => job.id);
  for (const id of childIds) assert.ok(ids.includes(id), `${id} ausente em jobs.json`);
});
