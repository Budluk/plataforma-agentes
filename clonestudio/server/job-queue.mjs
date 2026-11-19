/* Fila duravel de jobs do CloneStudio (Fase 3 do plano de producao).
 *
 * Substitui o Map em memoria por registros em DATA_DIR/jobs.json, gravados de
 * forma atomica (.tmp + renameWithRetry). Nao ha Redis nem processo extra:
 * o worker roda no proprio processo, com concorrencia limitada. O build
 * continua serializado pelo buildChain do generator.mjs.
 *
 * Estados: queued -> running -> succeeded | failed | cancelled.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, renameWithRetry } from './storage.mjs';
import { logAudit } from './audit.mjs';

export const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const CONCURRENCY = Math.max(1, Number(process.env.CLONESTUDIO_JOB_CONCURRENCY || 2));
const MAX_RECORDS = Math.max(10, Number(process.env.CLONESTUDIO_JOB_HISTORY || 100));

let records = [];
let pending = [];
let active = 0;
let saveChain = Promise.resolve();
let loaded = false;
const scheduled = new WeakSet();

function isTerminal(state) {
  return TERMINAL.has(state);
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    if (Array.isArray(parsed?.jobs)) {
      // Mantem o estado persistido: `running` precisa ser distinguido de
      // `queued` na recuperacao para virar `cancelled` apos um restart.
      records = parsed.jobs.filter(
        (record) => record && typeof record.id === 'string' && typeof record.kind === 'string',
      );
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[jobs] Nao foi possivel ler ${JOBS_FILE}:`, error.message);
    }
  }
}

/** Serializa as gravacoes para que um estado mais recente nunca seja sobrescrito. */
export function flushJobs() {
  return saveChain;
}

function persist() {
  load();
  const snapshot = JSON.stringify({ version: 1, jobs: records }, null, 2);
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      await fs.promises.mkdir(path.dirname(JOBS_FILE), { recursive: true });
      const tmp = `${JOBS_FILE}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, 'utf8');
      await renameWithRetry(tmp, JOBS_FILE);
    })
    .catch((error) => {
      console.error('[jobs] Nao foi possivel gravar jobs.json:', error.message);
    });
  return saveChain;
}

/** Mantem o historico limitado, descartando primeiro os registros terminados. */
function prune() {
  if (records.length <= MAX_RECORDS) return;
  let excess = records.length - MAX_RECORDS;
  records = records.filter((record) => {
    if (excess > 0 && isTerminal(record.state)) {
      excess -= 1;
      return false;
    }
    return true;
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

/** Chave determinstica: evita duplicar um mesmo pedido apos restart. */
export function idempotencyKey(id, kind, options = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ id, kind, options: stable(options) }))
    .digest('hex')
    .slice(0, 16);
}

function schedule(record, runner) {
  if (scheduled.has(record)) return;
  scheduled.add(record);
  pending.push({ record, runner });
  drain();
}

function finish(record, state, error = null) {
  record.state = state;
  record.finishedAt = new Date().toISOString();
  record.updatedAt = record.finishedAt;
  record.error = error ? String(error.message || error).slice(0, 1000) : null;
  persist();
  logAudit('job_finished', {
    jobId: record.id,
    kind: record.kind,
    state,
    attempts: record.attempts,
    ...(record.error ? { reason: record.error } : {}),
  });
}

function drain() {
  while (active < CONCURRENCY && pending.length > 0) {
    const { record, runner } = pending.shift();
    active += 1;
    record.state = 'running';
    record.attempts += 1;
    record.startedAt = new Date().toISOString();
    record.updatedAt = record.startedAt;
    persist();
    logAudit('job_running', {
      jobId: record.id,
      kind: record.kind,
      attempt: record.attempts,
    });

    Promise.resolve()
      .then(() => new Promise((resolve) => setImmediate(resolve)))
      .then(() => runner(record.id, record.options))
      .then(() => finish(record, 'succeeded'))
      .catch((error) => finish(record, 'failed', error))
      .finally(() => {
        active -= 1;
        drain();
      });
  }
}

/** Adiciona um job. Retorna false se ja existe job ativo para o mesmo projeto. */
export function enqueue({ id, kind, options = {}, runner }) {
  load();
  if (typeof runner !== 'function') throw new Error('runner obrigatorio na fila de jobs');
  if (records.some((record) => record.id === id && !isTerminal(record.state))) return false;

  const key = idempotencyKey(id, kind, options);
  if (records.some((record) => record.idempotencyKey === key && record.state === 'queued')) {
    return false;
  }

  const now = new Date().toISOString();
  const record = {
    id,
    kind,
    options,
    state: 'queued',
    attempts: 0,
    idempotencyKey: key,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  records.push(record);
  prune();
  persist();
  logAudit('job_enqueued', { jobId: id, kind, idempotencyHash: key });
  schedule(record, runner);
  return true;
}

export function isJobActive(id) {
  load();
  return records.some((record) => record.id === id && !isTerminal(record.state));
}

export function queueStats() {
  load();
  const activeJobs = records.filter((record) => !isTerminal(record.state)).length;
  return {
    activeJobs,
    queued: pending.length,
    running: active,
    history: records.filter((record) => isTerminal(record.state)).length,
    concurrency: CONCURRENCY,
  };
}

/**
 * Retomada apos restart. Jobs `running` sao cancelados (o processo anterior
 * morreu); jobs `queued` voltam para o worker com o runner do seu tipo.
 */
export function recover(runners = {}) {
  load();
  const interruptedIds = [];
  const resumedIds = [];
  for (const record of records) {
    if (isTerminal(record.state)) continue;
    if (record.state === 'running') {
      record.state = 'cancelled';
      record.finishedAt = new Date().toISOString();
      record.updatedAt = record.finishedAt;
      record.error = 'Servidor reiniciado durante a execucao.';
      interruptedIds.push(record.id);
      logAudit('job_recovered', {
        jobId: record.id,
        kind: record.kind,
        from: 'running',
        state: 'cancelled',
      });
      continue;
    }
    const runner = runners[record.kind];
    if (typeof runner !== 'function') {
      record.state = 'cancelled';
      record.finishedAt = new Date().toISOString();
      record.updatedAt = record.finishedAt;
      record.error = `Tipo de job desconhecido ao retomar: ${record.kind}`;
      interruptedIds.push(record.id);
      logAudit('job_recovered', {
        jobId: record.id,
        kind: record.kind,
        from: 'queued',
        state: 'cancelled',
      });
      continue;
    }
    resumedIds.push(record.id);
    schedule(record, runner);
  }
  persist();
  return { interruptedIds, resumedIds };
}
