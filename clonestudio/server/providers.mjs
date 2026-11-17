import { providersCatalog } from './provider-catalog.mjs';

const DEFAULT_TIMEOUT = Number(process.env.AI_REQUEST_TIMEOUT_MS || 240000);

function baseFromEnv(name) {
  return String(process.env[name] || '').trim().replace(/\/+$/, '');
}

function listFromEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function validBaseUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const definitions = [
  {
    id: 'freellmapi',
    label: 'FreeLLMAPI',
    description: 'Gateway local com fallback entre provedores gratuitos.',
    baseUrl: baseFromEnv('FREELLMAPI_BASE_URL'),
    apiKey: process.env.FREELLMAPI_API_KEY || '',
    model: process.env.FREELLMAPI_MODEL || '',
    fallbackModels: listFromEnv('FREELLMAPI_FALLBACK_MODELS'),
    envPrefix: 'FREELLMAPI',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Modelos rodando na sua máquina ou em um servidor Ollama.',
    baseUrl: baseFromEnv('OLLAMA_BASE_URL'),
    apiKey: process.env.OLLAMA_API_KEY || 'ollama',
    model: process.env.OLLAMA_MODEL || '',
    envPrefix: 'OLLAMA',
  },
  {
    id: 'localllm',
    label: 'LocalAI',
    description: 'Servidor OpenAI-compatible auto-hospedado.',
    baseUrl: baseFromEnv('LOCALAI_BASE_URL'),
    apiKey: process.env.LOCALAI_API_KEY || '',
    model: process.env.LOCALAI_MODEL || '',
    envPrefix: 'LOCALAI',
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    description: 'llama-server local compatível com chat completions.',
    baseUrl: baseFromEnv('LLAMACPP_BASE_URL'),
    apiKey: process.env.LLAMACPP_API_KEY || 'llama',
    model: process.env.LLAMACPP_MODEL || '',
    envPrefix: 'LLAMACPP',
  },
];

const catalogById = new Map(providersCatalog.map((item) => [item.id, item]));

export function getProvider(id) {
  return definitions.find((provider) => provider.id === id) || null;
}

export function providerStatuses() {
  return definitions.map((provider) => {
    const configured = validBaseUrl(provider.baseUrl);
    const catalog = catalogById.get(provider.id) || {};
    return {
      id: provider.id,
      label: provider.label,
      description: catalog.description || provider.description,
      configured,
      baseUrl: configured ? provider.baseUrl : null,
      model: provider.model || null,
      envPrefix: provider.envPrefix,
    };
  });
}

export function providerOrder() {
  const raw = process.env.AI_PROVIDER_ORDER || 'freellmapi,ollama,localllm,llamacpp';
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const configured = ids
    .map((id) => getProvider(id))
    .filter((provider) => provider && validBaseUrl(provider.baseUrl));
  const unique = [];
  for (const provider of configured) {
    if (!unique.some((item) => item.id === provider.id)) unique.push(provider);
  }
  return unique;
}

function endpoint(provider, suffix) {
  const base = provider.baseUrl.endsWith('/') ? provider.baseUrl : `${provider.baseUrl}/`;
  return new URL(suffix, base);
}

function extractContent(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  return '';
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('É necessário enviar pelo menos uma mensagem.');
  }
  return messages.map((message) => ({
    role: ['system', 'user', 'assistant'].includes(message?.role) ? message.role : 'user',
    content:
      typeof message?.content === 'string'
        ? message.content
        : JSON.stringify(message?.content ?? ''),
  }));
}

