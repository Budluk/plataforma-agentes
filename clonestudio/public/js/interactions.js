import { saveWorkspaceStateFor, scheduleWorkspaceStateSave, state } from './runtime.js';
import { copyText, showToast } from './feedback.js';
import { api } from './network.js';
import { fileToBase64, isGithubUrl, isInspirationUrl } from './ui.js';
import { analyzeInspiration, createFromInspiration, createFromInspection, importFromDrop, inspectFromDrop } from './imports.js';
import { closeProjectTab, closeWindow, createFromComposer, deleteProject, fixBuild, fixFromValidation, openProject, openProjectWindow, rebuild, retryGeneration, sendChat, validatePreview } from './actions.js';
import { loadVersions, restoreVersion } from './versions.js';
import { refreshHomeProjects } from './polling.js';
import { render } from './renderer.js';
import { ensureSelectedFile } from './workspace/render.js';
import { routeChanged } from './routing.js';

export function registerInteractions() {
function isImportDrag(transfer) {
  if (!transfer) return false;
  const types = [...(transfer.types || [])];
  return (
    types.includes('application/x-clonestudio-project') ||
    types.includes('Files') ||
    types.includes('text/uri-list')
  );
}

document.addEventListener('dragstart', (event) => {
  const card = event.target.closest?.('.project-card');
  if (!card || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-clonestudio-project', card.dataset.id || '');
  event.dataTransfer.setData('text/plain', card.dataset.name || 'App');
});

document.addEventListener('dragover', (event) => {
  if (!isImportDrag(event.dataTransfer)) return;
  event.preventDefault();
  const form = event.target.closest?.('#create-form');
  if (!form) return;
  event.dataTransfer.dropEffect = 'copy';
  form.classList.add('drop-active');
});

document.addEventListener('dragleave', (event) => {
  const form = event.target.closest?.('#create-form');
  if (!form) return;
  if (!form.contains(event.relatedTarget)) form.classList.remove('drop-active');
});

document.addEventListener('drop', async (event) => {
  if (!isImportDrag(event.dataTransfer)) return;
  event.preventDefault();
  const form = event.target.closest?.('#create-form');
  if (!form) {
    document
      .querySelectorAll('.composer.drop-active')
      .forEach((element) => element.classList.remove('drop-active'));
    showToast('Solte o link, app ou .zip dentro do quadro de perguntas.', 'info');
    return;
  }
  form.classList.remove('drop-active');
  const transfer = event.dataTransfer;
  const promptEl = document.getElementById('prompt');
  if (promptEl) state.promptDraft = promptEl.value;

  const projectId = transfer.getData('application/x-clonestudio-project');
  if (projectId) {
    await importFromDrop({ kind: 'app', projectId }, 'cópia do app');
    return;
  }

  const zip = [...(transfer.files || [])].find((file) => /\.zip$/i.test(file.name));
  if (zip) {
    if (zip.size > 20_000_000) {
      showToast('O .zip é grande demais (limite 20 MB).', 'error');
      return;
    }
    const dataBase64 = await fileToBase64(zip).catch(() => '');
    if (!dataBase64) {
      showToast('Não foi possível ler o .zip.', 'error');
      return;
    }
    await inspectFromDrop({ kind: 'zip', filename: zip.name, dataBase64 }, zip.name);
    return;
  }

  const url = String(transfer.getData('text/uri-list') || transfer.getData('text/plain') || '')
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
  if (!url) {
    showToast('Solte um link, um app do painel ou um arquivo .zip.', 'error');
    return;
  }
  if (isGithubUrl(url)) {
    await inspectFromDrop({ kind: 'github', url }, url);
  } else if (isInspirationUrl(url)) {
    await analyzeInspiration(url, url);
  } else {
    await importFromDrop({ kind: 'site', url, prompt: state.promptDraft }, url);
  }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target.id === 'prompt' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    createFromComposer();
    return;
  }
  if (target.id === 'chat-input' && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChat();
    return;
  }
  if (
    target.getAttribute?.('role') === 'tab' &&
    ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)
  ) {
    const list = target.closest('[role="tablist"]');
    const tabs = list ? [...list.querySelectorAll('[role="tab"]')] : [];
    if (tabs.length) {
      event.preventDefault();
      const current = Math.max(0, tabs.indexOf(target));
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      tabs[next].focus();
      tabs[next].click();
    }
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    const card = target.closest?.('[data-action="open-project"]');
    if (card && target === card) {
      event.preventDefault();
      openProject(card.dataset.id);
    }
  }
});

document.addEventListener('auxclick', (event) => {
  if (event.button !== 1) return;
  const tab = event.target.closest?.('.ws-tab-main');
  if (!tab) return;
  event.preventDefault();
  closeProjectTab(tab.dataset.id);
});

