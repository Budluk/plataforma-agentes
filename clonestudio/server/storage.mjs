import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './env.mjs';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
export const TEMPLATE_DIR = path.join(ROOT, 'templates', 'base');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const MAX_PROJECTS = 80;
const MAX_MESSAGES = 80;
const MAX_VERSIONS = Math.max(1, Number(process.env.MAX_VERSIONS ?? 30));
const PERSIST_DELAY_MS = Math.max(0, Number(process.env.PERSIST_DELAY_MS ?? 150));
const SOURCE_SCAN_TTL_MS = Math.max(0, Number(process.env.SOURCE_SCAN_TTL_MS ?? 5000));

let db = { version: 1, projects: [] };
let saveChain = Promise.resolve();
let loaded = false;
let persistenceBlocked = false;
let persistTimer = null;
let dirty = false;

// Cache do conteúdo de src/ por projeto. A varredura continua barata (só
// readdir + stat) e o conteúdo só é relido quando mtime/tamanho mudam.
const sourceCache = new Map();

function ensureDirs() {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function load() {
  if (loaded) return;
  ensureDirs();
  try {
    if (!fs.existsSync(PROJECTS_FILE)) {
      loaded = true;
      return;
    }
    const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) {
      throw new Error('formato inválido (esperava { projects: [...] })');
    }
    db.projects = parsed.projects.filter((p) => p && typeof p.id === 'string');
    loaded = true;
    persistenceBlocked = false;
  } catch (error) {
    console.error('[storage] Não foi possível ler projects.json:', error.message);
    // Preserva o arquivo antes de qualquer gravação para não perder os dados
    // caso o JSON esteja corrompido. Sem o backup, uma escrita posterior
    // substituiria a lista por um array vazio.
    try {
      const backup = `${PROJECTS_FILE}.corrupt-${Date.now()}`;
      fs.copyFileSync(PROJECTS_FILE, backup);
      console.error(`[storage] Cópia de segurança criada em ${backup}`);
      loaded = true;
      persistenceBlocked = false;
    } catch (backupError) {
      console.error(
        '[storage] Não foi possível criar a cópia de segurança; gravações ficam bloqueadas:',
        backupError.message,
      );
      loaded = false;
      persistenceBlocked = true;
    }
  }
}

