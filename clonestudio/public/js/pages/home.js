import { renderInspectionCard, renderInspirationCard, renderShell } from '../cards.js';
import { configuredProvider, esc, icon, initial, knowledgeChip, referenceChip, relTime, statusInfo } from '../ui.js';
import { state } from '../runtime.js';
import { SUGGESTIONS } from '../constants.js';

export function renderHome() {
  const busyCount = state.projects.filter((project) => ['generating', 'building'].includes(project.status)).length;
  const provider = configuredProvider();
  return renderShell(
    'home',
    `<div class="page">
      <section class="hero">
        <div class="hero-topline">
          <span class="eyebrow">${icon('sparkles')} CloneStudio AI</span>
          <a class="provider-pill ${provider ? 'ready' : 'missing'}" href="#/providers" title="${provider ? 'Provedor ativo' : 'Configurar provedor'}">
            <span class="dot ${provider ? 'good' : 'bad'}"></span>
            <strong>${provider ? esc(provider.label) : 'Sem provedor'}</strong>
            <span>${provider ? 'Ativo' : 'Configurar'}</span>
          </a>
        </div>
        <div class="hero-grid">
          <div class="hero-main">
            <h1>Descreva. A IA constrói.<br /><span class="grad">Você refina conversando.</span></h1>
            <p>Um app React completo, compilado de verdade e com preview ao vivo. Peça mudanças pelo chat e veja o resultado em segundos.</p>
            ${
              state.importBusy
                ? `<div class="import-banner">${icon('loader', 'spin')} <span>Baixando ${esc(state.importLabel || 'conteúdo')} e criando o projeto…</span></div>`
                : ''
            }
            ${
              state.inspectionBusy
                ? `<div class="import-banner">${icon('loader', 'spin')} <span>Analisando ${esc(state.inspectionLabel || 'projeto')} para descobrir o que ele faz…</span></div>`
                : ''
            }
            ${
              state.inspirationBusy
                ? `<div class="import-banner">${icon('loader', 'spin')} <span>Analisando ${esc(state.inspirationLabel || 'canal')} e estimando público e alcance públicos…</span></div>`
                : ''
            }
            <form id="create-form" class="composer">
              <label class="sr-only" for="prompt">Descreva o aplicativo que você quer criar</label>
              <textarea id="prompt" maxlength="6000" placeholder="Ex.: crie um CRM com dashboard de vendas, funil kanban e cadastro de contatos…">${esc(state.promptDraft)}</textarea>
              <div class="composer-foot">
                <span class="composer-hint">${icon('bolt')} ${busyCount ? `${busyCount} projeto(s) em andamento` : 'Ctrl + Enter para gerar'}</span>
                <span class="composer-drop">${icon('download')} Arraste um link, app ou .zip</span>
                <button class="btn primary" type="submit">${icon('sparkles')} Gerar app</button>
              </div>
            </form>
            <div class="idea-list">
              <span class="idea-label">Ideias para começar</span>
              <div class="chips">
                ${SUGGESTIONS.map(
                  (suggestion) =>
                    `<button class="chip" type="button" data-action="suggestion" data-prompt="${esc(suggestion)}">${icon('bolt')}<span>${esc(suggestion)}</span></button>`,
                ).join('')}
              </div>
            </div>
          </div>
          <aside class="hero-showcase" aria-label="Recursos do CloneStudio">
            <div class="showcase-window" aria-hidden="true">
              <div class="showcase-bar"><span></span><span></span><span></span></div>
              <div class="showcase-body">
                <div class="showcase-side"><span></span><span></span><span></span></div>
                <div class="showcase-content">
                  <div class="showcase-kicker"></div>
                  <div class="showcase-title"></div>
                  <div class="showcase-cards"><span></span><span></span><span></span></div>
                  <div class="showcase-line"></div>
                  <div class="showcase-line short"></div>
                </div>
              </div>
            </div>
            <div class="showcase-features">
              <span>${icon('code')} Código real</span>
              <span>${icon('monitor')} Preview ao vivo</span>
              <span>${icon('message')} Refino por chat</span>
            </div>
          </aside>
        </div>
        ${state.inspection ? renderInspectionCard(state.inspection) : ''}
        ${state.inspiration ? renderInspirationCard(state.inspiration) : ''}
      </section>

      ${renderOpenProjectsStrip()}

      <div class="section-head">
        <h2>Seus projetos <span class="count" id="project-count">${state.projects.length}</span></h2>
        <div class="section-actions">
          ${busyCount ? '<span class="muted page-subtle">Atualizando automaticamente…</span>' : ''}
          <button class="btn small" type="button" data-action="refresh-projects">${icon('refresh')} Atualizar</button>
        </div>
      </div>
      <div id="project-list">${renderProjectList()}</div>
    </div>`,
  );
}

