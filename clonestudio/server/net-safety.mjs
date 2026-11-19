import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const MAX_DEFAULT_BYTES = 20_000_000;
const MAX_REDIRECTS = 4;

function ipv4Parts(value) {
  const match = String(value || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part < 0 || part > 255)) return null;
  return parts;
}

export function isPrivateIpv4(value) {
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function mappedIpv4(value) {
  const text = String(value || '').toLowerCase();
  const dotted = text.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = text.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return '';
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isPrivateAddress(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (net.isIPv4(host)) return isPrivateIpv4(host);
  if (net.isIPv6(host)) {
    if (host === '::' || host === '::1') return true;
    const mapped = mappedIpv4(host);
    if (mapped) return isPrivateIpv4(mapped);
    return (
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80') ||
      host.startsWith('ff') ||
      host.startsWith('64:ff9b') ||
      host.startsWith('2001:db8')
    );
  }
  return false;
}

/** HOST de escuta: só loopback, para não expor o painel sem autenticação. */
export function isLoopbackHost(value) {
  const host = String(value ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (net.isIPv4(host)) return host.startsWith('127.');
  if (net.isIPv6(host)) {
    if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
    const mapped = mappedIpv4(host);
    return Boolean(mapped && mapped.startsWith('127.'));
  }
  return false;
}

export function assertLoopbackHost(value) {
  const host = String(value ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!isLoopbackHost(host)) {
    throw new Error('HOST deve ser loopback (127.0.0.1, ::1 ou localhost).');
  }
  return host;
}

/**
 * Host publico explicito autorizado a fazer mutacoes via tunel (alvo B).
 * Vazio mantem o comportamento atual: somente loopback. Nunca aceita IP ou
 * loopback, para nao transformar essa liberacao em exposição irrestrita.
 */
export function parsePublicHost(raw) {
  const host = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  if (!host) return '';
  if (isLoopbackHost(host)) {
    throw new Error('CLONESTUDIO_PUBLIC_HOST nao pode ser loopback.');
  }
  if (net.isIPv4(host) || net.isIPv6(host)) {
    throw new Error('CLONESTUDIO_PUBLIC_HOST deve ser um hostname, nao um IP.');
  }
  const labels = host.split('.');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) || labels.some((label) => label.startsWith('-') || label.endsWith('-'))) {
    throw new Error('CLONESTUDIO_PUBLIC_HOST invalido.');
  }
  return host;
}

/**
 * Valida Host/Origin de mutacoes. Lanca Error com mensagem especifica; o
 * chamador converte em status HTTP. `publicHost` so e aceito quando definido.
 */
export function assertTrustedHost(hostHeader, originHeader, { bindHost = '127.0.0.1', publicHost = '' } = {}) {
  const rawHost = String(hostHeader ?? '');
  let hostname = '';
  try {
    hostname = new URL(`http://${rawHost}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    hostname = '';
  }
  if (!hostname) throw new Error('Cabeçalho Host ausente.');
  const bind = String(bindHost ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  const allowed =
    ['127.0.0.1', 'localhost', '::1'].includes(hostname) || hostname === bind || (Boolean(publicHost) && hostname === publicHost);
  if (!allowed) throw new Error('Host não permitido.');
  const origin = String(originHeader ?? '').trim();
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new Error('Origem inválida.');
    }
    if (originHost !== rawHost) throw new Error('Origem não permitida.');
  }
}

function isBlockedHostname(value) {
  const host = String(value || '').trim().toLowerCase().replace(/\.+$/, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    host === 'metadata.google.internal'
  );
}

export function assertPublicHttpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Link inválido. Cole uma URL completa começando com http:// ou https://.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Apenas links http:// ou https:// podem ser baixados.');
  }
  if (url.username || url.password) {
    throw new Error('Links com usuário/senha embutidos não são permitidos.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host || isBlockedHostname(host) || isPrivateAddress(host)) {
    throw new Error('Links locais ou privados não podem ser baixados pelo servidor.');
  }
  return url;
}

/**
 * Valida a URL e resolve o DNS uma única vez. Os endereços retornados são os
 * únicos usados na conexão (ver `pinnedLookup`), então o domínio não pode
 * trocar de IP entre a validação e o download (DNS rebinding).
 */
export async function resolvePublicHttpUrl(raw) {
  const url = assertPublicHttpUrl(raw);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error('Links locais ou privados não podem ser baixados pelo servidor.');
    }
    return { url, addresses: [{ address: host, family: net.isIP(host) }] };
  }
  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`Não foi possível resolver o domínio "${host}".`);
  }
  if (!records.length) {
    throw new Error(`Não foi possível resolver o domínio "${host}".`);
  }
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Links locais ou privados não podem ser baixados pelo servidor.');
  }
  return {
    url,
    addresses: records.map((record) => ({ address: record.address, family: record.family })),
  };
}

export async function assertPublicHttpUrlResolved(raw) {
  const { url } = await resolvePublicHttpUrl(raw);
  return url;
}

/**
 * `lookup` do node:net que só devolve os endereços já validados. Mesmo que o
 * DNS mude depois, a conexão continua indo para o IP aprovado.
 */
export function pinnedLookup(addresses) {
  // Os endereços vêm de resolvePublicHttpUrl e já foram validados; aqui só
  // garantimos que nenhuma outra resolução DNS seja usada na conexão.
  const pinned = Array.isArray(addresses)
    ? addresses.filter((item) => item && item.address)
    : [];
  return (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const family = Number(options?.family || 0);
    const usable = family ? pinned.filter((item) => item.family === family) : pinned;
    if (!usable.length) {
      callback(new Error(`Nenhum endereço público válido para ${hostname}.`));
      return;
    }
    if (options?.all) {
      callback(null, usable);
      return;
    }
    const [first] = usable;
    callback(null, first.address, first.family);
  };
}

function decoderFor(encoding) {
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip();
  if (encoding === 'deflate') return zlib.createUnzip();
  if (encoding === 'br') return zlib.createBrotliDecompress();
  return null;
}

function decodeBody(response) {
  const raw = String(response.headers['content-encoding'] || '').toLowerCase();
  const encodings = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && item !== 'identity');
  if (!encodings.length) return { stream: response, decoded: false };
  const decoders = encodings.reverse().map(decoderFor);
  if (decoders.some((decoder) => !decoder)) return { stream: response, decoded: false };
  let stream = response;
  for (const decoder of decoders) stream = stream.pipe(decoder);
  return { stream, decoded: true };
}

/**
 * Requisição HTTP(S) conectando exclusivamente aos endereços informados.
 * Devolve um `Response` compatível com fetch (inclui descompressão gzip/br).
 */
export function requestPinned(target, options = {}, addresses = []) {
  const url = target instanceof URL ? target : new URL(target);
  const transport = url.protocol === 'https:' ? https : http;
  const method = String(options.method || 'GET').toUpperCase();
  const headers =
    options.headers instanceof Headers
      ? Object.fromEntries(options.headers)
      : { ...(options.headers || {}) };
  const body = options.body;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method,
        headers,
        lookup: pinnedLookup(addresses),
        signal: options.signal,
        // Sem pool de sockets: cada requisição refaz o lookup fixado, então um
        // socket antigo nunca é reutilizado para outro destino.
        agent: false,
      },
      (response) => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value == null) continue;
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(key, String(item));
          } else {
            responseHeaders.set(key, String(value));
          }
        }

        const status = response.statusCode || 502;
        const noBody = method === 'HEAD' || status === 204 || status === 304;
        let stream = null;
        if (!noBody) {
          const decoded = decodeBody(response);
          if (decoded.decoded) {
            responseHeaders.delete('content-encoding');
            responseHeaders.delete('content-length');
          }
          stream = Readable.toWeb(decoded.stream);
        } else {
          response.resume();
        }

        let result;
        try {
          result = new Response(stream, {
            status,
            statusText: response.statusMessage || '',
            headers: responseHeaders,
          });
        } catch (error) {
          response.resume();
          reject(error);
          return;
        }
        resolve(result);
      },
    );

    request.on('error', reject);
    if (body != null) {
      if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
        request.write(body);
      } else if (body && typeof body.pipe === 'function') {
        body.pipe(request);
        return;
      } else {
        request.write(String(body));
      }
    }
    request.end();
  });
}

/**
 * Segue redirects revalidando cada destino. Exportado para testes com uma
 * função de requisição falsa; o uso normal é `safeFetch`.
 */
export async function followSafeRedirects(raw, options, request, hops = 0) {
  const { url, addresses } = await resolvePublicHttpUrl(raw);
  const response = await request(url, options, addresses);
  const location = response.headers.get('location');
  if ([301, 302, 303, 307, 308].includes(response.status) && location) {
    await response.body?.cancel().catch(() => {});
    if (hops >= MAX_REDIRECTS) throw new Error('O link redireciona vezes demais.');
    const method = String(options.method || 'GET').toUpperCase();
    const next = { ...options };
    if (
      response.status === 303 ||
      ([301, 302].includes(response.status) && method !== 'GET' && method !== 'HEAD')
    ) {
      next.method = 'GET';
      delete next.body;
    }
    return followSafeRedirects(new URL(location, url).href, next, request, hops + 1);
  }
  return response;
}

export function safeFetch(url, options = {}) {
  return followSafeRedirects(url, options, requestPinned);
}

export async function readLimited(response, limit = MAX_DEFAULT_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error('O conteúdo é grande demais para importar.');
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new Error('O conteúdo é grande demais para importar.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
