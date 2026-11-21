/* Endpoint SSE opt-in do painel (Fase 5 do plano de producao).
 *
 * O fluxo continua sendo polling por padrao. Com CLONESTUDIO_SSE_ENABLED=1 o
 * painel abre um EventSource e este modulo so avisa "algo mudou" (scope/id/
 * revision). O cliente entao chama as mesmas rotas de sempre para buscar os
 * dados, inclusive o detalhe completo quando a geracao termina.
 *
 * Nao ha payload de prompt/resposta no stream, nem autenticacao nueva: o alvo
 * atual e loopback e o gateway ja rejeita HOST nao-loopback no boot.
 */
import { currentRevision, subscribeChanges } from './change-events.mjs';
import { logAudit } from './audit.mjs';

const KEEPALIVE_MS = 20_000;
const COALESCE_MS = 150;

let clients = 0;
let accepted = 0;
let rejected = 0;

export function sseEnabled() {
  return process.env.CLONESTUDIO_SSE_ENABLED === '1';
}

export function sseStatus() {
  const maxClients = Math.max(1, Number(process.env.CLONESTUDIO_SSE_MAX_CLIENTS || 20));
  return { sseEnabled: sseEnabled(), sseClients: clients, sseMaxClients: maxClients, accepted, rejected };
}

function writeEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) return false;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return true;
}

function writeComment(res, text) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`: ${text}\n\n`);
}

/**
 * Assume a resposta quando SSE esta ligado. Retorna false quando o recurso
 * esta desligado (o chamador decide a resposta de fallback).
 */
export function handleSse(req, res) {
  if (!sseEnabled()) return false;

  const maxClients = Math.max(1, Number(process.env.CLONESTUDIO_SSE_MAX_CLIENTS || 20));
  if (clients >= maxClients) {
    rejected += 1;
    logAudit('sse_rejected', { reason: 'limite de conexoes', clients, maxClients });
    res.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify({ error: 'Muitas conexões de eventos abertas.' }));
    return true;
  }

  // Só contabiliza depois que o stream foi realmente iniciado: se writeHead
  // falhar, o contador não pode vazar e reduzir o limite de cliente para sempre.
  try {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
    });
    res.flushHeaders?.();
    writeEvent(res, 'hello', { sse: true, revision: currentRevision() });
  } catch {
    try {
      res.end();
    } catch {}
    logAudit('sse_rejected', { reason: 'falha ao iniciar stream' });
    return true;
  }
  clients += 1;
  accepted += 1;
  logAudit('sse_connected', { clients });

  const pending = new Map();
  let coalesceTimer = null;
  let keepaliveTimer = null;
  let done = false;

  const unsubscribe = subscribeChanges((change) => {
    // Mesmo id/scope several vezes seguidas vira um unico aviso (last-write-wins).
    pending.set(`${change.scope}:${change.id || ''}`, change);
    if (coalesceTimer) return;
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null;
      const changes = [...pending.values()];
      pending.clear();
      if (done || changes.length === 0) return;
      const latest = changes.reduce((max, item) => Math.max(max, item.revision), 0);
      writeEvent(res, 'change', { revision: latest, changes });
    }, COALESCE_MS);
    coalesceTimer.unref?.();
  });

  keepaliveTimer = setInterval(() => writeComment(res, 'ping'), KEEPALIVE_MS);
  keepaliveTimer.unref?.();

  const cleanup = () => {
    if (done) return;
    done = true;
    if (coalesceTimer) clearTimeout(coalesceTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    unsubscribe();
    pending.clear();
    clients = Math.max(0, clients - 1);
    logAudit('sse_disconnected', { clients });
  };
  // `req` 'close' pode disparar assim que o GET sem corpo termina de ser lido;
  // o fim da resposta e o socket sao os sinais confiaveis de desconexao.
  res.on('close', cleanup);
  res.on('finish', cleanup);
  req.socket?.on('close', cleanup);
  return true;
}
