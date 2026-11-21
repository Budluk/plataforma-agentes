import zlib from 'node:zlib';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  addMessage,
  createProject,
  ensureProjectWorkspace,
  getProject,
  readSourceFiles,
  updateProject,
  writeGeneratedFiles,
} from './storage.mjs';
import { requestGeneration, buildProject } from './generator.mjs';
import { renderSiteReference } from './site-renderer.mjs';
import { extractVideosFromHtml } from './video-core.mjs';
import { analyzeProjectEntries, inspectableEntry } from './project-inspector.mjs';
import {
  assertPublicHttpUrl,
  assertPublicHttpUrlResolved,
  readLimited,
  safeFetch,
} from './net-safety.mjs';

export { assertPublicHttpUrl } from './net-safety.mjs';

function envNumber(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const MAX_DOWNLOAD_BYTES = envNumber('IMPORT_MAX_BYTES', 20_000_000, { min: 1024 });
const MAX_SOURCE_BYTES = envNumber('IMPORT_MAX_SOURCE_BYTES', 1_500_000, { min: 1024 });
const SITE_TIMEOUT_MS = envNumber('IMPORT_SITE_TIMEOUT_MS', 25000, { min: 1000 });
const SITE_RETRY_DELAY_MS = envNumber('IMPORT_SITE_RETRY_DELAY_MS', 2000, { min: 0, max: 10000 });
const SITE_RETRY_FAST_FAILURE_MS = 12000;
const MAX_SITE_CHARS = 12000;

const importJobs = new Set();
const inspectionCache = new Map();
const INSPECTION_TTL_MS = envNumber('IMPORT_INSPECTION_TTL_MS', 15 * 60 * 1000, { min: 1000 });
const MAX_INSPECTION_ENTRIES = envNumber('IMPORT_INSPECTION_MAX_ENTRIES', 6000, { min: 10 });
const MAX_INSPECTION_CACHE = envNumber('IMPORT_INSPECTION_CACHE', 8, { min: 1, max: 1000 });

const siteReferenceCache = new Map();
const siteReferenceInflight = new Map();
const SITE_REFERENCE_TTL_MS = envNumber('IMPORT_SITE_REFERENCE_TTL_MS', 10 * 60 * 1000, { min: 1000 });
const MAX_SITE_REFERENCE_CACHE = envNumber('IMPORT_SITE_REFERENCE_CACHE', 20, { min: 1, max: 1000 });

/* ---------- URL safety ---------- */
// A validação de URL/rede (incluindo resolução de DNS) fica em net-safety.mjs.

/* ---------- HTML extraction ---------- */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const value =
        code[1]?.toLowerCase() === 'x'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      const valid =
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 0x10ffff &&
        !(value >= 0xd800 && value <= 0xdfff);
      return valid ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<template[\s\S]*?<\/template>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function metaContent(html, keys) {
  for (const key of keys) {
    const pattern = new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      'i',
    );
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
    const reversed = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`,
      'i',
    );
    const match2 = html.match(reversed);
    if (match2) return decodeEntities(match2[1]).trim();
  }
  return '';
}

function topValues(values, limit) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

export function resolveUrl(value, base) {
  const raw = String(value || '').trim();
  if (!raw || /^data:|^blob:|^javascript:/i.test(raw)) return '';
  try {
    return new URL(raw, base).href;
  } catch {
    return '';
  }
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

export function extractImagesFromHtml(html, baseUrl, limit = 30) {
  const source = String(html || '');
  const images = [];
  const push = (src, alt = '') => {
    const absolute = resolveUrl(src, baseUrl);
    if (!absolute || /\.svg(\?|#|$)/i.test(absolute)) return;
    if (images.some((image) => image.src === absolute)) return;
    images.push({ src: absolute, alt: String(alt || '').slice(0, 120) });
  };
  const ogImage = metaContent(source, ['og:image', 'twitter:image']);
  if (ogImage) push(ogImage, '');
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const srcset = attribute(tag, 'srcset')
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean)
      .pop();
    const src =
      attribute(tag, 'src') ||
      attribute(tag, 'data-src') ||
      attribute(tag, 'data-lazy-src') ||
      srcset;
    push(src, attribute(tag, 'alt'));
    if (images.length >= limit) break;
  }
  for (const match of source.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
    const value = match[1];
    if (!/\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(value)) continue;
    push(value, '');
    if (images.length >= limit) break;
  }
  return images.slice(0, limit);
}

export function extractLinksFromHtml(html, baseUrl, limit = 30) {
  const source = String(html || '');
  const links = [];
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = resolveUrl(attribute(match[1], 'href'), baseUrl);
    const label = stripTags(match[2]).slice(0, 60);
    if (!href || !label) continue;
    if (links.some((link) => link.href === href)) continue;
    links.push({ label, href });
    if (links.length >= limit) break;
  }
  return links;
}

export function extractPage(html, url) {
  const source = String(html || '');
  const title =
    metaContent(source, ['og:title', 'twitter:title']) ||
    decodeEntities((source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  const description = metaContent(source, [
    'og:description',
    'twitter:description',
    'description',
  ]);
  const headings = [...source.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => stripTags(match[2]))
    .filter((text) => text && text.length <= 180)
    .slice(0, 24);
  const colors = topValues(
    [...source.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase()),
    6,
  );
  const fonts = topValues(
    [...source.matchAll(/font-family\s*:\s*([^;"'}]+)/gi)].map((match) =>
      match[1].replace(/\s+/g, ' ').trim().slice(0, 60),
    ),
    4,
  );
  const text = stripTags(source).slice(0, MAX_SITE_CHARS);
  return {
    kind: 'site',
    url,
    title: title.slice(0, 160),
    description: description.slice(0, 400),
    headings,
    colors,
    fonts,
    textColors: [],
    images: extractImagesFromHtml(source, url),
    links: extractLinksFromHtml(source, url),
    videos: extractVideosFromHtml(source, url),
    text,
    rendered: false,
    fetchedAt: new Date().toISOString(),
  };
}

export function isTransientSiteStatus(status) {
  const code = Number(status || 0);
  return code === 408 || code === 425 || code === 429 || (code >= 500 && code <= 599);
}

/**
 * Decide se vale repetir a leitura. Só repete quando nada foi lido e a falha
 * parece temporária (HTTP 429/5xx ou erro rápido sem status, como uma falha
 * momentânea do navegador). Timeout não é repetido para não dobrar a espera.
 */
export function shouldRetrySiteFetch({
  rendered = null,
  staticReference = null,
  status = 0,
  timedOut = false,
  elapsedMs = 0,
} = {}) {
  if (rendered || staticReference) return false;
  if (isTransientSiteStatus(status)) return true;
  return !status && !timedOut && elapsedMs < SITE_RETRY_FAST_FAILURE_MS;
}

export function describeSiteFetchFailure({ status = 0, timedOut = false } = {}) {
  const seconds = Math.round(SITE_TIMEOUT_MS / 1000);
  const code = Number(status || 0);
  if (timedOut) {
    return `O site demorou mais de ${seconds}s para responder. Tente novamente em instantes.`;
  }
  if (code === 403) {
    return 'O site bloqueou a leitura automática (HTTP 403). Confira se a página abre no navegador.';
  }
  if (code === 404) {
    return 'A página não foi encontrada (HTTP 404). Confira o link e tente novamente.';
  }
  if (code === 429) {
    return 'O site limitou as tentativas de acesso (HTTP 429). Aguarde alguns segundos e tente novamente.';
  }
  if (isTransientSiteStatus(code)) {
    return `O site respondeu com um erro temporário (HTTP ${code}). Tente novamente em instantes.`;
  }
  return 'Não foi possível ler a página do site. Confira se o link abre no navegador e tente novamente.';
}

async function readSiteOnce(url, timeoutMs) {
  let failure = null;
  let staticStatus = 0;
  let timedOut = false;

  const rendered = await renderSiteReference(url.href, { timeoutMs }).catch((error) => {
    failure = error;
    console.warn(`[importer] Renderização falhou: ${error.message}`);
    return null;
  });

  let staticReference = null;
  const needsStatic =
    !rendered || !rendered.description || (rendered.images || []).length === 0;
  if (needsStatic) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await safeFetch(url.href, {
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CloneStudioBot/0.2',
        },
      });
      staticStatus = response.status;
      if (response.ok) {
        const type = response.headers.get('content-type') || '';
        if (/text\/html|application\/xhtml/i.test(type)) {
          const buffer = await readLimited(response, 3_000_000);
          staticReference = extractPage(buffer.toString('utf8'), url.href);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') timedOut = true;
      failure = failure || error;
      console.warn(`[importer] Leitura estática falhou: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return { rendered, staticReference, staticStatus, timedOut, failure };
}

export async function fetchSiteReference(rawUrl) {
  const url = await assertPublicHttpUrlResolved(rawUrl);
  const cacheKey = url.href;

  const cached = siteReferenceCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.reference;
  }

  // Deduplica requisicoes concorrentes para a mesma URL normalizada.
  const inflight = siteReferenceInflight.get(cacheKey);
  if (inflight) return inflight;

  const pending = loadSiteReference(url, cacheKey);
  siteReferenceInflight.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    siteReferenceInflight.delete(cacheKey);
  }
}