document.addEventListener('click', async (event) => {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const action = element.dataset.action;

  switch (action) {
    case 'skip-main': {
      const main = document.getElementById('main');
      if (main) main.focus();
      break;
    }
    case 'suggestion': {
      state.promptDraft = element.dataset.prompt || '';
      const textarea = document.getElementById('prompt');
      if (textarea) {
        textarea.value = state.promptDraft;
        textarea.focus();
      }
      break;
    }
    case 'chat-suggestion': {
      const input = document.getElementById('chat-input');
      if (input && !input.disabled) {
        state.chatDraft = element.dataset.prompt || '';
        input.value = state.chatDraft;
        input.focus();
        const button = document.querySelector('#chat-form button[type="submit"]');
        if (button) button.disabled = !state.chatDraft.trim();
        scheduleWorkspaceStateSave();
      }
      break;
    }
    case 'open-project':
      openProject(element.dataset.id);
      break;
    case 'switch-project':
      openProject(element.dataset.id);
      break;
    case 'close-project-tab':
      event.stopPropagation();
      closeProjectTab(element.dataset.id);
      break;
    case 'open-project-window':
      event.stopPropagation();
      openProjectWindow(element.dataset.id || state.project?.id);
      break;
    case 'close-window':
      closeWindow();
      break;
    case 'retry-route':
      state.routeError = '';
      routeChanged();
      break;
    case 'delete-project':
      event.stopPropagation();
      deleteProject(element.dataset.id, element.dataset.name || 'projeto');
      break;
    case 'tab':
      state.tab = element.dataset.tab || 'preview';
      if (state.tab === 'code') ensureSelectedFile();
      saveWorkspaceStateFor();
      if (state.tab === 'versions') loadVersions();
      else render();
      break;
    case 'device':
      state.device = element.dataset.device === 'mobile' ? 'mobile' : 'desktop';
      saveWorkspaceStateFor();
      render();
      break;
    case 'refresh-preview':
      state.previewNonce += 1;
      render();
      break;
    case 'select-file':
      state.selectedFile = element.dataset.file || null;
      saveWorkspaceStateFor();
      render();
      break;
    case 'copy-code': {
      const file = (state.project?.files || []).find((item) => item.path === state.selectedFile);
      if (file) copyText(file.content);
      break;
    }
    case 'copy-text':
      copyText(element.dataset.copy || '');
      break;
    case 'copy-preview-link':
      event.stopPropagation();
      copyText(element.dataset.copy || '');
      break;
    case 'open-preview':
      event.preventDefault();
      window.open(element.dataset.url || '', '_blank', 'noreferrer');
      break;
    case 'open-reference':
      event.preventDefault();
      window.open(element.getAttribute('href') || '', '_blank', 'noreferrer');
      break;
    case 'fix-build':
      fixBuild();
      break;
    case 'retry-generation':
      retryGeneration();
      break;
    case 'validate-preview':
      validatePreview();
      break;
    case 'fix-validation':
      fixFromValidation();
      break;
    case 'rebuild':
      rebuild();
      break;
    case 'refresh-versions':
      loadVersions();
      break;
    case 'restore-version':
      restoreVersion(Number(element.dataset.version));
      break;
    case 'create-inspected':
      createFromInspection();
      break;
    case 'dismiss-inspection':
      state.inspection = null;
      render();
      break;
    case 'create-inspiration':
      createFromInspiration();
      break;
    case 'dismiss-inspiration':
      state.inspiration = null;
      state.inspirationToken = '';
      render();
      break;
    case 'refresh-projects':
      await refreshHomeProjects();
      showToast('Lista de projetos atualizada.', 'success');
      break;
    case 'filter-integrations':
      state.integrationFilter = element.dataset.filter || 'all';
      render();
      break;
    case 'test-context7': {
      state.context7Busy = true;
      render();
      try {
        const status = await api('/api/context7/status');
        state.context7Status = status;
        if (status.status === 'ok') {
          showToast(
            `Context7 conectado em ${status.latencyMs} ms (${status.tools.length} ferramentas).`,
            'success',
          );
        } else if (status.status === 'disabled') {
          showToast('Context7 está desativado por CONTEXT7_ENABLED=off.', 'info');
        } else {
          showToast(`Context7 indisponível: ${status.error || 'erro desconhecido'}`, 'error');
        }
      } catch (error) {
        state.context7Status = { status: 'error', error: error.message };
        showToast(`Context7 indisponível: ${error.message}`, 'error');
      }
      state.context7Busy = false;
      render();
      break;
    }
    case 'load-models': {
      const providerId = element.dataset.provider;
      if (!providerId) break;
      state.models[providerId] = { loading: true };
      render();
      try {
        const data = await api(`/api/providers/${providerId}/models`);
        state.models[providerId] = { models: data.models || [] };
      } catch (error) {
        state.models[providerId] = { error: error.message };
      }
      render();
      break;
    }
    default:
      break;
  }
});
}
