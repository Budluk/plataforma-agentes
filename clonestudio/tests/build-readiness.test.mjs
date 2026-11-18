import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-build-ready-'));
process.env.DATA_DIR = dataDir;
process.env.PERSIST_DELAY_MS = '0';

const storage = await import('../server/storage.mjs');
const { finishBuild } = await import('../server/generator.mjs');

test.after(async () => {
  await storage.flushPersistence();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('o build só fica pronto depois do snapshot da versão', async () => {
  const project = storage.createProject({ prompt: 'Teste de prontidão do build' });
  storage.ensureProjectWorkspace(project.id);
  await storage.writeGeneratedFiles(project.id, [
    { path: 'src/App.tsx', content: 'export default function App() { return <main>ok</main>; }\n' },
  ]);
  storage.updateProject(project.id, { status: 'building', stage: 'Compilando o app' });

  let statusDuringSnapshot = '';
  const finished = await finishBuild(project.id, async () => {
    statusDuringSnapshot = storage.getProject(project.id).status;
    await storage.snapshotVersion(project.id, { label: 'Alteração por chat', kind: 'generation' });
  });

  assert.equal(statusDuringSnapshot, 'building', 'o snapshot precisa rodar antes de marcar pronto');
  assert.equal(finished.status, 'ready');
  assert.equal(storage.getProject(project.id).currentVersion, 1);
  assert.equal(storage.listVersions(project.id).length, 1);
});

test('build sem snapshot também fica pronto', async () => {
  const project = storage.createProject({ prompt: 'Teste de build sem versão' });
  storage.updateProject(project.id, { status: 'building', stage: 'Compilando o app' });

  const finished = await finishBuild(project.id);
  assert.equal(finished.status, 'ready');
  assert.equal(storage.getProject(project.id).currentVersion ?? 0, 0);
});

test('projeto removido durante o snapshot não volta como pronto', async () => {
  const project = storage.createProject({ prompt: 'Teste de remoção durante o build' });
  storage.updateProject(project.id, { status: 'building', stage: 'Compilando o app' });

  const finished = await finishBuild(project.id, async () => {
    storage.deleteProject(project.id);
  });

  assert.equal(finished, null);
  assert.equal(storage.getProject(project.id), null);
});

test('falha no snapshot não marca o projeto como pronto', async () => {
  const project = storage.createProject({ prompt: 'Teste de falha no snapshot' });
  storage.updateProject(project.id, { status: 'building', stage: 'Compilando o app' });

  await assert.rejects(
    finishBuild(project.id, async () => {
      throw new Error('snapshot falhou');
    }),
    /snapshot falhou/,
  );
  assert.equal(storage.getProject(project.id).status, 'building');
});

test('finishBuild ignora projeto inexistente', async () => {
  const finished = await finishBuild(randomUUID(), async () => {
    throw new Error('não deveria rodar');
  });
  assert.equal(finished, null);
});
