/* Barramento interno de mudancas de estado (Fase 5 do plano de producao).
 *
 * Transporta apenas metadados minimos -- scope, id e revision. Nunca carrega
 * prompt, corpo de requisicao, arquivos gerados ou resposta do modelo: esses
 * dados continuam sendo lidos pelas rotas /api/projects normais, com a mesma
 * redacao/auditoria de sempre.
 */
import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let revision = 0;

export function publishChange(scope, id = null) {
  revision += 1;
  emitter.emit('change', { scope, id, revision });
}

export function subscribeChanges(listener) {
  emitter.on('change', listener);
  return () => emitter.off('change', listener);
}

export function currentRevision() {
  return revision;
}