async function loadSiteReference(url, cacheKey) {
  const startedAt = Date.now();
  let attempt = await readSiteOnce(url, SITE_TIMEOUT_MS);

  if (
    shouldRetrySiteFetch({
      rendered: attempt.rendered,
      staticReference: attempt.staticReference,
      status: attempt.staticStatus,
      timedOut: attempt.timedOut,
      elapsedMs: Date.now() - startedAt,
    })
  ) {
    console.warn(
      `[importer] Nova tentativa de leitura (HTTP ${attempt.staticStatus || 'sem resposta'}${
        attempt.timedOut ? ', tempo esgotado' : ''
      }).`,
    );
    if (SITE_RETRY_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, SITE_RETRY_DELAY_MS));
    }
    attempt = await readSiteOnce(url, SITE_TIMEOUT_MS);
  }

  const { rendered, staticReference, staticStatus, timedOut, failure } = attempt;

  if (!rendered && !staticReference) {
    if (!timedOut && !staticStatus && failure && failure.name !== 'AbortError') {
      throw failure;
    }
    throw new Error(describeSiteFetchFailure({ status: staticStatus, timedOut }));
  }

  const base = rendered || staticReference;
  const fallback = staticReference || {};
  const pick = (key) => {
    const value = base[key];
    if (Array.isArray(value) ? value.length > 0 : value) return value;
    return fallback[key] || (Array.isArray(value) ? [] : '');
  };

  const reference = {
    kind: 'site',
    url: base.url || url.href,
    title: String(pick('title') || '').slice(0, 160),
    description: String(pick('description') || '').slice(0, 400),
    headings: (pick('headings') || []).slice(0, 30),
    colors: (pick('colors') || []).slice(0, 8),
    textColors: (pick('textColors') || []).slice(0, 6),
    fonts: (pick('fonts') || []).slice(0, 4),
    images: (pick('images') || []).slice(0, 30),
    links: (pick('links') || []).slice(0, 30),
    videos: (pick('videos') || []).slice(0, 24),
    text: String(pick('text') || '').slice(0, MAX_SITE_CHARS),
    rendered: Boolean(rendered),
    fetchedAt: new Date().toISOString(),
  };

  // Cache de referência de site para não refetchar a mesma URL em curto intervalo.
  if (siteReferenceCache.size >= MAX_SITE_REFERENCE_CACHE) {
    const oldest = siteReferenceCache.keys().next().value;
    if (oldest !== undefined) siteReferenceCache.delete(oldest);
  }
  siteReferenceCache.set(cacheKey, { reference, expiresAt: Date.now() + SITE_REFERENCE_TTL_MS });

  return reference;
}

