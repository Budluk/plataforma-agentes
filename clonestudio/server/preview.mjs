import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { distDir, getProject } from './storage.mjs';
import { isNotModified, staticCacheControl, weakEtag } from './http-cache.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

// `unsafe-eval` nao e necessario para o build de producao do Vite. Mantido
// como escape hatch apenas para apps antigos que dependam de `new Function`.
const PREVIEW_ALLOW_EVAL = process.env.PREVIEW_ALLOW_UNSAFE_EVAL === '1';

export const PREVIEW_CSP = [
  "default-src 'self' data: blob: https: http:",
  ['script-src', "'self'", "'unsafe-inline'", 'blob:', ...(PREVIEW_ALLOW_EVAL ? ["'unsafe-eval'"] : [])].join(' '),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: https:",
  "media-src 'self' data: blob: https: http:",
  "worker-src 'self' blob: data:",
  "frame-src 'self' https: http: blob:",
  "connect-src 'self' https: http: ws: wss:",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
].join('; ');

function previewHandler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Método não permitido');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://preview.local').pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Requisição inválida');
    return;
  }

  const match = pathname.match(/^\/preview\/([a-f0-9-]{36})(?:\/(.*))?$/i);
  if (!match) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Preview não encontrado');
    return;
  }

  const id = match[1];
  if (!getProject(id)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Projeto não encontrado');
    return;
  }

  if (req.url === `/preview/${id}` || req.url === `/preview/${id}/`) {
    if (req.url === `/preview/${id}`) {
      res.writeHead(301, { location: `/preview/${id}/` });
      res.end();
      return;
    }
  }

  const root = distDir(id);
  let relative = match[2] || '';
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado');
    return;
  }

  let file = resolved;
  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch {
    stat = null;
  }
  if (!stat?.isFile()) {
    const extension = path.extname(file);
    if (!extension) {
      file = path.join(root, 'index.html');
      try {
        stat = fs.statSync(file);
      } catch {
        stat = null;
      }
    }
  }

  if (!stat?.isFile()) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="font-family:system-ui;background:#0b1020;color:#e9eefb;padding:32px"><h1>Preview indisponível</h1><p>Este projeto ainda não tem um build pronto.</p></body></html>',
    );
    return;
  }

  const extension = path.extname(file).toLowerCase();
  const relativeFile = path.relative(root, file).replace(/\\/g, '/');
  const cacheControl = staticCacheControl(relativeFile);
  const etag = weakEtag(stat);
  if (isNotModified(req, etag)) {
    res.writeHead(304, { etag, 'cache-control': cacheControl });
    res.end();
    return;
  }
  const headers = {
    'content-type': MIME[extension] || 'application/octet-stream',
    'cache-control': cacheControl,
    etag,
    'content-length': stat.size,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': PREVIEW_CSP,
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    })
    .pipe(res);
}

export function startPreviewServer({ host = '127.0.0.1', port = 8788 } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(previewHandler);
    server.on('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
