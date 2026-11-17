import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  addMessage,
  appDir,
  distDir,
  getProject,
  listSourceFiles,
  readSourceFiles,
  restoreVersion,
  snapshotVersion,
  syncProjectTemplate,
  templateMainSource,
  TEMPLATE_DIR,
  updateProject,
  writeGeneratedFiles,
} from './storage.mjs';
import { ALLOWED_PACKAGES, buildFileDump, parseGenerationResponse } from './generation-core.mjs';
import { buildValidationInstruction } from './validation-core.mjs';
import { callChat } from './providers.mjs';
import { runPreviewValidation } from './preview-validator.mjs';
import { collectKnowledge, knowledgeForProject } from './context7.mjs';

const jobs = new Map();
let buildChain = Promise.resolve();
let templateInstall = null;
let activeBuilds = 0;

const GENERATION_TIMEOUT = Number(process.env.AI_GENERATION_TIMEOUT_MS || 300000);
const BUILD_TIMEOUT = Number(process.env.BUILD_TIMEOUT_MS || 240000);
const MAX_TOKENS = Number(process.env.AI_CODEGEN_MAX_TOKENS || 12000);

export const SYSTEM_PROMPT = `Você é o motor de código do CloneStudio AI, um construtor de apps estilo Lovable.

Sua tarefa: gerar um app React completo, bonito e funcional a partir de uma descrição em linguagem natural, e depois alterá-lo seguindo instruções do usuário.

FORMATO DE SAÍDA — responda SOMENTE com um objeto JSON válido, sem markdown, sem texto antes ou depois:
{
  "name": "Nome curto do app",
  "description": "Uma frase descrevendo o app",
  "message": "Resumo curto em português do que foi feito",
  "files": [
    { "path": "src/App.tsx", "content": "código completo" },
    { "path": "src/index.css", "content": "CSS completo" }
  ]
}

REGRAS DO PROJETO:
- Template fixo: React 18 + Vite + TypeScript. NÃO escreva package.json, vite.config.ts, index.html, tsconfig.json nem src/main.tsx. Eles já existem e são fixos.
- Você só pode criar/alterar arquivos dentro de src/, com extensões .tsx, .ts, .css ou .json.
- src/main.tsx importa "./App" e "./index.css". Portanto SEMPRE inclua src/App.tsx.
- Sempre devolva o conjunto COMPLETO e atualizado dos arquivos do app (não apenas o diff). O conjunto anterior será substituído.
- Imports permitidos: apenas relativos (./ e ../) e os pacotes: ${ALLOWED_PACKAGES.join(', ')}. Nunca importe outro pacote, nunca use imports absolutos como "@/...".
- Não use Tailwind, shadcn, styled-components, next, react-router nem CSS externo. Use CSS puro em src/index.css.
- Ícones: lucide-react. Gráficos: recharts. Animações: framer-motion (use com moderação). Classes condicionais: clsx.
- framer-motion: use motion.div/motion.button (ou motion.*) para whileHover, whileTap, initial, animate e transition. NUNCA passe essas props para tags HTML comuns como button/div, pois o React emite warnings.
- Não faça chamadas de rede para APIs externas, não use chaves. Use dados mock, estado local e, se precisar persistir, localStorage com try/catch.
- Imagens: use SOMENTE URLs de imagem fornecidas na referência do site. Nunca invente URLs e nunca use via.placeholder.com, placehold.it, dummyimage.com ou picsum.photos (serviços instáveis ou fora do ar). Sem imagens na referência, crie pôsteres/ilustrações com CSS (gradientes, padrões) ou SVG inline. Toda <img> externa deve ter onError para cair num fundo CSS.
- Quando houver referência de site, recrie a estrutura da página (cabeçalho, navegação, hero, filtros, listas e rodapé) e o conteúdo real extraído, em vez de entregar só uma grade genérica.
- Vídeos: quando a referência listar vídeos/trailers, crie um player funcional (iframe do YouTube/Vimeo ou <video controls> para arquivo direto) aberto por um botão "Trailer"/"Assistir". Nunca invente URL de vídeo nem use uma thumbnail no lugar do player. Desmonte o iframe/vídeo ao fechar o modal.
- Em cards/listas vindos de uma referência, mostre apenas os dados que existem nela (título, imagem, tipo, país, gênero, status). Não invente nota/estrela, ano, duração, preço ou contagem.
- Nada de placeholders vazios: todas as telas, botões, filtros, modais e navegação devem funcionar de verdade com dados de exemplo.
- UI em português do Brasil, a menos que o pedido esteja em outro idioma. Textos reais, sem lorem ipsum.
- Design profissional e responsivo: hierarquia clara, espaçamento consistente, paleta coerente, estados de hover/focus, layout mobile-first. Evite aparência de template genérico.
- Componentes: divida em arquivos quando passar de ~250 linhas. Use TypeScript simples e evite tipos complexos que quebrem o build.
- Garanta JSX válido: tags fechadas, chaves em listas, sem trechos truncados. Não use caracteres de controle.
- Se a instrução do usuário for uma correção de build, corrija a causa raiz e mantenha o restante funcionando.

Responda apenas JSON.`;

