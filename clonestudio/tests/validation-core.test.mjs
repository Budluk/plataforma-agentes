import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildValidationInstruction,
  isBenignConsoleError,
  isBenignRequestFailure,
  sanitizeValidationEntries,
  summarizeValidation,
  truncateText,
  validationStatus,
} from '../server/validation-core.mjs';

test('truncateText remove caracteres de controle e limita o tamanho', () => {
  const text = truncateText('erro\u0000 grave\nlinha 2', 12);
  assert.equal(text.includes('\u0000'), false);
  assert.ok(text.length <= 13);
});

test('isBenignConsoleError ignora DevTools e favicon', () => {
  assert.equal(
    isBenignConsoleError('Download the React DevTools for a better development experience'),
    true,
  );
  assert.equal(isBenignConsoleError('Failed to load resource: favicon.ico'), true);
  assert.equal(
    isBenignConsoleError({
      text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
      location: 'http://127.0.0.1:8788/favicon.ico',
    }),
    true,
  );
  assert.equal(isBenignConsoleError('TypeError: Cannot read properties of undefined'), false);
});

test('isBenignRequestFailure ignora favicon e blob abortado', () => {
  assert.equal(isBenignRequestFailure({ url: 'http://x/favicon.ico', error: '404' }), true);
  assert.equal(
    isBenignRequestFailure({ url: 'blob:http://x/123', error: 'net::ERR_ABORTED' }),
    true,
  );
  assert.equal(
    isBenignRequestFailure({ url: 'http://x/api/data.json', error: 'net::ERR_FAILED' }),
    false,
  );
});

test('sanitizeValidationEntries remove benignos, deduplica e limita', () => {
  const entries = sanitizeValidationEntries({
    consoleErrors: [
      { text: 'Download the React DevTools', location: '' },
      { text: 'TypeError: boom', location: 'app.js:10' },
      { text: 'TypeError: boom', location: 'app.js:10' },
    ],
    failedRequests: [
      { method: 'get', url: 'http://x/favicon.ico', error: '404' },
      { method: 'post', url: 'http://x/api', error: 'net::ERR_FAILED' },
    ],
  });
  assert.equal(entries.consoleErrors.length, 1);
  assert.equal(entries.consoleErrors[0].text, 'TypeError: boom');
  assert.equal(entries.failedRequests.length, 1);
  assert.equal(entries.failedRequests[0].method, 'POST');
});

test('validationStatus classifica passed, issues e failed', () => {
  assert.equal(validationStatus({}), 'passed');
  assert.equal(validationStatus({ consoleErrors: [{ text: 'x' }] }), 'issues');
  assert.equal(validationStatus({ blank: true }), 'issues');
  assert.equal(validationStatus({ navigationError: 'timeout' }), 'failed');
});

test('summarizeValidation soma as categorias', () => {
  const counts = summarizeValidation({
    consoleErrors: [{}, {}],
    pageErrors: [{}],
    failedRequests: [],
    httpErrors: [{}],
    brokenImages: [{}, {}, {}],
  });
  assert.deepEqual(counts, { console: 2, page: 1, requests: 0, http: 1, images: 3, total: 7 });
});

test('imagens quebradas contam como problema na validação', () => {
  assert.equal(validationStatus({ brokenImages: [{ src: 'https://x/a.png' }] }), 'issues');
  const entries = sanitizeValidationEntries({
    brokenImages: [
      { src: 'https://x/a.png', alt: 'Capa' },
      { src: 'https://x/a.png', alt: 'Capa' },
    ],
  });
  assert.equal(entries.brokenImages.length, 1);
  const instruction = buildValidationInstruction({ brokenImages: entries.brokenImages });
  assert.match(instruction, /IMAGENS QUEBRADAS/);
  assert.match(instruction, /https:\/\/x\/a\.png/);
  assert.match(instruction, /via\.placeholder\.com/);
});

test('buildValidationInstruction inclui erros e limite de tamanho', () => {
  const instruction = buildValidationInstruction({
    blank: true,
    consoleErrors: [{ text: 'TypeError: boom', location: 'app.js:10' }],
    failedRequests: [{ method: 'GET', url: 'http://x/api', error: 'net::ERR_FAILED' }],
    httpErrors: [{ status: 404, method: 'GET', url: 'http://x/img.png' }],
  });
  assert.match(instruction, /PÁGINA EM BRANCO/);
  assert.match(instruction, /ERROS DE CONSOLE/);
  assert.match(instruction, /TypeError: boom/);
  assert.match(instruction, /ERROS DE CONSOLE/);
  assert.match(instruction, /REQUISIÇÕES COM FALHA/);
  assert.match(instruction, /404 GET/);
  assert.ok(instruction.length <= 7800);
});
