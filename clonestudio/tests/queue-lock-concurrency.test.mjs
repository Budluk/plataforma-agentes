import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-lock-conc-'));
test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('lock serializa secoes criticas concorrentes e registra estatisticas', async () => {
  const lock = await import('../server/queue-lock.mjs');
  const dir = path.join(dataDir, 'lock-conc');
  const events = [];
  const N = 8;

  const runs = Array.from({ length: N }, (_, i) =>
    lock.withQueueLock(
      dir,
      async () => {
        events.push(`in-${i}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push(`out-${i}`);
      },
      { timeoutMs: 5_000, staleMs: 60_000 },
    ),
  );

  await Promise.all(runs);

  // Deve ser estritamente serializado: nenhum 'in' entre 'in' e 'out' do mesmo indice.
  const ins = events.filter((e) => e.startsWith('in-')).map((e) => Number(e.split('-')[1]));
  const outs = events.filter((e) => e.startsWith('out-')).map((e) => Number(e.split('-')[1]));
  assert.equal(ins.length, N);
  assert.equal(outs.length, N);
  // Cada out deve vir depois do respectivo in.
  for (const i of ins) {
    const inIdx = events.indexOf(`in-${i}`);
    const outIdx = events.indexOf(`out-${i}`);
    assert.ok(outIdx > inIdx, `out-${i} deve vir depois de in-${i}`);
  }
  // Nenhuma sobreposicao: entre in-i e out-i nao pode haver outro in.
  for (const i of ins) {
    const slice = events.slice(events.indexOf(`in-${i}`) + 1, events.indexOf(`out-${i}`));
    assert.ok(!slice.some((e) => e.startsWith('in-')), `secao critica de ${i} foi sobreposta`);
  }

  const stats = lock.lockStatsSnapshot();
  assert.equal(stats.acquires, N);
  assert.ok(stats.totalWaitMs >= 0);
  assert.ok(stats.maxWaitMs >= 0);
  assert.ok(stats.averageWaitMs >= 0);
  assert.equal(fs.existsSync(dir), false);
});

test('recuperacao de lock stale incrementa staleRecoveries', async () => {
  const lock = await import('../server/queue-lock.mjs');
  const dir = path.join(dataDir, 'lock-stale-stats');
  fs.mkdirSync(dir, { recursive: true });
  const old = new Date(Date.now() - 120_000).toISOString();
  fs.utimesSync(dir, new Date(old), new Date(old));

  const before = lock.lockStatsSnapshot();
  await lock.withQueueLock(dir, async () => {}, { staleMs: 60_000, timeoutMs: 2_000 });
  const after = lock.lockStatsSnapshot();

  assert.equal(after.staleRecoveries, before.staleRecoveries + 1);
  assert.equal(fs.existsSync(dir), false);
});

test('lockStatsSnapshot e consistente apos operacoes', async () => {
  const lock = await import('../server/queue-lock.mjs');
  const stats = lock.lockStatsSnapshot();
  assert.ok(typeof stats.acquires === 'number' && stats.acquires >= 0);
  assert.ok(typeof stats.waits === 'number' && stats.waits >= 0);
  assert.ok(typeof stats.totalWaitMs === 'number' && stats.totalWaitMs >= 0);
  assert.ok(typeof stats.maxWaitMs === 'number' && stats.maxWaitMs >= 0);
  assert.ok(typeof stats.staleRecoveries === 'number' && stats.staleRecoveries >= 0);
  assert.ok(typeof stats.averageWaitMs === 'number' && stats.averageWaitMs >= 0);
  if (stats.acquires > 0) {
    assert.ok(stats.totalWaitMs >= stats.maxWaitMs);
    assert.ok(stats.averageWaitMs <= stats.totalWaitMs);
  }
});
