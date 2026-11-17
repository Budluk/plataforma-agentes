const DEFAULT_ENDPOINT = 'https://mcp.context7.com/mcp';
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_LIBRARIES = 2;
const DEFAULT_MAX_CHARS = 6000;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 60;

const cache = new Map();
let nextRequestId = 1;

function positiveInt(value, fallback, min = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min ? Math.floor(number) : fallback;
}

function envFlag(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !/^(0|off|false|no|disabled)$/i.test(String(raw).trim());
}

export function context7Config() {
  const endpoint = String(process.env.CONTEXT7_BASE_URL || DEFAULT_ENDPOINT).trim();
  return {
    enabled: envFlag('CONTEXT7_ENABLED', true),
    endpoint,
    apiKey: String(process.env.CONTEXT7_API_KEY || '').trim(),
    timeoutMs: positiveInt(process.env.CONTEXT7_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000),
    maxLibraries: positiveInt(
      process.env.CONTEXT7_MAX_LIBRARIES,
      DEFAULT_MAX_LIBRARIES,
      1,
    ),
    maxChars: positiveInt(process.env.CONTEXT7_MAX_CHARS, DEFAULT_MAX_CHARS, 1000),
    cacheTtlMs: positiveInt(process.env.CONTEXT7_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, 1000),
  };
}

export function clearContext7Cache() {
  cache.clear();
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value, ttlMs) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Extrai o payload JSON-RPC de uma resposta MCP. O transporte pode devolver
 * JSON puro ou Server-Sent Events (event: message / data: {...}).
 */
export function parseMcpResponse(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  const messages = [];
  let dataLines = [];
  const flush = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n').trim();
    dataLines = [];
    if (!data) return;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // ignora evento malformado e continua lendo os próximos
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    } else if (line.trim() === '') {
      flush();
    }
  }
  flush();

  if (messages.length === 0) return null;
  return (
    messages.find((message) => message && (message.result !== undefined || message.error)) ||
    messages[0]
  );
}