export function shortSitePrompt(reference, userPrompt) {
  return (
    String(userPrompt || '').trim() ||
    `Recrie em React um app inspirado em ${reference.title || reference.url}.`
  ).slice(0, 6000);
}

/* ---------- GitHub ---------- */

export function parseGithubUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[a-z0-9_.-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(repo)) return null;
  let branch = '';
  if (parts[2] === 'tree' && parts[3]) branch = decodeURIComponent(parts.slice(3).join('/'));
  return { owner, repo, branch, url: `https://github.com/${owner}/${repo}` };
}

export async function downloadGithubZip(repo) {
  const candidates = [];
  if (repo.branch) candidates.push(repo.branch);
  candidates.push('HEAD', 'main', 'master');
  let lastError = null;
  for (const branch of [...new Set(candidates)]) {
    const url = `https://codeload.github.com/${repo.owner}/${repo.repo}/zip/${encodeURI(branch)}`;
    try {
      const response = await safeFetch(url, {
        headers: { accept: 'application/zip', 'user-agent': 'CloneStudioBot/0.2' },
      });
      if (!response.ok) {
        lastError = new Error(`GitHub respondeu HTTP ${response.status} para ${branch}.`);
        continue;
      }
      return await readLimited(response, MAX_DOWNLOAD_BYTES);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Não foi possível baixar o repositório do GitHub.');
}

/* ---------- ZIP ---------- */

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 66_000);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

export function unzipEntries(buffer, options = {}) {
  const maxEntries = options.maxEntries || 500;
  const maxBytes = options.maxBytes || MAX_DOWNLOAD_BYTES;
  const allow = options.allow || (() => true);
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error('Arquivo .zip inválido ou corrompido.');
  const total = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 não é suportado. Compacte em um .zip comum.');
  }
  let pointer = directoryOffset;
  const entries = [];
  let totalBytes = 0;
  for (let index = 0; index < total; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('Arquivo .zip inválido: diretório central corrompido.');
    }
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const uncompressedSize = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer
      .toString('utf8', pointer + 46, pointer + 46 + nameLength)
      .replace(/\\/g, '/');
    pointer += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith('/')) continue;
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('ZIP64 não é suportado. Compacte em um .zip comum.');
    }
    if (!allow(name)) continue;
    if (entries.length >= maxEntries) {
      throw new Error(`O .zip tem arquivos demais (limite ${maxEntries}).`);
    }
    // Valida os limites antes de qualquer leitura em localOffset: um valor
    // corrompido não pode fazer o parser ler fora do buffer.
    if (!Number.isSafeInteger(localOffset) || localOffset < 0 || localOffset + 30 > buffer.length) {
      throw new Error(`Arquivo .zip inválido: cabeçalho local de ${name} fora do arquivo.`);
    }
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('Arquivo .zip inválido: cabeçalho local corrompido.');
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart < 0 || dataStart + compressedSize > buffer.length) {
      throw new Error(`Arquivo .zip inválido: dados de ${name} fora do arquivo.`);
    }
    const remaining = maxBytes - totalBytes;
    if (remaining <= 0 || uncompressedSize > remaining) {
      throw new Error('O conteúdo descompactado é grande demais.');
    }
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) {
      if (compressedSize > remaining) throw new Error('O conteúdo descompactado é grande demais.');
      data = Buffer.from(compressed);
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, Math.min(remaining, uncompressedSize || remaining)),
        });
      } catch {
        throw new Error(`Não foi possível descomprimir ${name}.`);
      }
    } else {
      throw new Error(`Compressão não suportada em ${name} (método ${method}).`);
    }
    totalBytes += data.length;
    if (totalBytes > maxBytes) {
      throw new Error('O conteúdo descompactado é grande demais.');
    }
    entries.push({ name, data });
  }
  return entries;
}

