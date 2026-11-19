import test from 'node:test';
import assert from 'node:assert/strict';

const bus = await import('../server/change-events.mjs');

test('publica mudancas com revision crescente e metadados minimos', () => {
  const received = [];
  const unsubscribe = bus.subscribeChanges((change) => received.push(change));
  const start = bus.currentRevision();

  bus.publishChange('project', 'abc');
  bus.publishChange('projects', 'def');

  assert.equal(received.length, 2);
  assert.deepEqual(Object.keys(received[0]).sort(), ['id', 'revision', 'scope']);
  assert.deepEqual(received[0], { scope: 'project', id: 'abc', revision: start + 1 });
  assert.deepEqual(received[1], { scope: 'projects', id: 'def', revision: start + 2 });
  assert.equal(bus.currentRevision(), start + 2);
  unsubscribe();
});

test('unsubscribe impede novos avisos', () => {
  const received = [];
  const unsubscribe = bus.subscribeChanges((change) => received.push(change));
  bus.publishChange('project', 'um');
  unsubscribe();
  bus.publishChange('project', 'dois');
  assert.equal(received.length, 1);
  assert.equal(received[0].id, 'um');
});

test('o barramento nunca carrega prompt, arquivos ou resposta do modelo', () => {
  let payload = null;
  const unsubscribe = bus.subscribeChanges((change) => {
    payload = JSON.stringify(change);
  });
  bus.publishChange('project', 'proj-1');
  unsubscribe();
  assert.ok(!payload.toLowerCase().includes('prompt'));
  assert.ok(!payload.includes('files'));
  assert.ok(!payload.includes('content'));
});
