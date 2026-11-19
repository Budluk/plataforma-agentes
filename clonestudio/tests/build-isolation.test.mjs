import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  copyBuildInputs,
  ensureModuleCache,
  linkTemplateModules,
  parseBuildIsolation,
  quoteWindowsArg,
  shouldCopyBuildEntry,
} = await import('../server/build-isolation.mjs');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('isolamento default e off no alvo A', () => {
  assert.equal(parseBuildIsolation(undefined), 'off');
  assert.equal(parseBuildIsolation(''), 'off');
  assert.equal(parseBuildIsolation('off'), 'off');
  assert.equal(parseBuildIsolation(' REQUIRED '), 'required');
});

test('valor invalido de isolamento e rejeitado', () => {
  assert.throws(() => parseBuildIsolation('whenever'), /CLONESTUDIO_BUILD_ISOLATION invalido/);
});

test('host publico exige isolamento required (fail closed)', () => {
  assert.throws(
    () => parseBuildIsolation('off', { publicHost: 'studio.example.com' }),
    /required e obrigatorio/,
  );
  assert.throws(
    () => parseBuildIsolation('', { publicHost: 'studio.example.com' }),
    /required e obrigatorio/,
  );
  assert.equal(parseBuildIsolation('required', { publicHost: 'studio.example.com' }), 'required');
});

test('argumentos Windows com espacos sao aspados', () => {
  assert.equal(quoteWindowsArg('build'), 'build');
  assert.equal(quoteWindowsArg('C:\\Program Files\\node.exe'), '"C:\\Program Files\\node.exe"');
  assert.equal(quoteWindowsArg('a"b'), '"a\\"b"');
});

test('copia de workspace ignora node_modules, dist e metadados', () => {
  const source = tempDir('iso-src-');
  const target = tempDir('iso-dst-');
  try {
    fs.mkdirSync(path.join(source, 'src'), { recursive: true });
    fs.mkdirSync(path.join(source, 'node_modules', 'vite'), { recursive: true });
    fs.mkdirSync(path.join(source, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(source, 'src', 'App.tsx'), 'export default () => null;');
    fs.writeFileSync(path.join(source, 'node_modules', 'vite', 'x'), 'no');
    fs.writeFileSync(path.join(source, 'dist', 'index.html'), 'no');
    fs.writeFileSync(path.join(source, 'package.json'), '{}');

    copyBuildInputs(source, target);

    assert.equal(fs.readFileSync(path.join(target, 'src', 'App.tsx'), 'utf8'), 'export default () => null;');
    assert.ok(fs.existsSync(path.join(target, 'package.json')));
    assert.ok(!fs.existsSync(path.join(target, 'node_modules')));
    assert.ok(!fs.existsSync(path.join(target, 'dist')));
    assert.equal(shouldCopyBuildEntry('component.tsx'), true);
    assert.equal(shouldCopyBuildEntry('.git'), false);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('cache de modulos e estavel e reutilizavel', () => {
  const base = tempDir('iso-cache-');
  const template = path.join(base, 'templates', 'base');
  const modules = path.join(template, 'node_modules');
  try {
    fs.mkdirSync(path.join(modules, 'vite'), { recursive: true });
    fs.writeFileSync(path.join(template, 'package.json'), '{"dependencies":{"vite":"1.0.0"}}');
    fs.writeFileSync(path.join(modules, 'vite', 'index.js'), 'module.exports = 1;');

    const first = ensureModuleCache(modules);
    const second = ensureModuleCache(modules);
    assert.equal(first, second);
    assert.ok(fs.existsSync(path.join(first, '.clonestudio-cache')));
    assert.equal(fs.readFileSync(path.join(first, 'vite', 'index.js'), 'utf8'), 'module.exports = 1;');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('linker cria node_modules real com .vite-temp gravavel', () => {
  const base = tempDir('iso-link-');
  const cache = path.join(base, 'node_modules');
  const workspace = path.join(base, 'workspace');
  try {
    fs.mkdirSync(path.join(cache, 'vite'), { recursive: true });
    fs.writeFileSync(path.join(cache, 'vite', 'index.js'), 'ok');
    fs.writeFileSync(path.join(cache, '.package-lock.json'), '{}');
    fs.mkdirSync(path.join(cache, '.vite-temp'), { recursive: true });
    fs.writeFileSync(path.join(cache, '.clonestudio-cache'), 'hash');

    linkTemplateModules(cache, workspace);

    const linked = path.join(workspace, 'node_modules');
    assert.ok(fs.existsSync(path.join(linked, 'vite', 'index.js')));
    assert.ok(fs.existsSync(path.join(linked, '.package-lock.json')));
    assert.ok(fs.statSync(path.join(linked, '.vite-temp')).isDirectory());
    assert.ok(!fs.existsSync(path.join(linked, '.clonestudio-cache')));
    fs.writeFileSync(path.join(linked, '.vite-temp', 'tmp.mjs'), 'x');
    assert.ok(fs.existsSync(path.join(cache, '.vite-temp', 'tmp.mjs')) === false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
