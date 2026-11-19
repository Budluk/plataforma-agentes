import { forgetOpenProject, pruneOpenProjects, state, syncProjectSummary } from './runtime.js';
import { api } from './network.js';
import { showToast } from './feedback.js';
import { isBusy, validationIssueCount } from './ui.js';
import { renderOpenProjectsStrip, renderProjectList } from './pages/home.js';
import { ensureSelectedFile, renderWorkspaceTabsList } from './workspace/render.js';
import { loadVersions } from './versions.js';
import { render } from './renderer.js';

export function afterRenderWorkspace() {
  const messages = document.getElementById('messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
  ensureSelectedFile();
  if (
    state.tab === 'versions' &&
    state.project &&
    state.versionsProjectId !== state.project.id &&
    !state.versionsBusy
  ) {
    loadVersions();
  }
  if (isBusy()) scheduleProjectPoll();
  scheduleTabsPoll();
}

export function scheduleProjectPoll(delay = 1600) {
  if (state.sseConnected) return;
  if (state.route.name !== 'project' || !isBusy()) return;
  // Um timer já agendado basta: renderizações frequentes não podem adiar o
  // polling indefinidamente.
  if (state.pollTimer) return;
  state.pollTimer = setTimeout(() => {
    state.pollTimer = null;
    refreshProject();
  }, delay);
}

export function scheduleTabsPoll() {
  if (state.sseConnected) return;
  if (state.route.name !== 'project' || state.tabsPollTimer) return;
  const backgroundBusy = state.openProjects.some((id) => {
    if (id === state.project?.id) return false;
    const summary = state.projects.find((project) => project.id === id);
    return summary && ['generating', 'building'].includes(summary.status);
  });
  if (!backgroundBusy) return;
  state.tabsPollTimer = setTimeout(() => {
    state.tabsPollTimer = null;
    refreshOpenProjectSummaries();
  }, state.tabsPollDelay);
}

export async function refreshOpenProjectSummaries() {
  try {
    const data = await api('/api/projects');
    state.projects = data.projects || [];
    state.tabsPollDelay = 4000;
    pruneOpenProjects();
    const list = document.getElementById('ws-tabs-list');
    if (list) list.innerHTML = renderWorkspaceTabsList();
  } catch {
    // Backoff exponencial: uma falha transitória não vira enxurrada de
    // requisições a cada 4 s.
    state.tabsPollDelay = Math.min(30000, state.tabsPollDelay * 2);
  }
  scheduleTabsPoll();
}

export async function refreshProject() {
  if (!state.project) return;
  const id = state.project.id;
  try {
    // Durante a geração o polling não precisa reler src/ inteiro a cada 1,6 s.
    const data = await api(`/api/projects/${id}?files=0`);
    if (state.route.name !== 'project' || state.project?.id !== id) return;
    state.projectPollFailures = 0;
    const previous = state.project;
    let next = data.project;
    if (!Array.isArray(next.files)) next.files = previous.files || [];
    const finished = previous.status !== next.status && !isBusy(next);
    if (previous.status !== next.status && !isBusy(next)) {
      // Ao terminar, busca o detalhe completo (arquivos e log) uma única vez.
      try {
        const full = await api(`/api/projects/${id}`);
        // O usuário pode ter trocado de aba durante o segundo await.
        if (state.route.name !== 'project' || state.project?.id !== id) return;
        next = full.project;
      } catch {
        // mantém o resumo se o detalhe completo falhar
      }
    }
    if (state.route.name !== 'project' || state.project?.id !== id) return;
    state.project = next;
    syncProjectSummary(next);
    if ((previous.previewVersion || 0) !== (next.previewVersion || 0)) {
      state.previewNonce += 1;
    }
    ensureSelectedFile();
    if (previous.status !== next.status) {
      if (next.status === 'ready') showToast('Build concluído. Preview atualizado!', 'success');
      if (next.status === 'error') showToast('A geração falhou. Veja o log.', 'error');
    }
    const previousValidation = previous.validation?.status || 'none';
    const nextValidation = next.validation?.status || 'none';
    if (previousValidation === 'running' && nextValidation !== 'running') {
      const count = validationIssueCount(next.validation);
      if (nextValidation === 'passed') {
        showToast('Preview validado: nenhum erro encontrado.', 'success');
      } else if (nextValidation === 'issues') {
        showToast(`A validação encontrou ${count} problema(s) no preview.`, 'error');
      } else if (nextValidation === 'failed') {
        showToast('A validação não conseguiu abrir o preview.', 'error');
      }
    }
    render();
    if (finished && state.tab === 'versions') loadVersions();
  } catch (error) {
    if (state.route.name !== 'project' || state.project?.id !== id) return;
    if (error.status === 404) {
      forgetOpenProject(id);
      showToast('Este projeto não existe mais.', 'error');
      location.hash = '#/';
      return;
    }
    state.projectPollFailures += 1;
    if (state.projectPollFailures >= 3) {
      showToast('Não foi possível atualizar o projeto. O acompanhamento foi pausado.', 'error');
      return;
    }
    if (state.projectPollFailures === 1) showToast(error.message, 'error');
    scheduleProjectPoll(Math.min(8000, 1600 * 2 ** state.projectPollFailures));
  }
}

export function scheduleHomePoll() {
  clearTimeout(state.homePollTimer);
  if (state.sseConnected) return;
  if (state.route.name !== 'home') return;
  const busy = state.projects.some((project) =>
    ['generating', 'building'].includes(project.status),
  );
  // Lista vazia também se atualiza sozinha: cobre aba antiga ou resposta transitória.
  if (!busy && state.projects.length > 0) return;
  state.homePollTimer = setTimeout(refreshHomeProjects, busy ? 3000 : 5000);
}

export async function refreshHomeProjects() {
  try {
    const data = await api('/api/projects');
    state.projects = data.projects || [];
    pruneOpenProjects();
    if (state.route.name !== 'home') return;
    const list = document.getElementById('project-list');
    const count = document.getElementById('project-count');
    if (list) list.innerHTML = renderProjectList();
    if (count) count.textContent = String(state.projects.length);
    const strip = document.getElementById('open-projects-strip');
    if (strip) strip.outerHTML = renderOpenProjectsStrip();
    scheduleHomePoll();
  } catch {
    // Tenta de novo mais tarde em vez de parar o acompanhamento na primeira falha.
    clearTimeout(state.homePollTimer);
    if (state.route.name === 'home') {
      state.homePollTimer = setTimeout(refreshHomeProjects, 6000);
    }
  }
}