async function writeSnapshot(snapshot) {
  ensureDirs();
  const tmp = `${PROJECTS_FILE}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, snapshot, 'utf8');
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.promises.rename(tmp, PROJECTS_FILE);
      return;
    } catch (error) {
      lastError = error;
      // OneDrive/antivírus podem bloquear o rename por alguns instantes.
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  // Último recurso: grava direto no arquivo final (sem rename atômico).
  try {
    await fs.promises.writeFile(PROJECTS_FILE, snapshot, 'utf8');
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    return;
  } catch {
    throw lastError;
  }
}

const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * Renomeia com novas tentativas curtas: OneDrive e antivírus no Windows podem
 * segurar a pasta recém-criada por alguns instantes (EPERM/EBUSY/EACCES).
 */
export async function renameWithRetry(
  from,
  to,
  { attempts = 6, baseDelayMs = 120, rename = fs.promises.rename } = {},
) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!RENAME_RETRY_CODES.has(error.code)) throw error;
      if (baseDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (persistenceBlocked) {
    dirty = false;
    console.error('[storage] Gravação ignorada: projects.json não pôde ser lido com segurança.');
    return saveChain;
  }
  if (!dirty) return saveChain;
  dirty = false;
  const snapshot = JSON.stringify({ version: 1, projects: db.projects }, null, 2);
  saveChain = saveChain
    .catch(() => {})
    .then(() => writeSnapshot(snapshot))
    .catch((error) => {
      dirty = true;
      console.error('[storage] Falha ao salvar projetos:', error.message);
    });
  return saveChain;
}

function persist({ immediate = false } = {}) {
  load();
  dirty = true;
  if (immediate || PERSIST_DELAY_MS === 0) return persistNow();
  if (!persistTimer) {
    // Agrupa vários setStage/updateProject seguidos em uma única gravação.
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, PERSIST_DELAY_MS);
  }
  return saveChain;
}

export function flushPersistence() {
  load();
  return persistNow();
}

function now() {
  return new Date().toISOString();
}

function trimMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_MESSAGES);
}

const MAX_PROJECT_NAME = 52;

function cutAtWord(value, limit) {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  const base = space >= Math.floor(limit / 2) ? cut.slice(0, space) : cut;
  return base.replace(/[\s,;:.!?\-–—]+$/u, '').trim() || cut.trim();
}

export function deriveProjectName(prompt) {
  const clean = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'Novo app';
  const first = clean.split(/[.!?\n]/)[0].trim();
  const name = cutAtWord(first || clean, MAX_PROJECT_NAME);
  return name.length < 3 ? 'Novo app' : name.charAt(0).toUpperCase() + name.slice(1);
}

export function listProjects() {
  load();
  return db.projects
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getProject(id) {
  load();
  return db.projects.find((project) => project.id === id) || null;
}

export function createProject({ prompt, name }) {
  load();
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Descreva o app que você quer criar.');
  const project = {
    id: crypto.randomUUID(),
    name: name || deriveProjectName(text),
    description: '',
    prompt: text,
    status: 'generating',
    stage: 'Preparando o projeto',
    error: null,
    buildLog: '',
    provider: null,
    model: null,
    previewVersion: 0,
    createdAt: now(),
    updatedAt: now(),
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'user',
        kind: 'chat',
        content: text,
        createdAt: now(),
      },
    ],
  };
  db.projects.unshift(project);
  if (db.projects.length > MAX_PROJECTS) {
    const removed = db.projects.splice(MAX_PROJECTS);
    for (const old of removed) {
      removeProjectDir(old.id).catch(() => {});
    }
  }
  persist({ immediate: true });
  return project;
}

export function updateProject(id, patch) {
  load();
  const project = getProject(id);
  if (!project) return null;
  Object.assign(project, patch, { updatedAt: now() });
  if (Array.isArray(project.messages)) project.messages = trimMessages(project.messages);
  persist();
  return project;
}

export function addMessage(id, message) {
  load();
  const project = getProject(id);
  if (!project) return null;
  project.messages = trimMessages([
    ...(project.messages || []),
    {
      id: crypto.randomUUID(),
      createdAt: now(),
      ...message,
    },
  ]);
  project.updatedAt = now();
  persist({ immediate: true });
  return project;
}

export function deleteProject(id) {
  load();
  const index = db.projects.findIndex((project) => project.id === id);
  if (index === -1) return false;
  db.projects.splice(index, 1);
  invalidateSourceCache(id);
  persist({ immediate: true });
  removeProjectDir(id).catch(() => {});
  return true;
}

async function removeProjectDir(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return;
  invalidateSourceCache(id);
  await fs.promises.rm(path.join(PROJECTS_DIR, id), { recursive: true, force: true });
}

export function appDir(id) {
  return path.join(PROJECTS_DIR, id, 'app');
}

export function distDir(id) {
  return path.join(appDir(id), 'dist');
}

export function versionsDir(id) {
  return path.join(PROJECTS_DIR, id, 'versions');
}

function versionNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1_000_000) return null;
  return number;
}

function readVersionMeta(dir) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    const version = versionNumber(meta?.version);
    if (!version) return null;
    return {
      version,
      label: typeof meta.label === 'string' ? meta.label : '',
      kind: typeof meta.kind === 'string' ? meta.kind : 'build',
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : '',
      hash: typeof meta.hash === 'string' ? meta.hash : '',
      fileCount: Number(meta.fileCount) || 0,
      messageId: typeof meta.messageId === 'string' ? meta.messageId : null,
    };
  } catch {
    return null;
  }
}

function readVersionFiles(dir) {
  const src = path.join(dir, 'src');
  const byPath = new Map();
  for (const entry of scanSourceEntries(src)) byPath.set(entry.path, entry.absolute);
  return sortSourceFiles([...byPath.keys()].map((relative) => `src/${relative}`)).map(
    (relative) => ({
      path: relative,
      content: fs.readFileSync(byPath.get(relative.replace(/^src\//, '')), 'utf8'),
    }),
  );
}

export function listVersions(id) {
  const root = versionsDir(id);
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const versions = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const meta = readVersionMeta(path.join(root, entry.name));
    if (meta) versions.push(meta);
  }
  return versions.sort((a, b) => b.version - a.version);
}

export function getVersion(id, value) {
  const number = versionNumber(value);
  if (!number) return null;
  const dir = path.join(versionsDir(id), String(number));
  const meta = readVersionMeta(dir);
  if (!meta || !fs.existsSync(path.join(dir, 'src'))) return null;
  return { ...meta, files: readVersionFiles(dir) };
}

function sourceHash(files) {
  const hash = crypto.createHash('sha1');
  for (const file of files) {
    hash.update(String(file.path));
    hash.update('\0');
    hash.update(String(file.content));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function snapshotVersion(
  id,
  { label = '', kind = 'build', messageId = null, protect = [] } = {},
) {
  const project = getProject(id);
  if (!project) return null;
  const src = path.join(appDir(id), 'src');
  if (!fs.existsSync(src)) return null;
  const files = readSourceFiles(id);
  if (!files.length) return null;

  const hash = sourceHash(files);
  const currentNumber = versionNumber(project.currentVersion);
  const currentMeta = currentNumber
    ? readVersionMeta(path.join(versionsDir(id), String(currentNumber)))
    : null;
  // Recompilar sem mudar o código não deve criar uma versão nova.
  if (currentMeta && currentMeta.hash === hash) return currentMeta;

  const root = versionsDir(id);
  const existing = listVersions(id);
  const next = existing.length ? Math.max(...existing.map((version) => version.version)) + 1 : 1;
  const staging = path.join(root, `.tmp-${process.pid}-${Date.now()}`);
  const target = path.join(root, String(next));
  const meta = {
    version: next,
    label,
    kind,
    createdAt: now(),
    hash,
    fileCount: files.length,
    messageId,
  };

  await fs.promises.mkdir(root, { recursive: true });
  try {
    await fs.promises.mkdir(staging, { recursive: true });
    await fs.promises.cp(src, path.join(staging, 'src'), { recursive: true });
    await fs.promises.writeFile(
      path.join(staging, 'meta.json'),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
    await fs.promises.rename(staging, target);
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
  }

  updateProject(id, { currentVersion: next });

  // Mantém as versões mais recentes e nunca apaga a versão atual nem as que a
  // operação em andamento precisa preservar (ex.: o alvo de uma restauração).
  const keep = new Set([next]);
  if (currentNumber) keep.add(currentNumber);
  for (const value of Array.isArray(protect) ? protect : [protect]) {
    const number = versionNumber(value);
    if (number) keep.add(number);
  }
  for (const old of listVersions(id).slice(MAX_VERSIONS)) {
    if (keep.has(old.version)) continue;
    await fs.promises
      .rm(path.join(root, String(old.version)), { recursive: true, force: true })
      .catch(() => {});
  }
  return meta;
}

export async function restoreVersion(id, value) {
  const project = getProject(id);
  if (!project) throw new Error('Projeto não encontrado.');
  const number = versionNumber(value);
  if (!number) throw new Error('Versão inválida.');
  const dir = path.join(versionsDir(id), String(number));
  const meta = readVersionMeta(dir);
  const source = path.join(dir, 'src');
  if (!meta || !fs.existsSync(source)) throw new Error(`A versão ${number} não existe.`);

  const app = ensureProjectWorkspace(id);
  const target = path.join(app, 'src');
  const staging = path.join(app, `.src-restore-${process.pid}-${Date.now()}`);
  const previous = path.join(app, `.src-before-restore-${process.pid}-${Date.now()}`);

  // Copia a versão escolhida antes de qualquer poda: o snapshot do estado
  // atual pode remover versões antigas quando o limite é atingido.
  await fs.promises.cp(source, staging, { recursive: true });

  try {
    // Guarda o estado atual antes de sobrescrever, para que a restauração
    // também possa ser desfeita.
    await snapshotVersion(id, {
      label: `Antes de restaurar a versão ${number}`,
      kind: 'pre-restore',
      protect: [number],
    });

    invalidateSourceCache(id);

    let movedPrevious = false;
    if (fs.existsSync(target)) {
      await renameWithRetry(target, previous);
      movedPrevious = true;
    }
    try {
      await renameWithRetry(staging, target);
    } catch (error) {
      if (movedPrevious) await renameWithRetry(previous, target).catch(() => {});
      throw error;
    }
    if (movedPrevious) {
      await fs.promises.rm(previous, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
    invalidateSourceCache(id);
  }

  updateProject(id, { currentVersion: number });
  return meta;
}

function copyTemplate(target) {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    throw new Error('Template base não encontrado em templates/base.');
  }
  fs.mkdirSync(target, { recursive: true });
  const entries = fs.readdirSync(TEMPLATE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', '.vite'].includes(entry.name)) continue;
    const source = path.join(TEMPLATE_DIR, entry.name);
    const destination = path.join(target, entry.name);
    fs.cpSync(source, destination, { recursive: true });
  }
}

export function ensureProjectWorkspace(id) {
  const dir = appDir(id);
  const packageFile = path.join(dir, 'package.json');
  if (!fs.existsSync(packageFile)) {
    copyTemplate(dir);
  }
  return dir;
}

export function syncProjectTemplate(id) {
  const dir = ensureProjectWorkspace(id);
  for (const relative of ['package.json', 'vite.config.ts', 'tsconfig.json', 'index.html']) {
    const source = path.join(TEMPLATE_DIR, relative);
    const destination = path.join(dir, relative);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, destination);
    }
  }
  return dir;
}

export function templateMainSource() {
  return fs.readFileSync(path.join(TEMPLATE_DIR, 'src', 'main.tsx'), 'utf8');
}

export function templateCssSource() {
  try {
    return fs.readFileSync(path.join(TEMPLATE_DIR, 'src', 'index.css'), 'utf8');
  } catch {
    return '';
  }
}

function safeSourcePath(relativePath) {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
  if (!normalized.startsWith('src/')) throw new Error(`Caminho fora de src/: ${relativePath}`);
  if (normalized.includes('..') || path.posix.isAbsolute(normalized)) {
    throw new Error(`Caminho inválido: ${relativePath}`);
  }
  return normalized;
}

export async function writeGeneratedFiles(id, files) {
  const dir = ensureProjectWorkspace(id);
  const src = path.join(dir, 'src');
  const staging = path.join(dir, `.src-next-${process.pid}-${Date.now()}`);
  invalidateSourceCache(id);

  const hasCss = files.some((file) => file.path === 'src/index.css');
  const finalFiles = hasCss
    ? files
    : [...files, { path: 'src/index.css', content: templateCssSource() }];

  // Valida todos os caminhos antes de tocar no src/ atual. A gravação acontece
  // em uma pasta temporária e só substitui src/ se tudo der certo.
  const planned = [];
  const root = path.resolve(src);
  for (const file of finalFiles) {
    const relative = safeSourcePath(file.path);
    if (relative === 'src/main.tsx') continue;
    const resolved = path.resolve(dir, relative);
    if (!resolved.startsWith(root + path.sep)) {
      throw new Error(`Caminho fora do projeto: ${file.path}`);
    }
    planned.push({ file, resolved });
  }

  try {
    await fs.promises.mkdir(staging, { recursive: true });
    await fs.promises.writeFile(path.join(staging, 'main.tsx'), templateMainSource(), 'utf8');
    for (const { file, resolved } of planned) {
      const target = path.join(staging, path.relative(src, resolved));
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (file.encoding === 'base64') {
        await fs.promises.writeFile(target, Buffer.from(String(file.content ?? ''), 'base64'));
      } else {
        await fs.promises.writeFile(target, String(file.content ?? ''), 'utf8');
      }
    }
    const previous = path.join(dir, `.src-old-${process.pid}-${Date.now()}`);
    let movedPrevious = false;
    if (fs.existsSync(src)) {
      await renameWithRetry(src, previous);
      movedPrevious = true;
    }
    try {
      await renameWithRetry(staging, src);
    } catch (error) {
      if (movedPrevious) await renameWithRetry(previous, src).catch(() => {});
      throw error;
    }
    if (movedPrevious) {
      await fs.promises.rm(previous, { recursive: true, force: true }).catch(() => {});
    }
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
    invalidateSourceCache(id);
  }
}

function scanSourceEntries(dir) {
  const entries = [];
  const visit = (current) => {
    let children;
    try {
      children = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of children) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (/\.(tsx?|css|json)$/.test(entry.name)) {
        try {
          const stat = fs.statSync(absolute);
          entries.push({
            path: path.relative(dir, absolute).replace(/\\/g, '/'),
            absolute,
            mtimeMs: stat.mtimeMs,
            size: stat.size,
          });
        } catch {
          // arquivo removido durante a varredura
        }
      }
    }
  };
  visit(dir);
  return entries;
}

function sourceSnapshot(id) {
  const dir = path.join(appDir(id), 'src');
  const cached = sourceCache.get(id);
  const now = Date.now();
  if (
    cached &&
    cached.dir === dir &&
    now - cached.checkedAt < SOURCE_SCAN_TTL_MS
  ) {
    return cached;
  }
  const entries = scanSourceEntries(dir);
  const snapshot = {
    dir,
    entries,
    checkedAt: now,
    contents: cached?.contents || new Map(),
    paths: sortSourceFiles(entries.map((entry) => `src/${entry.path}`)),
  };
  sourceCache.set(id, snapshot);
  return snapshot;
}

export function invalidateSourceCache(id) {
  sourceCache.delete(id);
}

function sortSourceFiles(paths) {
  const priority = (file) =>
    file === 'src/App.tsx'
      ? 0
      : file === 'src/index.css'
        ? 1
        : file.includes('/components/')
          ? 3
          : 2;
  return paths.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
}

export function listSourceFiles(id) {
  return [...sourceSnapshot(id).paths];
}

// Contagem para os cards/listas: reaproveita a última varredura mesmo depois
// do TTL. Toda escrita da aplicação invalida o cache e qualquer leitura de
// arquivos atualiza os caminhos, então o número se corrige sozinho.
function sourceCount(id) {
  const cached = sourceCache.get(id);
  if (cached) return cached.paths.length;
  return listSourceFiles(id).length;
}

export function readSourceFiles(id) {
  const snapshot = sourceSnapshot(id);
  const byPath = new Map(snapshot.entries.map((entry) => [entry.path, entry]));
  return snapshot.paths
    .map((relative) => {
      const inner = relative.replace(/^src\//, '');
      const entry = byPath.get(inner);
      if (!entry) return null;
      const cached = snapshot.contents.get(inner);
      if (cached && cached.mtimeMs === entry.mtimeMs && cached.size === entry.size) {
        return { path: relative, content: cached.content };
      }
      const content = fs.readFileSync(entry.absolute, 'utf8');
      snapshot.contents.set(inner, {
        mtimeMs: entry.mtimeMs,
        size: entry.size,
        content,
      });
      return { path: relative, content };
    })
    .filter(Boolean);
}

export function projectSummary(project, previewBase) {
  return {
    id: project.id,
    name: project.name,
    description: project.description || '',
    prompt: project.prompt,
    status: project.status,
    stage: project.stage || '',
    error: project.error || null,
    errorKind: project.errorKind || null,
    provider: project.provider || null,
    model: project.model || null,
    previewVersion: project.previewVersion || 0,
    currentVersion: project.currentVersion || 0,
    previewUrl: previewBase ? `${previewBase}/preview/${project.id}/` : null,
    validation: project.validation || null,
    knowledge: project.knowledge || null,
    reference: project.reference
      ? {
          kind: project.reference.kind || 'site',
          url: project.reference.url || '',
          title: project.reference.title || '',
        }
      : null,
    fileCount: sourceCount(project.id),
    messageCount: Array.isArray(project.messages) ? project.messages.length : 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function projectDetail(project, previewBase, { includeFiles = true } = {}) {
  const detail = {
    ...projectSummary(project, previewBase),
    buildLog: project.buildLog || '',
    messages: project.messages || [],
  };
  if (includeFiles) detail.files = readSourceFiles(project.id);
  return detail;
}
