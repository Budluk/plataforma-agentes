/* Hardening do build do CloneStudio (Fase 4 do plano de producao).
 *
 * NAO e isolamento de seguranca: o codigo gerado continua sendo compilado no
 * mesmo usuario do servidor. Aqui so reduzimos o que o child process pode ver
 * e impedimos que arquivos de configuracao do template sejam alterados.
 * Para exposicao publica seria necessario container/VM (fora do escopo atual).
 */
import fs from 'node:fs';
import path from 'node:path';

const SENSITIVE_ENV = [
  /api[_-]?key/i,
  /access[_-]?key/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /credential/i,
  /private[_-]?key/i,
  /session/i,
  /auth/i,
  /cookie/i,
];

const SENSITIVE_PREFIXES = [
  'FREELLMAPI_',
  'OLLAMA_',
  'LOCALAI_',
  'LLAMACPP_',
  'CONTEXT7_',
  'CLONESTUDIO_',
  'ANTHROPIC_',
  'OPENAI_',
  'GEMINI_',
  'GITHUB_',
  'GH_',
  'NPM_',
];

export const LOCKED_CONFIG = [
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'index.html',
];

export const FORBIDDEN_CONFIG = [
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  '.npmrc',
  '.npmrc.js',
];

export const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'];

export function isSensitiveEnvName(name) {
  const upper = String(name || '').toUpperCase();
  return (
    SENSITIVE_ENV.some((pattern) => pattern.test(name)) ||
    SENSITIVE_PREFIXES.some((prefix) => upper.startsWith(prefix))
  );
}

/** Proxy pode conter usuario:senha na URL; preserva o proxy sem a credencial. */
function scrubProxy(value) {
  return String(value ?? '').replace(/\/\/[^/@:\s]+:[^/@\s]+@/g, '//***@');
}

function nodeOptionsWithHeapLimit(current, maxOldSpaceMb) {
  const parts = String(current || '')
    .split(/\s+/)
    .filter((part) => part && !part.startsWith('--max-old-space-size'));
  parts.push(`--max-old-space-size=${maxOldSpaceMb}`);
  return parts.join(' ');
}

/** Copia o ambiente do servidor removendo credenciais antes de spawnar o build. */
export function buildChildEnv({
  maxOldSpaceMb = 512,
  extra = {},
  source = process.env,
} = {}) {
  const env = {};
  for (const [name, value] of Object.entries(source)) {
    if (isSensitiveEnvName(name)) continue;
    if (/^(HTTP|HTTPS|ALL|NO)_PROXY$/i.test(name)) {
      env[name] = scrubProxy(value);
      continue;
    }
    env[name] = value;
  }
  env.CI = '1';
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  env.NODE_OPTIONS = nodeOptionsWithHeapLimit(env.NODE_OPTIONS, maxOldSpaceMb);
  return { ...env, ...extra };
}

function sameFile(left, right) {
  try {
    return fs.readFileSync(left).equals(fs.readFileSync(right));
  } catch {
    return false;
  }
}

/**
 * Garante que nenhum arquivo de configuracao do template foi trocado por
 * conteudo gerado/importado e que nao ha hooks de instalacao de dependencias.
 */
export function assertSafeBuildConfig(dir, { templateDir }) {
  for (const name of FORBIDDEN_CONFIG) {
    if (fs.existsSync(path.join(dir, name))) {
      throw new Error(`Arquivo de configuracao nao permitido no build: ${name}`);
    }
  }
  for (const name of LOCKED_CONFIG) {
    const target = path.join(dir, name);
    if (!fs.existsSync(target)) continue;
    const source = path.join(templateDir, name);
    if (!sameFile(target, source)) {
      throw new Error(`Arquivo fixo do template foi alterado: ${name}`);
    }
  }

  const packageFile = path.join(dir, 'package.json');
  if (!fs.existsSync(packageFile)) return;
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  } catch {
    throw new Error('package.json do projeto e invalido.');
  }
  const hooks = LIFECYCLE_SCRIPTS.filter((name) => pkg?.scripts?.[name]);
  if (hooks.length > 0) {
    throw new Error(`Scripts de instalacao nao permitidos: ${hooks.join(', ')}`);
  }
}
