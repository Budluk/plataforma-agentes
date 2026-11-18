import { extractPage } from './importer.mjs';
import { assertPublicHttpUrl, readLimited, safeFetch } from './net-safety.mjs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CloneStudioBot/0.2';
const PAGE_TIMEOUT_MS = 20_000;
const OEMBED_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_500_000;
const MAX_OEMBED_BYTES = 512_000;
const MAX_TEXT = 4000;
const MAX_LINKS = 12;
const MAX_HASHTAGS = 12;

export const PLATFORMS = {
  youtube: { label: 'YouTube', format: 'vídeos longos e Shorts' },
  tiktok: { label: 'TikTok', format: 'vídeos curtos' },
  instagram: { label: 'Instagram', format: 'feed, Reels e Stories' },
  facebook: { label: 'Facebook', format: 'página, posts e vídeos' },
};

const BLOCKED_LINK_HOSTS =
  /(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.com|google\.com|gstatic\.com|doubleclick\.net|schema\.org|w3\.org)/i;

const THEMES = [
  { label: 'fitness e saúde', words: ['fitness', 'treino', 'academia', 'musculacao', 'workout', 'emagrec', 'saude', 'hipertrofia', 'exercicio'] },
  { label: 'receitas e gastronomia', words: ['receita', 'culinaria', 'comida', 'chef', 'cozinha', 'gastronomia', 'confeitaria'] },
  { label: 'beleza e moda', words: ['beleza', 'maquiagem', 'skincare', 'cabelo', 'moda', 'estilo', 'makeup'] },
  { label: 'games', words: ['game', 'gaming', 'jogos', 'gameplay', 'minecraft', 'free fire', 'valorant', 'fortnite', 'roblox'] },
  { label: 'finanças e negócios', words: ['financa', 'investimento', 'dinheiro', 'renda', 'economia', 'negocio', 'empreend'] },
  { label: 'viagem e turismo', words: ['viagem', 'turismo', 'destino', 'viajar', 'mochilao'] },
  { label: 'humor', words: ['humor', 'comedia', 'piada', 'meme', 'engracad'] },
  { label: 'tecnologia', words: ['tecnologia', 'tech', 'programacao', 'software', 'inteligencia artificial', ' ia ', 'dev'] },
  { label: 'educação', words: ['aula', 'curso', 'aprenda', 'educacao', 'estudo', 'professor', 'ensino'] },
  { label: 'música', words: ['musica', 'som', 'beat', 'cantor', 'dj', 'banda'] },
  { label: 'esporte', words: ['futebol', 'esporte', 'time', 'campeonato', 'basquete', 'surfe'] },
  { label: 'pets e animais', words: ['pet', 'cachorro', 'gato', 'animal', 'veterinari'] },
  { label: 'lifestyle e rotina', words: ['lifestyle', 'rotina', 'vlog', 'dia a dia', 'organizacao', 'produtividade'] },
  { label: 'arte e design', words: ['arte', 'desenho', 'ilustracao', 'design', 'pintura', 'arquitetura'] },
];

function decodeJsonEscapes(text) {
  return String(text || '')
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/');
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return decodeJsonEscapes(match[1]).trim();
  }
  return '';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function parseCount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const match = text.match(
    /(\d[\d.,]*\d|\d)\s*(milhões|milhão|milhoes|milhao|mil|mi|bi|m|b|k)?/i,
  );
  if (!match) return null;
  const raw = match[1].replace(/[.,]+$/, '');
  const suffix = (match[2] || '').toLowerCase();
  let number;
  if (suffix) {
    const factor = {
      k: 1e3,
      mil: 1e3,
      m: 1e6,
      mi: 1e6,
      milhão: 1e6,
      milhao: 1e6,
      milhões: 1e6,
      milhoes: 1e6,
      b: 1e9,
      bi: 1e9,
    }[suffix];
    number = Number(raw.replace(',', '.')) * factor;
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
    number = Number(raw.replace(/[.,]/g, ''));
  } else {
    number = Number(raw.replace(',', '.'));
  }
  return Number.isFinite(number) ? Math.round(number) : null;
}

export function formatNumber(value) {
  if (value == null || !Number.isFinite(value)) return 'não informado';
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function detectPlatform(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/i.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'youtube';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'facebook.com' || host === 'fb.com' || host === 'm.facebook.com') return 'facebook';
  return null;
}