function nowIso() {
  return new Date().toISOString();
}

function setStage(id, stage) {
  updateProject(id, { stage });
}

function truncate(value, limit = 4000) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncado]` : text;
}

function chatHistory(project, currentMessageId) {
  return (project.messages || [])
    .filter(
      (message) =>
        message.kind !== 'error' &&
        ['user', 'assistant'].includes(message.role) &&
        message.id !== currentMessageId,
    )
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: truncate(message.content, 6000),
    }));
}

function knowledgeSection(knowledgeText) {
  return knowledgeText ? `\n\n${knowledgeText}` : '';
}

function referenceSection(project) {
  const reference = project?.reference;
  if (!reference?.text) return '';
  const images = Array.isArray(reference.images) ? reference.images.slice(0, 24) : [];
  const links = Array.isArray(reference.links) ? reference.links.slice(0, 20) : [];
  const headings = Array.isArray(reference.headings) ? reference.headings.slice(0, 20) : [];
  const videos = Array.isArray(reference.videos) ? reference.videos.slice(0, 16) : [];
  const lines = [
    '',
    '',
    `REFERÊNCIA BAIXADA DE ${reference.url || 'uma página'}`,
    reference.title ? `Título: ${reference.title}` : '',
    reference.description ? `Descrição: ${reference.description}` : '',
    reference.colors?.length ? `Cores de fundo detectadas: ${reference.colors.join(', ')}` : '',
    reference.textColors?.length
      ? `Cores de texto detectadas: ${reference.textColors.join(', ')}`
      : '',
    reference.fonts?.length ? `Fontes detectadas: ${reference.fonts.join(', ')}` : '',
    headings.length ? `\nESTRUTURA/SEÇÕES DA PÁGINA (use como esqueleto do app):\n- ${headings.join('\n- ')}` : '',
    links.length
      ? `\nNAVEGAÇÃO E LINKS DA PÁGINA (recrie os itens de menu com essas mesmas seções):\n- ${links
          .map((link) => `${link.label} → ${link.href}`)
          .join('\n- ')}`
      : '',
    images.length
      ? `\nIMAGENS REAIS ENCONTRADAS NA PÁGINA (use estas URLs nos cards; NÃO invente outras):\n- ${images
          .map((image) => `${image.src}${image.alt ? ` (alt: ${image.alt})` : ''}`)
          .join('\n- ')}`
      : '',
    videos.length
      ? `\nVÍDEOS/TRAILERS REAIS ENCONTRADOS (use exatamente estas URLs; NÃO invente vídeos):\n- ${videos
          .map((video) => {
            const target = video.embedUrl || video.url;
            const label = video.title || 'Vídeo';
            const provider = video.provider ? ` [${video.provider}]` : '';
            const poster =
              video.poster && !['youtube', 'vimeo'].includes(video.provider)
                ? ` (poster: ${video.poster})`
                : '';
            const page = video.pageUrl ? ` (página: ${video.pageUrl})` : '';
            return `${label} → ${target}${provider}${poster}${page}`;
          })
          .join('\n- ')}\n\nCOMO TOCAR OS VÍDEOS (obrigatório):\n- Crie um player funcional. Em cada card/hero que tiver vídeo, adicione um botão "Trailer"/"Assistir" que abre um modal com <iframe src={embedUrl} title={titulo} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />. Para arquivos diretos (.mp4/.webm), use <video controls poster={poster} src={url}>.\n- O modal precisa fechar e desmontar o iframe/vídeo ao fechar. O vídeo deve tocar de verdade: não use a thumbnail no lugar do player.\n- Se um item não tiver vídeo na lista, não mostre botão de trailer nele. Não use autoplay com som; se usar autoplay, mute.`
      : '',
    '',
    'CONTEÚDO EXTRAÍDO DA PÁGINA:',
    truncate(reference.text, 10000),
    '',
    'Use a referência como inspiração de conteúdo e identidade visual. Crie um app original, sem copiar marcas, logos ou textos proprietários literalmente.',
    'Use a primeira cor de fundo como base do tema e as cores de texto na tipografia, para o app lembrar a identidade visual do site.',
    'Não invente notas, anos, países, gêneros, contagens ou preços que não estejam na referência: mostre apenas os campos que existem ou omita o dado.',
    'Se um título da referência terminar em "…", complete-o com o alt da imagem correspondente.',
    images.length
      ? 'Use as IMAGENS REAIS acima para dar vida aos cards e ao topo. Se uma imagem falhar, trate com onError e mostre um fundo CSS.'
      : 'Não há imagens reais na referência. NÃO invente URLs de imagem e NUNCA use via.placeholder.com, placehold.it ou dummyimage.com (esses serviços estão fora do ar): crie pôsteres com gradientes CSS, iniciais do título ou um SVG local.',
  ].filter(Boolean);
  return `\n${lines.join('\n')}`;
}

export function initialInstruction(project, knowledgeText = '', instruction = '') {
  const description = String(instruction || project?.prompt || '').trim();
  return `Crie o app descrito abaixo. Entregue uma primeira versão completa, polida e funcional.

