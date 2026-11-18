import { randomUUID } from 'node:crypto';
import {
  createProject,
  deriveProjectName,
  ensureProjectWorkspace,
  getProject,
  updateProject,
} from './storage.mjs';
import { requestGeneration } from './generator.mjs';
import {
  buildInspirationReference,
  inspirationPrompt,
} from './inspiration.mjs';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED = 20;

const cache = new Map();

function pruneCache(now = Date.now()) {
  for (const [token, entry] of cache) {
    if (now - entry.createdAt > TOKEN_TTL_MS) cache.delete(token);
  }
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function rememberInspiration(report) {
  pruneCache();
  const token = randomUUID();
  cache.set(token, { report, createdAt: Date.now() });
  pruneCache();
  return token;
}

export function readInspiration(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.report;
}

export function forgetInspiration(token) {
  cache.delete(String(token || '').trim());
}

export function inspirationProjectName(report, userPrompt = '') {
  const custom = String(userPrompt || '').trim();
  if (custom && !/^https?:\/\/\S+$/i.test(custom)) return deriveProjectName(custom);
  const theme = (report.content?.themes || []).find(
    (item) => item && item !== 'conteúdo geral',
  );
  if (theme) return `App de ${theme}`.slice(0, 80);
  return `App de ${report.platformLabel || 'inspiração'}`.slice(0, 80);
}

export function importInspiration({ token, url = '', prompt = '' } = {}) {
  const report = readInspiration(token);
  if (!report) {
    throw new Error(
      'A análise de inspiração expirou. Analise o link novamente antes de criar o app.',
    );
  }
  const rawPrompt = String(prompt || '').trim();
  const custom = /^https?:\/\/\S+$/i.test(rawPrompt) ? '' : rawPrompt;
  const reference = buildInspirationReference(report);
  const finalPrompt = inspirationPrompt(report, custom);
  const project = createProject({
    prompt: finalPrompt,
    name: inspirationProjectName(report, custom),
  });
  ensureProjectWorkspace(project.id);
  const theme = (report.content?.themes || []).find(
    (item) => item && item !== 'conteúdo geral',
  );
  updateProject(project.id, {
    description: `Projeto original inspirado em análise pública de ${report.platformLabel}${
      theme ? ` (${theme})` : ''
    }.`,
    reference: {
      ...reference,
      url: reference.url || String(url || '').slice(0, 500),
    },
    stage: 'Na fila',
  });
  forgetInspiration(token);
  if (!requestGeneration(project.id, { fresh: true })) {
    throw new Error('Já existe uma geração em andamento para este projeto.');
  }
  return getProject(project.id);
}
