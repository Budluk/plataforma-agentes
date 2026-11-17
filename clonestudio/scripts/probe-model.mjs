import '../server/env.mjs';
import { SYSTEM_PROMPT } from '../server/generator.mjs';
import { parseGenerationResponse } from '../server/generation-core.mjs';
import { callChat } from '../server/providers.mjs';

const model = process.argv[2] || 'auto';
const maxTokens = Number(process.argv[3] || 12000);

const prompt =
  'Um app de notas com busca, tags, favoritos e tema claro/escuro. Deve permitir criar, editar e excluir notas, com persistência no localStorage e layout responsivo.';

const messages = [
  { role: 'system', content: SYSTEM_PROMPT },
  {
    role: 'user',
    content: `Crie o app descrito abaixo. Entregue uma primeira versão completa, polida e funcional.\n\nDESCRIÇÃO DO USUÁRIO:\n${prompt}\n\nLembre-se: responda somente com JSON e inclua src/App.tsx e src/index.css.`,
  },
];

try {
  const result = await callChat(messages, {
    model,
    timeoutMs: 360000,
    maxTokens,
    temperature: 0.35,
  });
  console.log(`provider=${result.provider} model=${result.model} elapsed=${result.elapsedMs}ms chars=${result.text.length}`);
  try {
    const parsed = parseGenerationResponse(result.text);
    console.log(`JSON OK: name=${parsed.name} files=${parsed.files.length} (${parsed.files.map((f) => f.path).join(', ')})`);
  } catch (error) {
    console.log(`JSON INVÁLIDO: ${error.message}`);
  }
  console.log('---BEGIN---');
  console.log(result.text.slice(0, 3500));
  console.log('---END---');
} catch (error) {
  console.error('FALHOU:', error.message);
  process.exitCode = 1;
}
