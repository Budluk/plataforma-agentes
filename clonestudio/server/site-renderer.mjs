import { forceStopBrowser, launchBrowser, loadPlaywright } from './browser.mjs';
import { resolvePublicHttpUrl, safeFetch } from './net-safety.mjs';
import {
  cleanVideoTitle,
  extractVideosFromHtml,
  normalizeVideoList,
} from './video-core.mjs';

const MAX_TEXT = 12000;
const MAX_IMAGES = 30;
const MAX_LINKS = 30;
const MAX_VIDEOS = 24;
const MAX_DETAIL_PAGES = 8;
const DETAIL_FETCH_TIMEOUT_MS = 6000;
const DOM_EXTRACT_TIMEOUT_MS = 10_000;

const MOBILE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function clean(value, limit) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

/** Executa uma promise com timeout; rejeita com TimeoutError se exceder. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout de ${label} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function isRenderableImage(src) {
  const value = String(src || '').trim();
  if (!value) return false;
  if (/^data:/i.test(value)) return false;
  if (/^blob:/i.test(value)) return false;
  if (/\.svg(\?|#|$)/i.test(value)) return false;
  return /^https?:\/\//i.test(value);
}

export function normalizeImageList(images = []) {
  const seen = new Set();
  const output = [];
  for (const image of images) {
    if (typeof image === 'string') {
      if (!isRenderableImage(image) || seen.has(image)) continue;
      seen.add(image);
      output.push({ src: image, alt: '' });
      continue;
    }
    const src = String(image?.src || '').trim();
    if (!isRenderableImage(src) || seen.has(src)) continue;
    seen.add(src);
    output.push({ src, alt: clean(image?.alt, 120) });
    if (output.length >= MAX_IMAGES) break;
  }
  return output;
}

export function normalizeLinkList(links = []) {
  const seen = new Set();
  const output = [];
  for (const link of links) {
    const label = clean(link?.label, 60);
    const href = String(link?.href || '').trim();
    if (!label || !/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    output.push({ label, href });
    if (output.length >= MAX_LINKS) break;
  }
  return output;
}

/**
 * Função executada dentro do navegador: coleta vídeos de <video>, <source>,
 * iframes, links, metatags e JSON-LD. A normalização final fica no Node.
 */
function collectVideosInPage() {
  const absolute = (value) => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return '';
    }
  };
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const output = [];
  const push = (url, title = '', poster = '', pageUrl = '') => {
    const value = absolute(url);
    if (!value) return;
    output.push({
      url: value,
      title: clean(title).slice(0, 140),
      poster: absolute(poster),
      pageUrl,
    });
  };

  for (const video of document.querySelectorAll('video')) {
    const title = video.getAttribute('title') || video.getAttribute('aria-label') || '';
    const poster = video.getAttribute('poster') || '';
    push(video.currentSrc || video.getAttribute('src') || '', title, poster);
    for (const source of video.querySelectorAll('source')) {
      push(source.getAttribute('src') || '', title, poster);
    }
    for (const [key, value] of Object.entries(video.dataset || {})) {
      if (/video|src|url|trailer|stream/i.test(key) && /^https?:|^\//i.test(String(value))) {
        push(value, title, poster);
      }
    }
  }

  for (const frame of document.querySelectorAll('iframe')) {
    const src = frame.getAttribute('src') || frame.getAttribute('data-src') || '';
    if (!src) continue;
    push(src, frame.getAttribute('title') || frame.getAttribute('aria-label') || '');
  }

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') || '';
    if (!/youtube|youtu\.be|vimeo|dailymotion|dai\.ly|\.mp4|\.webm|\.m3u8|\.mpd/i.test(href)) {
      continue;
    }
    push(href, anchor.innerText || anchor.getAttribute('aria-label') || '');
  }

  for (const key of [
    'og:video',
    'og:video:url',
    'og:video:secure_url',
    'twitter:player',
    'twitter:player:stream',
  ]) {
    const element =
      document.querySelector(`meta[property="${key}"]`) || document.querySelector(`meta[name="${key}"]`);
    const content = element?.getAttribute('content') || '';
    if (content) push(content, '');
  }

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const item of node) walk(item);
          return;
        }
        const type = String(node['@type'] || '').toLowerCase();
        if (type.includes('videoobject') || node.trailer) {
          const url =
            node.contentUrl || node.embedUrl || node.url || node.trailer?.url || node.trailer?.embedUrl;
          if (url) push(url, node.name || node.trailer?.name || '', node.thumbnailUrl || '');
        }
        for (const value of Object.values(node)) walk(value);
      };
      walk(JSON.parse(script.textContent || ''));
    } catch {
      // JSON-LD inválido: ignora
    }
  }

  return output;
}

