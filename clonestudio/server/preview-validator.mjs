import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, distDir, getProject, updateProject } from './storage.mjs';
import { forceStopBrowser, launchBrowser, loadPlaywright } from './browser.mjs';
import {
  buildValidationInstruction,
  isBenignRequestFailure,
  sanitizeValidationEntries,
  summarizeValidation,
  truncateText,
  validationStatus,
} from './validation-core.mjs';

const VALIDATION_TIMEOUT = Number(process.env.PREVIEW_VALIDATION_TIMEOUT_MS || 35000);
const NAVIGATION_TIMEOUT = Math.min(20000, Math.max(5000, VALIDATION_TIMEOUT - 8000));
const VIEWPORT = { width: 1280, height: 820 };
const HOST =
  process.env.PREVIEW_VALIDATION_HOST || process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PREVIEW_PORT || 8788);
const MAX_ENTRIES = 15;

const running = new Map();

function nowIso() {
  return new Date().toISOString();
}

function validationDir(id) {
  return path.join(PROJECTS_DIR, id, 'validation');
}

export function validationScreenshotPath(id) {
  return path.join(validationDir(id), 'screenshot.png');
}

export function validationReportPath(id) {
  return path.join(validationDir(id), 'report.json');
}

export function isPreviewValidationRunning(id) {
  return running.has(id);
}

export function isPreviewValidationEnabled() {
  return String(process.env.PREVIEW_VALIDATION || 'on').toLowerCase() !== 'off';
}

export function previewValidationUrl(id) {
  return `http://${HOST}:${PORT}/preview/${id}/?validation=${Date.now()}`;
}

function consoleLocation(message) {
  try {
    const location = message.location();
    if (!location?.url) return '';
    const line = location.lineNumber ? `:${location.lineNumber}` : '';
    return truncateText(`${location.url}${line}`, 240);
  } catch {
    return '';
  }
}

async function pageMetrics(page) {
  try {
    return await page.evaluate(() => {
      const body = document.body;
      const text = (body?.innerText || '').trim();
      const root = document.getElementById('root');
      const images = [...document.querySelectorAll('img')];
      const brokenImages = images
        .filter((image) => {
          const src = image.currentSrc || image.getAttribute('src') || '';
          if (!src || /^data:/i.test(src)) return false;
          return image.complete && image.naturalWidth === 0;
        })
        .slice(0, 10)
        .map((image) => ({
          src: (image.currentSrc || image.getAttribute('src') || '').slice(0, 300),
          alt: (image.getAttribute('alt') || '').slice(0, 80),
        }));
      return {
        title: document.title || '',
        bodyTextLength: text.length,
        textSample: text.slice(0, 240),
        interactive: document.querySelectorAll(
          'button, a, input, textarea, select, [role="button"]',
        ).length,
        rootChildren: root ? root.children.length : 0,
        imagesTotal: images.length,
        brokenImages,
        url: location.href,
      };
    });
  } catch {
    return {
      title: '',
      bodyTextLength: 0,
      textSample: '',
      interactive: 0,
      rootChildren: 0,
      imagesTotal: 0,
      brokenImages: [],
      url: '',
    };
  }
}

function baseReport(id, startedAt, extra = {}) {
  return {
    status: 'failed',
    checkedAt: nowIso(),
    previewVersion: getProject(id)?.previewVersion || 0,
    startedAt,
    durationMs: Date.now() - new Date(startedAt).getTime(),
    url: previewValidationUrl(id),
    title: '',
    browser: null,
    browserAttempts: [],
    viewport: { ...VIEWPORT },
    screenshot: false,
    screenshotVersion: null,
    blank: false,
    navigationError: '',
    metrics: null,
    counts: { console: 0, page: 0, requests: 0, http: 0, images: 0, total: 0 },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    ...extra,
  };
}

function finishReport(id, report) {
  const project = getProject(id);
  if (!project) return report;
  const finalReport = {
    ...report,
    status: report.status === 'running' ? 'failed' : report.status,
    checkedAt: nowIso(),
    durationMs: Date.now() - new Date(report.startedAt).getTime(),
  };
  if (['issues', 'failed'].includes(finalReport.status)) {
    finalReport.instruction = buildValidationInstruction(finalReport);
  }
  try {
    fs.mkdirSync(validationDir(id), { recursive: true });
    fs.writeFileSync(validationReportPath(id), JSON.stringify(finalReport, null, 2), 'utf8');
  } catch (error) {
    console.warn(`[validator] Não foi possível salvar o relatório: ${error.message}`);
  }
  updateProject(id, { validation: finalReport });
  return finalReport;
}

