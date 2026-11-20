/* Lock adaptivo entre processos para o arquivo da fila (jobs.json).
 *
 * Nao ha dependencia nova: a exclusao mutua usa a atomicidade de mkdir em
 * DATA_DIR/jobs.lock. O lock protege apenas a secao de leitura -> fusao ->
 * gravacao, nunca a execucao do job. Um lock abandonado por processo morto
 * e descartado apos CLONESTUDIO_JOB_LOCK_STALE_MS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const LOCK_NAME = 'jobs.lock';
export const DEFAULT_TIMEOUT_MS = 2_000;
export const DEFAULT_STALE_MS = 60_000;
const RETRY_MS = 25;

export function queueLockPath(dataDir) {
  return path.join(dataDir, LOCK_NAME);
}

/** Inteiros positivos; valores invalidos voltam ao padrao (fail closed). */
export function envPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function lockAgeMs(dir) {
  try {
    return Math.max(0, Date.now() - fs.statSync(dir).mtimeMs);
  } catch {
    return 0;
  }
}

/**
 * Cria o diretorio-lock e devolve uma funcao de liberacao idempotente.
 * EEXIST com lock fresco significa "outro processo esta gravando"; EEXIST
 * com lock velho e tratado como abandonado.
 */
export async function acquireQueueLock(
  dir,
  { timeoutMs = DEFAULT_TIMEOUT_MS, staleMs = DEFAULT_STALE_MS } = {},
) {
  await fs.promises.mkdir(path.dirname(dir), { recursive: true });
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await fs.promises.mkdir(dir);
      const owner = { pid: process.pid, createdAt: new Date().toISOString() };
      await fs.promises.writeFile(
        path.join(dir, 'owner.json'),
        `${JSON.stringify(owner)}\n`,
        'utf8',
      );
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await fs.promises.rm(dir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (lockAgeMs(dir) >= staleMs) {
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error('A fila esta ocupada por outro processo.');
      }
      await delay(RETRY_MS);
    }
  }
}

export async function withQueueLock(dir, fn, options = {}) {
  const { staleMs = DEFAULT_STALE_MS } = options;
  const release = await acquireQueueLock(dir, options);
  // Mantem o lock "vivo" durante secoes criticas lentas para que outro
  // processo nao o trate como abandonado por idade.
  const heartbeatMs = Math.max(200, Math.floor(staleMs / 3));
  const heartbeat = setInterval(() => {
    const stamp = new Date();
    fs.promises.utimes(dir, stamp, stamp).catch(() => {
      const ownerFile = path.join(dir, 'owner.json');
      fs.promises.utimes(ownerFile, stamp, stamp).catch(() => {});
    });
  }, heartbeatMs);
  heartbeat.unref?.();
  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    await release();
  }
}
