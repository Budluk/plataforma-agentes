import { errorKindOf, esc, fileKind, fmtDuration, fmtTime, icon, initial, isBusy, knowledgeChip, referenceChip, relTime, stageStepState, statusInfo, validationInfo, validationIssueCount } from '../ui.js';
import { state } from '../runtime.js';
import { CHAT_SUGGESTIONS, VALIDATION_STATE } from '../constants.js';

export function ensureSelectedFile() {
  const files = state.project?.files || [];
  if (!state.selectedFile || !files.some((file) => file.path === state.selectedFile)) {
    state.selectedFile =
      files.find((file) => ['src/App.tsx', 'App.tsx'].includes(file.path))?.path ||
      files[0]?.path ||
      null;
  }
}

export function renderWorkspaceTabsList() {
  const activeId = state.route.name === 'project' ? state.route.id : state.project?.id;
  const entries = state.openProjects
    .map(
      (id) =>
        state.projects.find((project) => project.id === id) ||
        (state.project?.id === id ? state.project : null),
    )
    .filter(Boolean);
  return entries
    .map((project) => {
      const info = statusInfo(project.status);
      const active = project.id === activeId;
      return `<div class="ws-tab ${active ? 'active' : ''}">
        <button class="ws-tab-main" type="button" data-action="switch-project" data-id="${esc(project.id)}" title="${esc(project.name)}" aria-current="${active ? 'page' : 'false'}">
          <span class="dot ${info.dot}"></span>
          <span class="ws-tab-name">${esc(project.name)}</span>
          ${isBusy(project) ? icon('loader', 'spin ws-tab-spin') : ''}
        </button>
        <button class="ws-tab-close" type="button" data-action="close-project-tab" data-id="${esc(project.id)}" title="Fechar aba" aria-label="Fechar ${esc(project.name)}">${icon('x')}</button>
      </div>`;
    })
    .join('');
}

function renderWorkspaceTabs() {
  return `<nav class="ws-tabs" aria-label="Projetos abertos">
    <div class="ws-tabs-list" id="ws-tabs-list">${renderWorkspaceTabsList()}</div>
    <a class="ws-tab-add" href="#/" title="Abrir outro projeto" aria-label="Abrir outro projeto">${icon('plus')}</a>
  </nav>`;
}

