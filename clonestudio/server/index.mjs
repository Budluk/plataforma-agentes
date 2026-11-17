import './env.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import {
  addMessage,
  createProject,
  deleteProject,
  distDir,
  ensureProjectWorkspace,
  flushPersistence,
  getProject,
  listProjects,
  listSourceFiles,
  projectDetail,
  projectSummary,
  updateProject,
} from './storage.mjs';
import { isNotModified, weakEtag } from './http-cache.mjs';
import {
  callChat,
  listProviderModels,
  providerOrder,
  providerStatuses,
} from './providers.mjs';
import {
  generatorStats,
  isGenerating,
  requestGeneration,
  requestRebuild,
} from './generator.mjs';
import { listSkills } from './skills.mjs';
import {
  duplicateProject,
  importFromGithub,
  importFromInspection,
  importFromZip,
  importSite,
  inspectGithubSource,
  inspectZipSource,
  isImporting,
  parseGithubUrl,
} from './importer.mjs';
import { integrationGroups, integrationSummary } from './integrations.mjs';
import {
  context7Status,
  queryLibraryDocs,
  resolveLibraryId,
} from './context7.mjs';
import { ALLOWED_PACKAGES } from './generation-core.mjs';
import { startPreviewServer } from './preview.mjs';
import {
  isPreviewValidationRunning,
  readValidationReport,
  runPreviewValidation,
  validationScreenshotPath,
} from './preview-validator.mjs';

const VERSION = '0.2.0';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 8788);

const PUBLIC_DIR = path.join(ROOT, 'public');
const STATIC_ROUTES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js'],
  ['/favicon.svg', 'favicon.svg'],
]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function previewBaseFor(req) {
  const configured = String(process.env.PREVIEW_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const rawHost = String(req?.headers?.host || '').split(':')[0] || '127.0.0.1';
  const hostname = rawHost === '0.0.0.0' || rawHost === '[::1]' ? '127.0.0.1' : rawHost;
  return `http://${hostname}:${PREVIEW_PORT}`;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message, extra) {
  sendJson(res, status, { error: message, ...(extra || {}) });
}

async function readBody(req, limit = 1_000_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new HttpError(413, 'Corpo da requisição grande demais.');
  }
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON inválido no corpo da requisição.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'O corpo da requisição deve ser um objeto JSON.');
  }
  return parsed;
}

/**
 * O painel é local, mas ainda pode receber requisições de outra origem via
 * navegador (CSRF) ou com Host forjado (DNS rebinding). Bloqueia mutações que
 * não vierem do próprio painel.
 */
function assertTrustedRequest(req) {
  const hostHeader = String(req.headers.host || '');
  let hostname = '';
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    hostname = '';
  }
  if (!hostname) throw new HttpError(400, 'Cabeçalho Host ausente.');
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'];
  if (HOST !== '0.0.0.0' && HOST !== '::' && !loopback.includes(hostname) && hostname !== HOST) {
    throw new HttpError(403, 'Host não permitido.');
  }
  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, 'Origem inválida.');
    }
    if (originHost !== hostHeader) throw new HttpError(403, 'Origem não permitida.');
  }
}

