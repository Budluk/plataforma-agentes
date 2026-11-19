import { forgetOpenProject, isDetachedWindow, projectHash, rememberOpenProject, saveWorkspaceStateFor, state, syncProjectSummary } from './runtime.js';
import { api } from './network.js';
import { showToast } from './feedback.js';
import { icon, isBusy, isGithubUrl, isInspirationUrl, validationIssueCount } from './ui.js';
import { ensureSelectedFile, renderWorkspaceTabsList } from './workspace/render.js';
import { render } from './renderer.js';
import { analyzeInspiration, inspectFromDrop } from './imports.js';

export async function createFromComposer() {
  const prompt = state.promptDraft.trim();
  if (prompt.length < 3) {
    showToast('Descreva o app com um pouco mais de detalhe.', 'error');
    return;
  }
  if (/^https?:\/\/\S+$/i.test(prompt) && isGithubUrl(prompt)) {
    await inspectFromDrop({ kind: 'github', url: prompt }, prompt);
    return;
  }
  if (/^https?:\/\/\S+$/i.test(prompt) && isInspirationUrl(prompt)) {
    await analyzeInspiration(prompt, prompt);
    return;
  }
  if (state.creating) return;
  state.creating = true;
  const button = document.querySelector('#create-form button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.innerHTML = `${icon('loader', 'spin')} Gerando…`;
  }
  try {
    const data = await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
    state.project = data.project;
    syncProjectSummary(data.project);
    rememberOpenProject(data.project.id);
    state.selectedFile = null;
    state.chatDraft = '';
    state.promptDraft = '';
    state.tab = 'preview';
    state.device = 'desktop';
    state.previewNonce = 0;
    state.route = { name: 'project', id: data.project.id, detached: isDetachedWindow() };
    ensureSelectedFile();
    location.hash = projectHash(data.project.id);
    render();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    // Sem isso, um sucesso deixaria o botão travado para sempre ao voltar
    // para a home.
    state.creating = false;
    const currentButton = document.querySelector('#create-form button[type="submit"]');
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.innerHTML = `${icon('sparkles')} Gerar app`;
    }
  }
}

export async function sendChat() {
  const project = state.project;
  const content = state.chatDraft.trim();
  if (!project || !content || isBusy(project) || state.busyAction) return;
  const projectId = project.id;
  state.busyAction = true;
  state.chatDraft = '';
  try {
    const data = await api(`/api/projects/${projectId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (state.project?.id !== projectId) return;
    state.project = data.project;
    state.tab = 'preview';
    saveWorkspaceStateFor(data.project.id);
    render();
  } catch (error) {
    if (state.project?.id === projectId) {
      state.chatDraft = content;
      render();
    }
    showToast(error.message, 'error');
  } finally {
    state.busyAction = false;
  }
}

export async function fixBuild() {
  const project = state.project;
  if (!project || state.busyAction) return;
  const projectId = project.id;
  state.busyAction = true;
  try {
    const data = await api(`/api/projects/${projectId}/fix`, { method: 'POST' });
    if (state.project?.id !== projectId) return;
    state.project = data.project;
    state.tab = 'preview';
    render();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.busyAction = false;
  }
}

export async function retryGeneration() {
  const project = state.project;
  if (!project || state.busyAction) return;
  const projectId = project.id;
  state.busyAction = true;
  try {
    const data = await api(`/api/projects/${projectId}/retry`, { method: 'POST' });
    if (state.project?.id !== projectId) return;
    state.project = data.project;
    state.tab = 'preview';
    render();
    showToast('Gerando novamente com o prompt original…');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.busyAction = false;
  }
}

export async function rebuild() {
  const project = state.project;
  if (!project || state.busyAction) return;
  const projectId = project.id;
  state.busyAction = true;
  try {
    const data = await api(`/api/projects/${projectId}/rebuild`, { method: 'POST' });
    if (state.project?.id !== projectId) return;
    state.project = data.project;
    render();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.busyAction = false;
  }
}

export async function validatePreview() {
  const project = state.project;
  if (!project || state.validationBusy) return;
  state.validationBusy = true;
  state.busyAction = true;
  state.tab = 'validation';
  render();
  try {
    const data = await api(`/api/projects/${project.id}/validate`, { method: 'POST' });
    if (state.project?.id !== project.id) return;
    state.project = data.project;
    const validation = data.validation || data.project?.validation;
    const status = validation?.status;
    if (status === 'passed') {
      showToast('Preview validado: nenhum erro encontrado.', 'success');
    } else if (status === 'issues') {
      showToast(
        `A validação encontrou ${validationIssueCount(validation)} problema(s) no preview.`,
        'error',
      );
    } else if (status === 'unavailable') {
      showToast('Playwright indisponível neste ambiente. Veja os detalhes.', 'error');
    } else if (status === 'failed') {
      showToast('Não foi possível abrir o preview para validar.', 'error');
    } else {
      showToast('Validação concluída.');
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.validationBusy = false;
    state.busyAction = false;
    render();
  }
}

export async function fixFromValidation() {
  const project = state.project;
  if (!project || state.busyAction) return;
  const projectId = project.id;
  state.busyAction = true;
  try {
    const data = await api(`/api/projects/${projectId}/fix-validation`, { method: 'POST' });
    if (state.project?.id !== projectId) return;
    state.project = data.project;
    state.tab = 'preview';
    render();
    showToast('Correção da validação enviada ao modelo…');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.busyAction = false;
  }
}

export async function deleteProject(id, name) {
  if (!window.confirm(`Excluir o projeto "${name}"? Essa ação apaga os arquivos.`)) return;
  try {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    const wasActive = state.project?.id === id;
    state.projects = state.projects.filter((project) => project.id !== id);
    forgetOpenProject(id);
    if (wasActive) {
      state.project = null;
      const nextId = state.openProjects[state.openProjects.length - 1];
      location.hash = nextId ? projectHash(nextId) : '#/';
      showToast('Projeto excluído.', 'success');
      return;
    }
    render();
    showToast('Projeto excluído.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

export function openProject(id) {
  if (!id) return;
  if (state.route.name === 'project' && state.route.id === id) return;
  saveWorkspaceStateFor();
  location.hash = projectHash(id);
}

export function closeProjectTab(id) {
  if (!id) return;
  const index = state.openProjects.indexOf(id);
  const active = state.route.name === 'project' && state.route.id === id;
  forgetOpenProject(id);
  if (!active) {
    const list = document.getElementById('ws-tabs-list');
    if (list) list.innerHTML = renderWorkspaceTabsList();
    else render();
    return;
  }
  const nextId =
    state.openProjects[index] || state.openProjects[index - 1] || state.openProjects[0];
  if (nextId) {
    location.hash = projectHash(nextId);
    return;
  }
  if (state.route.detached) {
    window.close();
    if (!window.closed) location.hash = '#/';
    return;
  }
  location.hash = '#/';
}

export function openProjectWindow(id = state.project?.id) {
  if (!id) return;
  const url = `${location.origin}${location.pathname}#/p/${id}?window=1`;
  const win = window.open(url, `clonestudio-${id}`, 'popup=yes,width=1440,height=900');
  if (!win) {
    showToast('O navegador bloqueou a janela. Permita pop-ups para este painel.', 'error');
    return;
  }
  win.focus();
}

export function closeWindow() {
  window.close();
  if (!window.closed) {
    showToast('A janela não pôde ser fechada automaticamente.', 'info');
    location.hash = '#/';
  }
}