function viewTabAttrs(id) {
  const selected = state.tab === id;
  return `role="tab" id="view-tab-${id}" aria-selected="${selected}" aria-controls="canvas-body" tabindex="${selected ? '0' : '-1'}"`;
}
export function renderWorkspace() {
  const project = state.project;
  if (!project) {
    if (state.routeError) {
      return `<div class="boot">
        <div class="boot-mark">CS</div>
        <h1 class="boot-title">Não foi possível abrir o projeto</h1>
        <p class="boot-text">${esc(state.routeError)}</p>
        <div class="boot-actions">
          <button class="btn primary" type="button" data-action="retry-route">${icon('refresh')} Tentar de novo</button>
          <a class="btn ghost" href="#/">Voltar para o início</a>
        </div>
      </div>`;
    }
    return `<div class="boot"><div class="boot-mark">CS</div><p>Abrindo projeto…</p></div>`;
  }
  const info = statusInfo(project.status);
  const busy = isBusy(project);
  const canChat = !busy && ['ready', 'error'].includes(project.status);
  const previewUrl = project.previewUrl || '';
  const version = project.previewVersion || 0;
  const validation = project.validation || null;
  const validationIssues = validationIssueCount(validation);
  const validationRunning = validation?.status === 'running' || state.validationBusy;
  return `<div class="workspace">
    ${renderWorkspaceTabs()}
    <header class="ws-head">
      <div class="ws-left">
        ${
          state.route.detached
            ? `<button class="icon-btn" type="button" data-action="close-window" title="Fechar janela" aria-label="Fechar janela">${icon('x')}</button>`
            : `<a class="icon-btn" href="#/" title="Voltar para o início" aria-label="Voltar para o início">${icon('arrowLeft')}</a>`
        }
        <span class="ws-project-mark" aria-hidden="true">${esc(initial(project.name))}</span>
        <div class="ws-title">
          <h1>${esc(project.name)}</h1>
          <div class="ws-sub">
            <span class="status-pill ${info.cls}"><span class="dot ${info.dot}"></span>${info.label}</span>
            ${project.model ? `<span class="model">${esc(project.model)}</span>` : ''}
            ${knowledgeChip(project)}
            ${referenceChip(project)}
            ${previewUrl && version ? `<span class="ws-url" title="${esc(previewUrl)}">${icon('external')}${esc(previewUrl)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="ws-right">
        ${
          state.route.detached
            ? ''
            : `<button class="icon-btn" type="button" data-action="open-project-window" data-id="${esc(project.id)}" title="Abrir em janela separada" aria-label="Abrir em janela separada">${icon('window')}</button>`
        }
        ${
          project.status === 'error'
            ? errorKindOf(project) === 'build'
              ? `<button class="btn small" type="button" data-action="fix-build">${icon('wrench')} Corrigir build</button>`
              : `<button class="btn small primary" type="button" data-action="retry-generation">${icon('refresh')} Tentar de novo</button>`
            : ''
        }
        ${
          project.status === 'ready' && version
            ? `<button class="icon-btn" type="button" data-action="validate-preview" title="Validar preview no navegador" aria-label="Validar preview no navegador" ${validationRunning ? 'disabled' : ''}>${icon(validationRunning ? 'loader' : 'shield', validationRunning ? 'spin' : '')}</button>`
            : ''
        }
        <button class="icon-btn" type="button" data-action="rebuild" title="Recompilar" aria-label="Recompilar">${icon('refresh')}</button>
        ${
          previewUrl && version
            ? `<a class="btn ghost" href="${esc(previewUrl)}" target="_blank" rel="noreferrer">${icon('external')}<span>Abrir</span></a>
               <button class="icon-btn" type="button" data-action="copy-preview-link" data-copy="${esc(previewUrl)}" title="Copiar link do preview" aria-label="Copiar link do preview">${icon('copy')}</button>`
            : ''
        }
      </div>
    </header>
    <div class="ws-grid">
      <section class="canvas">
        <div class="canvas-bar">
          <div class="tabs" role="tablist" aria-label="Visões do projeto">
            <button class="tab ${state.tab === 'preview' ? 'active' : ''}" type="button" ${viewTabAttrs('preview')} data-action="tab" data-tab="preview">${icon('monitor')} Preview</button>
            <button class="tab ${state.tab === 'validation' ? 'active' : ''}" type="button" ${viewTabAttrs('validation')} data-action="tab" data-tab="validation">${icon(validationRunning ? 'loader' : 'shield', validationRunning ? 'spin' : '')} Validação${validationIssues && !validationRunning ? `<span class="tab-badge">${validationIssues}</span>` : ''}</button>
            <button class="tab ${state.tab === 'code' ? 'active' : ''}" type="button" ${viewTabAttrs('code')} data-action="tab" data-tab="code">${icon('code')} Código</button>
            <button class="tab ${state.tab === 'versions' ? 'active' : ''}" type="button" ${viewTabAttrs('versions')} data-action="tab" data-tab="versions">${icon('clock')} Histórico</button>
            <button class="tab ${state.tab === 'log' ? 'active' : ''}" type="button" ${viewTabAttrs('log')} data-action="tab" data-tab="log">${icon('terminal')} Log</button>
          </div>
          ${
            state.tab === 'preview' && project.status === 'ready'
              ? `<div class="canvas-tools">
                  <span class="canvas-tools-label">Visualização</span>
                  <div class="tool-group">
                    <button class="icon-btn ${state.device === 'desktop' ? 'active' : ''}" type="button" data-action="device" data-device="desktop" title="Desktop" aria-label="Visualizar em desktop" aria-pressed="${state.device === 'desktop'}">${icon('monitor')}</button>
                    <button class="icon-btn ${state.device === 'mobile' ? 'active' : ''}" type="button" data-action="device" data-device="mobile" title="Mobile" aria-label="Visualizar em mobile" aria-pressed="${state.device === 'mobile'}">${icon('smartphone')}</button>
                    <button class="icon-btn" type="button" data-action="refresh-preview" title="Recarregar preview" aria-label="Recarregar preview">${icon('refresh')}</button>
                  </div>
                </div>`
              : ''
          }
        </div>
        <div class="canvas-body" id="canvas-body" role="tabpanel" aria-labelledby="view-tab-${state.tab}" aria-busy="${busy}">${renderCanvas(project)}</div>
      </section>
      <aside class="chat">
        <div class="chat-head">
          <div class="chat-head-main">
            <span class="chat-avatar ${busy ? 'busy' : ''}" aria-hidden="true">CS</span>
            <div class="chat-head-text">
              <strong>Conversa</strong>
              <span>${busy ? esc(project.stage || 'Trabalhando no app…') : 'Peça ajustes no app gerado'}</span>
            </div>
          </div>
          <span class="chat-count" title="Mensagens na conversa">${(project.messages || []).length}</span>
        </div>
        <div class="messages ${(project.messages || []).length ? '' : 'empty'}" id="messages" aria-busy="${busy}">
          ${
            (project.messages || []).length
              ? renderMessages(project)
              : `<div class="chat-empty">
                  <div class="chat-empty-icon">${icon('sparkles')}</div>
                  <h3>Comece a conversa</h3>
                  <p>Peça uma alteração, corrija algo ou descreva o próximo passo do app.</p>
                </div>`
          }
          ${
            busy
              ? `<div class="message assistant typing-message">
                  <div class="avatar">CS</div>
                  <div class="message-body">
                    <div class="message-meta"><span class="message-author">CloneStudio</span><span class="message-kind working">trabalhando</span></div>
                    <div class="typing"><span></span><span></span><span></span></div>
                  </div>
                </div>`
              : ''
          }
        </div>
        <div class="chat-foot">
          ${
            canChat
              ? `<div class="chat-quick">
                  <span>Sugestões</span>
                  ${CHAT_SUGGESTIONS.map(
                    (suggestion) =>
                      `<button type="button" data-action="chat-suggestion" data-prompt="${esc(suggestion)}">${esc(suggestion)}</button>`,
                  ).join('')}
                </div>`
              : ''
          }
          <form id="chat-form" class="chat-form">
            <label class="sr-only" for="chat-input">Descreva a alteração que você quer no app</label>
            <textarea id="chat-input" maxlength="8000" placeholder="${canChat ? 'Peça uma alteração…' : 'Aguarde a geração atual…'}" ${canChat ? '' : 'disabled'}>${esc(state.chatDraft)}</textarea>
            <button class="send-btn" type="submit" ${canChat && state.chatDraft.trim() ? '' : 'disabled'} title="Enviar" aria-label="Enviar mensagem">${icon('arrowUp')}</button>
          </form>
          <p class="chat-hint">
            <span>${canChat ? 'Enter envia · Shift+Enter quebra linha' : 'Você poderá conversar quando o build terminar'}</span>
            ${busy ? `<span class="stage-text">${esc(project.stage || 'Trabalhando…')}</span>` : ''}
          </p>
        </div>
      </aside>
    </div>
  </div>`;
}
function renderCanvas(project) {
  if (state.tab === 'code') return renderCodeView(project);
  if (state.tab === 'log') return renderLogView(project);
  if (state.tab === 'validation') return renderValidationView(project);
  if (state.tab === 'versions') return renderVersionsView(project);
  if (project.status === 'error') return renderErrorView(project);
  if (project.status === 'generating' || project.status === 'building' || !project.previewVersion) {
    return renderStage(project);
  }
  const src = `${esc(project.previewUrl)}?v=${project.previewVersion}-${state.previewNonce}`;
  const prettyUrl = esc(String(project.previewUrl || '').replace(/^https?:\/\//, ''));
  const shownVersion = project.currentVersion || project.previewVersion;
  return `<div class="preview-wrap">
    <div class="preview-frame ${state.device === 'mobile' ? 'mobile' : ''}">
      <div class="preview-chrome">
        <span class="preview-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="preview-address" title="${esc(project.previewUrl)}">${icon('monitor')}<span>${prettyUrl}</span></span>
        <span class="preview-version" title="Versão atual">v${esc(String(shownVersion))}</span>
        <a class="preview-open" href="${esc(project.previewUrl)}" target="_blank" rel="noreferrer" title="Abrir preview em nova aba" aria-label="Abrir preview em nova aba">${icon('external')}</a>
      </div>
      <div class="preview-stage">
        <iframe src="${src}" title="Preview do app gerado" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"></iframe>
      </div>
    </div>
  </div>`;
}

function renderStage(project) {
  const steps = [
    ['Gerando código', 'O modelo está escrevendo React + TypeScript'],
    ['Validando arquivos', 'Conferindo imports e arquivos obrigatórios'],
    ['Compilando', 'Rodando o build do Vite'],
    ['Validando preview', 'Abrindo o app em um navegador real'],
    ['Publicando', 'Liberando a nova versão do preview'],
  ];
  const states = steps.map((_, index) => stageStepState(project, index));
  const done = states.filter((status) => status === 'done').length;
  const activeIndex = states.indexOf('active');
  const current = steps[activeIndex >= 0 ? activeIndex : Math.min(done, steps.length - 1)];
  const heading =
    project.stage || (project.status === 'building' ? 'Compilando seu app…' : 'Gerando seu app…');
  return `<div class="stage-screen">
    <section class="stage-card">
      <header class="stage-head">
        <div class="orb"><div class="orb-core">${icon('sparkles')}</div></div>
        <div class="stage-head-text">
          <span class="stage-kicker">${project.status === 'building' ? 'Compilando' : 'Gerando'}</span>
          <h2>${esc(heading)}</h2>
          <p>${esc(current[1])}</p>
        </div>
        <span class="stage-pill">${icon('loader', 'spin')} ${done}/${steps.length}</span>
      </header>
      <ol class="stage-steps">
        ${steps
          .map(([label, hint], index) => {
            const status = states[index];
            const iconName = status === 'done' ? 'check' : status === 'active' ? 'loader' : 'clock';
            return `<li class="stage-step ${status}">
              <span class="stage-step-icon">${icon(iconName, status === 'active' ? 'spin' : '')}</span>
              <span class="stage-step-text"><strong>${label}</strong><small>${hint}</small></span>
            </li>`;
          })
          .join('')}
      </ol>
      <footer class="stage-foot">
        <span>${icon('terminal')} Acompanhe os detalhes na aba Log.</span>
        <button class="btn small ghost" type="button" data-action="tab" data-tab="log">Abrir log</button>
      </footer>
    </section>
  </div>`;
}
function renderErrorView(project) {
  const hasFiles = Boolean(project.files?.length);
  const hasLog = Boolean(project.buildLog);
  const kind = errorKindOf(project);
  const buildFailed = kind === 'build';
  const interrupted = kind === 'interrupted';
  let description;
  let nextStep;
  let title;
  let badge;
  if (interrupted) {
    description = hasFiles
      ? 'O servidor reiniciou no meio da geração. O código atual foi preservado; tentar de novo recomeça a partir do prompt original.'
      : 'O servidor reiniciou antes de o app ser gerado. Tentar de novo reenvia o prompt original.';
    nextStep = hasFiles
      ? 'O código atual foi preservado. Tentar de novo recomeça a geração do zero.'
      : 'Nenhum arquivo foi gravado. Tentar de novo reenvia o prompt original.';
    title = 'Geração interrompida';
    badge = 'interrompida';
  } else if (buildFailed) {
    description =
      'O código foi gravado, mas o build falhou. Peça uma correção automática ou ajuste pelo chat.';
    nextStep = 'O código atual foi preservado. Corrija o build ou descreva o ajuste no chat.';
    title = 'O build não foi concluído';
    badge = 'build';
  } else {
    description =
      'O modelo não conseguiu concluir. Tente novamente — o prompt original será enviado de novo.';
    nextStep = 'Nenhum arquivo foi gravado. Tentar de novo reenvia o prompt original.';
    title = 'Não foi possível gerar o app';
    badge = 'geração';
  }
  return `<div class="error-panel">
    <section class="error-card">
      <header class="error-head">
        <div class="error-icon">${icon('alert')}</div>
        <div class="error-head-text">
          <span class="error-kicker">${buildFailed ? 'Build não concluído' : 'Geração interrompida'}</span>
          <h2>${title}</h2>
        </div>
        <span class="error-badge">${badge}</span>
      </header>
      <div class="error-body">
        <p>${description}</p>
        <span class="error-message-label">Detalhe técnico</span>
        <pre class="error-message">${esc(project.error || 'Erro desconhecido.')}</pre>
        <div class="error-actions">
          ${
            buildFailed && hasFiles
              ? `<button class="btn primary" type="button" data-action="fix-build">${icon('wrench')} Corrigir com IA</button>
                 <button class="btn" type="button" data-action="rebuild">${icon('refresh')} Tentar build de novo</button>
                 ${hasLog ? `<button class="btn" type="button" data-action="tab" data-tab="log">${icon('terminal')} Ver log</button>` : ''}`
              : `<button class="btn primary" type="button" data-action="retry-generation">${icon('refresh')} Tentar de novo</button>
                 ${hasFiles ? `<button class="btn" type="button" data-action="rebuild">${icon('refresh')} Tentar build de novo</button>` : ''}`
          }
        </div>
      </div>
      <footer class="error-foot">${icon('info')} ${nextStep}</footer>
    </section>
  </div>`;
}

function renderLogView(project) {
  const log = project.buildLog
    ? project.buildLog
    : 'Nenhum log de build disponível. Gere o app ou use "Recompilar" para produzir um log.';
  const lines = String(log).split('\n').length;
  return `<div class="log-view">
    <div class="code-head">
      <span class="left">${icon('terminal')} <span class="path">build.log</span>
        <span class="badge">${lines} linha(s)</span>
      </span>
      <button class="btn small" type="button" data-action="rebuild">${icon('refresh')} Recompilar</button>
    </div>
    <pre class="log-box">${esc(log)}</pre>
  </div>`;
}

function renderValidationEntries(title, iconName, entries, formatter) {
  if (!entries?.length) return '';
  return `<section class="validation-section">
    <div class="validation-section-head">
      <span class="left">${icon(iconName)}<h3>${title}</h3></span>
      <span class="count">${entries.length}</span>
    </div>
    <ul class="validation-list">
      ${entries.map((entry) => `<li>${formatter(entry)}</li>`).join('')}
    </ul>
  </section>`;
}

function renderValidationCounts(counts) {
  if (!counts) return '';
  const items = [
    ['console', 'Console'],
    ['page', 'Exceções'],
    ['requests', 'Rede'],
    ['http', 'HTTP'],
  ].filter(([key]) => Number(counts[key]) > 0);
  if (!items.length) return '';
  return `<div class="validation-counts">${items
    .map(
      ([key, label]) =>
        `<span class="validation-count"><strong>${Number(counts[key])}</strong>${label}</span>`,
    )
    .join('')}</div>`;
}
function renderValidationView(project) {
  const base = validationInfo(project);
  const running = base.status === 'running' || state.validationBusy;
  const { validation, status, label, cls, icon: iconName, hint } = running
    ? { ...base, ...VALIDATION_STATE.running, status: 'running' }
    : base;
  const counts = validation?.counts || null;
  const issues = validationIssueCount(validation);
  const version = project.previewVersion || 0;
  const canValidate = project.status === 'ready' && Boolean(version) && !running;
  const hasDiagnostics = Boolean(
    validation && (issues > 0 || validation.blank || validation.navigationError),
  );
  const canFix =
    project.status === 'ready' &&
    !running &&
    ['issues', 'failed'].includes(status) &&
    hasDiagnostics;
  const stale = Boolean(
    validation?.previewVersion && version && validation.previewVersion !== version,
  );
  const checked = !running && validation?.checkedAt ? relTime(validation.checkedAt) : '';
  const shotUrl =
    validation?.screenshot && !stale && !running
      ? `/api/projects/${project.id}/validation/screenshot?v=${encodeURIComponent(
          validation.screenshotVersion || validation.checkedAt || '',
        )}`
      : '';
  const viewport = validation?.viewport
    ? `${validation.viewport.width}×${validation.viewport.height}`
    : '';
  const reason = validation?.reason || validation?.navigationError || '';
  const attempts = Array.isArray(validation?.browserAttempts) ? validation.browserAttempts : [];
  const instruction = validation?.instruction || '';
  const meta = [
    checked
      ? `<span title="${esc(validation.checkedAt)}">${icon('clock')} ${esc(checked)}</span>`
      : '',
    validation?.browser && !running
      ? `<span>${icon('monitor')} ${esc(validation.browser)}</span>`
      : '',
    validation?.durationMs && !running
      ? `<span>${icon('bolt')} ${esc(fmtDuration(validation.durationMs))}</span>`
      : '',
    viewport && !running ? `<span>${icon('smartphone')} ${esc(viewport)}</span>` : '',
  ]
    .filter(Boolean)
    .join('');
  const validateButton = canValidate
    ? `<button class="btn ${canFix ? 'ghost' : 'primary'}" type="button" data-action="validate-preview">${icon('refresh')} ${
        status === 'none' ? 'Validar preview' : 'Validar de novo'
      }</button>`
    : '';
  const fixButton = canFix
    ? `<button class="btn primary" type="button" data-action="fix-validation">${icon('wrench')} Corrigir com IA</button>`
    : '';
  const awaitingBuild =
    !running && ['generating', 'building'].includes(project.status) && status !== 'issues';

  return `<div class="validation-view">
    <section class="validation-hero ${cls}">
      <div class="validation-hero-icon">${icon(running ? 'loader' : iconName, running ? 'spin' : '')}</div>
      <div class="validation-hero-body">
        <span class="category">Validação de preview</span>
        <h2>${esc(label)}</h2>
        <p>${esc(hint)}</p>
        ${meta ? `<div class="validation-meta">${meta}</div>` : ''}
        ${running ? '<div class="validation-progress"><span></span></div>' : ''}
      </div>
      <div class="validation-actions">
        ${fixButton}
        ${validateButton}
        ${
          running
            ? `<span class="validation-running-note">${icon('loader', 'spin')} Abrindo o preview…</span>`
            : ''
        }
      </div>
    </section>
    ${
      stale
        ? `<div class="note">${icon('info')}<div>Este resultado é da versão ${
            validation.previewVersion
          } do preview, mas a versão atual é ${version}. Valide novamente para atualizar o diagnóstico.</div></div>`
        : ''
    }
    ${
      awaitingBuild
        ? `<div class="note">${icon('info')}<div>A validação roda automaticamente assim que o build terminar e o preview estiver disponível.</div></div>`
        : ''
    }
    ${!running && (canFix || status === 'issues' || status === 'failed') ? renderValidationCounts(counts) : ''}
    ${
      status === 'none'
        ? `<div class="validation-empty">
            <div class="validation-empty-icon">${icon('shield')}</div>
            <h3>O preview ainda não foi inspecionado</h3>
            <p>A validação abre o app em um navegador headless real, coleta erros de console e de rede, detecta tela em branco e salva um screenshot.</p>
            <p>Ela roda automaticamente após cada build bem-sucedido. Use o botão acima para validar agora.</p>
          </div>`
        : ''
    }
    ${
      status === 'passed'
        ? `<section class="validation-clean">
            <div class="validation-clean-icon">${icon('check')}</div>
            <div>
              <h3>Nenhum erro de execução encontrado</h3>
              <p>${
                validation?.metrics
                  ? `${validation.metrics.bodyTextLength} caracteres de texto e ${validation.metrics.interactive} elemento(s) interativo(s) encontrados na página.`
                  : 'O app abriu, renderizou conteúdo e não registrou erros.'
              }</p>
            </div>
          </section>`
        : ''
    }
    ${
      validation?.blank
        ? `<section class="validation-alert">${icon('alert')}
            <div><strong>Página em branco</strong><p>O app abriu sem texto visível e sem elementos interativos. Normalmente é um erro de renderização, import ou componente raiz.</p></div>
          </section>`
        : ''
    }
    ${shotUrl
        ? `<section class="validation-section validation-shot">
            <div class="validation-section-head">
              <span class="left">${icon('monitor')}<h3>Screenshot do preview</h3></span>
              <a class="link" href="${shotUrl}" target="_blank" rel="noreferrer">${icon('external')} Abrir</a>
            </div>
            <a class="validation-shot-frame" href="${shotUrl}" target="_blank" rel="noreferrer" title="Abrir screenshot em tamanho real">
              <img src="${shotUrl}" alt="Screenshot do preview capturado durante a validação" loading="lazy" />
            </a>
          </section>`
        : ''
    }
    ${renderValidationEntries(
      'Exceções não tratadas',
      'alert',
      validation?.pageErrors,
      (entry) => `<div class="validation-entry">
        <code class="validation-entry-text">${esc(entry.message)}</code>
        ${
          entry.stack
            ? `<details class="validation-stack"><summary>Ver stack trace</summary><pre>${esc(
                entry.stack,
              )}</pre></details>`
            : ''
        }
      </div>`,
    )}
    ${renderValidationEntries(
      'Erros de console',
      'terminal',
      validation?.consoleErrors,
      (entry) => `<div class="validation-entry">
        <code class="validation-entry-text">${esc(entry.text)}</code>
        ${entry.location ? `<span class="validation-entry-meta">${esc(entry.location)}</span>` : ''}
      </div>`,
    )}
    ${renderValidationEntries(
      'Requisições com falha',
      'plug',
      validation?.failedRequests,
      (entry) => `<div class="validation-entry validation-entry-row">
        <span class="validation-code">${esc(entry.method)}</span>
        <code class="validation-entry-text">${esc(entry.url)}</code>
        <span class="validation-entry-meta">${esc(entry.error)}</span>
      </div>`,
    )}
    ${renderValidationEntries(
      'Respostas HTTP de erro',
      'alert',
      validation?.httpErrors,
      (entry) => `<div class="validation-entry validation-entry-row">
        <span class="validation-code bad">${esc(entry.status)}</span>
        <span class="validation-entry-meta">${esc(entry.method)}</span>
        <code class="validation-entry-text">${esc(entry.url)}</code>
      </div>`,
    )}
    ${renderValidationEntries(
      'Imagens quebradas',
      'image',
      validation?.brokenImages,
      (entry) => `<div class="validation-entry">
        <code class="validation-entry-text">${esc(entry.src)}</code>
        ${entry.alt ? `<span class="validation-entry-meta">alt: ${esc(entry.alt)}</span>` : ''}
      </div>`,
    )}
    ${
      reason && !running && !['passed', 'none'].includes(status)
        ? `<section class="validation-section validation-diagnostic">
            <div class="validation-section-head">
              <span class="left">${icon('info')}<h3>Detalhes da validação</h3></span>
            </div>
            <pre class="validation-reason">${esc(reason)}</pre>
            ${
              attempts.length
                ? `<details class="validation-attempts"><summary>${attempts.length} tentativa(s) de abrir o navegador</summary><ul>${attempts
                    .map((attempt) => `<li>${esc(attempt)}</li>`)
                    .join('')}</ul></details>`
                : ''
            }
          </section>`
        : ''
    }
    ${
      instruction && !running
        ? `<details class="validation-instruction">
            <summary>${icon('code')} Instrução enviada ao modelo ao corrigir</summary>
            <pre>${esc(instruction)}</pre>
          </details>`
        : ''
    }
    ${
      status === 'disabled'
        ? `<div class="note">${icon('info')}<div>Defina <code class="mono">PREVIEW_VALIDATION=on</code> no <code class="mono">.env</code> e reinicie o servidor para reativar a validação automática.</div></div>`
        : ''
    }
  </div>`;
}

function renderVersionsView(project) {
  const versions = state.versions;
  const loading = state.versionsBusy && !versions.length;
  const busy = isBusy(project) || state.busyAction;
  const head = `<div class="versions-head">
    <div>
      <h2>${icon('clock')} Histórico de versões</h2>
      <p>Cada build bem-sucedido vira uma versão restaurável. Restaurar recompila o app e salva o estado atual antes da troca.</p>
    </div>
    <div class="versions-head-actions">
      <span class="versions-count">${versions.length} versão(ões)</span>
      <button class="btn small" type="button" data-action="refresh-versions" ${state.versionsBusy ? 'disabled' : ''}>${icon('refresh', state.versionsBusy ? 'spin' : '')} Atualizar</button>
    </div>
  </div>`;

  if (loading) {
    return `<div class="versions-view">${head}<div class="versions-empty">${icon('loader', 'spin')} Carregando versões…</div></div>`;
  }
  if (state.versionsError) {
    return `<div class="versions-view">${head}<div class="versions-empty error">${icon('alert')} ${esc(state.versionsError)}</div></div>`;
  }
  if (!versions.length) {
    return `<div class="versions-view">${head}<div class="versions-empty">${icon('info')} Nenhuma versão ainda. Gere o app ou peça uma alteração para criar a primeira.</div></div>`;
  }

  return `<div class="versions-view">${head}
    <div class="version-list">
      ${versions
        .map((version) => {
          const current = version.version === (project.currentVersion || 0);
          const restoring = state.restoringVersion === version.version;
          const when = relTime(version.createdAt);
          return `<article class="version-card ${current ? 'current' : ''}">
            <span class="version-number">v${version.version}</span>
            <div class="version-body">
              <strong>${esc(version.label || 'Versão')}</strong>
              <span class="version-meta" title="${esc(version.createdAt)}">${when} · ${version.fileCount} arquivo(s)</span>
            </div>
            ${
              current
                ? '<span class="version-current">atual</span>'
                : `<button class="btn small" type="button" data-action="restore-version" data-version="${version.version}" ${busy ? 'disabled' : ''}>${icon(restoring ? 'loader' : 'clock', restoring ? 'spin' : '')} ${restoring ? 'Restaurando…' : 'Restaurar'}</button>`
            }
          </article>`;
        })
        .join('')}
    </div>
  </div>`;
}
function renderCodeView(project) {
  const files = project.files || [];
  ensureSelectedFile();
  const selected = files.find((file) => file.path === state.selectedFile) || files[0] || null;
  const selectedLines = selected ? String(selected.content || '').split('\n').length : 0;
  const selectedPath = selected ? String(selected.path) : '';
  const slash = selectedPath.lastIndexOf('/');
  const dir = slash >= 0 ? selectedPath.slice(0, slash + 1) : '';
  const name = slash >= 0 ? selectedPath.slice(slash + 1) : selectedPath;
  return `<div class="code-view">
    <div class="file-tree">
      <div class="file-tree-head"><span>Arquivos</span><span class="count">${files.length}</span></div>
      ${files
        .map(
          (file) => `<button class="file-btn file-${fileKind(file.path)} ${selected && file.path === selected.path ? 'active' : ''}" type="button" data-action="select-file" data-file="${esc(file.path)}">
            ${icon(fileKind(file.path) === 'css' ? 'layers' : 'file')}<span>${esc(file.path.replace(/^src\//, ''))}</span>
          </button>`,
        )
        .join('')}
    </div>
    <div class="code-pane">
      <div class="code-head">
        <span class="left">${icon('file')} <span class="path">${dir ? `<span class="dir">${esc(dir)}</span>` : ''}<strong>${esc(name || 'nenhum arquivo')}</strong></span>
          ${selected && selected.path === 'src/main.tsx' ? '<span class="badge">fixo</span>' : ''}
          ${selected ? `<span class="badge">${selectedLines} linha(s)</span>` : ''}
        </span>
        ${selected ? `<button class="copy-btn" type="button" data-action="copy-code" title="Copiar código" aria-label="Copiar código">${icon('copy')}</button>` : ''}
      </div>
      <div class="code-scroll">${selected ? renderCode(selected.content) : '<p class="muted empty-note">Nenhum arquivo.</p>'}</div>
    </div>
  </div>`;
}

function renderCode(content) {
  const lines = String(content).split('\n');
  return `<pre class="code"><code>${lines
    .map(
      (line, index) =>
        `<span class="code-line"><span class="ln" aria-hidden="true">${index + 1}</span><span class="lc">${esc(line) || ' '}</span></span>`,
    )
    .join('')}</code></pre>`;
}

function renderMessages(project) {
  return (project.messages || [])
    .map((message) => {
      const user = message.role === 'user';
      const kind = message.kind === 'error' ? 'error' : message.kind === 'info' ? 'info' : '';
      const kindLabel = kind === 'error' ? 'Erro' : kind === 'info' ? 'Aviso' : '';
      const when = message.createdAt ? fmtTime(message.createdAt) : '';
      return `<div class="message ${user ? 'user' : 'assistant'}${kind ? ` ${kind}` : ''}">
        <div class="avatar">${user ? 'EU' : 'CS'}</div>
        <div class="message-body">
          <div class="message-meta">
            <span class="message-author">${user ? 'Você' : 'CloneStudio'}</span>
            ${kind ? `<span class="message-kind ${kind}">${icon(kind === 'error' ? 'alert' : 'info')} ${kindLabel}</span>` : ''}
            ${when ? `<time class="message-time" datetime="${esc(message.createdAt)}">${when}</time>` : ''}
          </div>
          <div class="bubble">${esc(message.content)}</div>
        </div>
      </div>`;
    })
    .join('');
}