async function mcpRequest(method, params, options = {}) {
  const config = context7Config();
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || config.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const id = nextRequestId++;

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(config.apiKey ? { 'context7-api-key': config.apiKey } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });

    const raw = await response.text();
    if (!response.ok) {
      const detail = raw.replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Context7 respondeu HTTP ${response.status}${detail ? `: ${detail}` : ''}.`);
    }

    const payload = parseMcpResponse(raw);
    if (!payload) throw new Error('Context7 devolveu uma resposta vazia ou inválida.');
    if (payload.error) {
      throw new Error(`Context7: ${payload.error.message || 'erro JSON-RPC'}`);
    }
    return payload.result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Context7 não respondeu em ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function context7Status(options = {}) {
  const config = context7Config();
  if (!config.enabled) {
    return {
      provider: 'context7',
      enabled: false,
      status: 'disabled',
      endpoint: config.endpoint,
      checkedAt: new Date().toISOString(),
    };
  }

  const startedAt = Date.now();
  try {
    const result = await mcpRequest('tools/list', {}, options);
    const tools = Array.isArray(result?.tools)
      ? result.tools.map((tool) => tool.name).filter(Boolean)
      : [];
    return {
      provider: 'context7',
      enabled: true,
      status: 'ok',
      endpoint: config.endpoint,
      keyless: !config.apiKey,
      tools,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: 'context7',
      enabled: true,
      status: 'error',
      endpoint: config.endpoint,
      keyless: !config.apiKey,
      latencyMs: Date.now() - startedAt,
      error: String(error.message || error).slice(0, 500),
      checkedAt: new Date().toISOString(),
    };
  }
}

function textFromToolResult(result) {
  if (!result) return '';
  if (Array.isArray(result.content)) {
    return result.content
      .filter((part) => part && part.type === 'text')
      .map((part) => part.text || '')
      .join('\n\n')
      .trim();
  }
  if (typeof result.text === 'string') return result.text.trim();
  return '';
}

async function callTool(name, args, options = {}) {
  const result = await mcpRequest(
    'tools/call',
    { name, arguments: args },
    options,
  );
  const text = textFromToolResult(result);
  if (result?.isError) {
    throw new Error(`Context7 (${name}): ${text || 'falha ao executar a ferramenta'}`);
  }
  return text;
}

export function parseLibraryResults(text) {
  return String(text || '')
    .split(/-{5,}/)
    .map((block) => {
      const id = block.match(/Context7-compatible library ID:\s*(\S+)/i)?.[1];
      if (!id) return null;
      const title = block.match(/Title:\s*(.+)/i)?.[1]?.trim() || id;
      const description = block.match(/Description:\s*(.+)/i)?.[1]?.trim() || '';
      const snippets = Number(block.match(/Code Snippets:\s*(\d+)/i)?.[1] || 0);
      const reputation = block.match(/Source Reputation:\s*(\S+)/i)?.[1] || '';
      const benchmark = Number(block.match(/Benchmark Score:\s*([\d.]+)/i)?.[1] || 0);
      const versions = (block.match(/Versions:\s*(.+)/i)?.[1] || '')
        .split(',')
        .map((version) => version.trim())
        .filter(Boolean)
        .slice(0, 8);
      return { id, title, description, snippets, reputation, benchmark, versions };
    })
    .filter(Boolean)
    .slice(0, 8);
}

export async function resolveLibraryId(libraryName, query, options = {}) {
  const name = String(libraryName || '').trim();
  const topic = String(query || '').trim();
  if (!name) throw new Error('Informe o nome da biblioteca.');
  if (!topic) throw new Error('Informe o assunto a pesquisar.');

  const config = context7Config();
  const key = `resolve:${name.toLowerCase()}:${topic.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const text = await callTool(
    'resolve-library-id',
    { libraryName: name.slice(0, 120), query: topic.slice(0, 500) },
    options,
  );
  const results = parseLibraryResults(text);
  cacheSet(key, results, config.cacheTtlMs);
  return results;
}

export async function queryLibraryDocs(libraryId, query, options = {}) {
  const id = String(libraryId || '').trim();
  const topic = String(query || '').trim();
  if (!/^\/[^\s/]+\/[^\s/]+(?:\/[^\s/]+)?$/.test(id)) {
    throw new Error('libraryId inválido. Use o formato /org/projeto.');
  }
  if (!topic) throw new Error('Informe o assunto da documentação.');

  const config = context7Config();
  const language = String(options.language || 'TypeScript').slice(0, 40);
  const key = `docs:${id}:${language}:${topic.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const text = await callTool(
    'query-docs',
    {
      libraryId: id,
      query: topic.slice(0, 500),
      language,
    },
    options,
  );
  if (!text) throw new Error(`Context7 não devolveu documentação para ${id}.`);
  cacheSet(key, text, config.cacheTtlMs);
  return text;
}

/**
 * Bibliotecas compatíveis com o template fixo (React + Vite + TS + CSS puro).
 * Só buscamos documentação quando o pedido menciona uma dessas tecnologias,
 * para evitar latência e custo em apps que não precisam de nada específico.
 */
export const LIBRARY_HINTS = [
  {
    name: 'Recharts',
    id: '/recharts/recharts',
    pattern: /\brecharts\b|\bgr[aá]ficos?\b|\bcharts?\b|\bdashboards?\b|\bgr[aá]fico de/i,
    topic: 'gráficos e dashboards em React com TypeScript',
    language: 'TypeScript',
  },
  {
    name: 'Framer Motion',
    id: '/grx7/framer-motion',
    pattern:
      /\bframer[- ]?motion\b|\banima[cç][õo]es?\b|\banimations?\b|\btransi[cç][õo]es?\b|\bmotion\./i,
    topic: 'animações e transições em React com TypeScript',
    language: 'TypeScript',
  },
  {
    name: 'Lucide',
    id: '/lucide-icons/lucide',
    pattern: /\blucide(?:-react)?\b|[íi]cones?\b|\bicons?\b/i,
    topic: 'ícones em React com TypeScript',
    language: 'TypeScript',
  },
  {
    name: 'clsx',
    id: '/lukeed/clsx',
    pattern: /\bclsx\b|\bclasses condicionais\b/i,
    topic: 'classes condicionais em React',
    language: 'TypeScript',
  },
];

export function detectLibraries(text) {
  const source = String(text || '');
  const found = [];
  for (const hint of LIBRARY_HINTS) {
    if (!hint.pattern.test(source)) continue;
    if (found.some((item) => item.id === hint.id)) continue;
    found.push(hint);
  }
  return found;
}

function cleanDocs(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateAt(text, limit) {
  const value = String(text || '');
  if (value.length <= limit) return value;
  const cut = value.slice(0, Math.max(0, limit));
  const boundary = cut.lastIndexOf('\n');
  return `${boundary > limit * 0.6 ? cut.slice(0, boundary) : cut}\n...[trecho truncado]`;
}

/**
 * Monta o bloco de conhecimento usado no prompt de geração. Nunca lança:
 * uma falha do Context7 apenas registra o status e a geração continua.
 */
export async function collectKnowledge(text, options = {}) {
  const config = context7Config();
  const fetchedAt = new Date().toISOString();
  if (!config.enabled) {
    return {
      provider: 'context7',
      status: 'disabled',
      libraries: [],
      chars: 0,
      text: '',
      fetchedAt,
    };
  }

  const maxLibraries = positiveInt(options.maxLibraries, config.maxLibraries, 1);
  const maxChars = positiveInt(options.maxChars, config.maxChars, 1000);
  const hints = detectLibraries(text).slice(0, maxLibraries);
  if (hints.length === 0) {
    return {
      provider: 'context7',
      status: 'skipped',
      reason: 'Nenhuma biblioteca compatível mencionada no pedido.',
      libraries: [],
      chars: 0,
      text: '',
      fetchedAt,
    };
  }

  const libraries = [];
  let body = '';

  for (const hint of hints) {
    try {
      let libraryId = hint.id;
      let raw;
      try {
        raw = await queryLibraryDocs(libraryId, hint.topic, {
          ...options,
          language: hint.language,
        });
      } catch (firstError) {
        // O ID fixo pode envelhecer; resolve o nome oficial e tenta de novo.
        const matches = await resolveLibraryId(hint.name, hint.topic, options);
        const alternative = matches[0]?.id;
        if (!alternative || alternative === libraryId) throw firstError;
        libraryId = alternative;
        raw = await queryLibraryDocs(libraryId, hint.topic, {
          ...options,
          language: hint.language,
        });
      }
      const docs = cleanDocs(raw);
      const remaining = maxChars - body.length - 300;
      if (remaining < 300) {
        libraries.push({ name: hint.name, id: libraryId, chars: 0, skipped: 'limite de tamanho' });
        continue;
      }
      const excerpt = truncateAt(docs, remaining);
      body += `\n\n### ${hint.name} (${libraryId})\n${excerpt}`;
      libraries.push({ name: hint.name, id: libraryId, chars: excerpt.length });
    } catch (error) {
      libraries.push({
        name: hint.name,
        id: hint.id,
        error: String(error.message || error).slice(0, 300),
      });
    }
  }

  const used = libraries.filter((library) => library.chars > 0);
  if (used.length === 0) {
    return {
      provider: 'context7',
      status: 'error',
      reason:
        libraries.find((library) => library.error)?.error ||
        'Context7 não devolveu documentação utilizável.',
      libraries,
      chars: 0,
      text: '',
      fetchedAt,
    };
  }

  const header = `## Documentação atualizada (Context7)
Use os trechos abaixo como referência de API. Adapte tudo ao template fixo React 18 + TypeScript + CSS puro; não copie imports, dependências ou recursos incompatíveis.`;
  const output = `${header}${body}`;
  return {
    provider: 'context7',
    status: 'used',
    libraries,
    chars: output.length,
    text: output,
    fetchedAt,
  };
}

export function knowledgeForProject(knowledge) {
  if (!knowledge || !knowledge.provider) return null;
  return {
    provider: knowledge.provider,
    status: knowledge.status,
    libraries: (knowledge.libraries || []).map((library) => ({
      name: library.name,
      id: library.id,
      chars: library.chars || 0,
      ...(library.error ? { error: library.error } : {}),
      ...(library.skipped ? { skipped: library.skipped } : {}),
    })),
    chars: knowledge.chars || 0,
    reason: knowledge.reason || null,
    fetchedAt: knowledge.fetchedAt || null,
  };
}
