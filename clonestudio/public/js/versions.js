import { saveWorkspaceStateFor, state, syncProjectSummary } from './runtime.js';
import { api } from './network.js';
import { showToast } from './feedback.js';
import { render } from './renderer.js';

export async function loadVersions() {
  const project = state.project;
  if (!project || state.versionsBusy) return;
  const projectId = project.id;
  if (state.versionsProjectId !== projectId) {
    state.versions = [];
    state.versionsProjectId = projectId;
  }
  state.versionsBusy = true;
  state.versionsError = '';
  render();
  try {
    const data = await api(`/api/projects/${projectId}/versions`);
    if (state.project?.id !== projectId) return;
    state.versions = data.versions || [];
    if (data.currentVersion && state.project) state.project.currentVersion = data.currentVersion;
  } catch (error) {
    if (state.project?.id !== projectId) return;
    state.versionsError = error.message;
  } finally {
    state.versionsBusy = false;
    if (state.project?.id === projectId) render();
  }
}

export async function restoreVersion(version) {
  const project = state.project;
  if (!project || state.busyAction) return;
  if (
    !window.confirm(
      `Restaurar a versão ${version}? O estado atual é preservado antes da troca.`,
    )
  ) {
    return;
  }
  const projectId = project.id;
  state.busyAction = true;
  state.restoringVersion = version;
  render();
  try {
    const data = await api(`/api/projects/${projectId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
    if (state.project?.id !== projectId) return;
    state.project = data.project;
    syncProjectSummary(data.project);
    state.tab = 'preview';
    saveWorkspaceStateFor(projectId);
    showToast(`Restaurando a versão ${version}…`);
    render();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.busyAction = false;
    state.restoringVersion = null;
    if (state.project?.id === projectId) render();
  }
}
