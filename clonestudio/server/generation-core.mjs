import path from 'node:path';

export const ALLOWED_PACKAGES = [
  'react',
  'react-dom',
  'lucide-react',
  'framer-motion',
  'recharts',
  'clsx',
];

const ALLOWED_EXTENSIONS = new Set(['.tsx', '.ts', '.css', '.json']);
const MAX_FILES = 30;
const MAX_FILE_BYTES = 220_000;
const MAX_TOTAL_BYTES = 700_000;

export function sanitizeJsonText(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        output += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        output += char;
        escaped = true;
        continue;
      }
      if (char === '"') {
        output += char;
        inString = false;
        continue;
      }
      if (char === '\n') {
        output += '\\n';
        continue;
      }
      if (char === '\r') {
        output += '\\r';
        continue;
      }
      if (char === '\t') {
        output += '\\t';
        continue;
      }
      const code = char.charCodeAt(0);
      if (code < 0x20) {
        output += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      output += char;
      continue;
    }
    if (char === '"') inString = true;
    output += char;
  }
  return output;
}

function balancedEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function tryParse(candidate) {
  const sanitized = sanitizeJsonText(candidate);
  try {
    return JSON.parse(sanitized);
  } catch {
    try {
      return JSON.parse(sanitized.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

export function extractJsonObject(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('O modelo retornou uma resposta vazia.');
  }
  const text = raw.replace(/^\uFEFF/, '').trim();
  const starts = [];
  for (let index = 0; index < text.length && starts.length < 6; index += 1) {
    if (text[index] === '{') starts.push(index);
  }
  for (const start of starts) {
    const end = balancedEnd(text, start);
    if (end === -1) continue;
    const parsed = tryParse(text.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  const lastOpen = text.lastIndexOf('{');
  const lastClose = text.lastIndexOf('}');
  if (lastOpen !== -1 && lastClose > lastOpen) {
    const parsed = tryParse(text.slice(lastOpen, lastClose + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  throw new Error('O modelo não retornou um objeto JSON válido.');
}

function contentValue(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.content === 'string') return entry.content;
  if (entry && typeof entry.code === 'string') return entry.code;
  return null;
}

export function normalizeFiles(payload) {
  const raw = payload?.files ?? payload?.arquivos;
  let entries = [];
  if (Array.isArray(raw)) {
    entries = raw;
  } else if (raw && typeof raw === 'object') {
    entries = Object.entries(raw).map(([filePath, content]) => ({
      path: filePath,
      content,
    }));
  } else {
    throw new Error('A resposta não contém a lista "files".');
  }

  if (entries.length === 0) {
    throw new Error('O modelo não gerou nenhum arquivo.');
  }
  if (entries.length > MAX_FILES) {
    throw new Error(`O modelo tentou gerar ${entries.length} arquivos (máximo ${MAX_FILES}).`);
  }

  const byPath = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const rawPath = entry.path ?? entry.file ?? entry.name ?? entry.filename;
    const content = contentValue(entry);
    if (typeof rawPath !== 'string' || content === null) continue;
    const normalized = rawPath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');
    if (!normalized) continue;
    byPath.set(normalized, content);
  }

  const files = [...byPath.entries()].map(([filePath, content]) => ({
    path: filePath,
    content,
  }));

  if (files.length === 0) {
    throw new Error('A resposta não contém arquivos com "path" e "content".');
  }

  const seen = new Set();
  for (const file of files) {
    const normalized = path.posix.normalize(file.path);
    if (normalized !== file.path) {
      throw new Error(`Caminho de arquivo não normalizado: ${file.path}`);
    }
    if (seen.has(normalized)) throw new Error(`Arquivo duplicado: ${file.path}`);
    seen.add(normalized);

    if (!normalized.startsWith('src/')) {
      throw new Error(`O arquivo "${file.path}" está fora de src/.`);
    }
    if (normalized.includes('..')) {
      throw new Error(`Caminho inválido: ${file.path}`);
    }
    if (normalized === 'src/main.tsx') {
      throw new Error('src/main.tsx é fixo do template e não deve ser gerado pelo modelo.');
    }
    const extension = path.posix.extname(normalized).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error(
        `Extensão não permitida em "${file.path}". Use apenas .tsx, .ts, .css ou .json.`,
      );
    }
    if (file.content.includes('\u0000')) {
      throw new Error(`O arquivo "${file.path}" contém caracteres inválidos.`);
    }
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(`O arquivo "${file.path}" é grande demais (${Math.round(bytes / 1024)} KB).`);
    }
  }

  const totalBytes = files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error('O conjunto de arquivos é grande demais. Peça uma implementação mais enxuta.');
  }

  if (!files.some((file) => file.path === 'src/App.tsx')) {
    throw new Error('A resposta precisa incluir src/App.tsx.');
  }

  return files;
}

const IMPORT_FROM_RE = /import\s+(?:type\s+)?[\w*{}\s,$]*?\sfrom\s*['"]([^'"]+)['"]/g;
const IMPORT_SIDE_EFFECT_RE = /import\s*['"]([^'"]+)['"]/g;
const EXPORT_FROM_RE = /export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CSS_IMPORT_RE = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g;

function importSpecifiers(source) {
  const specifiers = [];
  for (const regex of [IMPORT_FROM_RE, IMPORT_SIDE_EFFECT_RE, EXPORT_FROM_RE, DYNAMIC_IMPORT_RE]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(source))) specifiers.push(match[1]);
  }
  return specifiers;
}

function cssImportSpecifiers(source) {
  const specifiers = [];
  CSS_IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = CSS_IMPORT_RE.exec(source))) {
    if (!/^(?:https?:)?\/\//.test(match[1])) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveRelative(fromFile, specifier, available) {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromFile), specifier),
  );
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.css`,
    `${base}.json`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
    `${base}/index.css`,
  ];
  return candidates.find((candidate) => available.has(candidate)) || null;
}

export function validateFiles(files, options = {}) {
  const existing = options.existingPaths || [];
  const available = new Set([
    ...existing,
    'src/main.tsx',
    ...files.map((file) => file.path),
  ]);
  const errors = [];

  for (const file of files) {
    const isCss = file.path.endsWith('.css');
    const specifiers = isCss ? cssImportSpecifiers(file.content) : importSpecifiers(file.content);
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        if (!resolveRelative(file.path, specifier, available)) {
          errors.push(`${file.path}: import relativo não encontrado "${specifier}"`);
        }
        continue;
      }
      if (specifier.startsWith('/')) {
        errors.push(`${file.path}: imports absolutos não são permitidos ("${specifier}")`);
        continue;
      }
      const root = specifier.split('/')[0];
      if (!ALLOWED_PACKAGES.includes(root)) {
        errors.push(
          `${file.path}: pacote "${specifier}" não permitido. Use: ${ALLOWED_PACKAGES.join(', ')}.`,
        );
      }
    }
  }

  return errors;
}

export function parseGenerationResponse(raw, options = {}) {
  const payload = extractJsonObject(raw);
  const files = normalizeFiles(payload);
  const importErrors = validateFiles(files, options);
  if (importErrors.length > 0) {
    const error = new Error(
      `O código gerado tem imports inválidos:\n${importErrors.slice(0, 12).join('\n')}`,
    );
    error.validationErrors = importErrors;
    throw error;
  }
  const name =
    typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim().slice(0, 60)
      : null;
  const description =
    typeof payload.description === 'string' ? payload.description.trim().slice(0, 240) : '';
  const message =
    typeof payload.message === 'string' ? payload.message.trim().slice(0, 4000) : '';
  return { name, description, message, files };
}

export function buildFileDump(files, maxChars = 70000) {
  const chunks = [];
  let total = 0;
  for (const file of files) {
    // main.tsx é fixo do template: não precisa ocupar contexto do modelo nem
    // aparecer como se fosse um arquivo editável.
    if (file.path === 'src/main.tsx' || file.path === 'main.tsx') continue;
    const block = `### ${file.path}\n\`\`\`${file.path.endsWith('.css') ? 'css' : 'tsx'}\n${file.content}\n\`\`\``;
    if (total + block.length > maxChars) {
      chunks.push('(Arquivos restantes omitidos por limite de contexto.)');
      break;
    }
    chunks.push(block);
    total += block.length;
  }
  return chunks.join('\n\n');
}
