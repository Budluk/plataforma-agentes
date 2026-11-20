import { assertTrustedHost } from './net-safety.mjs';

/**
 * Origem usada nos iframes de preview e no `frame-src` do CSP.
 *
 * O Host recebido do cliente é uma pista, nunca uma autoridade: só é usado
 * quando passa pela mesma validação das rotas /api/. Caso contrário a função
 * cai no bind configurado, que o boot já garante ser loopback. A URL definida
 * pelo operador em PREVIEW_PUBLIC_URL tem precedência sobre tudo.
 */
export function previewOriginFor({
  hostHeader = '',
  configured = '',
  bindHost = '127.0.0.1',
  publicHost = '',
  previewPort = 8788,
} = {}) {
  const fixed = String(configured || '')
    .trim()
    .replace(/\/+$/, '');
  if (fixed) return fixed;

  let hostname = String(bindHost || '127.0.0.1')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');

  try {
    assertTrustedHost(hostHeader, undefined, { bindHost, publicHost });
    const candidate = new URL(`http://${String(hostHeader || '')}`)
      .hostname.replace(/^\[|\]$/g, '')
      .toLowerCase();
    if (candidate && candidate !== '0.0.0.0' && candidate !== '::') hostname = candidate;
  } catch {
    // Host ausente ou não permitido: mantém o bind, nunca o valor do cabeçalho.
  }

  if (!hostname || hostname === '0.0.0.0' || hostname === '::') hostname = '127.0.0.1';
  const formatted = hostname.includes(':') ? `[${hostname}]` : hostname;
  return `http://${formatted}:${previewPort}`;
}