/**
 * Coleta links de fichas/detalhes na própria página (ex.: cards do acervo).
 * O título vem do alt da capa, para casar o trailer com o card certo.
 */
function collectDetailLinksInPage() {
  const absolute = (value) => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return '';
    }
  };
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const output = [];
  const seen = new Set();

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = absolute(anchor.getAttribute('href') || '');
    if (!href) continue;
    let url;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.origin !== location.origin) continue;
    if (
      !/\/(drama|dorama|titulo|title|serie|series|filme|filmes|movie|movies|anime|novel|watch|episode|episodio)\//i.test(
        url.pathname,
      )
    ) {
      continue;
    }
    if (seen.has(href)) continue;
    const image = anchor.querySelector('img[alt]');
    const title = clean(
      image?.getAttribute('alt') ||
        anchor.getAttribute('aria-label') ||
        anchor.getAttribute('title') ||
        '',
    );
    if (!title) continue;
    seen.add(href);
    output.push({ href, title: title.slice(0, 140) });
    if (output.length >= 30) break;
  }

  return output;
}

async function fetchDetailHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': MOBILE_UA,
      },
    });
    if (!response.ok) return '';
    const type = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) return '';
    const text = await response.text();
    return text.length > 2_000_000 ? text.slice(0, 2_000_000) : text;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Em páginas de listagem (acervo, catálogo), segue alguns cards e busca o
 * trailer na ficha de cada título. Isso dá vídeos reais para os cards do app.
 */
