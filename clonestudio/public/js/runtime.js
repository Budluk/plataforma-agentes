import { MAX_OPEN_PROJECTS, OPEN_PROJECTS_KEY, WORKSPACE_STATES_KEY } from './constants.js';

export const state = {
  route: parseRoute(),
  config: null,
  providers: [],
  projects: [],
  skills: [],
  integrations: null,
  project: null,
  loading: true,
  tab: 'preview',
  device: 'desktop',
  selectedFile: null,
  promptDraft: '',
  chatDraft: '',
  creating: false,
  busyAction: false,
  models: {},
  integrationFilter: 'all',
  context7Status: null,
  context7Busy: false,
  previewNonce: 0,
  validationBusy: false,
  importBusy: false,
  importLabel: '',
  inspection: null,
  inspectionBusy: false,
  inspectionLabel: '',
  inspiration: null,
  inspirationToken: '',
  inspirationBusy: false,
  inspirationLabel: '',
  versions: [],
  versionsBusy: false,
  versionsError: '',
  versionsProjectId: null,
  restoringVersion: null,
  openProjects: loadOpenProjects(),
  workspaceStates: loadWorkspaceStates(),
  pollTimer: null,
  homePollTimer: null,
  tabsPollTimer: null,
  tabsPollDelay: 4000,
  projectPollFailures: 0,
  sseConnected: false,
  sseAttempted: false,
  routeError: '',
  workspaceSaveTimer: null,
  toastTimer: null,
};

export const app = document.getElementById('app');
export const toastEl = document.getElementById('toast');
export function isDetachedWindow() {
  return (
    /[?&]window=1(?:&|$)/.test(location.hash) ||
    (Boolean(window.opener) && String(window.name || '').startsWith('clonestudio-'))
  );
}

export function loadOpenProjects() {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_PROJECTS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((id) => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)))].slice(
      -MAX_OPEN_PROJECTS,
    );
  } catch {
    return [];
  }
}

export function persistOpenProjects() {
  try {
    localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(state.openProjects));
  } catch {
    /* armazenamento indisponível */
  }
}

export function loadWorkspaceStates() {
  try {
    const raw = JSON.parse(localStorage.getItem(WORKSPACE_STATES_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function persistWorkspaceStates() {
  try {
    localStorage.setItem(WORKSPACE_STATES_KEY, JSON.stringify(state.workspaceStates));
  } catch {
    /* armazenamento indisponível */
  }
}

export function rememberOpenProject(id) {
  if (!id || state.openProjects.includes(id)) return;
  state.openProjects = [...state.openProjects, id].slice(-MAX_OPEN_PROJECTS);
  persistOpenProjects();
}

export function forgetOpenProject(id) {
  if (!id) return;
  state.openProjects = state.openProjects.filter((item) => item !== id);
  if (state.workspaceStates[id]) {
    delete state.workspaceStates[id];
    persistWorkspaceStates();
  }
  persistOpenProjects();
}

/**
 * Remove abas de projetos que não existem mais (excluídos em outra janela ou
 * por outro navegador). Mantém a aba ativa mesmo se a lista estiver defasada.
 */
export function pruneOpenProjects() {
  const known = new Set(state.projects.map((project) => project.id));
  const activeId = state.route.name === 'project' ? state.route.id : null;
  const next = state.openProjects.filter((id) => known.has(id) || id === activeId);
  if (next.length === state.openProjects.length) return false;
  state.openProjects = next;
  let statesChanged = false;
  for (const id of Object.keys(state.workspaceStates)) {
    if (!next.includes(id)) {
      delete state.workspaceStates[id];
      statesChanged = true;
    }
  }
  persistOpenProjects();
  if (statesChanged) persistWorkspaceStates();
  return true;
}

export function saveWorkspaceStateFor(id = state.project?.id) {
  if (!id) return;
  // Aba fechada não deve ressuscitar o estado salvo por um timer atrasado ou
  // pelo beforeunload.
  if (!state.openProjects.includes(id)) return;
  state.workspaceStates[id] = {
    tab: state.tab,
    device: state.device,
    selectedFile: state.selectedFile,
    chatDraft: state.chatDraft,
  };
  persistWorkspaceStates();
}

export function scheduleWorkspaceStateSave() {
  clearTimeout(state.workspaceSaveTimer);
  state.workspaceSaveTimer = setTimeout(() => {
    state.workspaceSaveTimer = null;
    saveWorkspaceStateFor();
  }, 250);
}

export function applyWorkspaceState(id) {
  const saved = state.workspaceStates[id] || {};
  state.tab = ['preview', 'validation', 'code', 'log', 'versions'].includes(saved.tab)
    ? saved.tab
    : 'preview';
  state.device = saved.device === 'mobile' ? 'mobile' : 'desktop';
  state.selectedFile = typeof saved.selectedFile === 'string' ? saved.selectedFile : null;
  state.chatDraft = typeof saved.chatDraft === 'string' ? saved.chatDraft : '';
  state.previewNonce = 0;
}

export function projectHash(id) {
  return `#/p/${id}${isDetachedWindow() ? '?window=1' : ''}`;
}

export function syncProjectSummary(project) {
  if (!project?.id) return;
  const patch = {
    id: project.id,
    name: project.name,
    description: project.description,
    prompt: project.prompt,
    status: project.status,
    model: project.model,
    previewUrl: project.previewUrl,
    previewVersion: project.previewVersion,
    validation: project.validation,
    updatedAt: project.updatedAt,
    fileCount: Array.isArray(project.files) ? project.files.length : project.fileCount,
  };
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) state.projects[index] = { ...state.projects[index], ...patch };
  else state.projects.unshift(patch);
}
export function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const projectMatch = hash.match(/^\/p\/([a-f0-9-]{36})(?:\?([^#]*))?/i);
  if (projectMatch) return { name: 'project', id: projectMatch[1], detached: isDetachedWindow() };
  if (hash.startsWith('/skills')) return { name: 'skills' };
  if (hash.startsWith('/integrations')) return { name: 'integrations' };
  if (hash.startsWith('/providers')) return { name: 'providers' };
  return { name: 'home' };
}
export function stopTimers() {
  clearTimeout(state.pollTimer);
  clearTimeout(state.homePollTimer);
  clearTimeout(state.tabsPollTimer);
  state.pollTimer = null;
  state.homePollTimer = null;
  state.tabsPollTimer = null;
  state.tabsPollDelay = 4000;
  state.projectPollFailures = 0;
}
