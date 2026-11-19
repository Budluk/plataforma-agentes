import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FREELLMAPI_BASE_URL = 'http://127.0.0.1:3001/v1';
process.env.FREELLMAPI_API_KEY = 'chave-teste';
process.env.FREELLMAPI_MODEL = 'alpha';
process.env.FREELLMAPI_FALLBACK_MODELS = 'beta, alpha';
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
process.env.OLLAMA_MODEL = 'llama-teste';
delete process.env.LOCALAI_BASE_URL;
delete process.env.LLAMACPP_BASE_URL;
process.env.AI_PROVIDER_ORDER = 'freellmapi,ollama';
process.env.AI_DEFAULT_MODEL = '';
process.env.AI_REQUEST_TIMEOUT_MS = '5000';

const providers = await import('../server/providers.mjs');

const FREELMAPI_CHAT = 'http://127.0.0.1:3001/v1/chat/completions';
const FREELMAPI_MODELS = 'http://127.0.0.1:3001/v1/models';
const OLLAMA_CHAT = 'http://127.0.0.1:11434/v1/chat/completions';

// Os avisos de fallback são esperados e barulhentos; guardamos para inspeção.
const warnings = [];
console.warn = (...args) => warnings.push(args.join(' '));
test.beforeEach(() => {
  warnings.length = 0;
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chatPayload(text, model = 'modelo') {
  return { model, choices: [{ message: { role: 'assistant', content: text } }] };
}

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    const call = {
      url: href,
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body ? JSON.parse(init.body) : null,
      signal: init.signal,
    };
    calls.push(call);
    const handler = routes[href] || routes['*'];
    if (!handler) throw new Error(`URL inesperada no teste: ${href}`);
    return handler(call, calls.filter((item) => item.url === href).length);
  };
  return { fetchImpl, calls };
}

test('providerOrder respeita a ordem configurada e ignora desconhecidos', () => {
  process.env.AI_PROVIDER_ORDER = 'ollama,freellmapi,inexistente,ollama';
  try {
    assert.deepEqual(
      providers.providerOrder().map((provider) => provider.id),
      ['ollama', 'freellmapi'],
    );
  } finally {
    process.env.AI_PROVIDER_ORDER = 'freellmapi,ollama';
  }

  process.env.AI_PROVIDER_ORDER = 'inexistente';
  try {
    assert.deepEqual(providers.providerOrder(), []);
  } finally {
    process.env.AI_PROVIDER_ORDER = 'freellmapi,ollama';
  }
});

test('providerStatuses só marca como configurado quem tem URL válida', () => {
  const statuses = new Map(
    providers.providerStatuses().map((provider) => [provider.id, provider]),
  );
  assert.equal(statuses.get('freellmapi').configured, true);
  assert.equal(statuses.get('freellmapi').baseUrl, 'http://127.0.0.1:3001/v1');
  assert.equal(statuses.get('freellmapi').model, 'alpha');
  assert.equal(statuses.get('ollama').configured, true);
  assert.equal(statuses.get('localllm').configured, false);
  assert.equal(statuses.get('localllm').baseUrl, null);
  assert.equal(statuses.get('llamacpp').configured, false);
});

test('callChat usa o primeiro provedor e envia modelo, chave e parâmetros', async () => {
  const { fetchImpl, calls } = mockFetch({
    [FREELMAPI_CHAT]: () =>
      jsonResponse({
        ...chatPayload('resposta do alpha', 'alpha-2026'),
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
  });

  const result = await providers.callChat([{ role: 'user', content: 'Oi' }], { fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, FREELMAPI_CHAT);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.authorization, 'Bearer chave-teste');
  assert.equal(calls[0].body.model, 'alpha');
  assert.equal(calls[0].body.stream, false);
  assert.equal(calls[0].body.temperature, 0.35);
  assert.ok(calls[0].body.max_tokens > 0);

  assert.equal(result.text, 'resposta do alpha');
  assert.equal(result.provider, 'freellmapi');
  assert.equal(result.providerLabel, 'FreeLLMAPI');
  assert.equal(result.model, 'alpha-2026');
  assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 5 });
  assert.equal(typeof result.elapsedMs, 'number');
});