async function requestProvider(provider, messages, options) {
  const url = endpoint(provider, 'chat/completions');
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model || provider.model || process.env.AI_DEFAULT_MODEL || 'default',
        messages,
        stream: false,
        temperature: options.temperature ?? 0.35,
        max_tokens: options.maxTokens || Number(process.env.AI_MAX_TOKENS || 12000),
      }),
    });
    const payload = await response.json().catch((error) => {
      // Abortar durante a leitura do corpo também é timeout: não pode virar
      // "resposta vazia" e esconder que o provedor estourou o prazo.
      if (error?.name === 'AbortError') throw error;
      return {};
    });
    if (!response.ok) {
      const detail =
        payload?.error?.message || payload?.message || `HTTP ${response.status} do provedor`;
      throw new Error(detail);
    }
    const choice = payload?.choices?.[0];
    const text = extractContent(choice?.message || choice?.delta);
    if (!text.trim()) {
      const reason = choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : '';
      throw new Error(`O provedor não retornou conteúdo${reason}.`);
    }
    return {
      text,
      provider: provider.id,
      providerLabel: provider.label,
      model: payload.model || options.model || provider.model || 'desconhecido',
      usage: payload.usage || null,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

function modelCandidates(provider, options) {
  const explicit = String(options.model || '').trim();
  if (explicit) return [explicit];
  const models = [
    ...new Set(
      [provider.model, ...(provider.fallbackModels || []), process.env.AI_DEFAULT_MODEL]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ];
  return models.length ? models : ['default'];
}

export async function callChat(messages, options = {}) {
  const normalized = normalizeMessages(messages);
  const providers = providerOrder();
  if (providers.length === 0) {
    throw new Error(
      'Nenhum provedor de IA está configurado. Preencha FREELLMAPI_BASE_URL e FREELLMAPI_API_KEY no arquivo .env.',
    );
  }
  const totalBudget = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT));
  const deadline = Date.now() + totalBudget;
  const errors = [];
  let timedOut = false;

  providerLoop: for (const provider of providers) {
    const models = modelCandidates(provider, options);
    const failures = [];
    for (const model of models) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        timedOut = true;
        break providerLoop;
      }
      try {
        return await requestProvider(provider, normalized, {
          ...options,
          model,
          timeoutMs: remaining,
        });
      } catch (error) {
        const message =
          error.name === 'AbortError'
            ? `tempo limite de ${Math.round(totalBudget / 1000)}s excedido`
            : error.message;
        failures.push(models.length > 1 ? `${model}: ${message}` : message);
        if (error.name === 'AbortError') {
          timedOut = true;
          break providerLoop;
        }
        if (models.length > 1) {
          console.warn(`[providers] ${provider.id}/${model} falhou: ${message}`);
        }
      }
    }
    errors.push({ provider: provider.id, label: provider.label, error: failures.join(' | ') });
    console.warn(`[providers] ${provider.id} falhou: ${failures.join(' | ')}`);
  }
  if (timedOut && errors.length === 0) {
    errors.push({
      provider: 'timeout',
      label: 'Tempo limite',
      error: `tempo limite total de ${Math.round(totalBudget / 1000)}s excedido`,
    });
  }
  const detail = errors.map((item) => `${item.label}: ${item.error}`).join(' | ');
  const unreachable = errors.some((item) =>
    /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|network|socket hang up/i.test(item.error),
  );
  const hint = unreachable
    ? ' O gateway de IA parece estar fora do ar — inicie o FreeLLMAPI (http://127.0.0.1:3001) e tente de novo.'
    : '';
  const error = new Error(`Nenhum provedor respondeu.${hint} ${detail}`);
  error.providerErrors = errors;
  throw error;
}

const modelCache = new Map();

export async function listProviderModels(providerId) {
  const provider = getProvider(providerId);
  if (!provider || !validBaseUrl(provider.baseUrl)) {
    throw new Error(`Provedor "${providerId}" não está configurado.`);
  }
  const cached = modelCache.get(providerId);
  if (cached && Date.now() - cached.at < 60000) return cached.models;

  const url = endpoint(provider, 'models');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {},
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    }
    const models = (Array.isArray(payload?.data) ? payload.data : [])
      .map((item) => (typeof item === 'string' ? item : item?.id))
      .filter(Boolean)
      .sort();
    modelCache.set(providerId, { at: Date.now(), models });
    return models;
  } finally {
    clearTimeout(timer);
  }
}
