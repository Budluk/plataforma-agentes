import test from 'node:test';
import assert from 'node:assert/strict';
import { generationVersionLabel } from '../server/generator.mjs';

test('primeira geração de um projeto novo é rotulada como inicial', () => {
  assert.equal(generationVersionLabel({ fresh: true, hasVersions: false }), 'Geração inicial');
});

test('retry com versões já salvas é rotulado como geração reiniciada', () => {
  assert.equal(generationVersionLabel({ fresh: true, hasVersions: true }), 'Geração reiniciada');
});

test('correção de validação tem rótulo próprio', () => {
  assert.equal(
    generationVersionLabel({ validationFix: true, fileCount: 2 }),
    'Correção da validação',
  );
});

test('correção de build tem rótulo próprio', () => {
  assert.equal(generationVersionLabel({ fix: true, fileCount: 2 }), 'Correção de build');
});

test('ajuste por chat com arquivos é rotulado como alteração por chat', () => {
  assert.equal(generationVersionLabel({ fileCount: 3 }), 'Alteração por chat');
});

test('geração sem arquivos e sem contexto cai no rótulo inicial', () => {
  assert.equal(generationVersionLabel({ fileCount: 0 }), 'Geração inicial');
});