test('callChat tenta os modelos de fallback antes de trocar de provedor', async () => {
  const { fetchImpl, calls } = mockFetch({
    [FREELMAPI_CHAT]: (call) =>
      call.body.model === 'beta'
        ? jsonResponse(chatPayload('resposta do beta', 'beta'))
        : jsonResponse({ error: { message: 'modelo alpha indisponível' } }, 503),
  });

  const result = await providers.callChat([{ role: 'user', content: 'Oi' }], { fetchImpl });

  assert.deepEqual(
    calls.map((call) => call.body.model),
    ['alpha', 'beta'],
  );
  assert.equal(result.provider, 'freellmapi');
  assert.equal(result.text, 'resposta do beta');
  assert.match(warnings.join('\n'), /freellmapi\/alpha falhou: modelo alpha indisponível/);
});

test('callChat cai para o próximo provedor quando todos os modelos falham', async () => {
  const { fetchImpl, calls } = mockFetch({
    [FREELMAPI_CHAT]: (call) =>
      jsonResponse({ error: { message: `sem ${call.body.model}` } }, 500),
    [OLLAMA_CHAT]: () => jsonResponse(chatPayload('resposta do ollama', 'llama-teste')),
  });

  const result = await providers.callChat([{ role: 'user', content: 'Oi' }], { fetchImpl });

  assert.deepEqual(
    calls.map((call) => `${new URL(call.url).port}/${call.body.model}`),
    ['3001/alpha', '3001/beta', '11434/llama-teste'],
  );
  assert.equal(result.provider, 'ollama');
  assert.equal(result.text, 'resposta do ollama');
  assert.equal(calls[2].headers.authorization, 'Bearer ollama');
});

test('callChat trata resposta sem conteúdo como falha e segue adiante', async () => {
  const { fetchImpl, calls } = mockFetch({
    [FREELMAPI_CHAT]: (call) =>
      call.body.model === 'alpha'
        ? jsonResponse({
            choices: [{ message: { role: 'assistant', content: '   ' }, finish_reason: 'length' }],
          })
        : jsonResponse(chatPayload('conteúdo do beta', 'beta')),
  });

  const result = await providers.callChat([{ role: 'user', content: 'Oi' }], { fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(result.text, 'conteúdo do beta');
  assert.match(
    warnings.join('\n'),
    /O provedor não retornou conteúdo \(finish_reason: length\)/,
  );
});

test('callChat respeita modelo explícito sem tentar os fallbacks', async () => {
  const { fetchImpl, calls } = mockFetch({
    [FREELMAPI_CHAT]: () => jsonResponse(chatPayload('modelo explícito', 'custom-1')),
  });

  const result = await providers.callChat([{ role: 'user', content: 'Oi' }], {
    fetchImpl,
    model: 'custom-1',
    temperature: 0,
    maxTokens: 321,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, 'custom-1');
  assert.equal(calls[0].body.temperature, 0);
  assert.equal(calls[0].body.max_tokens, 321);
  assert.equal(result.model, 'custom-1');
});

test('callChat normaliza papéis desconhecidos e conteúdo não textual', async () => {
  const { fetchImpl, calls } = mockFetch({
    [FREELMAPI_CHAT]: () => jsonResponse(chatPayload('ok', 'alpha')),
  });

  await providers.callChat(
    [
      { role: 'system', content: 'Instruções' },
      { role: 'tool', content: { texto: 'objeto' } },
      { role: 'assistant', content: [{ type: 'text', text: 'parte' }] },
    ],
    { fetchImpl },
  );

  assert.deepEqual(calls[0].body.messages, [
    { role: 'system', content: 'Instruções' },
    { role: 'user', content: '{"texto":"objeto"}' },
    { role: 'assistant', content: '[{"type":"text","text":"parte"}]' },
  ]);

  await assert.rejects(providers.callChat([], { fetchImpl }), /pelo menos uma mensagem/);
  await assert.rejects(providers.callChat(null, { fetchImpl }), /pelo menos uma mensagem/);
});

test('callChat interrompe no timeout sem tentar outros modelos ou provedores', async () => {
  let requests = 0;
  const fetchImpl = (url, init = {}) => {
    requests += 1;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('abortado');
        error.name = 'AbortError';
        reject(error);
      });
    });
  };

  await assert.rejects(
    providers.callChat([{ role: 'user', content: 'Oi' }], { fetchImpl, timeoutMs: 1000 }),
    /tempo limite total de 1s excedido/,
  );
  assert.equal(requests, 1, 'timeout não deve avançar para o próximo modelo');
});