/* ---------- project files ---------- */

export const SOURCE_FILE = /\.(tsx|ts|jsx|js|css|json)$/i;
export const ASSET_FILE =
  /\.(svg|png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|mov)$/i;
export const IGNORED_SOURCE = /(^|\/)(node_modules|dist|build|\.git|coverage|public|assets)\//i;
const IGNORED_ASSET = /(^|\/)(node_modules|dist|build|\.git|coverage)\//i;
const MAX_ASSET_BYTES = envNumber('IMPORT_MAX_ASSET_BYTES', 8_000_000, { min: 1024 });

export function stripRootFolder(entries) {
  if (entries.length === 0) return entries;
  const first = entries[0].name.split('/')[0];
  if (!first || !entries.every((entry) => entry.name.startsWith(`${first}/`))) return entries;
  return entries.map((entry) => ({ ...entry, name: entry.name.slice(first.length + 1) }));
}

export function prettifyName(value) {
  const cleaned = String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const shortened =
    cleaned.length > 52 ? `${cleaned.slice(0, 52).replace(/\s+\S*$/, '')}…` : cleaned;
  return shortened.replace(/^\w/, (char) => char.toUpperCase());
}

export function pickProjectFiles(entries) {
  const allEntries = stripRootFolder(
    entries.map((entry) => ({ ...entry, name: entry.name.replace(/\\/g, '/') })),
  );
  const textEntries = allEntries
    .filter((entry) => SOURCE_FILE.test(entry.name) && !IGNORED_SOURCE.test(entry.name))
    .filter((entry) => entry.data.length <= 500_000)
    .map((entry) => ({
      name: entry.name,
      content: entry.data.toString('utf8'),
    }));

  const underSrc = textEntries.some((entry) => entry.name.startsWith('src/'));
  const rootApp = textEntries.some((entry) => /^App\.(tsx|jsx|ts|js)$/i.test(entry.name));
  if (!underSrc && !rootApp) {
    throw new Error(
      'Não encontrei um app React/Vite no pacote (esperava src/App.tsx ou App.tsx). Projetos Next.js e Vue não são compatíveis.',
    );
  }

  // Projetos Vite normalmente usam src/, mas alguns têm App.tsx na raiz com
  // components/, pages/ e hooks/ ao lado. Inclui essas pastas em vez de
  // descartar os componentes.
  const rootSourceDir = /^(components|pages|hooks|lib|utils|styles|assets|context|store|services)\//i;
  const inScope = (name) =>
    underSrc ? name.startsWith('src/') : !name.includes('/') || rootSourceDir.test(name);
  const toRelative = (name) => (name.startsWith('src/') ? name : `src/${name}`);

  const picked = [];
  let total = 0;
  for (const entry of textEntries) {
    if (!inScope(entry.name)) continue;
    let relative = toRelative(entry.name);
    if (/^src\/main\.(tsx|jsx|ts|js)$/i.test(relative)) continue;
    relative = relative.replace(/\.jsx$/i, '.tsx').replace(/\.js$/i, '.tsx');
    if (!/^src\/.+\.(tsx|ts|css|json)$/i.test(relative)) continue;
    total += entry.content.length;
    if (total > MAX_SOURCE_BYTES) {
      throw new Error('O código do app é grande demais para importar (limite ~1,5 MB).');
    }
    picked.push({ path: relative, content: entry.content });
  }

  // Copia imagens, fontes, áudio e vídeo referenciados pelo app para o build
  // resolver imports como "./logo.svg" e "./assets/fundo.webp".
  let assetTotal = 0;
  for (const entry of allEntries) {
    if (!ASSET_FILE.test(entry.name) || IGNORED_ASSET.test(entry.name)) continue;
    if (!inScope(entry.name)) continue;
    assetTotal += entry.data.length;
    if (assetTotal > MAX_ASSET_BYTES) {
      throw new Error('As imagens/mídias do app são grandes demais para importar (limite ~8 MB).');
    }
    picked.push({
      path: toRelative(entry.name),
      content: entry.data.toString('base64'),
      encoding: 'base64',
    });
  }

  if (!picked.some((file) => /^src\/App\.(tsx|ts)$/i.test(file.path))) {
    throw new Error('O pacote não tem um componente src/App.tsx (ou App.jsx) para importar.');
  }
  const escaping = findEscapingImports(picked);
  if (escaping.length > 0) {
    throw new Error(
      `O app importa arquivos fora de src/ (${escaping
        .slice(0, 3)
        .join(', ')}). Isso não é permitido por segurança.`,
    );
  }
  return picked;
}