function serveStatic(req, res, pathname) {
  const relative = STATIC_ROUTES.get(pathname);
  if (!relative) return false;
  const file = path.join(PUBLIC_DIR, relative);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    sendError(res, 404, 'Arquivo não encontrado.');
    return true;
  }
  if (!stat.isFile()) {
    sendError(res, 404, 'Arquivo não encontrado.');
    return true;
  }
  const etag = weakEtag(stat);
  const cacheControl = 'no-cache';
  if (isNotModified(req, etag)) {
    res.writeHead(304, { etag, 'cache-control': cacheControl });
    res.end();
    return true;
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    `frame-src ${previewBaseFor(req)}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': cacheControl,
    etag,
    'content-length': stat.size,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': csp,
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(file)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    })
    .pipe(res);
  return true;
}

function projectOrThrow(id) {
  const project = getProject(id);
  if (!project) throw new HttpError(404, 'Projeto não encontrado.');
  return project;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method || 'GET';
    const pathname = url.pathname;

    if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      assertTrustedRequest(req);
    }

    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        name: 'CloneStudio AI',
        version: VERSION,
        time: new Date().toISOString(),
        providers: providerOrder().map((provider) => provider.id),
        ...generatorStats(),
      });
    }

    if (method === 'GET' && pathname === '/api/config') {
      return sendJson(res, 200, {
        name: 'CloneStudio AI',
        version: VERSION,
        previewPort: PREVIEW_PORT,
        previewBase: previewBaseFor(req),
        allowedPackages: ALLOWED_PACKAGES,
        providers: providerStatuses(),
        integrations: integrationSummary(),
      });
    }

    if (method === 'GET' && pathname === '/api/providers') {
      return sendJson(res, 200, {
        providers: providerStatuses(),
        order: providerOrder().map((provider) => provider.id),
      });
    }

    const modelsMatch = pathname.match(/^\/api\/providers\/([a-z0-9_-]+)\/models$/i);
    if (method === 'GET' && modelsMatch) {
      try {
        const models = await listProviderModels(modelsMatch[1]);
        return sendJson(res, 200, { models, count: models.length });
      } catch (error) {
        return sendError(res, 502, error.message || 'Falha ao consultar o provedor.');
      }
    }

    if (method === 'GET' && pathname === '/api/skills') {
      return sendJson(res, 200, { skills: listSkills() });
    }

    if (method === 'GET' && pathname === '/api/integrations') {
      return sendJson(res, 200, {
        summary: integrationSummary(),
        groups: integrationGroups(),
      });
    }

    if (method === 'GET' && pathname === '/api/context7/status') {
      return sendJson(res, 200, await context7Status());
    }

    if (method === 'POST' && pathname === '/api/context7/resolve') {
      const body = await readBody(req, 200_000);
      const libraryName = String(body.libraryName || '').trim();
      const query = String(body.query || '').trim();
      if (!libraryName) throw new HttpError(400, 'Informe o nome da biblioteca.');
      if (!query) throw new HttpError(400, 'Informe o assunto a pesquisar.');
      try {
        const results = await resolveLibraryId(libraryName.slice(0, 120), query.slice(0, 500));
        return sendJson(res, 200, { results });
      } catch (error) {
        return sendError(res, 502, error.message || 'Falha ao consultar o Context7.');
      }
    }

    if (method === 'POST' && pathname === '/api/context7/docs') {
      const body = await readBody(req, 200_000);
      const libraryId = String(body.libraryId || '').trim();
      const query = String(body.query || '').trim();
      if (!libraryId) throw new HttpError(400, 'Informe libraryId no formato /org/projeto.');
      if (!query) throw new HttpError(400, 'Informe o assunto da documentação.');
      try {
        const text = await queryLibraryDocs(libraryId, query.slice(0, 500), {
          language: String(body.language || 'TypeScript').slice(0, 40),
        });
        return sendJson(res, 200, {
          libraryId,
          query,
          chars: text.length,
          text: text.slice(0, 20000),
        });
      } catch (error) {
        return sendError(res, 502, error.message || 'Falha ao consultar o Context7.');
      }
    }

    if (method === 'POST' && pathname === '/api/ai/chat') {
      const body = await readBody(req, 2_000_000);
      const messages = Array.isArray(body.messages)
        ? body.messages
            .slice(0, 40)
            .map((message) => ({
              role: ['system', 'user', 'assistant'].includes(message?.role)
                ? message.role
                : 'user',
              content: String(message?.content || '').slice(0, 30000),
            }))
            .filter((message) => message.content)
        : [];
      if (messages.length === 0) throw new HttpError(400, 'Informe messages (1 a 40 mensagens).');
      const result = await callChat(messages, {
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 240000),
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (pathname === '/api/projects' && !['GET', 'POST'].includes(method)) {
      res.setHeader('allow', 'GET, POST');
      throw new HttpError(405, 'Método não permitido.');
    }

    if (pathname === '/api/projects' && method === 'GET') {
      const base = previewBaseFor(req);
      return sendJson(res, 200, {
        projects: listProjects().map((project) => projectSummary(project, base)),
      });
    }

    if (pathname === '/api/projects' && method === 'POST') {
      const body = await readBody(req);
      const prompt = String(body.prompt || '').trim();
      if (prompt.length < 3) throw new HttpError(400, 'Descreva o app com pelo menos 3 caracteres.');
      if (prompt.length > 6000) throw new HttpError(400, 'A descrição deve ter no máximo 6000 caracteres.');
      if (/^https?:\/\/\S+$/i.test(prompt)) {
        try {
          const project = parseGithubUrl(prompt)
            ? await importFromGithub(prompt)
            : await importSite(prompt, '');
          return sendJson(res, 201, {
            kind: 'url',
            project: projectDetail(getProject(project.id), previewBaseFor(req)),
          });
        } catch (error) {
          console.warn(`[import] URL no prompt não pôde ser baixada: ${error.message}`);
        }
      }
      const project = createProject({ prompt });
      ensureProjectWorkspace(project.id);
      requestGeneration(project.id, { fresh: true });
      return sendJson(res, 201, {
        project: projectDetail(getProject(project.id), previewBaseFor(req)),
      });
    }

    if (method === 'POST' && pathname === '/api/inspect') {
      const body = await readBody(req, 45_000_000);
      const kind = String(body.kind || '').trim().toLowerCase();
      if (kind === 'github') {
        const url = String(body.url || '').trim();
        if (!url) throw new HttpError(400, 'Cole um link do GitHub para analisar.');
        try {
          const inspection = await inspectGithubSource(url);
          return sendJson(res, 200, { ok: true, inspection });
        } catch (error) {
          return sendError(res, 502, error.message || 'Não foi possível analisar o repositório.');
        }
      }
      if (kind === 'zip') {
        try {
          const inspection = inspectZipSource(
            body.dataBase64,
            String(body.filename || 'projeto.zip').slice(0, 160),
          );
          return sendJson(res, 200, { ok: true, inspection });
        } catch (error) {
          return sendError(res, 400, error.message || 'Não foi possível analisar o .zip.');
        }
      }
      throw new HttpError(400, 'Tipo de análise inválido (github ou zip).');
    }

    if (method === 'POST' && pathname === '/api/import') {
      const body = await readBody(req, 45_000_000);
      const kind = String(body.kind || '').trim().toLowerCase();
      const base = previewBaseFor(req);
      const inspectionToken = String(body.inspectionToken || '').trim();

      if (kind === 'site') {
        const url = String(body.url || '').trim();
        if (!url) throw new HttpError(400, 'Solte um link para importar.');
        try {
          const project = await importSite(url, String(body.prompt || '').slice(0, 6000));
          return sendJson(res, 201, {
            kind,
            project: projectDetail(getProject(project.id), base),
          });
        } catch (error) {
          return sendError(res, 502, error.message || 'Não foi possível baixar o site.');
        }
      }

      if (kind === 'app') {
        const projectId = String(body.projectId || '').trim();
        const source = getProject(projectId);
        if (!source) throw new HttpError(404, 'App de origem não encontrado.');
        if (isGenerating(projectId) || isImporting(projectId)) {
          throw new HttpError(409, 'Aguarde o app de origem terminar antes de copiá-lo.');
        }
        if (source.status !== 'ready') {
          throw new HttpError(409, 'Só é possível copiar um app já pronto.');
        }
        const copy = duplicateProject(projectId);
        return sendJson(res, 201, {
          kind,
          project: projectDetail(getProject(copy.id), base),
        });
      }

      if (kind === 'github') {
        const url = String(body.url || '').trim();
        if (!inspectionToken && !url) {
          throw new HttpError(400, 'Solte um link do GitHub para importar.');
        }
        try {
          const project = inspectionToken
            ? importFromInspection(inspectionToken)
            : await importFromGithub(url);
          return sendJson(res, 201, {
            kind,
            project: projectDetail(getProject(project.id), base),
          });
        } catch (error) {
          return sendError(res, 502, error.message || 'Não foi possível importar o repositório.');
        }
      }

      if (kind === 'zip') {
        try {
          const project = inspectionToken
            ? importFromInspection(inspectionToken)
            : importFromZip(
                body.dataBase64,
                String(body.filename || 'projeto.zip').slice(0, 160),
              );
          return sendJson(res, 201, {
            kind,
            project: projectDetail(getProject(project.id), base),
          });
        } catch (error) {
          return sendError(res, 400, error.message || 'Não foi possível importar o .zip.');
        }
      }

      throw new HttpError(400, 'Tipo de importação inválido (site, app, github ou zip).');
    }

    const screenshotMatch = pathname.match(
      /^\/api\/projects\/([a-f0-9-]{36})\/validation\/screenshot$/i,
    );
    if (method === 'GET' && screenshotMatch) {
      const id = screenshotMatch[1];
      projectOrThrow(id);
      const file = validationScreenshotPath(id);
      if (!fs.existsSync(file)) {
        return sendError(res, 404, 'Screenshot de validação ainda não disponível.');
      }
      res.writeHead(200, {
        'content-type': 'image/png',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      return fs.createReadStream(file).pipe(res);
    }

    const validationMatch = pathname.match(
      /^\/api\/projects\/([a-f0-9-]{36})\/validation$/i,
    );
    if (method === 'GET' && validationMatch) {
      projectOrThrow(validationMatch[1]);
      return sendJson(res, 200, {
        validation: readValidationReport(validationMatch[1]),
      });
    }

    const projectMatch = pathname.match(
      /^\/api\/projects\/([a-f0-9-]{36})(?:\/(messages|fix|fix-validation|rebuild|retry|validate))?$/i,
    );
    if (projectMatch) {
      const id = projectMatch[1];
      const action = projectMatch[2] || '';
      if (!['GET', 'POST', 'DELETE'].includes(method)) {
        res.setHeader('allow', 'GET, POST, DELETE');
        throw new HttpError(405, 'Método não permitido.');
      }
      const project = projectOrThrow(id);
      const base = previewBaseFor(req);

      if (method === 'GET' && !action) {
        const wantsFiles = (() => {
          try {
            return new URL(req.url, 'http://local').searchParams.get('files') !== '0';
          } catch {
            return true;
          }
        })();
        return sendJson(res, 200, {
          project: projectDetail(project, base, { includeFiles: wantsFiles }),
        });
      }

      if (method === 'DELETE' && !action) {
        if (isGenerating(id) || isImporting(id)) {
          throw new HttpError(409, 'Aguarde a geração terminar antes de excluir o projeto.');
        }
        deleteProject(id);
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'POST' && action === 'messages') {
        if (isGenerating(id)) throw new HttpError(409, 'Aguarde a geração atual terminar.');
        if (!['ready', 'error'].includes(project.status)) {
          throw new HttpError(409, 'O projeto ainda não está pronto para receber alterações.');
        }
        const body = await readBody(req);
        const content = String(body.content || '').trim();
        if (content.length < 2) throw new HttpError(400, 'Escreva a alteração desejada.');
        if (content.length > 8000) throw new HttpError(400, 'A mensagem deve ter no máximo 8000 caracteres.');
        const previousMessages = [...(project.messages || [])];
        const previousStatus = project.status;
        const previousStage = project.stage || '';
        addMessage(id, { role: 'user', kind: 'chat', content });
        updateProject(id, { status: 'generating', stage: 'Na fila', error: null });
        if (!requestGeneration(id)) {
          updateProject(id, {
            messages: previousMessages,
            status: previousStatus,
            stage: previousStage,
          });
          throw new HttpError(409, 'Já existe uma geração em andamento.');
        }
        return sendJson(res, 200, {
          project: projectDetail(getProject(id), base),
        });
      }

      if (method === 'POST' && action === 'fix') {
        if (isGenerating(id)) throw new HttpError(409, 'Aguarde a geração atual terminar.');
        if (project.status !== 'error') throw new HttpError(409, 'O projeto não está em estado de erro.');
        if (!project.buildLog && listSourceFiles(id).length === 0) {
          throw new HttpError(409, 'Não há log de build nem código para corrigir.');
        }
        const previousStatus = project.status;
        const previousStage = project.stage || '';
        updateProject(id, { status: 'generating', stage: 'Na fila', error: null });
        if (!requestGeneration(id, { fix: true })) {
          updateProject(id, { status: previousStatus, stage: previousStage });
          throw new HttpError(409, 'Já existe uma geração em andamento.');
        }
        return sendJson(res, 200, { project: projectDetail(getProject(id), base) });
      }

      if (method === 'POST' && action === 'fix-validation') {
        if (isGenerating(id)) throw new HttpError(409, 'Aguarde a geração atual terminar.');
        if (isPreviewValidationRunning(id)) {
          throw new HttpError(409, 'Aguarde a validação atual terminar.');
        }
        if (project.status !== 'ready') {
          throw new HttpError(409, 'O preview precisa estar pronto para ser corrigido.');
        }
        const validation = readValidationReport(id) || project.validation;
        const hasDiagnostics = Boolean(
          validation?.counts?.total || validation?.blank || validation?.navigationError,
        );
        if (
          !validation ||
          !['issues', 'failed'].includes(validation.status) ||
          !hasDiagnostics
        ) {
          throw new HttpError(409, 'Não há problemas de validação para corrigir.');
        }
        const previousStatus = project.status;
        const previousStage = project.stage || '';
        updateProject(id, { status: 'generating', stage: 'Na fila', error: null });
        if (!requestGeneration(id, { validationFix: true })) {
          updateProject(id, { status: previousStatus, stage: previousStage });
          throw new HttpError(409, 'Já existe uma geração em andamento.');
        }
        return sendJson(res, 200, { project: projectDetail(getProject(id), base) });
      }

      if (method === 'POST' && action === 'retry') {
        if (isGenerating(id)) throw new HttpError(409, 'Aguarde a geração atual terminar.');
        if (!['error', 'generating', 'building'].includes(project.status)) {
          throw new HttpError(409, 'O projeto não está em estado de erro.');
        }
        const previousStatus = project.status;
        const previousStage = project.stage || '';
        const previousError = project.error || '';
        const previousBuildLog = project.buildLog || '';
        updateProject(id, {
          status: 'generating',
          stage: 'Na fila',
          error: null,
          buildLog: '',
        });
        if (!requestGeneration(id, { fresh: true })) {
          updateProject(id, {
            status: previousStatus,
            stage: previousStage,
            error: previousError,
            buildLog: previousBuildLog,
          });
          throw new HttpError(409, 'Já existe uma geração em andamento.');
        }
        return sendJson(res, 200, { project: projectDetail(getProject(id), base) });
      }

      if (method === 'POST' && action === 'rebuild') {
        if (isGenerating(id)) throw new HttpError(409, 'Aguarde a geração atual terminar.');
        if (listSourceFiles(id).length === 0) throw new HttpError(409, 'Não há código para recompilar.');
        requestRebuild(id);
        return sendJson(res, 200, { project: projectDetail(getProject(id), base) });
      }

      if (method === 'POST' && action === 'validate') {
        if (isGenerating(id)) throw new HttpError(409, 'Aguarde a geração atual terminar.');
        if (isPreviewValidationRunning(id)) {
          throw new HttpError(409, 'Já existe uma validação em andamento.');
        }
        if (!fs.existsSync(path.join(distDir(id), 'index.html'))) {
          throw new HttpError(409, 'Compile o app antes de validar o preview.');
        }
        const validation = await runPreviewValidation(id);
        return sendJson(res, 200, {
          validation,
          project: projectDetail(getProject(id), base),
        });
      }

    }

    // Rotas conhecidas que receberam um método errado devolvem 405 com Allow em
    // vez de 404, o que ajuda o painel a distinguir erro de rota de erro de uso.
    const API_METHODS = [
      [/^\/api$/, 'GET'],
      [/^\/api\/health$/, 'GET'],
      [/^\/api\/config$/, 'GET'],
      [/^\/api\/providers$/, 'GET'],
      [/^\/api\/providers\/[a-z0-9_-]+\/models$/i, 'GET'],
      [/^\/api\/skills$/, 'GET'],
      [/^\/api\/integrations$/, 'GET'],
      [/^\/api\/context7\/status$/, 'GET'],
      [/^\/api\/context7\/resolve$/, 'POST'],
      [/^\/api\/context7\/docs$/, 'POST'],
      [/^\/api\/ai\/chat$/, 'POST'],
      [/^\/api\/inspect$/, 'POST'],
      [/^\/api\/import$/, 'POST'],
      [/^\/api\/projects\/[a-f0-9-]{36}\/validation\/screenshot$/i, 'GET'],
    ];
    const apiRule = API_METHODS.find(([pattern]) => pattern.test(pathname));
    if (apiRule && !apiRule[1].split(', ').includes(method)) {
      res.setHeader('allow', apiRule[1]);
      throw new HttpError(405, 'Método não permitido.');
    }

    if ((method === 'GET' || method === 'HEAD') && serveStatic(req, res, pathname)) {
      return undefined;
    }

    if (method === 'GET' && pathname === '/api') {
      return sendJson(res, 200, {
        name: 'CloneStudio AI',
        version: VERSION,
        endpoints: [
          '/api/health',
          '/api/config',
          '/api/projects',
          '/api/projects/:id/validate',
          '/api/projects/:id/validation',
          '/api/projects/:id/validation/screenshot',
          '/api/providers',
          '/api/skills',
          '/api/integrations',
          '/api/context7/status',
          '/api/context7/resolve',
          '/api/context7/docs',
        ],
      });
    }

    return sendError(res, 404, 'Rota não encontrada.');
  } catch (error) {
    if (error instanceof HttpError) {
      return sendError(res, error.status, error.message, error.extra);
    }
    console.error('[server]', error);
    return sendError(res, 500, error.message || 'Erro interno do servidor.');
  }
});

let previewServer = null;

function recoverInterruptedProjects() {
  const stale = listProjects().filter((project) =>
    ['generating', 'building'].includes(project.status),
  );
  for (const project of stale) {
    const message =
      'A geração foi interrompida por um reinício do servidor. Use "Tentar de novo" para recomeçar.';
    updateProject(project.id, { status: 'error', stage: '', error: message });
    addMessage(project.id, { role: 'assistant', kind: 'error', content: message });
  }
  if (stale.length > 0) {
    console.log(`[server] ${stale.length} projeto(s) interrompido(s) marcados como erro.`);
  }
  const staleValidations = listProjects().filter(
    (project) => project.validation?.status === 'running',
  );
  for (const project of staleValidations) {
    updateProject(project.id, {
      validation: {
        ...project.validation,
        status: 'failed',
        checkedAt: new Date().toISOString(),
        reason: 'Validação interrompida por um reinício do servidor. Valide novamente.',
      },
    });
  }
}

async function main() {
  recoverInterruptedProjects();
  try {
    previewServer = await startPreviewServer({ host: HOST, port: PREVIEW_PORT });
  } catch (error) {
    console.error(
      `[preview] Não foi possível abrir a porta ${PREVIEW_PORT}: ${error.message}. ` +
        'Altere PREVIEW_PORT no .env.',
    );
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    const providers = providerOrder();
    console.log('');
    console.log('  CloneStudio AI');
    console.log(`  Painel:  http://${HOST}:${PORT}`);
    console.log(`  Preview: http://${HOST}:${PREVIEW_PORT}/preview/<id>/`);
    console.log(
      `  Provedor: ${providers.length ? providers.map((provider) => provider.label).join(' → ') : 'nenhum configurado'}`,
    );
    console.log('');
    if (providers.length === 0) {
      console.warn('[providers] Configure FREELLMAPI_BASE_URL e FREELLMAPI_API_KEY no .env.');
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[server] A porta ${PORT} já está em uso. Altere PORT no .env.`);
    } else {
      console.error('[server]', error);
    }
    process.exit(1);
  });
}

function shutdown() {
  server.close();
  previewServer?.close();
  flushPersistence()
    .catch(() => {})
    .finally(() => {
      setTimeout(() => process.exit(0), 100).unref();
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();

export { server, previewServer };