export function isInspirationUrl(raw) {
  return Boolean(detectPlatform(raw));
}

export function collectHashtags(text, limit = MAX_HASHTAGS) {
  const tags = [];
  for (const match of String(text || '').matchAll(/#([\p{L}\p{N}_]{2,40})/gu)) {
    const tag = `#${match[1]}`;
    if (/^#[0-9a-f]{3,8}$/i.test(tag) || /^#\d+$/.test(tag)) continue;
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length >= limit) break;
  }
  return tags;
}

function handleFromUrl(raw) {
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';
    if (url.hostname.includes('youtube')) {
      if (parts[0].startsWith('@')) return parts[0].slice(0, 80);
      if (parts[0] === 'channel' || parts[0] === 'c') return (parts[1] || '').slice(0, 80);
      return '';
    }
    if (url.hostname.includes('facebook') || url.hostname.includes('fb.com')) return '';
    return (parts[0].startsWith('@') ? parts[0] : `@${parts[0]}`).slice(0, 80);
  } catch {
    return '';
  }
}

function pickLinks(page) {
  const links = Array.isArray(page.links) ? page.links : [];
  const seen = new Set();
  const result = [];
  for (const link of links) {
    const href = String(link.href || '');
    if (!/^https?:\/\//i.test(href)) continue;
    if (BLOCKED_LINK_HOSTS.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    result.push({ label: String(link.label || '').slice(0, 60), href: href.slice(0, 500) });
    if (result.length >= MAX_LINKS) break;
  }
  return result;
}

function baseReport(platform, url, page, extra = {}) {
  const limitations = [...(extra.limitations || [])];
  const title = String(extra.title || page.title || '').slice(0, 160);
  const description = String(extra.description || page.description || '').slice(0, 600);
  if (!page.title && !page.description) {
    limitations.push('A página não expôs título nem descrição públicos.');
  }
  return {
    platform,
    platformLabel: PLATFORMS[platform].label,
    url,
    title,
    description,
    handle: String(extra.handle || '').slice(0, 80),
    avatar: String(extra.avatar || page.images?.[0]?.src || '').slice(0, 500),
    metrics: {
      followers: null,
      following: null,
      posts: null,
      totalViews: null,
      totalLikes: null,
      totalComments: null,
      ...extra.metrics,
    },
    hashtags: collectHashtags(`${title} ${description}`),
    links: pickLinks(page),
    limitations,
    fetchedAt: new Date().toISOString(),
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function youtubeChannelMetadata(html) {
  const start = String(html).indexOf('"channelMetadataRenderer":{');
  if (start < 0) return {};
  const slice = String(html).slice(start, start + 12_000);
  return {
    title: firstMatch(slice, [/"title":"((?:[^"\\]|\\.)*)"/]),
    description: firstMatch(slice, [/"description":"((?:[^"\\]|\\.)*)"/]),
    externalId: firstMatch(slice, [/"externalId":"([A-Za-z0-9_-]+)"/]),
    ownerUrl: firstMatch(slice, [/"ownerUrls":\["([^"]+)"/]),
    avatar: firstMatch(slice, [/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/]),
  };
}

export function parseYoutubePage(html, url) {
  const page = extractPage(html, url);
  const meta = youtubeChannelMetadata(html);
  const handle = (meta.ownerUrl ? handleFromUrl(meta.ownerUrl) : '') || handleFromUrl(url);
  const limitations = [];
  let subscribers = '';
  if (handle) {
    const escaped = escapeRegExp(handle);
    subscribers = firstMatch(html, [
      new RegExp(
        `${escaped}[^•]{0,80}•[^0-9]{0,24}([\\d.,]+\\s*(?:milhões|milhão|milhoes|milhao|mil|mi|bi|m|b|k)?)\\s*(?:de\\s*)?(?:inscritos|subscribers)`,
        'i',
      ),
      new RegExp(
        `${escaped}[^0-9]{0,60}([\\d.,]+\\s*(?:milhões|milhão|milhoes|milhao|mil|mi|bi|m|b|k)?)\\s*(?:de\\s*)?(?:inscritos|subscribers)`,
        'i',
      ),
    ]);
  }
  if (!parseCount(subscribers)) {
    limitations.push(
      'YouTube não expôs o número de inscritos publicamente nesta página; a análise usa título, descrição e palavras-chave.',
    );
  }
  limitations.push(
    'A contagem de vídeos e o total de visualizações do canal não aparecem na página inicial pública.',
  );
  return baseReport('youtube', url, page, {
    title: meta.title || page.title,
    description: meta.description || page.description,
    handle,
    avatar: meta.avatar,
    limitations,
    metrics: {
      followers: parseCount(subscribers),
      posts: null,
      totalViews: null,
      totalLikes: null,
      totalComments: null,
    },
  });
}

export function parseTiktokPage(html, url) {
  const page = extractPage(html, url);
  const urlHandle = handleFromUrl(url).replace(/^@/, '');
  const source = String(html);
  let scope = source;
  if (urlHandle) {
    const index = source.indexOf(`"uniqueId":"${urlHandle}"`);
    scope = index >= 0 ? source.slice(index, index + 15_000) : '';
  }
  const limitations = [];
  if (!scope) {
    limitations.push(
      'TikTok não expôs os dados públicos deste perfil (login ou bloqueio); a análise usa apenas a página.',
    );
  }
  const nickname = firstMatch(scope, [/"nickname":"((?:[^"\\]|\\.)*)"/]);
  const signature = firstMatch(scope, [/"signature":"((?:[^"\\]|\\.)*)"/]);
  const handle = firstMatch(scope, [/"uniqueId":"([^"]+)"/]) || urlHandle;
  const followers = firstMatch(scope, [/"followerCount":(\d+)/]);
  const following = firstMatch(scope, [/"followingCount":(\d+)/]);
  const likes = firstMatch(scope, [/"heartCount":(\d+)/]);
  const videos = firstMatch(scope, [/"videoCount":(\d+)/]);
  if (!parseCount(followers)) {
    limitations.push('TikTok não expôs o número de seguidores publicamente.');
  }
  return baseReport('tiktok', url, page, {
    title: nickname || page.title,
    description: signature || page.description,
    handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '',
    limitations,
    metrics: {
      followers: parseCount(followers),
      following: parseCount(following),
      posts: parseCount(videos),
      totalLikes: parseCount(likes),
    },
  });
}

function parseFollowerLine(text, labels) {
  const normalized = String(text || '');
  for (const label of labels) {
    const match = normalized.match(
      new RegExp(`([\\d.,]+\\s*(?:mil|mi|bi|k|m|b)?)\\s+${label}`, 'i'),
    );
    if (match) return match[1];
  }
  return '';
}

export function parseInstagramPage(html, url) {
  const page = extractPage(html, url);
  const text = `${page.title} ${page.description}`;
  const followers =
    parseFollowerLine(text, ['followers?', 'seguidores?']) ||
    firstMatch(html, [/"edge_followed_by":\{"count":(\d+)\}/]);
  const following =
    parseFollowerLine(text, ['following', 'seguindo']) ||
    firstMatch(html, [/"edge_follow":\{"count":(\d+)\}/]);
  const posts =
    parseFollowerLine(text, ['posts?', 'publica(?:ç|c)(?:õ|o)es']) ||
    firstMatch(html, [/"edge_owner_to_timeline_media":\{"count":(\d+)\}/]);
  const handle = firstMatch(text, [/\(@([a-z0-9_.]+)\)/i]) || handleFromUrl(url);
  const limitations = [];
  if (!parseCount(followers)) {
    limitations.push(
      'Instagram não expôs seguidores publicamente (login ou bloqueio); a análise usa apenas título e descrição.',
    );
  }
  return baseReport('instagram', url, page, {
    handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '',
    limitations,
    metrics: {
      followers: parseCount(followers),
      following: parseCount(following),
      posts: parseCount(posts),
    },
  });
}

export function parseFacebookPage(html, url) {
  const page = extractPage(html, url);
  const text = `${page.title} ${page.description}`;
  const followers =
    parseFollowerLine(text, ['followers?', 'seguidores?']) ||
    firstMatch(html, [/"follower_count":(\d+)/]);
  const likes =
    parseFollowerLine(text, ['likes?', 'curtidas?']) ||
    firstMatch(html, [/"fan_count":(\d+)/]);
  const limitations = [];
  if (!parseCount(followers) && !parseCount(likes)) {
    limitations.push(
      'Facebook não expôs seguidores ou curtidas publicamente (login ou bloqueio); a análise usa apenas título e descrição.',
    );
  }
  return baseReport('facebook', url, page, {
    limitations,
    metrics: {
      followers: parseCount(followers),
      totalLikes: parseCount(likes),
    },
  });
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function computeEngagement(metrics) {
  const likes = metrics.totalLikes;
  const comments = metrics.totalComments;
  if (likes == null && comments == null) return null;
  const interactions = (likes || 0) + (comments || 0);
  if (metrics.followers) return round2((interactions / metrics.followers) * 100);
  if (metrics.totalViews) return round2((interactions / metrics.totalViews) * 100);
  return null;
}

export function detectThemes(text) {
  const lower = normalizeText(text);
  return THEMES.filter((theme) => theme.words.some((word) => lower.includes(word)))
    .map((theme) => theme.label)
    .slice(0, 6);
}

function audienceProfile(metrics, engagement, themes) {
  const followers = metrics.followers;
  const size =
    followers == null
      ? 'desconhecido'
      : followers < 10_000
        ? 'nicho'
        : followers < 100_000
          ? 'pequeno'
          : followers < 1_000_000
            ? 'médio'
            : 'grande';
  const labels = {
    nicho: 'nicho (até 10 mil)',
    pequeno: 'pequeno (10 mil a 100 mil)',
    médio: 'médio (100 mil a 1 mi)',
    grande: 'grande (1 mi+)',
    desconhecido: 'desconhecido',
  };
  const parts = [];
  if (followers != null) parts.push(`${formatNumber(followers)} seguidores/inscritos`);
  if (engagement != null) parts.push(`engajamento público de ${engagement}%`);
  if (themes.length) parts.push(`temas: ${themes.join(', ')}`);
  return {
    size,
    sizeLabel: labels[size],
    summary: parts.length
      ? `Público estimado: ${parts.join('; ')}.`
      : 'Sem métricas públicas suficientes; análise baseada no título, descrição e hashtags.',
    signals: [
      followers != null ? `seguidores/inscritos: ${formatNumber(followers)}` : '',
      engagement != null ? `engajamento: ${engagement}%` : '',
      themes.length ? `temas: ${themes.join(', ')}` : '',
    ].filter(Boolean),
  };
}

function reachProfile(metrics) {
  const followers = metrics.followers || 0;
  const views = metrics.totalViews || 0;
  const level =
    followers >= 1_000_000 || views >= 10_000_000
      ? 'alto'
      : followers >= 100_000 || views >= 1_000_000
        ? 'médio'
        : followers > 0 || views > 0
          ? 'inicial'
          : 'desconhecido';
  const parts = [];
  if (followers) parts.push(`${formatNumber(followers)} seguidores/inscritos`);
  if (views) parts.push(`${formatNumber(views)} visualizações`);
  return {
    level,
    summary: parts.length
      ? `Alcance público estimado: ${parts.join(' e ')}.`
      : 'Alcance público não informado pela plataforma.',
    publicMetrics: {
      followers: metrics.followers ?? null,
      totalViews: metrics.totalViews ?? null,
      totalLikes: metrics.totalLikes ?? null,
      totalComments: metrics.totalComments ?? null,
    },
  };
}

export function analyzeInspiration(report) {
  const metrics = { ...(report.metrics || {}) };
  const themes = detectThemes(
    `${report.title || ''} ${report.description || ''} ${(report.hashtags || []).join(' ')}`,
  );
  const engagementRate = computeEngagement(metrics);
  const limitations = [...(report.limitations || [])];
  if (metrics.followers == null) {
    limitations.push('Seguidores/inscritos não estão públicos nesta página.');
  }
  if (metrics.totalViews == null) {
    limitations.push('Visualizações não estão públicas nesta página.');
  }
  if (report.platform === 'instagram' || report.platform === 'facebook') {
    limitations.push(
      'Alcance real, impressões e dados demográficos são privados; use as métricas públicas como proxy.',
    );
  }
  const uniqueLimitations = [...new Set(limitations)].slice(0, 8);
  return {
    ...report,
    metrics: { ...metrics, engagementRate },
    audience: audienceProfile(metrics, engagementRate, themes),
    reach: reachProfile(metrics),
    content: {
      themes: themes.length ? themes : ['conteúdo geral'],
      format: PLATFORMS[report.platform]?.format || 'conteúdo social',
      hashtags: report.hashtags || [],
      pillars: themes.length ? themes : ['conteúdo geral'],
    },
    limitations: uniqueLimitations,
  };
}

export function inspirationReportText(report) {
  const metrics = report.metrics || {};
  const lines = [
    `Plataforma: ${report.platformLabel || report.platform}`,
    `Página: ${report.url}`,
    report.handle ? `Perfil: ${report.handle}` : '',
    report.title ? `Título: ${report.title}` : '',
    report.description ? `Descrição: ${report.description}` : '',
    `Público estimado: ${report.audience?.sizeLabel || 'desconhecido'}. ${report.audience?.summary || ''}`,
    `Alcance público: ${report.reach?.level || 'desconhecido'}. ${report.reach?.summary || ''}`,
    `Temas: ${(report.content?.themes || []).join(', ') || 'não identificados'}`,
    `Formato: ${report.content?.format || 'não informado'}`,
    `Hashtags: ${(report.hashtags || []).join(' ') || 'não informadas'}`,
    `Métricas públicas: seguidores=${formatNumber(metrics.followers)}; publicações=${formatNumber(metrics.posts)}; views=${formatNumber(metrics.totalViews)}; curtidas=${formatNumber(metrics.totalLikes)}; comentários=${formatNumber(metrics.totalComments)}; engajamento=${metrics.engagementRate == null ? 'não informado' : `${metrics.engagementRate}%`}.`,
    `Limitações: ${(report.limitations || []).join(' ') || 'nenhuma'}`,
  ];
  return lines.filter(Boolean).join('\n').slice(0, MAX_TEXT);
}

export function buildInspirationReference(report) {
  return {
    kind: 'inspiration',
    platform: report.platform,
    url: report.url,
    title: report.title,
    description: report.description,
    headings: report.content?.pillars || [],
    colors: [],
    textColors: [],
    fonts: [],
    images: [],
    links: report.links || [],
    videos: [],
    text: inspirationReportText(report),
    rendered: false,
    fetchedAt: report.fetchedAt,
  };
}

export function inspirationPrompt(report, userPrompt = '') {
  const custom = String(userPrompt || '').trim();
  const theme = (report.content?.themes || []).find(
    (item) => item && item !== 'conteúdo geral',
  );
  const idea =
    custom ||
    `Crie um app original inspirado na proposta de uma página de ${report.platformLabel}${
      theme ? ` sobre ${theme}` : ''
    }.`;
  return `${idea}\n\nUse a análise de inspiração como referência de posicionamento, público e estrutura. Crie nome, textos, identidade visual e mídia originais. Não copie marca, logo, textos literais, vídeos, fotos ou áudio do canal.`.slice(
    0,
    6000,
  );
}

async function fetchHtml(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`A página respondeu HTTP ${response.status}.`);
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      throw new Error('O link não devolveu uma página HTML.');
    }
    const buffer = await readLimited(response, MAX_HTML_BYTES);
    return buffer.toString('utf8');
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        `A página demorou mais de ${Math.round(PAGE_TIMEOUT_MS / 1000)}s para responder.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOembed(rawUrl, platform, fetchImpl) {
  const endpoint =
    platform === 'youtube'
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`
      : platform === 'tiktok'
        ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`
        : '';
  if (!endpoint) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    });
    if (!response.ok) return null;
    const buffer = await readLimited(response, MAX_OEMBED_BYTES);
    const data = JSON.parse(buffer.toString('utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchInspiration(rawUrl, { fetchImpl = safeFetch } = {}) {
  const url = assertPublicHttpUrl(rawUrl);
  const platform = detectPlatform(url.href);
  if (!platform) {
    throw new Error('Link não reconhecido. Use uma página do YouTube, TikTok, Instagram ou Facebook.');
  }
  const html = await fetchHtml(url.href, fetchImpl);
  let report;
  if (platform === 'youtube') report = parseYoutubePage(html, url.href);
  else if (platform === 'tiktok') report = parseTiktokPage(html, url.href);
  else if (platform === 'instagram') report = parseInstagramPage(html, url.href);
  else report = parseFacebookPage(html, url.href);

  const oembed = await fetchOembed(url.href, platform, fetchImpl);
  if (oembed) {
    if (!report.title && oembed.title) report.title = String(oembed.title).slice(0, 160);
    if (!report.handle && oembed.author_name) {
      report.handle = String(oembed.author_name).slice(0, 80);
    }
    if (!report.description && oembed.author_url) {
      report.description = `Perfil: ${String(oembed.author_url).slice(0, 300)}`;
    }
  }
  return analyzeInspiration(report);
}
