import { applyWorkspaceState, forgetOpenProject, parseRoute, persistOpenProjects, pruneOpenProjects, rememberOpenProject, saveWorkspaceStateFor, state, stopTimers, syncProjectSummary } from './runtime.js';
import { api } from './network.js';
import { connectSse } from './sse.js';
import { showToast } from './feedback.js';
import { render, renderFatal } from './renderer.js';
import { ensureSelectedFile } from './workspace/render.js';

export async function init() {
  try {
    const [config, projectsData, skillsData, integrationsData, providersData] = await Promise.all([
      api('/api/config'),
      api('/api/projects'),
      api('/api/skills'),
      api('/api/integrations'),
      api('/api/providers'),
    ]);
    state.config = config;
    state.projects = projectsData.projects || [];
    pruneOpenProjects();
    persistOpenProjects();
    state.skills = skillsData.skills || [];
    state.integrations = integrationsData;
    state.providers = providersData.providers || [];
    state.loading = false;
    await routeChanged(true);
    connectSse();
  } catch (error) {
    renderFatal(error);
  }
}

export async function routeChanged(initial = false) {
  stopTimers();
  const previous = state.route;
  const previousProjectId = state.project?.id || null;
  state.route = parseRoute();

  if (state.route.name === 'project') {
    if (!state.project || state.project.id !== state.route.id) {
      if (previousProjectId) saveWorkspaceStateFor(previousProjectId);
      try {
        const data = await api(`/api/projects/${state.route.id}`);
        state.project = data.project;
        state.routeError = '';
        syncProjectSummary(data.project);
        applyWorkspaceState(data.project.id);
        ensureSelectedFile();
        if (state.versionsProjectId !== data.project.id) {
          state.versions = [];
          state.versionsError = '';
          state.versionsProjectId = null;
          state.versionsBusy = false;
        }
      } catch (error) {
        if (error.status === 404) {
          showToast('Este projeto não existe mais.', 'error');
          forgetOpenProject(state.route.id);
          state.project = null;
          location.hash = '#/';
          return;
        }
        // Falha transitória (servidor reiniciando, rede): não apaga a aba.
        state.project = null;
        state.routeError = error.message || 'Não foi possível abrir o projeto.';
        render();
        return;
      }
    }
    rememberOpenProject(state.route.id);
    state.tab = state.tab || 'preview';
  } else {
    if (previousProjectId) saveWorkspaceStateFor(previousProjectId);
    state.project = null;
    state.routeError = '';
    if (state.route.name === 'home' && !initial) {
      try {
        const data = await api('/api/projects');
        state.projects = data.projects || [];
      } catch {
        /* mantém a lista atual */
      }
    }
  }

  if (previous.name !== state.route.name) {
    window.scrollTo({ top: 0 });
  }
  const changedRoute =
    previous.name !== state.route.name ||
    (state.route.name === 'project' && previous.id !== state.route.id);
  render();
  if (changedRoute && !initial) {
    // Move o foco para o novo conteúdo para leitores de tela anunciarem a troca.
    const target =
      document.getElementById('main') || document.querySelector('.workspace .ws-title h1');
    if (target) {
      if (target.tagName === 'H1') target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }
}