DESCRIÇÃO DO USUÁRIO:
${description}${referenceSection(project)}${knowledgeSection(knowledgeText)}

Lembre-se: responda somente com JSON e inclua src/App.tsx e src/index.css.`;
}

function iterationInstruction(project, instruction, files, buildLog, knowledgeText = '') {
  const dump = buildFileDump(files);
  const errorSection = buildLog
    ? `\n\nERRO DE BUILD PARA CORRIGIR (últimas linhas):\n${truncate(buildLog, 9000)}`
    : '';
  return `Altere o app React existente seguindo a instrução do usuário.

INSTRUÇÃO:
${instruction}${errorSection}${knowledgeSection(knowledgeText)}

ARQUIVOS ATUAIS DO APP:
${dump}

Devolva o conjunto COMPLETO de arquivos (não apenas o diff), mantendo tudo o que já funciona e aplicando a alteração. Responda somente com JSON.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientProviderError(error) {
  const text = String(error?.message || '').toLowerCase();
  if (/tempo limite|timeout|aborted/.test(text)) return false;
  return /429|too many requests|empty_completion|empty completion|temporar|503|502|unavailable|cooldown/.test(
    text,
  );
}

async function requestModel(
  project,
  instruction,
  files,
  buildLog,
  currentMessageId,
  knowledgeText = '',
) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (files.length) {
    messages.push(...chatHistory(project, currentMessageId));
  }
  const userContent = files.length
    ? iterationInstruction(project, instruction, files, buildLog, knowledgeText)
    : initialInstruction(project, knowledgeText, instruction);
  messages.push({ role: 'user', content: userContent });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callChat(messages, {
        timeoutMs: GENERATION_TIMEOUT,
        maxTokens: MAX_TOKENS,
        temperature: 0.35,
      });
    } catch (error) {
      const transient = error.providerErrors && isTransientProviderError(error);
      if (!transient || attempt === maxAttempts) {
        if (error.providerErrors) throw error;
        throw new Error(`Falha ao consultar o modelo: ${error.message}`);
      }
      const delay = attempt * 6000;
      setStage(
        project.id,
        `Provedor ocupado; nova tentativa em ${Math.round(delay / 1000)}s (${attempt + 1}/${maxAttempts})`,
      );
      await sleep(delay);
    }
  }
  throw new Error('Falha ao consultar o modelo.');
}