async function executeValidation(id, startedAt) {
  const project = getProject(id);
  if (!project) throw new Error('Projeto não encontrado durante a validação.');

  if (!isPreviewValidationEnabled()) {
    return finishReport(
      id,
      baseReport(id, startedAt, {
        status: 'disabled',
        reason: 'Validação automática desativada por PREVIEW_VALIDATION=off.',
      }),
    );
  }

  const distIndex = path.join(distDir(id), 'index.html');
  if (!fs.existsSync(distIndex)) {
    return finishReport(
      id,
      baseReport(id, startedAt, {
        status: 'skipped',
        reason: 'O projeto ainda não tem um build pronto para validar.',
      }),
    );
  }

  const playwright = await loadPlaywright();
  if (!playwright) {
    return finishReport(
      id,
      baseReport(id, startedAt, {
        status: 'unavailable',
        reason:
          'playwright-core não está instalado. Rode "npm install playwright-core" na pasta do CloneStudio.',
      }),
    );
  }

  const launch = await launchBrowser(playwright);
  if (!launch.browser) {
    return finishReport(
      id,
      baseReport(id, startedAt, {
        status: 'unavailable',
        reason:
          'Nenhum navegador compatível foi encontrado. Instale o Microsoft Edge ou o Google Chrome, ou rode "npx playwright install chromium".',
        browserAttempts: launch.attempts.map((attempt) => truncateText(attempt, 300)),
      }),
    );
  }

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const httpErrors = [];
  let context = null;
  let screenshotSaved = false;
  let screenshotError = '';
  let navigationError = '';
  let metrics = null;

  try {
    fs.mkdirSync(validationDir(id), { recursive: true });
    fs.rmSync(validationScreenshotPath(id), { force: true });

    context = await launch.browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT);

    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (consoleErrors.length >= MAX_ENTRIES) return;
      consoleErrors.push({
        type: 'error',
        text: truncateText(message.text(), 700),
        location: consoleLocation(message),
      });
    });
    page.on('pageerror', (error) => {
      if (pageErrors.length >= MAX_ENTRIES) return;
      pageErrors.push({
        message: truncateText(error.message || error, 700),
        stack: truncateText(error.stack, 900),
      });
    });
    page.on('requestfailed', (request) => {
      if (failedRequests.length >= MAX_ENTRIES) return;
      const failure = request.failure();
      const entry = {
        method: request.method(),
        url: request.url(),
        error: failure?.errorText || 'falha de rede',
      };
      if (!isBenignRequestFailure(entry)) failedRequests.push(entry);
    });
    page.on('response', (response) => {
      if (httpErrors.length >= MAX_ENTRIES) return;
      if (response.status() < 400) return;
      const entry = {
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      };
      if (!isBenignRequestFailure(entry)) httpErrors.push(entry);
    });

    const target = previewValidationUrl(id);
    await page.goto(target, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);

    metrics = await pageMetrics(page);

    try {
      await page.screenshot({
        path: validationScreenshotPath(id),
        type: 'png',
        fullPage: false,
        timeout: 10000,
      });
      screenshotSaved = true;
    } catch (error) {
      screenshotError = truncateText(error.message, 600);
    }
  } catch (error) {
    navigationError = truncateText(error.message, 900);
    metrics = metrics || (await pageMetricsSafe(context));
  } finally {
    forceStopBrowser(launch);
  }

  const entries = sanitizeValidationEntries({
    consoleErrors,
    pageErrors,
    failedRequests,
    httpErrors,
    brokenImages: metrics?.brokenImages || [],
  });
  const blank =
    !navigationError &&
    metrics !== null &&
    metrics.bodyTextLength < 10 &&
    metrics.interactive === 0 &&
    metrics.rootChildren === 0;
  const counts = summarizeValidation(entries);
  const status = validationStatus({
    navigationError,
    blank,
    ...entries,
  });

  return finishReport(
    id,
    baseReport(id, startedAt, {
      status,
      title: metrics?.title || '',
      browser: launch.name,
      browserAttempts: launch.attempts.map((attempt) => truncateText(attempt, 300)),
      screenshot: screenshotSaved,
      screenshotVersion: screenshotSaved ? Date.now() : null,
      screenshotError,
      blank,
      navigationError,
      metrics: metrics
        ? {
            bodyTextLength: metrics.bodyTextLength,
            textSample: metrics.textSample,
            interactive: metrics.interactive,
            rootChildren: metrics.rootChildren,
            imagesTotal: metrics.imagesTotal,
            brokenImages: metrics.brokenImages?.length || 0,
          }
        : null,
      counts,
      ...entries,
    }),
  );
}

async function pageMetricsSafe(context) {
  try {
    const pages = context?.pages() || [];
    if (!pages.length) return null;
    return await pageMetrics(pages[0]);
  } catch {
    return null;
  }
}

export function runPreviewValidation(id) {
  if (running.has(id)) return running.get(id);
  const startedAt = nowIso();
  const project = getProject(id);
  if (project) {
    updateProject(id, {
      validation: {
        ...(project.validation || {}),
        status: 'running',
        startedAt,
        checkedAt: startedAt,
      },
    });
  }
  const promise = executeValidation(id, startedAt)
    .catch((error) => {
      if (!getProject(id)) return null;
      console.warn(`[validator] projeto ${id} falhou: ${error.message}`);
      return finishReport(
        id,
        baseReport(id, startedAt, {
          status: 'failed',
          reason: `A validação falhou inesperadamente: ${truncateText(error.message, 600)}`,
        }),
      );
    })
    .finally(() => {
      // Nunca deixa o projeto preso em "running" se algum caminho de saída
      // escapou do finishReport.
      const project = getProject(id);
      if (project?.validation?.status === 'running') {
        finishReport(
          id,
          baseReport(id, startedAt, {
            status: 'failed',
            reason: 'A validação terminou sem produzir um relatório. Valide novamente.',
          }),
        );
      }
      running.delete(id);
    });
  running.set(id, promise);
  return promise;
}

export function readValidationReport(id) {
  try {
    const raw = fs.readFileSync(validationReportPath(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return getProject(id)?.validation || null;
  }
}