async function enrichVideosFromDetailPages(detailLinks, currentUrl) {
  const links = [];
  const seen = new Set([currentUrl]);
  for (const link of detailLinks || []) {
    if (!link?.href || seen.has(link.href)) continue;
    seen.add(link.href);
    links.push(link);
    if (links.length >= MAX_DETAIL_PAGES) break;
  }
  if (links.length === 0) return [];

  const results = [];
  let index = 0;
  async function worker() {
    while (index < links.length) {
      const link = links[index];
      index += 1;
      const html = await fetchDetailHtml(link.href, DETAIL_FETCH_TIMEOUT_MS);
      if (!html) continue;
      const videos = extractVideosFromHtml(html, link.href, 3);
      const fallbackTitle = cleanVideoTitle(link.title);
      for (const video of videos) {
        results.push({
          ...video,
          title: video.title || fallbackTitle,
          pageUrl: link.href,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, links.length) }, () => worker()));
  return results;
}

/**
 * Abre a página em um navegador real (Edge/Chrome já instalados) e extrai o DOM
 * renderizado: textos, títulos, imagens reais, links, cores e fontes.
 * Retorna null quando nenhum navegador está disponível, para o importador cair
 * no modo HTML estático.
 */
export async function renderSiteReference(rawUrl, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.IMPORT_SITE_TIMEOUT_MS || 25000);
  const playwright = await loadPlaywright();
  if (!playwright) return null;

  const launch = await launchBrowser(playwright);
  if (!launch.browser) {
    console.warn(
      `[renderer] Nenhum navegador disponível para renderizar o site: ${launch.attempts.join(' | ')}`,
    );
    return null;
  }

  const deadline = Date.now() + timeoutMs;
  let context = null;
  try {
    context = await launch.browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      ignoreHTTPSErrors: true,
      userAgent: MOBILE_UA,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(Math.max(5000, Math.min(20000, deadline - Date.now())));

    // Imagens/fontes/mídia não precisam ser baixadas: só queremos as URLs e o layout.
    // As demais requisições (inclusive navegação e scripts) só seguem para
    // destinos públicos resolvidos, reduzindo SSRF/rebinding no navegador.
    const allowedHosts = new Map();
    await page.route('**/*', async (route) => {
      const request = route.request();
      const type = request.resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        return route.abort().catch(() => {});
      }
      const target = request.url();
      try {
        const parsed = new URL(target);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return route.abort().catch(() => {});
        }
        const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
        if (!allowedHosts.has(host)) {
          await resolvePublicHttpUrl(parsed.href);
          allowedHosts.set(host, true);
        }
      } catch {
        return route.abort().catch(() => {});
      }
      return route.continue().catch(() => {});
    });

    await page.goto(rawUrl, {
      waitUntil: 'load',
      timeout: Math.max(8000, Math.min(25000, deadline - Date.now())),
    });
    await page
      .waitForLoadState('networkidle', {
        timeout: Math.max(2000, Math.min(8000, deadline - Date.now())),
      })
      .catch(() => {});

    // Rola a página para montar listas "lazy" antes de extrair.
    for (let step = 1; step <= 3; step += 1) {
      if (Date.now() > deadline) break;
      await page
        .evaluate((fraction) => {
          window.scrollTo(0, document.body.scrollHeight * fraction);
        }, step / 3)
        .catch(() => {});
      await page.waitForTimeout(350);
    }
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

    const data = await withTimeout(
      page.evaluate(() => {
        const absolute = (value) => {
        try {
          return new URL(value, location.href).href;
        } catch {
          return '';
        }
      };
      const meta = (keys) => {
        for (const key of keys) {
          const element =
            document.querySelector(`meta[property="${key}"]`) ||
            document.querySelector(`meta[name="${key}"]`);
          const content = element?.getAttribute('content')?.trim();
          if (content) return content;
        }
        return '';
      };
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const headings = [...document.querySelectorAll('h1, h2, h3')]
        .map((element) => (element.innerText || '').replace(/\s+/g, ' ').trim())
        .filter((value) => value && value.length <= 160)
        .slice(0, 30);
      const images = [...document.querySelectorAll('img')]
        .map((image) => {
          const srcset = (image.getAttribute('srcset') || '')
            .split(',')
            .map((part) => part.trim().split(/\s+/)[0])
            .filter(Boolean)
            .pop();
          const src =
            image.currentSrc ||
            image.getAttribute('src') ||
            image.dataset?.src ||
            image.dataset?.lazySrc ||
            srcset ||
            '';
          return {
            src: absolute(src),
            alt: image.getAttribute('alt') || '',
            width: image.naturalWidth || image.width || 0,
            height: image.naturalHeight || image.height || 0,
          };
        })
        .filter((image) => {
          if (!image.src) return false;
          // Imagens bloqueadas pelo render não têm naturalWidth: mantém pela URL.
          if (image.width > 0 && image.width < 40 && image.height > 0 && image.height < 40) {
            return false;
          }
          return true;
        })
        .slice(0, 60);
      const backgroundImages = [];
      for (const element of document.querySelectorAll('[style*="background"]')) {
        const style = element.getAttribute('style') || '';
        for (const match of style.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
          backgroundImages.push({ src: absolute(match[1]), alt: '', width: 120, height: 120 });
        }
      }
      const links = [...document.querySelectorAll('a[href]')]
        .map((link) => ({
          label: (link.innerText || link.getAttribute('aria-label') || '')
            .replace(/\s+/g, ' ')
            .trim(),
          href: link.href,
        }))
        .filter((link) => link.label && link.label.length <= 60);
      const colorCounts = new Map();
      const backgroundCounts = new Map();
      const textColorCounts = new Map();
      const fontCounts = new Map();
      const elements = [document.body, ...document.querySelectorAll('header, nav, main, section, article, aside, footer, button, a, h1, h2, h3')].slice(0, 400);
      for (const element of elements) {
        if (!element) continue;
        const style = getComputedStyle(element);
        for (const color of [style.backgroundColor, style.color]) {
          if (!color || /rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(color)) continue;
          colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        }
        if (style.backgroundColor && !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(style.backgroundColor)) {
          backgroundCounts.set(
            style.backgroundColor,
            (backgroundCounts.get(style.backgroundColor) || 0) + 1,
          );
        }
        if (style.color) {
          textColorCounts.set(style.color, (textColorCounts.get(style.color) || 0) + 1);
        }
        const font = (style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
        if (font) fontCounts.set(font, (fontCounts.get(font) || 0) + 1);
      }
      const top = (counts, limit) =>
        [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([value]) => value);
      return {
        title: meta(['og:title', 'twitter:title']) || document.title || '',
        description: meta(['og:description', 'twitter:description', 'description']),
        text,
        headings,
        images: [...images, ...backgroundImages],
        links,
        colors: top(backgroundCounts, 6).length
          ? top(backgroundCounts, 6)
          : top(colorCounts, 8),
        textColors: top(textColorCounts, 6),
        fonts: top(fontCounts, 4),
        finalUrl: location.href,
      };
    }),
    DOM_EXTRACT_TIMEOUT_MS,
    'extração DOM',
  );

  let pageVideos = await page.evaluate(collectVideosInPage).catch(() => []);
    const detailLinks = await page.evaluate(collectDetailLinksInPage).catch(() => []);
    const finalUrl = data.finalUrl || rawUrl;

    // Alguns sites só montam o player depois de clicar em "Trailer"/"Assistir".
    if (normalizeVideoList(pageVideos, { limit: MAX_VIDEOS }).length === 0) {
      const clicked = await page
        .evaluate(() => {
          const labels = /^(trailer|ver trailer|assistir|assistir agora|play|vídeo|video)$/i;
          const targets = [...document.querySelectorAll('button, [role="button"]')].filter((element) =>
            labels.test((element.innerText || '').trim()),
          );
          let count = 0;
          for (const element of targets.slice(0, 2)) {
            element.click();
            count += 1;
          }
          return count;
        })
        .catch(() => 0);
      if (clicked) {
        await page.waitForTimeout(1200);
        const afterClick = await page.evaluate(collectVideosInPage).catch(() => []);
        pageVideos = [...pageVideos, ...afterClick];
      }
    }

    // O HTML renderizado inclui payloads de SPA (ex.: "trailerUrl" do Next.js).
    const renderedHtml = await page.content().catch(() => '');
    const htmlVideos = renderedHtml ? extractVideosFromHtml(renderedHtml, finalUrl) : [];
    const baseVideos = normalizeVideoList([...pageVideos, ...htmlVideos], {
      limit: MAX_VIDEOS,
    });

    // Em listagens, busca o trailer nas fichas dos primeiros cards.
    const enriched =
      baseVideos.length < 2 && detailLinks.length >= 3
        ? await enrichVideosFromDetailPages(detailLinks, finalUrl)
        : [];

    const videos = normalizeVideoList([...baseVideos, ...enriched], {
      limit: MAX_VIDEOS,
    });
    console.log(
      `[renderer] vídeos: dom=${pageVideos.length} html=${htmlVideos.length} fichas=${enriched.length} links=${detailLinks.length} finais=${videos.length}`,
    );
    const images = normalizeImageList(data.images);
    const links = normalizeLinkList(data.links);
    const alts = images.map((image) => image.alt).filter(Boolean);
    const headings = (data.headings || [])
      .map((heading) => {
        const cleanHeading = clean(heading, 180);
        if (!cleanHeading.endsWith('…') && !cleanHeading.endsWith('...')) return cleanHeading;
        const prefix = cleanHeading.replace(/(…|\.\.\.)$/, '').toLowerCase();
        const match = alts.find((alt) => alt.toLowerCase().startsWith(prefix));
        return match || cleanHeading;
      })
      .slice(0, 30);
    return {
      kind: 'site',
      url: data.finalUrl || rawUrl,
      title: clean(data.title, 160),
      description: clean(data.description, 400),
      headings,
      colors: (data.colors || []).slice(0, 8),
      textColors: (data.textColors || []).slice(0, 6),
      fonts: (data.fonts || []).slice(0, 4),
      images,
      links,
      videos,
      text: clean(data.text, MAX_TEXT),
      rendered: true,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`[renderer] Falha ao renderizar ${rawUrl}: ${error.message}`);
    return null;
  } finally {
    if (context) await context.close().catch(() => {});
    forceStopBrowser(launch);
  }
}
