import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();

/** Executa uma funcao com o request_id disponivel para qualquer log assincrono. */
export function runWithRequest(value, fn) {
  return context.run(value, fn);
}

export function currentRequestId() {
  return context.getStore()?.requestId || null;
}