/**
 * Imports como "../../data/projects.json?raw" fariam o Vite embutir arquivos
 * fora do projeto no bundle. Só imports relativos que permanecem em src/ são
 * aceitos.
 */
export function findEscapingImports(files) {
  const offenders = [];
  const pattern = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const file of files) {
    if (file.encoding === 'base64' || !/\.(tsx|ts)$/i.test(file.path)) continue;
    for (const match of String(file.content || '').matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const clean = specifier.split(/[?#]/)[0];
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.path), clean),
      );
      if (resolved === '..' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
        offenders.push(`${file.path}: ${specifier}`);
      } else if (!resolved.startsWith('src/')) {
        // "../../server/helper" normaliza para "server/helper", que também está
        // fora de src/ mesmo sem começar com "..".
        offenders.push(`${file.path}: ${specifier}`);
      }
    }
  }
  return offenders;
}

/* ---------- inspection (analyze before creating) ---------- */

function readInspectionEntries(buffer) {
  return stripRootFolder(
    unzipEntries(buffer, {
      maxEntries: MAX_INSPECTION_ENTRIES,
      allow: (name) =>
        inspectableEntry(name) || (ASSET_FILE.test(name) && !IGNORED_ASSET.test(name)),
    }),
  );
}

async function fetchGithubMetadata(repo) {
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await safeFetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'CloneStudioBot/0.2',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      description: String(data.description || '').slice(0, 400),
      stars: Number(data.stargazers_count || 0),
      forks: Number(data.forks_count || 0),
      language: String(data.language || ''),
      topics: Array.isArray(data.topics) ? data.topics.slice(0, 12) : [],
      license: data.license?.spdx_id || data.license?.name || '',
      homepage: String(data.homepage || ''),
      defaultBranch: String(data.default_branch || ''),
      archived: Boolean(data.archived),
      updatedAt: data.updated_at || '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cacheInspection(entries, inspection) {
  const now = Date.now();
  for (const [token, item] of inspectionCache) {
    if (now - item.createdAt > INSPECTION_TTL_MS) inspectionCache.delete(token);
  }
  while (inspectionCache.size >= MAX_INSPECTION_CACHE) {
    const oldest = inspectionCache.keys().next().value;
    inspectionCache.delete(oldest);
  }
  const token = randomUUID();
  inspectionCache.set(token, { entries, inspection, createdAt: now });
  return { ...inspection, token };
}

