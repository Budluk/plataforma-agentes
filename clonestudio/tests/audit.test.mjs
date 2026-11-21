import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-audit-'));
const auditFile = path.join(dataDir, 'audit.jsonl');
process.env.CLONESTUDIO_AUDIT_PATH = auditFile;

const audit = await import('../server/audit.mjs');
const { runWithRequest } = await import('../server/request-context.mjs');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('redacao cobre chaves sensiveis e segredos dentro de texto livre', () => {
  const secret = 'sk-' + 'a'.repeat(24);
  const value = audit.redact({
    apiKey: secret,
    authorization: 'Bearer abcdefgh123456',
    nested: [{ token: 'ghp_' + 'b'.repeat(25), note: `use ${secret} agora` }],
    keep: 'texto seguro',
  });
  assert.equal(value.apiKey, '***');
  assert.equal(value.authorization, '***');
  assert.equal(value.nested[0].token, '***');
  assert.equal(value.keep, 'texto seguro');
  assert.ok(!JSON.stringify(value).includes(secret));
  assert.ok(!JSON.stringify(value).includes('abcdefgh123456'));
  assert.ok(!JSON.stringify(value).includes('ghp_'));
});

test('redacao nao entra em loop com referencias circulares', () => {
  const value = { nome: 'ok' };
  value.self = value;
  const result = audit.redact(value);
  assert.equal(result.nome, 'ok');
  assert.equal(result.self, '[circular]');
});

test('hashText e determinstico e nao revela o conteudo', () => {
  const hash = audit.hashText('resposta sigilosa');
  assert.equal(hash, audit.hashText('resposta sigilosa'));
  assert.notEqual(hash, audit.hashText('outra resposta'));
  assert.match(hash, /^[0-9a-f]{16}$/);
  assert.ok(!hash.includes('sigilosa'));
});

test('rejectionFields guarda metadados sem a resposta bruta', () => {
  const text = 'JSON invalido com sk-' + 'c'.repeat(24);
  const fields = audit.rejectionFields(
    'resposta rejeitada',
    { text, provider: 'freellmapi', model: 'modelo' },
    new Error(`falha: Bearer zzzzzzzz11111111`),
    'v1',
  );
  assert.equal(fields.chars, text.length);
  assert.equal(fields.sha256, audit.hashText(text));
  assert.equal(fields.provider, 'freellmapi');
  assert.equal(fields.model, 'modelo');
  assert.equal(fields.promptVersion, 'v1');
  assert.ok(!JSON.stringify(fields).includes(text));
  assert.ok(!JSON.stringify(fields).includes('zzzzzzzz11111111'));
  assert.ok(fields.reason.startsWith('falha: ***'));
});

test('log escreve JSONL com request_id do contexto assincrono', () => {
  const logger = new audit.JsonlAudit({ filePath: auditFile });
  runWithRequest({ requestId: 'req-123' }, () =>
    logger.log('api_request', { path: '/api/projects', status: 201, apiKey: 'sk-' + 'd'.repeat(24) }),
  );
  logger.log('sem_contexto', { ok: true });

  const records = fs
    .readFileSync(auditFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(records.length, 2);
  assert.match(records[0].ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(records[0].event, 'api_request');
  assert.equal(records[0].requestId, 'req-123');
  assert.equal(records[0].apiKey, '***');
  assert.equal(records[1].event, 'sem_contexto');
  assert.ok(!('requestId' in records[1]));
});

test('rotacao mantem o limite de backups e o registro mais recente', () => {
  const rotatingFile = path.join(dataDir, 'rot.jsonl');
  const logger = new audit.JsonlAudit({ filePath: rotatingFile, maxBytes: 80, backups: 2 });
  for (let index = 1; index <= 6; index += 1) logger.log(`evento-${index}`, { n: index });

  const main = fs.readFileSync(rotatingFile, 'utf8');
  const first = fs.readFileSync(`${rotatingFile}.1`, 'utf8');
  const second = fs.readFileSync(`${rotatingFile}.2`, 'utf8');
  assert.match(main, /evento-6/);
  assert.ok(!main.includes('evento-1'));
  assert.match(first, /evento-/);
  assert.match(second, /evento-1/);
  for (const content of [main, first, second]) {
    for (const line of content.trim().split('\n')) JSON.parse(line);
  }
});

test('filterFreshLines preserva linhas sem timestamp identificavel', () => {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const result = audit.filterFreshLines(
    ['linha sem json', JSON.stringify({ ts: cutoff, event: 'limite' }), ''].join('\n'),
    cutoff,
  );
  assert.match(result.text, /linha sem json/);
  assert.match(result.text, /limite/);
  assert.equal(result.removed, 0);
});

test('retencao por idade remove registros antigos do arquivo e dos backups', () => {
  const retentionFile = path.join(dataDir, 'ret.jsonl');
  const now = Date.now();
  const oldTs = new Date(now - 40 * 86_400_000).toISOString();
  const recentTs = new Date(now - 1_000).toISOString();
  fs.writeFileSync(
    retentionFile,
    [
      JSON.stringify({ ts: oldTs, event: 'antigo' }),
      JSON.stringify({ ts: recentTs, event: 'recente' }),
      '',
    ].join('\n'),
  );
  fs.writeFileSync(`${retentionFile}.1`, `${JSON.stringify({ ts: oldTs, event: 'backupAntigo' })}\n`);

  const logger = new audit.JsonlAudit({ filePath: retentionFile, retentionDays: 30, backups: 2 });
  assert.equal(logger.expire(now), 2);

  const main = fs.readFileSync(retentionFile, 'utf8');
  assert.match(main, /recente/);
  assert.ok(!main.includes('antigo'));
  assert.equal(fs.existsSync(`${retentionFile}.1`), false);
  for (const line of main.trim().split('\n')) JSON.parse(line);
});

test('retencao assincrona por idade remove registros antigos', async () => {
  const asyncFile = path.join(dataDir, 'ret-async.jsonl');
  const now = Date.now();
  const oldTs = new Date(now - 40 * 86_400_000).toISOString();
  const recentTs = new Date(now - 1_000).toISOString();
  fs.writeFileSync(
    asyncFile,
    [JSON.stringify({ ts: oldTs, event: 'antigo' }), JSON.stringify({ ts: recentTs, event: 'recente' })].join('\n'),
  );
  fs.writeFileSync(`${asyncFile}.1`, `${JSON.stringify({ ts: oldTs, event: 'backupAntigo' })}\n`);

  const logger = new audit.JsonlAudit({ filePath: asyncFile, retentionDays: 0, backups: 2 });
  logger.retentionDays = 30;
  assert.equal(await logger.expireAsync(now), 2);

  const main = fs.readFileSync(asyncFile, 'utf8');
  assert.match(main, /recente/);
  assert.ok(!main.includes('antigo'));
  assert.equal(fs.existsSync(`${asyncFile}.1`), false);
  for (const line of main.trim().split('\n')) JSON.parse(line);
});
