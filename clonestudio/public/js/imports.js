import { projectHash, state } from './runtime.js';
import { api } from './network.js';
import { showToast } from './feedback.js';
import { render } from './renderer.js';
import { refreshHomeProjects } from './polling.js';

export async function analyzeInspiration(url, label) {
  if (state.importBusy || state.inspectionBusy || state.inspirationBusy) return;
  state.inspirationBusy = true;
  state.inspirationLabel = label || url;
  state.inspiration = null;
  state.inspirationToken = '';
  if (state.promptDraft.trim() === url) state.promptDraft = '';
  render();
  try {
    const data = await api('/api/inspiration/analyze', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    state.inspirationBusy = false;
    state.inspirationLabel = '';
    state.inspiration = data.inspiration || null;
    state.inspirationToken = data.token || '';
    render();
    if (state.inspiration) {
      requestAnimationFrame(() => {
        document.querySelector('.inspire-card')?.scrollIntoView({ block: 'nearest' });
      });
    }
  } catch (error) {
    state.inspirationBusy = false;
    state.inspirationLabel = '';
    render();
    showToast(error.message, 'error');
  }
}

export async function createFromInspiration() {
  const report = state.inspiration;
  if (!report || !state.inspirationToken || state.importBusy) return;
  const draft = state.promptDraft.trim();
  const idea = /^https?:\/\/\S+$/i.test(draft) ? '' : draft;
  state.importBusy = true;
  state.importLabel = report.title || report.handle || 'inspiração analisada';
  render();
  try {
    const data = await api('/api/import', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'inspiration',
        inspirationToken: state.inspirationToken,
        url: report.url,
        prompt: idea,
      }),
    });
    state.importBusy = false;
    state.importLabel = '';
    state.inspiration = null;
    state.inspirationToken = '';
    state.promptDraft = '';
    const project = data.project;
    showToast(`Criação iniciada: ${project?.name || 'novo app'}.`, 'success');
    await refreshHomeProjects();
    if (project?.id) location.hash = projectHash(project.id);
  } catch (error) {
    state.importBusy = false;
    state.importLabel = '';
    render();
    showToast(error.message, 'error');
  }
}

export async function importFromDrop(payload, label) {
  if (state.importBusy) return;
  state.importBusy = true;
  state.importLabel = label;
  render();
  try {
    const data = await api('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.importBusy = false;
    state.importLabel = '';
    state.promptDraft = '';
    const project = data.project;
    showToast(
      payload.kind === 'app'
        ? `Cópia criada: ${project?.name || 'novo app'}.`
        : `Importação iniciada: ${project?.name || 'novo app'}.`,
      'success',
    );
    await refreshHomeProjects();
    if (project?.id) location.hash = projectHash(project.id);
  } catch (error) {
    state.importBusy = false;
    state.importLabel = '';
    render();
    showToast(error.message, 'error');
  }
}

export async function inspectFromDrop(payload, label) {
  if (state.importBusy || state.inspectionBusy) return;
  state.inspectionBusy = true;
  state.inspectionLabel = label;
  state.inspection = null;
  render();
  try {
    const data = await api('/api/inspect', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.inspectionBusy = false;
    state.inspectionLabel = '';
    state.inspection = data.inspection || null;
    render();
    if (state.inspection) {
      requestAnimationFrame(() => {
        document.querySelector('.inspect-card')?.scrollIntoView({ block: 'nearest' });
      });
    }
  } catch (error) {
    state.inspectionBusy = false;
    state.inspectionLabel = '';
    render();
    showToast(error.message, 'error');
  }
}

export async function createFromInspection() {
  const inspection = state.inspection;
  if (!inspection?.token || state.importBusy) return;
  if (!inspection.compatibility?.canCreate) {
    showToast(inspection.compatibility?.reason || 'Este projeto não pode ser criado.', 'error');
    return;
  }
  state.importBusy = true;
  state.importLabel = inspection.name || 'projeto analisado';
  render();
  try {
    const data = await api('/api/import', {
      method: 'POST',
      body: JSON.stringify({
        kind: inspection.kind,
        inspectionToken: inspection.token,
      }),
    });
    state.importBusy = false;
    state.importLabel = '';
    state.inspection = null;
    state.promptDraft = '';
    const project = data.project;
    showToast(`Criação iniciada: ${project?.name || 'novo app'}.`, 'success');
    await refreshHomeProjects();
    if (project?.id) location.hash = projectHash(project.id);
  } catch (error) {
    state.importBusy = false;
    state.importLabel = '';
    render();
    showToast(error.message, 'error');
  }
}