function validateResponse(raw, existingPaths) {
  return parseGenerationResponse(raw, { existingPaths });
}

function logRejectedResponse(label, result, error) {
  console.warn(
    `[generator] ${label}: ${error.message} | provider=${result.provider} model=${result.model} chars=${String(
      result.text || '',
    ).length}\n${truncate(result.text, 1600)}`,
  );
}

async function generateWithRetry(
  projectRef,
  instruction,
  files,
  buildLog,
  currentMessageId,
  knowledgeText = '',
) {
  const project = typeof projectRef === 'string' ? getProject(projectRef) : projectRef;
  if (!project) throw new Error('Projeto não encontrado para gerar o app.');
  const result = await requestModel(
    project,
    instruction,
    files,
    buildLog,
    currentMessageId,
    knowledgeText,
  );
  setStage(project.id, 'Validando código gerado');
  const existingPaths = files.map((file) => file.path);
  try {
    return { ...result, parsed: validateResponse(result.text, existingPaths) };
  } catch (error) {
    logRejectedResponse('resposta rejeitada', result, error);
    setStage(project.id, 'Corrigindo resposta inválida');
    const retryMessages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `${files.length ? iterationInstruction(project, instruction, files, buildLog, knowledgeText) : initialInstruction(project, knowledgeText, instruction)}

SUA RESPOSTA ANTERIOR FOI REJEITADA:
${truncate(error.message, 3000)}

INÍCIO DA SUA RESPOSTA ANTERIOR:
${truncate(result.text, 1200)}

Responda novamente com o JSON completo e válido. Comece a resposta exatamente com { e termine com }. Não escreva plano, explicação, markdown nem texto antes ou depois do JSON.`,
      },
    ];
    const retry = await callChat(retryMessages, {
      timeoutMs: GENERATION_TIMEOUT,
      maxTokens: MAX_TOKENS,
      temperature: 0.2,
    });
    setStage(project.id, 'Validando código gerado');
    try {
      return {
        ...retry,
        parsed: validateResponse(retry.text, existingPaths),
      };
    } catch (retryError) {
      logRejectedResponse('resposta de correção rejeitada', retry, retryError);
      throw retryError;
    }
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        ...(options.env || {}),
      },
      windowsHide: true,
      shell: false,
    });
    let output = '';
    let finished = false;
    const timeout = Number(options.timeout || BUILD_TIMEOUT);
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      killTree(child);
      resolve({
        code: -1,
        output: `${output}\n[tempo limite de ${Math.round(timeout / 1000)}s excedido]`,
      });
    }, timeout);

    child.stdout?.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-30000);
    });
    child.stderr?.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-30000);
    });
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code: -1, output: `${output}\n${error.message}` });
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, output: output.trim() });
    });
  });
}

function killTree(child) {
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    // ignora falhas ao encerrar
  }
}

const REQUIRED_MODULES = [
  'vite',
  '@vitejs/plugin-react',
  'react',
  'react-dom',
  'lucide-react',
  'framer-motion',
  'recharts',
  'clsx',
];

async function runNpmInstall(packages = []) {
  const isWindows = process.platform === 'win32';
  const packageArgs = packages.length ? ` ${packages.join(' ')}` : '';
  const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const args = isWindows
    ? [
        '/d',
        '/s',
        '/c',
        `npm.cmd install${packageArgs} --no-audit --no-fund --loglevel=error`,
      ]
    : ['install', ...packages, '--no-audit', '--no-fund', '--loglevel=error'];
  return runCommand(command, args, { cwd: TEMPLATE_DIR, timeout: 300000 });
}