test('callChat detalha falhas e sugere subir o gateway quando a rede falha', async () => {
  const offline = () => {
    throw new TypeError('fetch failed');
  };
  const { fetchImpl } = mockFetch({ [FREELMAPI_CHAT]: offline, [OLLAMA_CHAT]: offline });

  await assert.rejects(
    providers.callChat([{ role: 'user', content: 'Oi' }], { fetchImpl }),
    (error) => {
      assert.match(error.message, /Nenhum provedor respondeu/);
      assert.match(error.message, /FreeLLMAPI: alpha: fetch failed/);
      assert.match(error.message, /Ollama: fetch failed/);
      assert.match(error.message, /parece estar fora do ar/);
      assert.equal(error.providerErrors.length, 2);
      assert.equal(error.providerErrors[0].provider, 'freellmapi');
      assert.equal(error.providerErrors[1].provider, 'ollama');
      return true;
    },
  );

  const { fetchImpl: unauthorized } = mockFetch({
    [FREELMAPI_CHAT]: () => jsonResponse({ error: { message: 'chave inválida' } }, 401),
    [OLLAMA_CHAT]: () => jsonResponse({ error: { message: 'modelo ausente' } }, 404),
  });
  await assert.rejects(
    providers.callChat([{ role: 'user', content: 'Oi' }], { fetchImpl: unauthorized }),
    (error) => {
      assert.doesNotMatch(error.message, /fora do ar/);
      assert.match(error.message, /FreeLLMAPI: alpha: chave inválida/);
      assert.match(error.message, /Ollama: modelo ausente/);
      return true;
    },
  );
});

test('callChat avisa quando nenhum provedor está configurado', async () => {
  process.env.AI_PROVIDER_ORDER = 'inexistente';
  try {
    await assert.rejects(
      providers.callChat([{ role: 'user', content: 'Oi' }]),
      /Nenhum provedor de IA está configurado/,
    );
  } finally {
    process.env.AI_PROVIDER_ORDER = 'freellmapi,ollama';
  }
});

test('listProviderModels ordena, aceita ids variados e usa cache', async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return jsonResponse({ data: [{ id: 'zeta' }, 'alpha', { id: 'beta' }, {}] });
  };

  assert.deepEqual(await providers.listProviderModels('ollama', { fetchImpl }), [
    'alpha',
    'beta',
    'zeta',
  ]);
  assert.deepEqual(await providers.listProviderModels('ollama', { fetchImpl }), [
    'alpha',
    'beta',
    'zeta',
  ]);
  assert.equal(requests, 1, 'segunda consulta deve vir do cache');
});

test('listProviderModels propaga erro do provedor e exige configuração', async () => {
  const { fetchImpl, calls } = mockFetch({
    [FREELMAPI_MODELS]: () => jsonResponse({ error: { message: 'sem chave' } }, 500),
  });
  await assert.rejects(
    providers.listProviderModels('freellmapi', { fetchImpl }),
    /sem chave/,
  );
  assert.equal(calls.length, 1);

  await assert.rejects(
    providers.listProviderModels('localllm', { fetchImpl }),
    /não está configurado/,
  );
  assert.equal(calls.length, 1, 'provedor não configurado não deve chamar a rede');
});
