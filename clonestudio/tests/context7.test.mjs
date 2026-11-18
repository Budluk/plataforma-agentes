import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearContext7Cache,
  collectKnowledge,
  context7Status,
  detectLibraries,
  parseLibraryResults,
  parseMcpResponse,
  queryLibraryDocs,
} from '../server/context7.mjs';

function sse(payload) {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

function httpResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

function toolResponse(text) {
  return sse({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text }] },
  });
}

beforeEach(() => {
  clearContext7Cache();
  process.env.CONTEXT7_ENABLED = 'on';
  delete process.env.CONTEXT7_MAX_CHARS;
  delete process.env.CONTEXT7_MAX_LIBRARIES;
});

test('parseMcpResponse aceita JSON puro e Server-Sent Events', () => {
  assert.deepEqual(parseMcpResponse('{"result":{"ok":true}}'), { result: { ok: true } });
  const payload = parseMcpResponse(
    'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n',
  );
  assert.deepEqual(payload.result, { tools: [] });
  assert.equal(parseMcpResponse('event: ping\n\n'), null);
});

test('parseLibraryResults extrai ids e metadados do Context7', () => {
  const text = `Available Libraries:

- Title: Recharts
- Context7-compatible library ID: /recharts/recharts
- Description: React charting library
- Code Snippets: 1200
- Source Reputation: High
- Benchmark Score: 88.5
- Versions: v3.0.0, v2.15.0
----------
- Title: Outra
- Context7-compatible library ID: /org/project
- Description: Outra lib
- Code Snippets: 10
- Source Reputation: Medium
- Benchmark Score: 40
- Versions: v1`;

  const results = parseLibraryResults(text);
  assert.equal(results.length, 2);
  assert.equal(results[0].id, '/recharts/recharts');
  assert.equal(results[0].title, 'Recharts');
  assert.equal(results[0].snippets, 1200);
  assert.deepEqual(results[0].versions, ['v3.0.0', 'v2.15.0']);
});

test('detectLibraries identifica bibliotecas compatíveis sem duplicar', () => {
  const found = detectLibraries(
    'Dashboard com gráficos, animações, ícones e classes condicionais usando clsx',
  );
  const ids = found.map((item) => item.id);
  assert.deepEqual(ids, [
    '/recharts/recharts',
    '/grx7/framer-motion',
    '/lucide-icons/lucide',
    '/lukeed/clsx',
  ]);
  assert.equal(detectLibraries('Um app de notas com tags').length, 0);
});

test('collectKnowledge injeta documentação e registra metadados', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const libraryId = body.params.arguments.libraryId;
    return httpResponse(
      toolResponse(`### ${libraryId}\n\nExemplo de uso em React com TypeScript.`),
    );
  };

  const knowledge = await collectKnowledge('Dashboard com gráficos e animações', {
    fetchImpl,
    maxLibraries: 2,
  });

  assert.equal(knowledge.status, 'used');
  assert.equal(knowledge.libraries.length, 2);
  assert.ok(knowledge.chars > 0);
  assert.match(knowledge.text, /Documentação atualizada \(Context7\)/);
  assert.match(knowledge.text, /Recharts/);
  assert.match(knowledge.text, /Framer Motion/);
  assert.equal(calls.every((call) => call.method === 'tools/call'), true);
  assert.equal(calls.every((call) => call.params.name === 'query-docs'), true);
});

test('collectKnowledge resolve um ID novo quando o ID fixo falha', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.params.name === 'query-docs' && body.params.arguments.libraryId === '/recharts/recharts') {
      return httpResponse(
        sse({
          jsonrpc: '2.0',
          id: 1,
          result: {
            isError: true,
            content: [{ type: 'text', text: 'library not found' }],
          },
        }),
      );
    }
    if (body.params.name === 'resolve-library-id') {
      return httpResponse(
        toolResponse(
          'Available Libraries:\n\n- Title: Recharts\n- Context7-compatible library ID: /websites/recharts_github_io\n- Description: docs',
        ),
      );
    }
    return httpResponse(toolResponse('### Docs novas\nConteúdo atualizado.'));
  };

  const knowledge = await collectKnowledge('Dashboard com gráficos', { fetchImpl });
  assert.equal(knowledge.status, 'used');
  assert.equal(knowledge.libraries[0].id, '/websites/recharts_github_io');
  assert.deepEqual(
    calls.map((call) => call.params.name),
    ['query-docs', 'resolve-library-id', 'query-docs'],
  );
});

