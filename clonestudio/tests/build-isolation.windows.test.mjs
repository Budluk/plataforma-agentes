import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const {
  deleteIsolationProfile,
  runIsolatedBuild,
} = await import('../server/build-isolation.mjs');

const PROBE = `
import fs from 'node:fs';
import net from 'node:net';
console.log('ISOLATED_OK');
try {
  fs.readFileSync(process.env.PROBE_SENTINEL, 'utf8');
  console.log('FS_LEAK');
} catch (error) {
  console.log('FS_DENIED=' + error.code);
}
const socket = net.connect(80, '1.1.1.1');
socket.on('connect', () => { console.log('NET_OK'); socket.destroy(); });
socket.on('error', (error) => { console.log('NET_DENIED=' + error.code); });
setTimeout(() => { console.log('NET_TIMEOUT'); socket.destroy(); }, 3000);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', '<html>isolated</html>');
`;

test(
  'AppContainer bloqueia rede e FS externo e devolve o dist',
  { skip: !isWindows && 'requer Windows' },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-iso-test-'));
    const project = path.join(root, 'project');
    const template = path.join(root, 'template');
    const output = path.join(root, 'dist');
    const profileName = `CsTest${Date.now().toString(36)}`;
    try {
      fs.mkdirSync(path.join(project, 'src'), { recursive: true });
      fs.mkdirSync(path.join(template, 'node_modules'), { recursive: true });
      fs.writeFileSync(path.join(template, 'package.json'), '{"name":"probe-template"}');
      fs.writeFileSync(path.join(project, 'src', 'App.tsx'), 'export default () => null;');
      fs.writeFileSync(path.join(project, 'package.json'), '{"name":"probe"}');
      fs.writeFileSync(path.join(project, 'build-probe.mjs'), PROBE);
      const sentinel = path.join(root, 'sentinel.txt');
      fs.writeFileSync(sentinel, 'segredo');

      const result = await runIsolatedBuild({
        projectDir: project,
        templateDir: template,
        outputDir: output,
        command: process.execPath,
        args: ['--preserve-symlinks-main', '--preserve-symlinks', 'build-probe.mjs'],
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PROBE_SENTINEL: sentinel },
        timeoutMs: 20_000,
        memoryMb: 512,
        profileName,
      });

      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /ISOLATED_OK/);
      assert.match(result.output, /FS_DENIED=/);
      assert.doesNotMatch(result.output, /FS_LEAK/);
      assert.match(result.output, /NET_DENIED=EACCES|NET_DENIED=EACCESV6|NET_TIMEOUT/);
      assert.doesNotMatch(result.output, /NET_OK/);
      assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), '<html>isolated</html>');
      assert.ok(!fs.existsSync(path.join(project, 'dist')), 'workspace isolado nao deve gravar no projeto');
      assert.ok(result.isolation.sid.startsWith('S-1-15-2-'));
    } finally {
      await deleteIsolationProfile(profileName).catch(() => {});
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
