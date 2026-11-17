import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFileDump,
  extractJsonObject,
  normalizeFiles,
  parseGenerationResponse,
  sanitizeJsonText,
  validateFiles,
} from '../server/generation-core.mjs';

test('sanitizeJsonText escapa quebras de linha dentro de strings', () => {
  const raw = '{"content": "linha 1\nlinha 2\ttab"}';
  const parsed = JSON.parse(sanitizeJsonText(raw));
  assert.equal(parsed.content, 'linha 1\nlinha 2\ttab');
});

test('extractJsonObject encontra JSON cercado por markdown e texto', () => {
  const raw = 'Claro! Aqui está:\n```json\n{"name":"App","files":[]}\n```\nFim.';
  const parsed = extractJsonObject(raw);
  assert.equal(parsed.name, 'App');
  assert.deepEqual(parsed.files, []);
});

test('extractJsonObject lida com chaves dentro de strings', () => {
  const raw = '{"code":"const x = { a: 1 }","ok":true}';
  const parsed = extractJsonObject(raw);
  assert.equal(parsed.code, 'const x = { a: 1 }');
});

test('extractJsonObject remove vírgula final', () => {
  const raw = '{"files":[{"path":"src/App.tsx","content":"x"},],}';
  const parsed = extractJsonObject(raw);
  assert.equal(parsed.files.length, 1);
});

test('normalizeFiles aceita array e normaliza caminhos', () => {
  const files = normalizeFiles({
    files: [
      { path: './src/App.tsx', content: 'export default function App(){return null}' },
      { path: 'src\\index.css', content: 'body{}' },
    ],
  });
  assert.deepEqual(
    files.map((file) => file.path),
    ['src/App.tsx', 'src/index.css'],
  );
});

test('normalizeFiles aceita mapa de arquivos', () => {
  const files = normalizeFiles({
    files: {
      'src/App.tsx': 'export default function App(){return null}',
    },
  });
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'src/App.tsx');
});

test('normalizeFiles rejeita src/main.tsx', () => {
  assert.throws(
    () =>
      normalizeFiles({
        files: [
          { path: 'src/App.tsx', content: 'x' },
          { path: 'src/main.tsx', content: 'x' },
        ],
      }),
    /main\.tsx/,
  );
});

test('normalizeFiles rejeita arquivo fora de src', () => {
  assert.throws(
    () => normalizeFiles({ files: [{ path: 'package.json', content: '{}' }] }),
    /fora de src/,
  );
});

test('normalizeFiles exige src/App.tsx', () => {
  assert.throws(
    () => normalizeFiles({ files: [{ path: 'src/index.css', content: 'body{}' }] }),
    /App\.tsx/,
  );
});

test('validateFiles aceita imports permitidos e relativos existentes', () => {
  const files = [
    {
      path: 'src/App.tsx',
      content:
        "import { useState } from 'react';\nimport { Camera } from 'lucide-react';\nimport Card from './components/Card';\nimport './index.css';",
    },
    { path: 'src/components/Card.tsx', content: 'export default function Card(){return null}' },
    { path: 'src/index.css', content: 'body{}' },
  ];
  assert.deepEqual(validateFiles(files), []);
});

test('validateFiles rejeita pacote não permitido', () => {
  const errors = validateFiles([
    { path: 'src/App.tsx', content: "import axios from 'axios'; export default function App(){return null}" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /axios/);
});

test('validateFiles rejeita import relativo quebrado', () => {
  const errors = validateFiles([
    { path: 'src/App.tsx', content: "import Card from './Card'; export default function App(){return null}" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Card/);
});

test('validateFiles rejeita import absoluto', () => {
  const errors = validateFiles([
    { path: 'src/App.tsx', content: "import Card from '/components/Card'; export default function App(){return null}" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /absoluto/);
});

test('validateFiles valida @import de CSS', () => {
  const errors = validateFiles([
    { path: 'src/index.css', content: "@import './theme.css';" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /theme\.css/);
});

test('parseGenerationResponse devolve metadados e arquivos válidos', () => {
  const raw = JSON.stringify({
    name: 'Agenda',
    description: 'Uma agenda simples',
    message: 'Criado',
    files: [
      { path: 'src/App.tsx', content: "import { useState } from 'react';\nexport default function App(){ const [x] = useState(0); return <div>{x}</div> }" },
      { path: 'src/index.css', content: 'body { margin: 0 }' },
    ],
  });
  const parsed = parseGenerationResponse(raw);
  assert.equal(parsed.name, 'Agenda');
  assert.equal(parsed.files.length, 2);
  assert.equal(parsed.message, 'Criado');
});

test('buildFileDump inclui caminhos e respeita limite', () => {
  const files = [
    { path: 'src/App.tsx', content: 'x' },
    { path: 'src/big.tsx', content: 'y'.repeat(1000) },
  ];
  const dump = buildFileDump(files, 120);
  assert.match(dump, /### src\/App\.tsx/);
  assert.match(dump, /omitidos/);
});