async function ensureTemplateDependencies() {
  const packageFile = path.join(TEMPLATE_DIR, 'package.json');
  const markerFile = path.join(TEMPLATE_DIR, 'node_modules', '.clonestudio-deps.json');
  let fingerprint = '';
  try {
    fingerprint = fs.readFileSync(packageFile, 'utf8');
  } catch {
    // sem package.json o build falha depois com uma mensagem mais clara
  }
  const missing = REQUIRED_MODULES.filter(
    (name) => !fs.existsSync(path.join(TEMPLATE_DIR, 'node_modules', name, 'package.json')),
  );
  let markerMatches = false;
  try {
    markerMatches = fs.readFileSync(markerFile, 'utf8') === fingerprint;
  } catch {
    markerMatches = false;
  }
  if (missing.length === 0 && markerMatches) return;
  if (templateInstall) return templateInstall;

  templateInstall = (async () => {
    console.log('[generator] Sincronizando dependências do template...');
    const result = await runNpmInstall();
    const stillMissing = REQUIRED_MODULES.filter(
      (name) => !fs.existsSync(path.join(TEMPLATE_DIR, 'node_modules', name, 'package.json')),
    );
    if (stillMissing.length > 0 || result.code !== 0) {
      throw new Error(
        `Não foi possível instalar as dependências do template${
          stillMissing.length ? ` (${stillMissing.join(', ')})` : ''
        }.\n${truncate(result.output, 4000)}`,
      );
    }
    fs.writeFileSync(markerFile, fingerprint, 'utf8');
  })().finally(() => {
    templateInstall = null;
  });

  return templateInstall;
}

