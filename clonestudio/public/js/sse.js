import { state, stopTimers } from './runtime.js';
import {
  refreshHomeProjects,
  refreshOpenProjectSummaries,
  refreshProject,
  scheduleHomePoll,
  scheduleProjectPoll,
  scheduleTabsPoll,
} from './polling.js';

/*
 * Camada opcional de eventos em tempo real (Fase 5). O servidor so envia
 * "scope + id + revision": nenhum prompt, arquivo ou resposta bruta trafega
 * por aqui. Todo refresh continua passando pelas rotas e funcoes ja usadas
 * no polling -- se o EventSource falhar, voltamos aos timers normais.
 */
const CHANGE_DEBOUNCE_MS = 250;

let source = null;
let debounceTimer = null;
let refreshChain = Promise.resolve();
const pending = new Map();

function serialize(task) {
  refreshChain = refreshChain.then(task, task).catch(() => {});
  return refreshChain;
}

function fallbackToPolling() {
  if (!state.sseAttempted) return;
  state.sseConnected = false;
  if (state.route.name === 'home') scheduleHomePoll();
  if (state.route.name === 'project') {
    scheduleProjectPoll();
    scheduleTabsPoll();
  }
}

function flushChanges() {
  debounceTimer = null;
  const changes = [...pending.values()];
  pending.clear();
  if (!state.sseConnected || changes.length === 0) return;

  const route = state.route.name;
  if (route === 'home') {
    serialize(() => refreshHomeProjects());
    return;
  }
  if (route !== 'project' || !state.project) return;

  const activeId = state.project.id;
  const forActive = changes.some(
    (change) =>
      (change.scope === 'project' && change.id === activeId) ||
      (change.scope === 'projects' && change.id === activeId),
  );
  const forOthers = changes.some((change) => change.id && change.id !== activeId);

  if (forActive) serialize(() => refreshProject());
  if (forOthers || changes.some((change) => change.scope === 'projects')) {
    serialize(() => refreshOpenProjectSummaries());
  }
}

function queueChange(change) {
  if (!state.sseConnected || !change || !change.scope) return;
  const key = `${change.scope}:${change.id || ''}`;
  pending.set(key, change);
  if (debounceTimer) return;
  debounceTimer = setTimeout(flushChanges, CHANGE_DEBOUNCE_MS);
}

export function connectSse() {
  if (source || state.sseAttempted) return;
  if (!state.config?.sse) return;
  state.sseAttempted = true;

  try {
    source = new EventSource('/api/events');
  } catch {
    fallbackToPolling();
    return;
  }

  source.addEventListener('hello', () => {
    state.sseConnected = true;
    // Cancela timers que ja tinham sido agendados antes da conexao abrir.
    stopTimers();
  });

  source.addEventListener('change', (event) => {
    let data = null;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const change of data?.changes || []) queueChange(change);
  });

  source.onerror = () => {
    if (source?.readyState === EventSource.CLOSED) {
      // 404 (desligado no servidor) ou 503 (limite de conexoes): nao reconecta.
      closeSse();
      fallbackToPolling();
      return;
    }
    // Queda transitoria: o EventSource reconecta sozinho, mas o polling volta
    // enquanto isso para o painel nao ficar sem atualizacao.
    fallbackToPolling();
  };
}

export function closeSse() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  pending.clear();
  if (source) {
    source.close();
    source = null;
  }
  state.sseConnected = false;
}
