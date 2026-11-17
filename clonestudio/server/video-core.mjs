const AD_HOST_PATTERNS = [
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)googlesyndication\.com$/i,
  /(^|\.)googleadservices\.com$/i,
  /(^|\.)googleads\.g\.doubleclick\.net$/i,
  /(^|\.)recaptcha\.net$/i,
  /(^|\.)adservice\.google\.com$/i,
];

const VIDEO_FILE_PATTERN = /\.(mp4|webm|ogv|ogg|mov|m4v|m3u8|mpd)(\?|#|$)/i;

export const MAX_VIDEOS = 24;

function safeUrl(value, baseUrl = '') {
  const raw = String(value || '').trim();
  if (!raw || /^data:|^blob:|^javascript:/i.test(raw)) return '';
  try {
    return new URL(raw, baseUrl || undefined).href;
  } catch {
    return '';
  }
}

function onlyHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function unescapeHtml(value) {
  return String(value || '')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/g, '/');
}

function hostOf(url) {
  return url.hostname.replace(/^www\./i, '').toLowerCase();
}

function isAdHost(host) {
  return AD_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function cleanText(value, limit = 140) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

/**
 * Converte uma URL de vídeo (YouTube, Vimeo, Dailymotion ou arquivo direto)
 * em um objeto com a URL original e a URL pronta para embed.
 * Retorna null para links que não são vídeo (canais, anúncios, páginas comuns).
 */
export function parseVideoUrl(value, baseUrl = '') {
  const absolute = safeUrl(unescapeHtml(value), baseUrl);
  if (!absolute || !/^https?:\/\//i.test(absolute)) return null;

  let url;
  try {
    url = new URL(absolute);
  } catch {
    return null;
  }

  const host = hostOf(url);
  if (isAdHost(host)) return null;

  const path = url.pathname;

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    let id = '';
    if (path === '/watch') id = url.searchParams.get('v') || '';
    else {
      const match = path.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{6,})/);
      if (match) id = match[1];
    }
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return {
        provider: 'youtube',
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube.com/embed/${id}?rel=0`,
        poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        title: '',
      };
    }
    return null;
  }

  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (/^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return {
        provider: 'youtube',
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube.com/embed/${id}?rel=0`,
        poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        title: '',
      };
    }
    return null;
  }

  if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
    const match = path.match(/^\/embed\/([A-Za-z0-9_-]{6,})/);
    if (match) {
      return {
        provider: 'youtube',
        id: match[1],
        url: `https://www.youtube.com/watch?v=${match[1]}`,
        embedUrl: `https://www.youtube.com/embed/${match[1]}?rel=0`,
        poster: `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`,
        title: '',
      };
    }
    return null;
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = path.match(/(\d{6,})/);
    if (match) {
      return {
        provider: 'vimeo',
        id: match[1],
        url: `https://vimeo.com/${match[1]}`,
        embedUrl: `https://player.vimeo.com/video/${match[1]}`,
        poster: '',
        title: '',
      };
    }
    return null;
  }

  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const match = path.match(/\/(?:video|embed\/video)\/([A-Za-z0-9]+)/) || path.match(/^\/([A-Za-z0-9]{5,})/);
    if (match) {
      return {
        provider: 'dailymotion',
        id: match[1],
        url: `https://www.dailymotion.com/video/${match[1]}`,
        embedUrl: `https://www.dailymotion.com/embed/video/${match[1]}`,
        poster: '',
        title: '',
      };
    }
    return null;
  }

  if (VIDEO_FILE_PATTERN.test(path)) {
    const isHls = /\.m3u8(\?|#|$)/i.test(path);
    const isDash = /\.mpd(\?|#|$)/i.test(path);
    return {
      provider: isHls ? 'hls' : isDash ? 'dash' : 'file',
      id: '',
      url: absolute,
      embedUrl: '',
      poster: '',
      title: '',
    };
  }

  return null;
}

export function cleanVideoTitle(value) {
  return cleanText(value, 160)
    .replace(/\s*[·|]\s*[^·|]{2,80}$/u, '')
    .replace(/\s*\((?:19|20)\d{2}\)\s*:\s*.*$/u, '')
    .replace(/\s*:\s*(?:onde assistir|assistir|ver|watch|trailer).*$/iu, '')
    .replace(/\s*\((?:19|20)\d{2}\)\s*$/u, '')
    .replace(/\s*[-–—]\s*(?:trailer|teaser|oficial|official).*$/iu, '')
    .trim();
}

/**
 * Normaliza e remove duplicatas de uma lista de vídeos.
 * Aceita strings ou objetos { url, embedUrl, title, poster, pageUrl }.
 */
export function normalizeVideoList(videos = [], options = {}) {
  const limit = Number(options.limit || MAX_VIDEOS);
  const seen = new Set();
  const output = [];

  for (const item of videos) {
    if (!item) continue;
    const source = typeof item === 'string' ? { url: item } : item;
    const parsed = parseVideoUrl(
      source.url || source.src || source.embedUrl || source.contentUrl,
      source.baseUrl || source.pageUrl || '',
    );
    if (!parsed) continue;

    const key = parsed.id ? `${parsed.provider}:${parsed.id}` : parsed.url;
    if (seen.has(key)) continue;
    seen.add(key);

    output.push({
      provider: parsed.provider,
      id: parsed.id,
      url: parsed.url,
      embedUrl: parsed.embedUrl,
      poster: onlyHttpUrl(parsed.poster || source.poster || source.thumbnail),
      title: cleanVideoTitle(source.title || source.label || parsed.title),
      pageUrl: onlyHttpUrl(source.pageUrl || source.page || ''),
    });
    if (output.length >= limit) break;
  }

  return output;
}

function metaContent(html, keys) {
  for (const key of keys) {
    const pattern = new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      'i',
    );
    const match = html.match(pattern);
    if (match) return unescapeHtml(match[1]).trim();
    const reversed = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`,
      'i',
    );
    const match2 = html.match(reversed);
    if (match2) return unescapeHtml(match2[1]).trim();
  }
  return '';
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? unescapeHtml(match[1]).trim() : '';
}

/**
 * Extrai vídeos de um HTML bruto, inclusive de payloads de SPA/Next.js
 * (ex.: "trailerUrl":"https://www.youtube.com/watch?v=...") e JSON-LD.
 */
export function extractVideosFromHtml(html, baseUrl = '', limit = MAX_VIDEOS) {
  const source = String(html || '');
  const decoded = unescapeHtml(source);
  const candidates = [];
  const pageTitle = cleanVideoTitle(
    metaContent(decoded, ['og:title', 'twitter:title', 'title']) || '',
  );
  const pagePoster = metaContent(decoded, ['og:image', 'twitter:image']);
  const push = (url, title = '', poster = '') => {
    if (!url) return;
    candidates.push({ url, title: title || pageTitle, poster: poster || pagePoster });
  };

  for (const key of ['og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player', 'twitter:player:stream']) {
    const value = metaContent(decoded, [key]);
    if (value) push(value);
  }

  for (const match of decoded.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>/gi)) {
    const tag = match[0];
    const poster = attribute(tag, 'poster');
    const title = attribute(tag, 'title') || attribute(tag, 'aria-label');
    const direct = attribute(tag, 'src') || attribute(tag, 'data-src') || attribute(tag, 'data-video');
    if (direct) push(direct, title, poster);
    for (const sourceMatch of match[1].matchAll(/<source\b[^>]*>/gi)) {
      const src = attribute(sourceMatch[0], 'src');
      if (src) push(src, title, poster);
    }
  }

  for (const match of decoded.matchAll(/<(?:iframe|embed)\b[^>]*>/gi)) {
    const tag = match[0];
    const src = attribute(tag, 'src') || attribute(tag, 'data-src');
    const title = attribute(tag, 'title') || attribute(tag, 'aria-label');
    if (src) push(src, title);
  }

  for (const match of decoded.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(match[1], 'href');
    const label = unescapeHtml(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (href) push(href, label);
  }

  // JSON-LD: VideoObject/trailer com name e thumbnailUrl.
  // Roda antes das URLs soltas para o título estruturado não ser sobrescrito.
  for (const match of decoded.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const item of node) walk(item);
          return;
        }
        const type = String(node['@type'] || '').toLowerCase();
        if (type.includes('videoobject') || node.trailer) {
          const url = node.contentUrl || node.embedUrl || node.url || node.trailer?.url || node.trailer?.embedUrl;
          if (url) push(url, node.name || node.trailer?.name || '', node.thumbnailUrl || '');
        }
        for (const value of Object.values(node)) walk(value);
      };
      walk(JSON.parse(match[1]));
    } catch {
      // JSON-LD inválido: ignora
    }
  }

  // URLs soltas em scripts/JSON (inclui trailerUrl do Next.js).
  for (const match of decoded.matchAll(/https?:\/\/[^\s"'\\<>]+/g)) {
    const url = match[0].replace(/[),.;]+$/g, '');
    if (!/youtube|youtu\.be|vimeo|dailymotion|dai\.ly|\.mp4|\.webm|\.m3u8|\.mpd|\.ogv|\.mov/i.test(url)) {
      continue;
    }
    push(url);
  }

  return normalizeVideoList(candidates, { limit });
}