function getCachedInspection(token) {
  const key = String(token || '').trim();
  const item = inspectionCache.get(key);
  if (!item) return null;
  if (Date.now() - item.createdAt > INSPECTION_TTL_MS) {
    inspectionCache.delete(key);
    return null;
  }
  return { ...item, token: key };
}

export async function inspectGithubSource(rawUrl) {
  const repo = parseGithubUrl(rawUrl);
  if (!repo) {
    throw new Error('Link do GitHub inválido. Use https://github.com/usuario/repositorio.');
  }
  const [buffer, metadata] = await Promise.all([
    downloadGithubZip(repo),
    fetchGithubMetadata(repo).catch(() => null),
  ]);
  const entries = readInspectionEntries(buffer);
  const inspection = analyzeProjectEntries(entries, {
    kind: 'github',
    url: repo.url,
    repo,
    metadata,
  });
  return cacheInspection(entries, inspection);
}

export function inspectZipSource(base64, filename = 'projeto.zip') {
  const raw = String(base64 || '').replace(/^data:[^,]+,/, '');
  if (!raw) throw new Error('O arquivo .zip está vazio.');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length === 0) throw new Error('O arquivo .zip está vazio.');
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error('O .zip é grande demais (limite 20 MB).');
  const entries = readInspectionEntries(buffer);
  const inspection = analyzeProjectEntries(entries, {
    kind: 'zip',
    filename,
  });
  return cacheInspection(entries, inspection);
}

