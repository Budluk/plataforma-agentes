import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-storage-'));
process.env.DATA_DIR = dataDir;
process.env.PERSIST_DELAY_MS = '0';
process.env.SOURCE_SCAN_TTL_MS = '0';

const storage = await import('../server/storage.mjs');

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('cache de src/ relê arquivos alterados e evita conteúdo velho', async () => {
  const project = storage.createProject({ prompt: 'Teste de cache de arquivos' });
  storage.ensureProjectWorkspace(project.id);
  await storage.writeGeneratedFiles(project.id, [
    { path: 'src/App.tsx', content: 'export default function App() { return null; }\n' },
    { path: 'src/index.css', content: 'body { color: white; }\n' },
  ]);

  assert.deepEqual(storage.listSourceFiles(project.id), [
    'src/App.tsx',
    'src/index.css',
    'src/main.tsx',
  ]);

  const first = storage.readSourceFiles(project.id);
  const app = first.find((file) => file.path === 'src/App.tsx');
  assert.match(app.content, /return null/);

  const appFile = path.join(storage.appDir(project.id), 'src', 'App.tsx');
  fs.writeFileSync(appFile, 'export default function App() { return "novo"; }\n', 'utf8');
  const future = new Date(Date.now() + 2000);
  fs.utimesSync(appFile, future, future);

  const second = storage.readSourceFiles(project.id);
  assert.match(second.find((file) => file.path === 'src/App.tsx').content, /novo/);
  assert.match(second.find((file) => file.path === 'src/index.css').content, /color: white/);
});

test('projectDetail pode omitir arquivos no polling', async () => {
  const project = storage.createProject({ prompt: 'Teste de detalhe sem arquivos' });
  storage.ensureProjectWorkspace(project.id);
  await storage.writeGeneratedFiles(project.id, [
    { path: 'src/App.tsx', content: 'export default function App() { return null; }\n' },
  ]);

  const full = storage.projectDetail(storage.getProject(project.id), 'http://preview');
  assert.ok(Array.isArray(full.files));
  assert.equal(full.fileCount, full.files.length);

  const light = storage.projectDetail(storage.getProject(project.id), 'http://preview', {
    includeFiles: false,
  });
  assert.equal('files' in light, false);
  assert.equal(light.fileCount, full.fileCount);
});

test('contagem do resumo se atualiza depois de escrever arquivos', async () => {
  const project = storage.createProject({ prompt: 'Teste de contagem de arquivos' });
  storage.ensureProjectWorkspace(project.id);
  await storage.writeGeneratedFiles(project.id, [
    { path: 'src/App.tsx', content: 'export default function App() { return null; }\n' },
  ]);
  assert.equal(storage.projectSummary(storage.getProject(project.id), 'http://preview').fileCount, 3);

  await storage.writeGeneratedFiles(project.id, [
    { path: 'src/App.tsx', content: 'export default function App() { return null; }\n' },
    { path: 'src/components/Card.tsx', content: 'export function Card() { return null; }\n' },
    { path: 'src/components/List.tsx', content: 'export function List() { return null; }\n' },
  ]);
  assert.equal(storage.projectSummary(storage.getProject(project.id), 'http://preview').fileCount, 5);
});

test('persistência agrupada grava o estado final', async () => {
  const project = storage.createProject({ prompt: 'Teste de persistência' });
  await storage.flushPersistence();
  storage.updateProject(project.id, { stage: 'Compilando' });
  storage.updateProject(project.id, { stage: 'Validando preview' });
  await storage.flushPersistence();

  const raw = fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8');
  const db = JSON.parse(raw);
  const saved = db.projects.find((item) => item.id === project.id);
  assert.equal(saved.stage, 'Validando preview');
});
