import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-storage-'));
process.env.DATA_DIR = dataDir;
process.env.PERSIST_DELAY_MS = '0';
process.env.SOURCE_SCAN_TTL_MS = '0';
process.env.MAX_VERSIONS = '3';

const storage = await import('../server/storage.mjs');

test.after(async () => {
  await storage.flushPersistence();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('nome derivado corta em limite de palavra', () => {
  assert.equal(
    storage.deriveProjectName('app de foco e estudo com timer pomodoro e lista de tarefas'),
    'App de foco e estudo com timer pomodoro e lista de',
  );
  assert.equal(storage.deriveProjectName('app de notas'), 'App de notas');
  assert.equal(
    storage.deriveProjectName('  App   de   notas, com tags e busca. '),
    'App de notas, com tags e busca',
  );
  assert.equal(storage.deriveProjectName('x'.repeat(80)).length, 52);
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

test('versões: snapshot, deduplicação e restauração com estado atual preservado', async () => {
  const project = storage.createProject({ prompt: 'Teste de versões' });
  storage.ensureProjectWorkspace(project.id);

  await storage.writeGeneratedFiles(project.id, [
    { path: 'src/App.tsx', content: 'export default function App() { return "v1"; }\n' },
  ]);
  const first = await storage.snapshotVersion(project.id, {
    label: 'Geração inicial',
    kind: 'generation',
  });
  assert.equal(first.version, 1);
  assert.equal(storage.getProject(project.id).currentVersion, 1);
  assert.equal(storage.listVersions(project.id).length, 1);

  // Recompilar o mesmo código não cria versão nova.
  const repeated = await storage.snapshotVersion(project.id, { label: 'Recompilação' });
  assert.equal(repeated.version, 1);
  assert.equal(storage.listVersions(project.id).length, 1);

  await storage.writeGeneratedFiles(project.id, [
    { path: 'src/App.tsx', content: 'export default function App() { return "v2"; }\n' },
  ]);
  const second = await storage.snapshotVersion(project.id, {
    label: 'Alteração por chat',
    kind: 'generation',
  });
  assert.equal(second.version, 2);
  assert.equal(storage.getProject(project.id).currentVersion, 2);

  const old = storage.getVersion(project.id, 1);
  assert.match(old.files.find((file) => file.path === 'src/App.tsx').content, /v1/);
  assert.equal(storage.getVersion(project.id, 99), null);

  // Simula uma edição fora do histórico: restaurar precisa salvar esse estado
  // antes de sobrescrever o src/.
  fs.writeFileSync(
    path.join(storage.appDir(project.id), 'src', 'App.tsx'),
    'export default function App() { return "v3-manual"; }\n',
    'utf8',
  );

  const restored = await storage.restoreVersion(project.id, 1);
  assert.equal(restored.version, 1);
  assert.equal(storage.getProject(project.id).currentVersion, 1);
  const files = storage.readSourceFiles(project.id);
  assert.match(files.find((file) => file.path === 'src/App.tsx').content, /v1/);

  const versions = storage.listVersions(project.id);
  assert.equal(versions.length, 3);
  assert.equal(versions[0].version, 3);
  assert.equal(versions[0].kind, 'pre-restore');
  assert.match(
    storage.getVersion(project.id, 3).files.find((file) => file.path === 'src/App.tsx').content,
    /v3-manual/,
  );
});

test('versões respeitam o limite e preservam o alvo da restauração', async () => {
  const project = storage.createProject({ prompt: 'Teste de limite de versões' });
  storage.ensureProjectWorkspace(project.id);

  for (let index = 1; index <= 5; index += 1) {
    await storage.writeGeneratedFiles(project.id, [
      {
        path: 'src/App.tsx',
        content: `export default function App() { return "limite-${index}"; }\n`,
      },
    ]);
    await storage.snapshotVersion(project.id, { label: `Versão ${index}` });
  }

  const versions = storage.listVersions(project.id);
  assert.deepEqual(
    versions.map((version) => version.version),
    [5, 4, 3],
  );
  assert.equal(storage.getProject(project.id).currentVersion, 5);

  // Edição manual fora do histórico força um snapshot novo na restauração; a
  // poda não pode apagar a versão que está sendo restaurada.
  fs.writeFileSync(
    path.join(storage.appDir(project.id), 'src', 'App.tsx'),
    'export default function App() { return "manual"; }\n',
    'utf8',
  );
  await storage.restoreVersion(project.id, 3);
  assert.equal(storage.getProject(project.id).currentVersion, 3);
  assert.ok(storage.getVersion(project.id, 3));
  assert.match(
    storage.readSourceFiles(project.id).find((file) => file.path === 'src/App.tsx').content,
    /limite-3/,
  );
});

test('renameWithRetry repete bloqueios transitórios e desiste em erro definitivo', async () => {
  const transient = new Error('pasta em uso');
  transient.code = 'EPERM';
  const calls = [];
  let failures = 2;
  await storage.renameWithRetry('de', 'para', {
    baseDelayMs: 0,
    rename: async (from, to) => {
      calls.push(`${from}->${to}`);
      if (failures > 0) {
        failures -= 1;
        throw transient;
      }
    },
  });
  assert.equal(calls.length, 3, 'deve tentar de novo até liberar');

  const denied = new Error('sem permissão');
  denied.code = 'EACCES';
  let attempts = 0;
  await assert.rejects(
    storage.renameWithRetry('a', 'b', {
      attempts: 4,
      baseDelayMs: 0,
      rename: async () => {
        attempts += 1;
        throw denied;
      },
    }),
    /sem permissão/,
  );
  assert.equal(attempts, 4);

  const missing = new Error('origem sumiu');
  missing.code = 'ENOENT';
  let fatalAttempts = 0;
  await assert.rejects(
    storage.renameWithRetry('x', 'y', {
      baseDelayMs: 0,
      rename: async () => {
        fatalAttempts += 1;
        throw missing;
      },
    }),
    /origem sumiu/,
  );
  assert.equal(fatalAttempts, 1, 'ENOENT não deve ser repetido');
});