test('collectKnowledge é pulado quando nenhuma biblioteca é mencionada', async () => {
  let called = false;
  const knowledge = await collectKnowledge('Um app de notas com tags e favoritos', {
    fetchImpl: async () => {
      called = true;
      return httpResponse(toolResponse('x'));
    },
  });
  assert.equal(knowledge.status, 'skipped');
  assert.equal(called, false);
  assert.equal(knowledge.text, '');
});

test('collectKnowledge respeita CONTEXT7_ENABLED=off', async () => {
  process.env.CONTEXT7_ENABLED = 'off';
  const knowledge = await collectKnowledge('Dashboard com gráficos');
  assert.equal(knowledge.status, 'disabled');
  assert.equal(knowledge.text, '');
});

test('collectKnowledge degrada sem lançar quando o Context7 falha', async () => {
  const knowledge = await collectKnowledge('Dashboard com gráficos', {
    fetchImpl: async () => {
      throw new Error('rede indisponível');
    },
  });
  assert.equal(knowledge.status, 'error');
  assert.match(knowledge.reason, /rede indisponível/);
  assert.equal(knowledge.text, '');
});

test('collectKnowledge trunca a documentação no limite configurado', async () => {
  const longDocs = `${'linha de documentação\n'.repeat(800)}`;
  const knowledge = await collectKnowledge('Dashboard com gráficos', {
    fetchImpl: async () => httpResponse(toolResponse(longDocs)),
    maxChars: 1200,
  });
  assert.equal(knowledge.status, 'used');
  assert.ok(knowledge.chars <= 1500, `chars=${knowledge.chars}`);
  assert.match(knowledge.text, /trecho truncado/);
});

test('cache evita chamadas repetidas ao Context7', async () => {
  let requests = 0;
  const fetchImpl = async () =>
    httpResponse(toolResponse('### docs\nConteúdo de exemplo.'));
  const wrapped = async (...args) => {
    requests += 1;
    return fetchImpl(...args);
  };

  await collectKnowledge('Gráficos no dashboard', { fetchImpl: wrapped });
  const first = requests;
  await collectKnowledge('Gráficos no dashboard', { fetchImpl: wrapped });
  assert.equal(requests, first);
});

test('queryLibraryDocs valida o formato do libraryId', async () => {
  await assert.rejects(() => queryLibraryDocs('recharts', 'gráficos'), /libraryId inválido/);
});

test('context7Status informa ferramentas e latência', async () => {
  const status = await context7Status({
    fetchImpl: async () =>
      httpResponse(
        sse({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'resolve-library-id' }, { name: 'query-docs' }] },
        }),
      ),
  });
  assert.equal(status.status, 'ok');
  assert.equal(status.enabled, true);
  assert.deepEqual(status.tools, ['resolve-library-id', 'query-docs']);
  assert.ok(status.latencyMs >= 0);
});

test('context7Status retorna disabled sem chamar a rede', async () => {
  process.env.CONTEXT7_ENABLED = 'off';
  let called = false;
  const status = await context7Status({
    fetchImpl: async () => {
      called = true;
      return httpResponse(sse({ result: {} }));
    },
  });
  assert.equal(status.status, 'disabled');
  assert.equal(called, false);
});

test('context7Status reporta erro honesto quando a rede falha', async () => {
  const status = await context7Status({
    fetchImpl: async () => {
      throw new Error('ECONNRESET');
    },
  });
  assert.equal(status.status, 'error');
  assert.match(status.error, /ECONNRESET/);
});
