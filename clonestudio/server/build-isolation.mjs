/* Isolamento real do build para o alvo B (ADR-0008).
 *
 * No alvo A (loopback) o build continua usando o caminho original, sem custo
 * extra. Com CLONESTUDIO_BUILD_ISOLATION=required o codigo gerado e compilado
 * dentro de um AppContainer sem capabilities de rede, num workspace efemero,
 * sob um Job Object com limites de memoria e tempo. Nada do projeto real e
 * gravado pelo processo isolado: so o dist e copiado de volta pelo servidor.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT } from './env.mjs';

const PROFILE_NAME = 'CloneStudioBuild';
const HELPER = path.join(ROOT, 'scripts', 'windows', 'build-isolation.ps1');
const WORKSPACE_ROOT = path.join(os.tmpdir(), 'clonestudio-build');
const DEFAULT_MEMORY_MB = 1536;
const HELPER_TIMEOUT_MS = 30_000;

const initPromises = new Map();

export function parseBuildIsolation(raw, { publicHost = '' } = {}) {
  const mode = String(raw ?? '').trim().toLowerCase() || 'off';
  if (mode !== 'off' && mode !== 'required') {
    throw new Error(
      `CLONESTUDIO_BUILD_ISOLATION invalido: ${String(raw)}. Use "off" (alvo A) ou "required" (alvo B).`,
    );
  }
  if (publicHost && mode !== 'required') {
    throw new Error(
      'CLONESTUDIO_BUILD_ISOLATION=required e obrigatorio quando CLONESTUDIO_PUBLIC_HOST esta definido.',
    );
  }
  return mode;
}

export function assertBuildIsolationBoot(publicHost) {
  const mode = parseBuildIsolation(process.env.CLONESTUDIO_BUILD_ISOLATION, { publicHost });
  if (mode === 'required' && process.platform !== 'win32') {
    throw new Error('CLONESTUDIO_BUILD_ISOLATION=required exige Windows (AppContainer).');
  }
  return mode;
}

export function isBuildIsolationRequired() {
  return parseBuildIsolation(process.env.CLONESTUDIO_BUILD_ISOLATION, {
    publicHost: process.env.CLONESTUDIO_PUBLIC_HOST,
  }) === 'required';
}

const WINDOWS_HELPER_ENV_KEYS = [
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemDrive',
  'NUMBER_OF_PROCESSORS',
];

function helperEnvFor(childEnv) {
  if (!childEnv) return undefined;
  const env = {};
  for (const key of WINDOWS_HELPER_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, ...childEnv };
}

function callHelper(mode, payload, childEnv, timeoutMs = HELPER_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('Isolamento AppContainer disponivel apenas no Windows.'));
      return;
    }
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER, '-Mode', mode],
      {
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        // O helper herda apenas o ambiente sanitizado; o CreateProcessW do
        // AppContainer herda do helper. Nenhuma chave de provedor vaza.
        ...(childEnv ? { env: helperEnvFor(childEnv) } : {}),
      },
    );
    let stdout = '';
    let stderr = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      reject(new Error(`Helper de isolamento excedeu ${timeoutMs}ms no modo ${mode}.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new Error(`Helper de isolamento nao retornou JSON (modo ${mode}, code ${code}): ${stderr || stdout.slice(0, 500)}`));
        return;
      }
      if (parsed.error) {
        reject(new Error(`Helper de isolamento falhou (modo ${mode}): ${parsed.error}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Helper de isolamento saiu com code ${code} (modo ${mode}): ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(parsed);
    });
    child.stdin.end(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'));
  });
}

export function deleteIsolationProfile(profileName = PROFILE_NAME) {
  if (process.platform !== 'win32') return Promise.resolve({ ok: true });
  for (const key of [...initPromises.keys()]) {
    if (key.startsWith(`${profileName}|`)) initPromises.delete(key);
  }
  return callHelper('cleanup', { profileName });
}

function ensureInitialized(profileName, modulesDir, env) {
  const key = `${profileName}|${modulesDir}`;
  if (!initPromises.has(key)) {
    const promise = callHelper('init', { profileName, modulesDir }, env).catch((error) => {
      initPromises.delete(key);
      throw error;
    });
    initPromises.set(key, promise);
  }
  return initPromises.get(key);
}

export function quoteWindowsArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_.\-/\\]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

export function ensureModuleCache(templateModules) {
  const fingerprint = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(templateModules, '..', 'package.json')))
    .digest('hex')
    .slice(0, 12);
  const cacheDir = path.join(WORKSPACE_ROOT, `cache-${fingerprint}`, 'node_modules');
  const marker = path.join(cacheDir, '.clonestudio-cache');
  if (fs.existsSync(marker)) return cacheDir;
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const staging = fs.mkdtempSync(path.join(WORKSPACE_ROOT, 'modules-staging-'));
  try {
    fs.cpSync(templateModules, staging, { recursive: true, force: true });
    fs.rmSync(path.join(staging, '.vite-temp'), { recursive: true, force: true });
    fs.writeFileSync(path.join(staging, '.clonestudio-cache'), fingerprint, 'utf8');
    fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
    fs.renameSync(staging, cacheDir);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return cacheDir;
}

export function linkTemplateModules(cachedModules, workspace) {
  const target = path.join(workspace, 'node_modules');
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(cachedModules, { withFileTypes: true })) {
    if (entry.name === '.vite-temp' || entry.name === '.clonestudio-cache') continue;
    const source = path.join(cachedModules, entry.name);
    const destination = path.join(target, entry.name);
    if (entry.isDirectory()) {
      fs.symlinkSync(source, destination, 'junction');
    } else {
      fs.copyFileSync(source, destination);
    }
  }
  fs.mkdirSync(path.join(target, '.vite-temp'), { recursive: true });
}

export function shouldCopyBuildEntry(name) {
  return !['node_modules', 'dist', '.git', 'out.log', 'err.log'].includes(name);
}

export function copyBuildInputs(sourceDir, workspace) {
  fs.cpSync(sourceDir, workspace, {
    recursive: true,
    filter: (source) => source === sourceDir || shouldCopyBuildEntry(path.basename(source)),
  });
}

export async function runIsolatedBuild({
  projectDir,
  templateDir,
  outputDir,
  command,
  args = [],
  env = {},
  timeoutMs = 240_000,
  memoryMb = DEFAULT_MEMORY_MB,
  profileName = PROFILE_NAME,
} = {}) {
  if (process.platform !== 'win32') {
    throw new Error('Isolamento AppContainer disponivel apenas no Windows.');
  }
  if (!projectDir || !templateDir || !outputDir || !command) {
    throw new Error('runIsolatedBuild requer projectDir, templateDir, outputDir e command.');
  }
  const modulesDir = path.join(templateDir, 'node_modules');
  const cachedModules = ensureModuleCache(modulesDir);
  const { sid } = await ensureInitialized(profileName, path.dirname(cachedModules), env);
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  const workspace = fs.mkdtempSync(path.join(WORKSPACE_ROOT, 'build-'));
  const outFile = path.join(workspace, 'out.log');
  const errFile = path.join(workspace, 'err.log');
  try {
    copyBuildInputs(projectDir, workspace);
    linkTemplateModules(cachedModules, workspace);
    fs.writeFileSync(outFile, '', 'utf8');
    fs.writeFileSync(errFile, '', 'utf8');

    const argsInCache = args.map((arg) => {
      const text = String(arg);
      return text.startsWith(modulesDir)
        ? path.join(cachedModules, text.slice(modulesDir.length))
        : text;
    });
    const commandLine = [command, ...argsInCache].map(quoteWindowsArg).join(' ');
    const result = await callHelper(
      'run',
      {
        profileName,
        workspace,
        app: command,
        commandLine,
        cwd: workspace,
        outFile,
        errFile,
        timeoutMs: Math.max(1, Math.floor(timeoutMs)),
        memoryMb: Math.max(256, Math.floor(memoryMb)),
      },
      env,
      Math.max(HELPER_TIMEOUT_MS, timeoutMs + 30_000),
    );

    const output = `${fs.readFileSync(outFile, 'utf8')}${fs.readFileSync(errFile, 'utf8')}`.trim();
    const builtDist = path.join(workspace, 'dist');
    let code = Number(result.code);
    if (!Number.isFinite(code)) code = -1;
    if (code === 0 && !fs.existsSync(path.join(builtDist, 'index.html'))) {
      code = -1;
    }
    if (code === 0) {
      await fs.promises.rm(outputDir, { recursive: true, force: true });
      await fs.promises.mkdir(path.dirname(outputDir), { recursive: true });
      await fs.promises.cp(builtDist, outputDir, { recursive: true });
    }
    return {
      code,
      output,
      isolation: {
        sid,
        timedOut: Boolean(result.timedOut),
        peakMemoryMb: Number(result.peakMemoryMb) || 0,
      },
    };
  } finally {
    await fs.promises.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}