export function renderProjectList() {
  if (state.projects.length === 0) {
    return `<div class="empty onboarding">
      <div class="empty-art" aria-hidden="true">
        <div class="empty-window">
          <div class="empty-window-bar"><span></span><span></span><span></span></div>
          <div class="empty-window-body"><span></span><span></span><span></span></div>
        </div>
        <span class="empty-spark">${icon('sparkles')}</span>
      </div>
      <h3>Nenhum app por aqui ainda</h3>
      <p>Escreva uma ideia acima e gere o primeiro projeto. Você também pode começar com um exemplo.</p>
      <ol class="empty-steps">
        <li>${icon('message')}<span><strong>Descreva</strong> o que quer criar</span></li>
        <li>${icon('sparkles')}<span><strong>A IA gera</strong> o app e compila</span></li>
        <li>${icon('bolt')}<span><strong>Você refina</strong> pelo chat</span></li>
      </ol>
      <button class="btn primary" type="button" data-action="suggestion" data-prompt="${esc(SUGGESTIONS[0])}">${icon('sparkles')} Usar um exemplo</button>
    </div>`;
  }
  return `<div class="project-grid">${state.projects.map(renderProjectCard).join('')}</div>`;
}

export function renderOpenProjectsStrip() {
  const entries = state.openProjects
    .map((id) => state.projects.find((project) => project.id === id))
    .filter(Boolean);
  if (!entries.length) return '';
  return `<section class="open-projects" id="open-projects-strip" aria-label="Projetos abertos">
    <div class="open-projects-head">
      <span>${icon('window')} Projetos abertos</span>
      <span class="muted">${entries.length}</span>
    </div>
    <div class="open-projects-list">
      ${entries
        .map((project) => {
          const info = statusInfo(project.status);
          return `<button class="open-project-chip" type="button" data-action="open-project" data-id="${esc(project.id)}">
            <span class="dot ${info.dot}"></span>
            <span class="open-project-name">${esc(project.name)}</span>
            <em>${info.label}</em>
          </button>`;
        })
        .join('')}
    </div>
  </section>`;
}

function renderProjectCard(project) {
  const info = statusInfo(project.status);
  const knowledge = knowledgeChip(project);
  const reference = referenceChip(project);
  return `<article class="project-card" data-action="open-project" data-id="${esc(project.id)}" data-name="${esc(project.name)}" draggable="true" title="Clique para abrir · arraste para o quadro de perguntas e criar uma cópia" tabindex="0" role="button" aria-label="Abrir ${esc(project.name)}">
    <div class="project-thumb ${info.cls}">
      <div class="thumb-lines"><span></span><span></span><span></span></div>
      <span class="thumb-initial">${esc(initial(project.name))}</span>
      <span class="thumb-status"><span class="dot ${info.dot}"></span>${info.label}</span>
    </div>
    <div class="project-body">
      <div class="project-row">
        <h3>${esc(project.name)}</h3>
        <button class="icon-btn" type="button" data-action="open-project-window" data-id="${esc(project.id)}" title="Abrir em janela separada" aria-label="Abrir ${esc(project.name)} em janela separada">${icon('window')}</button>
        <button class="icon-btn" type="button" data-action="delete-project" data-id="${esc(project.id)}" data-name="${esc(project.name)}" title="Excluir projeto" aria-label="Excluir ${esc(project.name)}">${icon('trash')}</button>
      </div>
      <p class="project-desc">${esc(project.description || project.prompt)}</p>
      <div class="project-meta">
        <span>${project.fileCount || 0} arquivos</span><span>·</span><span>${relTime(project.updatedAt)}</span>
        ${project.model ? `<span>·</span><span>${esc(String(project.model).split('/').pop())}</span>` : ''}
        ${knowledge ? `<span>·</span>${knowledge}` : ''}
        ${reference ? `<span>·</span>${reference}` : ''}
      </div>
      ${
        project.previewUrl && project.previewVersion
          ? `<div class="project-link">
              <a class="project-url" href="${esc(project.previewUrl)}" target="_blank" rel="noreferrer" data-action="open-preview" data-url="${esc(project.previewUrl)}" title="Abrir ${esc(project.previewUrl)}">${icon('external')}<span>${esc(project.previewUrl)}</span></a>
              <button class="copy-btn" type="button" data-action="copy-preview-link" data-copy="${esc(project.previewUrl)}" title="Copiar link do preview" aria-label="Copiar link do preview de ${esc(project.name)}">${icon('copy')}</button>
            </div>`
          : ''
      }
    </div>
  </article>`;
}
