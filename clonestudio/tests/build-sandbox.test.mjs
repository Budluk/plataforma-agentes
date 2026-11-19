import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  assertSafeBuildConfig,
  buildChildEnv,
  isSensitiveEnvName,
  LOCKED_CONFIG,
} = await import('../server/build-sandbox.mjs');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('identifica variaveis sensiveis e preserva variaveis de sistema', () => {
  assert.equal(isSensitiveEnvName('FREELLMAPI_API_KEY'), true);
  assert.equal(isSensitiveEnvName('GITHUB_TOKEN'), true);
  assert.equal(isSensitiveEnvName('DB_PASSWORD'), true);
  assert.equal(isSensitiveEnvName('NPM_CONFIG_AUTH'), true);
  assert.equal(isSensitiveEnvName('PATH'), false);
  assert.equal(isSensitiveEnvName('TEMP'), false);
  assert.equal(isSensitiveEnvName('SystemRoot'), false);
});

test('ambiente do child nao recebe chaves, tokens ou prefixos de provedor', () => {
  const env = buildChildEnv({
    source: {
      PATH: '/usr/bin',
      TEMP: '/tmp',
      HOME: '/home/user',
      FREELLMAPI_BASE_URL: 'http://localhost:1234/v1',
      FREELLMAPI_API_KEY: 'sk-' + 'a'.repeat(24),
      CONTEXT7_API_KEY: 'ctx-secret',
      GITHUB_TOKEN: 'ghp_' + 'b'.repeat(25),
      APP_PASSWORD: 'hunter2',
      NPM_CONFIG_TOKEN: 'npm-secret',
    },
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.TEMP, '/tmp');
  assert.equal(env.HOME, '/home/user');
  assert.equal(env.FREELLMAPI_BASE_URL, undefined);
  assert.equal(env.FREELLMAPI_API_KEY, undefined);
  assert.equal(env.CONTEXT7_API_KEY, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.APP_PASSWORD, undefined);
  assert.equal(env.NPM_CONFIG_TOKEN, undefined);
  assert.equal(env.CI, '1');
  assert.equal(env.NO_COLOR, '1');
  assert.equal(env.FORCE_COLOR, '0');
});

test('limpa credencial de proxy e limita a memoria do Node', () => {
  const env = buildChildEnv({
    maxOldSpaceMb: 384,
    source: {
      HTTPS_PROXY: 'http://usuario:senha@proxy.local:8080',
      NO_PROXY: 'localhost,127.0.0.1',
      NODE_OPTIONS: '--max-old-space-size=4096 --enable-source-maps',
    },
  });
  assert.equal(env.HTTPS_PROXY, 'http://***@proxy.local:8080');
  assert.equal(env.NO_PROXY, 'localhost,127.0.0.1');
  assert.equal(
    env.NODE_OPTIONS,
    '--enable-source-maps --max-old-space-size=384',
  );
});

test('extra sobrescreve o ambiente sanitizado apenas de proposito', () => {
  const env = buildChildEnv({
    source: { PATH: '/usr/bin', API_KEY: 'segredo' },
    extra: { NODE_ENV: 'test', CUSTOM_FLAG: '1' },
  });
  assert.equal(env.API_KEY, undefined);
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.CUSTOM_FLAG, '1');
});

test('config guard aceita template intacto e rejeita alteracoes', () => {
  const templateDir = tempDir('clonestudio-sandbox-template-');
  const projectDir = tempDir('clonestudio-sandbox-project-');
  try {
    for (const name of LOCKED_CONFIG) {
      const content = name === 'package.json' ? '{"scripts":{}}' : `conteudo fixo de ${name}`;
      fs.writeFileSync(path.join(templateDir, name), content, 'utf8');
      fs.writeFileSync(path.join(projectDir, name), content, 'utf8');
    }
    assert.doesNotThrow(() => assertSafeBuildConfig(projectDir, { templateDir }));

    const config = path.join(projectDir, 'vite.config.ts');
    fs.writeFileSync(config, 'export default { plugins: [evil()] };', 'utf8');
    assert.throws(
      () => assertSafeBuildConfig(projectDir, { templateDir }),
      /Arquivo fixo do template foi alterado: vite\.config\.ts/,
    );
    fs.writeFileSync(config, fs.readFileSync(path.join(templateDir, 'vite.config.ts')));

    fs.writeFileSync(path.join(projectDir, '.npmrc'), 'registry=http://evil.local', 'utf8');
    assert.throws(
      () => assertSafeBuildConfig(projectDir, { templateDir }),
      /Arquivo de configuracao nao permitido no build: \.npmrc/,
    );
    fs.rmSync(path.join(projectDir, '.npmrc'));

    // Grava o mesmo package.json com hook no template e no projeto: assim a
    // comparacao de arquivo fixo passa e a checagem de hooks e que dispara.
    const pkgPath = path.join(projectDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.scripts = { postinstall: 'node evil.mjs' };
    const pkgWithHook = JSON.stringify(pkg);
    fs.writeFileSync(pkgPath, pkgWithHook, 'utf8');
    fs.writeFileSync(path.join(templateDir, 'package.json'), pkgWithHook, 'utf8');
    assert.throws(
      () => assertSafeBuildConfig(projectDir, { templateDir }),
      /Scripts de instalacao nao permitidos: postinstall/,
    );
  } finally {
    fs.rmSync(templateDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