export function importFromInspection(token) {
  const cached = getCachedInspection(token);
  if (!cached) {
    throw new Error('A análise expirou. Solte o link ou o .zip novamente para analisar.');
  }
  const { inspection, entries } = cached;
  if (!inspection.compatibility?.canCreate) {
    throw new Error(
      inspection.compatibility?.reason ||
        'Este projeto não é compatível com o template React + Vite.',
    );
  }
  const files = pickProjectFiles(entries);
  const isGithub = inspection.kind === 'github';
  const sourceLabel = isGithub
    ? `github:${inspection.repoName || inspection.url || 'repositório'}`
    : `zip:${inspection.filename || 'projeto.zip'}`;
  const project = prepareImportedProject({
    name: inspection.name || 'App importado',
    prompt: isGithub
      ? `App importado do repositório ${inspection.url}.`
      : `App importado do arquivo ${inspection.filename || 'projeto.zip'}.`,
    description: isGithub
      ? `Repositório importado: ${inspection.url}`
      : `Arquivo importado: ${inspection.filename || 'projeto.zip'}`,
    files,
    sourceLabel,
  });
  inspectionCache.delete(String(token || '').trim());
  return project;
}

/* ---------- import jobs ---------- */

export function isImporting(id) {
  return importJobs.has(id);
}

function startImportJob(id, files, sourceLabel) {
  const job = Promise.resolve()
    .then(() => new Promise((resolve) => setImmediate(resolve)))
    .then(async () => {
      await writeGeneratedFiles(id, files);
      if (!getProject(id)) return;
      updateProject(id, {
        status: 'building',
        stage: 'Compilando app importado',
        error: null,
        buildLog: '',
        files: files.map((file) => file.path),
        provider: 'import',
        model: sourceLabel,
      });
      try {
        await buildProject(id);
        if (!getProject(id)) return;
        addMessage(id, {
          role: 'assistant',
          kind: 'info',
          content: `App importado de ${sourceLabel} e compilado com sucesso.`,
        });
        updateProject(id, { stage: '' });
      } catch (error) {
        if (!getProject(id)) return;
        updateProject(id, {
          status: 'error',
          stage: '',
          error: String(error.message || 'O build do app importado falhou.').slice(0, 5000),
          errorKind: 'build',
          buildLog: String(error.message || '').slice(0, 16000),
        });
        addMessage(id, {
          role: 'assistant',
          kind: 'error',
          content: `O build do app importado falhou: ${String(error.message || '').slice(0, 2500)}`,
        });
      }
    })
    .catch((error) => {
      console.error(`[importer] projeto ${id}:`, error.message);
      if (!getProject(id)) return;
      updateProject(id, {
        status: 'error',
        stage: '',
        error: String(error.message || 'Falha ao importar o app.').slice(0, 5000),
        errorKind: 'generation',
      });
    })
    .finally(() => importJobs.delete(id));
  importJobs.add(id);
  return job;
}

