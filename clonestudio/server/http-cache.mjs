export function weakEtag(stat) {
  if (!stat) return null;
  return `W/"${Number(stat.size).toString(16)}-${Math.floor(Number(stat.mtimeMs)).toString(16)}"`;
}

export function isNotModified(req, etag) {
  const header = req?.headers?.['if-none-match'];
  if (!header || !etag) return false;
  return String(header)
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === etag || value === '*');
}

export function staticCacheControl(relativePath) {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  // Arquivos gerados pelo Vite em assets/ têm hash no nome e podem ser
  // cacheados para sempre: um novo build gera nomes diferentes.
  return normalized.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}