async function linkTemplateModules(id) {
  const templateModules = path.join(TEMPLATE_DIR, 'node_modules');
  const appModules = path.join(appDir(id), 'node_modules');
  if (fs.existsSync(path.join(appModules, 'vite', 'bin', 'vite.js'))) return;
  if (fs.existsSync(appModules)) {
    await fs.promises.rm(appModules, { recursive: true, force: true });
  }
  await fs.promises.symlink(
    templateModules,
    appModules,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyDocumentMeta(id, project) {
  const indexFile = path.join(distDir(id), 'index.html');
  try {
    if (!fs.existsSync(indexFile)) return;
    let html = fs.readFileSync(indexFile, 'utf8');
    const title = escapeHtml(project.name || 'App');
    const description = escapeHtml(
      String(project.description || project.prompt || '').replace(/\s+/g, ' ').slice(0, 160),
    );
    html = /<title>[^<]*<\/title>/i.test(html)
      ? html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`)
      : html.replace('</head>', `<title>${title}</title></head>`);
    if (description) {
      const meta = `<meta name="description" content="${description}" />`;
      html = /<meta\s+name=["']description["'][^>]*>/i.test(html)
        ? html.replace(/<meta\s+name=["']description["'][^>]*>/i, meta)
        : html.replace('</head>', `${meta}</head>`);
    }
    fs.writeFileSync(indexFile, html, 'utf8');
  } catch (error) {
    console.warn(`[generator] Não foi possível ajustar o título do preview: ${error.message}`);
  }
}

async function doBuild(id) {
  const project = getProject(id);
  if (!project) throw new Error('Projeto removido durante o build.');
  updateProject(id, {
    status: 'building',
    stage: 'Preparando dependências',
    error: null,
    buildLog: '',
  });

  await ensureTemplateDependencies();
  if (!getProject(id)) throw new Error('Projeto removido durante o build.');

  const dir = syncProjectTemplate(id);
  await linkTemplateModules(id);
  const viteBin = path.join(TEMPLATE_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

  setStage(id, 'Compilando o app');
  activeBuilds += 1;
  let result;
  try {
    result = await runCommand(process.execPath, [viteBin, 'build', '--logLevel', 'warn'], {
      cwd: dir,
      timeout: BUILD_TIMEOUT,
    });
  } finally {
    activeBuilds -= 1;
  }

  if (!getProject(id)) return null;

  if (result.code !== 0 || !fs.existsSync(path.join(distDir(id), 'index.html'))) {
    await fs.promises.rm(distDir(id), { recursive: true, force: true }).catch(() => {});
    const log = truncate(result.output || 'O build falhou sem saída de log.', 16000);
    // Persiste o log antes de lançar o erro: o botão "Corrigir build" precisa
    // dele mesmo quando a geração termina em falha.
    updateProject(id, { buildLog: log });
    const error = new Error(`O build falhou.\n\n${log}`);
    error.buildLog = log;
    throw error;
  }

  const output = truncate(result.output, 16000);
  applyDocumentMeta(id, project);
  updateProject(id, {
    status: 'building',
    stage: 'Validando preview no navegador',
    error: null,
    buildLog: output,
    previewVersion: (project.previewVersion || 0) + 1,
  });
  try {
    await runPreviewValidation(id);
  } catch (error) {
    if (getProject(id)) {
      console.warn(`[validator] projeto ${id}: ${error.message}`);
      updateProject(id, {
        validation: {
          status: 'failed',
          checkedAt: nowIso(),
          reason: truncate(error.message, 800),
        },
      });
    }
  }
  if (!getProject(id)) return null;
  updateProject(id, { status: 'ready', stage: '' });
  return output;
}

export function buildProject(id) {
  const run = buildChain.then(
    () => doBuild(id),
    () => doBuild(id),
  );
  buildChain = run.catch(() => {});
  return run;
}

async function runGeneration(id, options = {}) {
  const project = getProject(id);
  if (!project) return;
  const isFix = Boolean(options.fix);
  const isValidationFix = Boolean(options.validationFix);
  const isFresh = Boolean(options.fresh);
  try {
    updateProject(id, {
      status: 'generating',
      stage: isFresh
        ? 'Gerando novamente'
        : isValidationFix
          ? 'Analisando a validação do preview'
          : isFix
            ? 'Analisando o erro de build'
            : 'Consultando o modelo',
      error: null,
    });

    const files = isFresh ? [] : listSourceFiles(id).length ? readSourceFiles(id) : [];
    const buildLog = getProject(id)?.buildLog || '';
    const currentMessages = getProject(id)?.messages || [];
    const lastUser = [...currentMessages].reverse().find((message) => message.role === 'user');
    const instruction = isFresh
      ? project.prompt
      : isValidationFix
        ? buildValidationInstruction(getProject(id)?.validation || {})
        : isFix
          ? `Corrija o erro de build abaixo. Mantenha o app funcionando e devolva todos os arquivos.\n\n${truncate(
              buildLog,
              9000,
            )}`
          : lastUser?.content || project.prompt;
    const currentMessageId = (isFix || isValidationFix) && !isFresh ? null : lastUser?.id || null;

    if (isFresh) {
      updateProject(id, { buildLog: '' });
    }

    if (isFix && !isFresh) {
      updateProject(id, { buildLog: '' });
      addMessage(id, {
        role: 'user',
        kind: 'chat',
        content: 'Corrija o erro de build e devolva o app funcionando.',
      });
    }

    if (isValidationFix) {
      addMessage(id, {
        role: 'user',
        kind: 'chat',
        content: 'Corrija os problemas encontrados na validação do preview.',
      });
    }

    setStage(id, 'Consultando documentação atualizada (Context7)');
    const knowledge = await collectKnowledge(instruction);
    if (!getProject(id)) return;
    updateProject(id, { knowledge: knowledgeForProject(knowledge) });

    const knowledgeText = knowledge.status === 'used' ? knowledge.text : '';
    const usedLibraries = (knowledge.libraries || [])
      .filter((library) => library.chars > 0)
      .map((library) => library.name);
    setStage(
      id,
      usedLibraries.length
        ? `Consultando o modelo (Context7: ${usedLibraries.join(', ')})`
        : 'Consultando o modelo',
    );
    const generation = await generateWithRetry(
      id,
      instruction,
      files,
      isFix ? buildLog : '',
      currentMessageId,
      knowledgeText,
    );

    if (!getProject(id)) return;

    const parsed = generation.parsed;
    setStage(id, 'Gravando arquivos');
    await writeGeneratedFiles(id, parsed.files);

    const patch = {
      description: parsed.description || project.description || '',
      provider: generation.provider,
      model: generation.model,
      files: parsed.files.map((file) => file.path),
    };
    if (!files.length) {
      patch.name = parsed.name || parsed.description?.slice(0, 60) || project.name;
    } else if (parsed.name && project.name === 'Novo app') {
      patch.name = parsed.name;
    }
    updateProject(id, patch);

    setStage(id, 'Compilando o app');
    await buildProject(id);

    const versionLabel = isFresh
      ? 'Geração reiniciada'
      : isValidationFix
        ? 'Correção da validação'
        : isFix
          ? 'Correção de build'
          : files.length
            ? 'Alteração por chat'
            : 'Geração inicial';
    await snapshotVersion(id, {
      label: versionLabel,
      kind: 'generation',
      messageId: currentMessageId,
    }).catch((error) => {
      console.warn(`[versions] projeto ${id}: ${error.message}`);
    });

    const summary =
      parsed.message ||
      `App ${files.length ? 'atualizado' : 'gerado'} com ${parsed.files.length} arquivo(s).`;
    addMessage(id, {
      role: 'assistant',
      kind: 'info',
      content: `${summary}\n\nBuild concluído com sucesso.`,
    });
    updateProject(id, { stage: '' });
  } catch (error) {
    if (!getProject(id)) return;
    const message = error.message || 'Erro inesperado durante a geração.';
    console.error(`[generator] projeto ${id}:`, message);
    updateProject(id, {
      status: 'error',
      stage: '',
      error: truncate(message, 5000),
      ...(error.buildLog ? { buildLog: truncate(error.buildLog, 16000) } : {}),
    });
    addMessage(id, {
      role: 'assistant',
      kind: 'error',
      content: `Não foi possível concluir: ${truncate(message, 2500)}`,
    });
  }
}

function startJob(id, options, runner) {
  if (jobs.has(id)) return false;
  const promise = Promise.resolve()
    .then(() => new Promise((resolve) => setImmediate(resolve)))
    .then(() => runner(id, options))
    .catch((error) => {
      console.error(`[generator] job ${id}:`, error);
    })
    .finally(() => jobs.delete(id));
  jobs.set(id, promise);
  return true;
}

export function requestGeneration(id, options = {}) {
  return startJob(id, options, runGeneration);
}

export function isGenerating(id) {
  return jobs.has(id);
}

export function requestRebuild(id) {
  if (jobs.has(id)) return false;
  // Marca o estado antes de devolver a resposta: o painel já começa a
  // acompanhar o build em vez de continuar exibindo o preview antigo.
  updateProject(id, { status: 'building', stage: 'Recompilando', error: null });
  const promise = Promise.resolve()
    .then(() => new Promise((resolve) => setImmediate(resolve)))
    .then(async () => {
      try {
        await buildProject(id);
        await snapshotVersion(id, { label: 'Recompilação', kind: 'rebuild' }).catch((error) => {
          console.warn(`[versions] projeto ${id}: ${error.message}`);
        });
        addMessage(id, {
          role: 'assistant',
          kind: 'info',
          content: 'Build recompilado com sucesso.',
        });
        updateProject(id, { stage: '' });
      } catch (error) {
        if (!getProject(id)) return;
        updateProject(id, {
          status: 'error',
          stage: '',
          error: truncate(error.message, 5000),
          buildLog: truncate(error.message, 16000),
        });
        addMessage(id, {
          role: 'assistant',
          kind: 'error',
          content: `O build falhou: ${truncate(error.message, 2500)}`,
        });
      }
    })
    .finally(() => jobs.delete(id));
  jobs.set(id, promise);
  return true;
}

export function requestRestore(id, version) {
  if (jobs.has(id)) return false;
  // O status muda antes da resposta para o painel acompanhar o build da versão
  // restaurada em vez de mostrar o preview antigo.
  updateProject(id, {
    status: 'building',
    stage: `Restaurando a versão ${version}`,
    error: null,
  });
  const promise = Promise.resolve()
    .then(() => new Promise((resolve) => setImmediate(resolve)))
    .then(async () => {
      try {
        const meta = await restoreVersion(id, version);
        await buildProject(id);
        addMessage(id, {
          role: 'assistant',
          kind: 'info',
          content: `Versão ${meta.version} restaurada e build concluído com sucesso.`,
        });
        updateProject(id, { stage: '' });
      } catch (error) {
        if (!getProject(id)) return;
        updateProject(id, {
          status: 'error',
          stage: '',
          error: truncate(error.message, 5000),
          buildLog: truncate(error.message, 16000),
        });
        addMessage(id, {
          role: 'assistant',
          kind: 'error',
          content: `Não foi possível restaurar a versão ${version}: ${truncate(error.message, 2500)}`,
        });
      }
    })
    .finally(() => jobs.delete(id));
  jobs.set(id, promise);
  return true;
}

export function generatorStats() {
  return { activeJobs: jobs.size, activeBuilds };
}

export function templateMain() {
  return templateMainSource();
}