function prepareImportedProject({ name, prompt, description, files, sourceLabel }) {
  const project = createProject({ prompt, name });
  ensureProjectWorkspace(project.id);
  updateProject(project.id, {
    description: description || `Importado de ${sourceLabel}`,
    status: 'building',
    stage: 'Preparando arquivos importados',
    provider: 'import',
    model: sourceLabel,
    files: files.map((file) => file.path),
  });
  startImportJob(project.id, files, sourceLabel);
  return getProject(project.id);
}

/* ---------- public imports ---------- */

export async function importSite(rawUrl, userPrompt = '') {
  const reference = await fetchSiteReference(rawUrl);
  const prompt = shortSitePrompt(reference, userPrompt);
  const project = createProject({
    prompt,
    name: reference.title ? prettifyName(reference.title) : undefined,
  });
  ensureProjectWorkspace(project.id);
  updateProject(project.id, {
    description: reference.description || `Inspirado em ${reference.url}`,
    reference: {
      kind: 'site',
      url: reference.url,
      title: reference.title,
      description: reference.description,
      headings: reference.headings,
      colors: reference.colors,
      textColors: reference.textColors,
      fonts: reference.fonts,
      images: reference.images,
      links: reference.links,
      videos: reference.videos,
      text: reference.text,
      rendered: reference.rendered,
    },
    stage: 'Na fila',
  });
  if (!requestGeneration(project.id, { fresh: true })) {
    throw new Error('Já existe uma geração em andamento para este projeto.');
  }
  return getProject(project.id);
}

export async function importFromGithub(rawUrl) {
  const repo = parseGithubUrl(rawUrl);
  if (!repo) throw new Error('Link do GitHub inválido. Use https://github.com/usuario/repositorio.');
  const buffer = await downloadGithubZip(repo);
  const entries = unzipEntries(buffer, {
    allow: (name) =>
      (SOURCE_FILE.test(name) && !IGNORED_SOURCE.test(name)) ||
      (ASSET_FILE.test(name) && !IGNORED_ASSET.test(name)),
  });
  const files = pickProjectFiles(entries);
  const label = `${repo.owner}/${repo.repo}`;
  return prepareImportedProject({
    name: prettifyName(repo.repo) || 'App importado',
    prompt: `App importado do repositório ${repo.url}.`,
    description: `Repositório importado: ${repo.url}`,
    files,
    sourceLabel: `github:${label}`,
  });
}

export function importFromZip(base64, filename = 'projeto.zip') {
  const raw = String(base64 || '').replace(/^data:[^,]+,/, '');
  if (!raw) throw new Error('O arquivo .zip está vazio.');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length === 0) throw new Error('O arquivo .zip está vazio.');
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error('O .zip é grande demais (limite 20 MB).');
  const entries = unzipEntries(buffer, {
    allow: (name) =>
      (SOURCE_FILE.test(name) && !IGNORED_SOURCE.test(name)) ||
      (ASSET_FILE.test(name) && !IGNORED_ASSET.test(name)),
  });
  const files = pickProjectFiles(entries);
  const name = prettifyName(String(filename).replace(/\.zip$/i, '')) || 'App importado';
  return prepareImportedProject({
    name,
    prompt: `App importado do arquivo ${filename}.`,
    description: `Arquivo importado: ${filename}`,
    files,
    sourceLabel: `zip:${filename}`,
  });
}

export function duplicateProject(sourceId) {
  const source = getProject(sourceId);
  if (!source) throw new Error('App de origem não encontrado.');
  const files = readSourceFiles(sourceId).map((file) => ({
    path: file.path,
    content: file.content,
  }));
  if (files.length === 0) throw new Error('O app de origem não tem arquivos para copiar.');
  return prepareImportedProject({
    name: prettifyName(`Cópia de ${source.name}`),
    prompt: source.prompt || `Cópia de ${source.name}.`,
    description: source.description || `Cópia de ${source.name}`,
    files,
    sourceLabel: `cópia:${source.name}`,
  });
}
