const ICONS = {
  sparkles:
    '<path d="M12 3l1.8 4.9 4.9 1.8-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  code: '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  smartphone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>',
  external:
    '<path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.36-8.64"/>',
  layers: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  wrench:
    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-3-3 2.3-2.3z"/>',
  terminal: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  github:
    '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77 5.44 5.44 0 0 0 3.5 8.55c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  bolt: '<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  shield:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  window:
    '<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 21h11a2 2 0 0 0 2-2V8"/>',
  users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  trending: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
};

const STATUS = {
  generating: { label: 'Gerando', cls: 'generating', dot: 'warn' },
  building: { label: 'Compilando', cls: 'building', dot: 'warn' },
  ready: { label: 'Pronto', cls: 'ready', dot: 'good' },
  error: { label: 'Erro', cls: 'error', dot: 'bad' },
};

const VALIDATION_STATE = {
  passed: {
    label: 'Preview saudável',
    cls: 'passed',
    icon: 'check',
    hint: 'Nenhum erro de execução foi encontrado no navegador.',
  },
  issues: {
    label: 'Problemas encontrados',
    cls: 'issues',
    icon: 'alert',
    hint: 'O app abriu, mas há erros de execução que precisam de correção.',
  },
  failed: {
    label: 'Validação falhou',
    cls: 'failed',
    icon: 'alert',
    hint: 'Não foi possível abrir ou inspecionar o preview.',
  },
  unavailable: {
    label: 'Playwright indisponível',
    cls: 'unavailable',
    icon: 'info',
    hint: 'O navegador headless não está disponível neste ambiente.',
  },
  disabled: {
    label: 'Validação desativada',
    cls: 'disabled',
    icon: 'info',
    hint: 'A validação automática está desligada por configuração.',
  },
  skipped: {
    label: 'Sem preview para validar',
    cls: 'skipped',
    icon: 'info',
    hint: 'Ainda não existe um build pronto para abrir no navegador.',
  },
  running: {
    label: 'Validando preview',
    cls: 'running',
    icon: 'loader',
    hint: 'Abrindo o app em um navegador headless real.',
  },
  none: {
    label: 'Ainda não validado',
    cls: 'none',
    icon: 'shield',
    hint: 'Execute a validação para abrir o preview e capturar erros reais.',
  },
};

const SUGGESTIONS = [
  'Um CRM de vendas com dashboard, funil e lista de contatos',
  'Uma landing page premium para um SaaS de produtividade',
  'Um app de finanças pessoais com gráficos e metas',
  'Um kanban de tarefas com arrastar e soltar e temas',
  'Um cardápio digital para uma cafeteria com carrinho',
  'Uma galeria de fotos com busca, filtros e lightbox',
];

const CHAT_SUGGESTIONS = [
  'Deixe o layout mais responsivo',
  'Ajuste as cores e a tipografia',
  'Adicione uma seção de depoimentos',
];

const OPEN_PROJECTS_KEY = 'clonestudio.openProjects';
const WORKSPACE_STATES_KEY = 'clonestudio.workspaceStates';
const MAX_OPEN_PROJECTS = 12;

const SKILL_FILTERS = [
  ['all', 'Todas'],
  ['nativo', 'Nativas'],
  ['catálogo', 'Catálogo'],
  ['adaptador', 'Adaptadores'],
  ['configuração', 'Configuração'],
  ['externo', 'Externas'],
  ['referência', 'Referências'],
];

const state = {
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
  routeError: '',
  workspaceSaveTimer: null,
  toastTimer: null,
};

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

function icon(name, extra = '') {
  const paths = ICONS[name] || ICONS.sparkles;
  return `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function isDetachedWindow() {
  return (
    /[?&]window=1(?:&|$)/.test(location.hash) ||
    (Boolean(window.opener) && String(window.name || '').startsWith('clonestudio-'))
  );
}

function loadOpenProjects() {
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

function persistOpenProjects() {
  try {
    localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(state.openProjects));
  } catch {
    /* armazenamento indisponível */
  }
}

function loadWorkspaceStates() {
  try {
    const raw = JSON.parse(localStorage.getItem(WORKSPACE_STATES_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function persistWorkspaceStates() {
  try {
    localStorage.setItem(WORKSPACE_STATES_KEY, JSON.stringify(state.workspaceStates));
  } catch {
    /* armazenamento indisponível */
  }
}

function rememberOpenProject(id) {
  if (!id || state.openProjects.includes(id)) return;
  state.openProjects = [...state.openProjects, id].slice(-MAX_OPEN_PROJECTS);
  persistOpenProjects();
}

function forgetOpenProject(id) {
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
function pruneOpenProjects() {
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

function saveWorkspaceStateFor(id = state.project?.id) {
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

function scheduleWorkspaceStateSave() {
  clearTimeout(state.workspaceSaveTimer);
  state.workspaceSaveTimer = setTimeout(() => {
    state.workspaceSaveTimer = null;
    saveWorkspaceStateFor();
  }, 250);
}

function applyWorkspaceState(id) {
  const saved = state.workspaceStates[id] || {};
  state.tab = ['preview', 'validation', 'code', 'log', 'versions'].includes(saved.tab)
    ? saved.tab
    : 'preview';
  state.device = saved.device === 'mobile' ? 'mobile' : 'desktop';
  state.selectedFile = typeof saved.selectedFile === 'string' ? saved.selectedFile : null;
  state.chatDraft = typeof saved.chatDraft === 'string' ? saved.chatDraft : '';
  state.previewNonce = 0;
}

function projectHash(id) {
  return `#/p/${id}${isDetachedWindow() ? '?window=1' : ''}`;
}

function syncProjectSummary(project) {
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

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const projectMatch = hash.match(/^\/p\/([a-f0-9-]{36})(?:\?([^#]*))?/i);
  if (projectMatch) return { name: 'project', id: projectMatch[1], detached: isDetachedWindow() };
  if (hash.startsWith('/skills')) return { name: 'skills' };
  if (hash.startsWith('/integrations')) return { name: 'integrations' };
  if (hash.startsWith('/providers')) return { name: 'providers' };
  return { name: 'home' };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Erro HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showToast(message, kind = 'info') {
  clearTimeout(state.toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast show ${kind}`;
  state.toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, 4200);
}

function copyText(text) {
  const value = String(text ?? '');
  const fallback = () => {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      showToast(
        ok ? 'Copiado para a área de transferência.' : 'Não foi possível copiar.',
        ok ? 'success' : 'error',
      );
    } catch {
      showToast('Não foi possível copiar.', 'error');
    }
  };
  if (!navigator.clipboard?.writeText) {
    fallback();
    return;
  }
  navigator.clipboard
    .writeText(value)
    .then(() => showToast('Copiado para a área de transferência.', 'success'))
    .catch(fallback);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function isGithubUrl(value) {
  try {
    return /^(www\.)?github\.com$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function isInspirationUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host === 'tiktok.com' ||
      host.endsWith('.tiktok.com') ||
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host === 'facebook.com' ||
      host === 'fb.com' ||
      host === 'm.facebook.com'
    );
  } catch {
    return false;
  }
}

async function analyzeInspiration(url, label) {
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

async function createFromInspiration() {
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

async function importFromDrop(payload, label) {
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

async function inspectFromDrop(payload, label) {
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

async function createFromInspection() {
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

function statusInfo(status) {
  return STATUS[status] || STATUS.generating;
}

function validationInfo(project = state.project) {
  const validation = project?.validation || null;
  const status = validation?.status || 'none';
  return {
    validation,
    status,
    ...(VALIDATION_STATE[status] || VALIDATION_STATE.none),
  };
}

function knowledgeChip(project) {
  const knowledge = project?.knowledge;
  if (!knowledge || knowledge.status !== 'used') return '';
  const names = (knowledge.libraries || [])
    .filter((library) => library.chars > 0)
    .map((library) => library.name);
  if (names.length === 0) return '';
  return `<span class="knowledge-chip" title="Documentação atual do Context7 injetada no prompt: ${esc(names.join(', '))}">${icon('book')} Context7: ${esc(names.join(', '))}</span>`;
}

function referenceChip(project) {
  const reference = project?.reference;
  if (!reference?.url) return '';
  const label =
    reference.kind === 'site'
      ? 'Site'
      : reference.kind === 'inspiration'
        ? 'Inspiração'
        : 'Referência';
  const fullTitle = reference.title || reference.url;
  const title = fullTitle.length > 38 ? `${fullTitle.slice(0, 38)}…` : fullTitle;
  const origin =
    reference.kind === 'inspiration' ? 'Análise pública de inspiração' : 'Referência baixada';
  return `<a class="knowledge-chip reference-chip" href="${esc(reference.url)}" target="_blank" rel="noreferrer" data-action="open-reference" title="${origin}: ${esc(reference.url)}">${icon('external')} ${label}: ${esc(title)}</a>`;
}

function validationIssueCount(validation) {
  if (!validation) return 0;
  if (validation.counts && Number.isFinite(validation.counts.total)) {
    return validation.counts.total;
  }
  return ['consoleErrors', 'pageErrors', 'failedRequests', 'httpErrors', 'brokenImages'].reduce(
    (total, key) => total + (Array.isArray(validation[key]) ? validation[key].length : 0),
    0,
  );
}

function fmtDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function isBusy(project = state.project) {
  return Boolean(project && ['generating', 'building'].includes(project.status));
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function relTime(iso) {
  try {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'agora mesmo';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `há ${days} d`;
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

function initial(name) {
  const match = String(name || 'A').trim().match(/[a-zA-Z0-9À-ÿ]/);
  return match ? match[0].toUpperCase() : 'A';
}

function configuredProvider() {
  return state.providers.find((provider) => provider.configured) || null;
}

/* ---------- render root ---------- */

async function init() {
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
  } catch (error) {
    renderFatal(error);
  }
}

async function routeChanged(initial = false) {
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
  render();
}

function stopTimers() {
  clearTimeout(state.pollTimer);
  clearTimeout(state.homePollTimer);
  clearTimeout(state.tabsPollTimer);
  state.pollTimer = null;
  state.homePollTimer = null;
  state.tabsPollTimer = null;
  state.tabsPollDelay = 4000;
  state.projectPollFailures = 0;
}

function render() {
  if (state.loading) {
    app.innerHTML = `<div class="boot"><div class="boot-mark">CS</div><p>Carregando CloneStudio AI…</p></div>`;
    return;
  }
  if (state.route.name === 'project') {
    app.innerHTML = renderWorkspace();
    afterRenderWorkspace();
    return;
  }
  const page =
    state.route.name === 'skills'
      ? renderSkills()
      : state.route.name === 'integrations'
        ? renderIntegrations()
        : state.route.name === 'providers'
          ? renderProviders()
          : renderHome();
  app.innerHTML = page;
  if (state.route.name === 'home') scheduleHomePoll();
}

function renderFatal(error) {
  app.innerHTML = `<div class="boot">
    <div class="boot-mark">CS</div>
    <h1 class="boot-title">Não foi possível carregar o painel</h1>
    <p class="boot-text">${esc(error.message)}</p>
    <a class="btn primary" href="/">Recarregar</a>
  </div>`;
}

/* ---------- shared parts ---------- */

function renderSidebar(active) {
  const provider = configuredProvider();
  const label = provider ? provider.label : 'Nenhum provedor';
  const navItems = [
    ['home', '#/', 'home', 'Início'],
    ['skills', '#/skills', 'book', 'Skills'],
    ['integrations', '#/integrations', 'plug', 'Integrações'],
    ['providers', '#/providers', 'layers', 'Provedores'],
  ];
  return `<aside class="sidebar">
    <a class="brand" href="#/">
      <span class="brand-mark">${icon('sparkles')}</span>
      <span>CloneStudio<span class="brand-ai">AI</span></span>
    </a>
    <nav class="nav" aria-label="Navegação principal">
      <span class="nav-section" aria-hidden="true">Navegação</span>
      ${navItems
        .map(
          ([id, href, iconName, text]) => `<a class="nav-link ${active === id ? 'active' : ''}" href="${href}">
            ${icon(iconName)}<span class="nav-label">${text}</span>
          </a>`,
        )
        .join('')}
    </nav>
    <div class="sidebar-card">
      <span class="dot ${provider ? 'good' : 'bad'}"></span>
      <div><strong>${esc(label)}</strong><small>${provider ? 'provedor configurado' : 'configure o .env'}</small></div>
    </div>
    <div class="sidebar-foot">
      <span class="dot good"></span>
      <span>Núcleo local</span>
      <span class="sidebar-version">v${esc(state.config?.version || '0.2.0')}</span>
    </div>
  </aside>`;
}

function renderShell(active, content) {
  return `<div class="shell">${renderSidebar(active)}<main class="main">${content}</main></div>`;
}

function pageHead(eyebrow, title, description) {
  return `<header class="page-head">
    <div>
      <span class="eyebrow">${icon('sparkles')} ${esc(eyebrow)}</span>
      <h1>${esc(title)}</h1>
      <p>${esc(description)}</p>
    </div>
  </header>`;
}

/* ---------- inspection card ---------- */

function renderInspectionCard(inspection) {
  const compatibility = inspection.compatibility || {};
  const canCreate = Boolean(compatibility.canCreate);
  const stats = [
    ['Stack', inspection.stack?.framework || '—'],
    ['Linguagem', inspection.stack?.language || '—'],
    ['Arquivos', inspection.stats?.files ?? 0],
    ['Linhas', inspection.stats?.codeLines ?? 0],
    ['Rotas', inspection.stats?.routes ?? 0],
    ['Componentes', inspection.stats?.components ?? 0],
  ];
  if (inspection.repo?.stars) stats.push(['Estrelas', inspection.repo.stars]);
  const runtime = inspection.dependencies?.runtime || [];
  const dev = inspection.dependencies?.dev || [];
  const deps = [...runtime, ...dev].slice(0, 18);
  const extraDeps = Math.max(0, (inspection.dependencies?.total || 0) - deps.length);
  const features = (inspection.features || []).slice(0, 28);
  const blockers = inspection.blockers || [];
  const createLabel =
    inspection.kind === 'github' ? 'Criar site do GitHub' : 'Criar site do ZIP';

  return `<section class="inspect-card" aria-live="polite">
    <header class="inspect-head">
      <span class="eyebrow">${icon(inspection.kind === 'github' ? 'github' : 'download')} ${esc(inspection.sourceLabel || 'Projeto analisado')}</span>
      <h3>${esc(inspection.name || 'Projeto')}</h3>
      <p>${esc(inspection.description || 'Sem descrição no projeto.')}</p>
      <div class="inspect-tags">
        ${inspection.repo?.language ? `<span class="inspect-tag">${esc(inspection.repo.language)}</span>` : ''}
        ${inspection.repo?.license ? `<span class="inspect-tag">${esc(inspection.repo.license)}</span>` : ''}
        ${inspection.stack?.styling && inspection.stack.styling !== 'Não identificado' ? `<span class="inspect-tag">${esc(inspection.stack.styling)}</span>` : ''}
        ${inspection.stack?.packageManager ? `<span class="inspect-tag">${esc(inspection.stack.packageManager)}</span>` : ''}
        ${inspection.repo?.archived ? '<span class="inspect-tag bad">arquivado</span>' : ''}
      </div>
    </header>
    <div class="inspect-body">
      <div class="inspect-stats">
        ${stats
          .map(
            ([label, value]) =>
              `<div class="inspect-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`,
          )
          .join('')}
      </div>

      ${
        features.length
          ? `<div class="inspect-section">
              <h4>O que ele pode fazer</h4>
              <ul class="feature-list">
                ${features
                  .map(
                    (feature) =>
                      `<li><strong>${esc(feature.label)}</strong><span>${esc(feature.detail || '')}</span></li>`,
                  )
                  .join('')}
              </ul>
            </div>`
          : ''
      }

      ${
        deps.length
          ? `<div class="inspect-section">
              <h4>Dependências principais</h4>
              <div class="dep-chips">
                ${deps
                  .map(
                    (dep) =>
                      `<span class="dep-chip" title="${esc(dep.name)} ${esc(dep.version)}">${esc(dep.name)} <em>${esc(dep.version)}</em></span>`,
                  )
                  .join('')}
                ${extraDeps ? `<span class="dep-chip more">+${extraDeps}</span>` : ''}
              </div>
            </div>`
          : ''
      }

      ${
        inspection.routes?.length
          ? `<div class="inspect-section">
              <h4>Rotas detectadas</h4>
              <div class="dep-chips">
                ${inspection.routes
                  .slice(0, 16)
                  .map((route) => `<span class="dep-chip route">${esc(route)}</span>`)
                  .join('')}
              </div>
            </div>`
          : ''
      }

      <div class="inspect-status ${canCreate ? 'good' : 'bad'}">
        <span class="inspect-status-icon">${icon(canCreate ? 'check' : 'alert')}</span>
        <div>
          <strong>${canCreate ? 'Pronto para criar' : 'Não é possível criar automaticamente'}</strong>
          <p>${esc(
            canCreate
              ? 'O projeto é compatível com o template React + Vite. Clique no botão para criar o site.'
              : compatibility.reason || blockers.join(' ') || 'Projeto incompatível com o template.',
          )}</p>
          ${
            !canCreate && blockers.length > 1
              ? `<ul class="inspect-blockers">${blockers
                  .map((blocker) => `<li>${esc(blocker)}</li>`)
                  .join('')}</ul>`
              : ''
          }
        </div>
      </div>
    </div>
    <footer class="inspect-actions">
      ${
        canCreate
          ? `<button class="btn primary" type="button" data-action="create-inspected">${icon('sparkles')} ${esc(createLabel)}</button>`
          : ''
      }
      <button class="btn ghost" type="button" data-action="dismiss-inspection">${icon('x')} Fechar análise</button>
    </footer>
  </section>`;
}

/* ---------- inspiration card ---------- */

function formatMetric(value) {
  const number = Number(value);
  if (value == null || !Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('pt-BR').format(number);
}

function renderInspirationCard(report) {
  const metrics = report.metrics || {};
  const audience = report.audience || {};
  const reach = report.reach || {};
  const content = report.content || {};
  const stats = [
    ['Público', audience.sizeLabel || 'desconhecido'],
    ['Seguidores/inscritos', formatMetric(metrics.followers)],
    ['Visualizações', formatMetric(metrics.totalViews)],
    ['Curtidas', formatMetric(metrics.totalLikes)],
    ['Comentários', formatMetric(metrics.totalComments)],
    ['Engajamento', metrics.engagementRate == null ? '—' : `${metrics.engagementRate}%`],
  ];
  const themes = content.themes || [];
  const hashtags = report.hashtags || [];
  const limitations = report.limitations || [];
  return `<section class="inspire-card" aria-live="polite">
    <header class="inspect-head">
      <span class="eyebrow">${icon('trending')} Inspiração · ${esc(report.platformLabel || report.platform)}</span>
      <h3>${esc(report.title || report.handle || 'Página analisada')}</h3>
      <p>${esc(report.description || 'Sem descrição pública disponível.')}</p>
      <div class="inspect-tags">
        ${report.handle ? `<span class="inspect-tag">${esc(report.handle)}</span>` : ''}
        ${themes.map((theme) => `<span class="inspect-tag">${esc(theme)}</span>`).join('')}
        <a class="inspect-tag" href="${esc(report.url)}" target="_blank" rel="noreferrer">Abrir página</a>
      </div>
    </header>
    <div class="inspect-body">
      <div class="inspect-stats">
        ${stats
          .map(
            ([label, value]) =>
              `<div class="inspect-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`,
          )
          .join('')}
      </div>

      <div class="inspire-grid">
        <div class="inspect-section">
          <h4>${icon('users')} Público estimado</h4>
          <p>${esc(audience.summary || 'Sem métricas públicas suficientes para estimar o público.')}</p>
        </div>
        <div class="inspect-section">
          <h4>${icon('eye')} Alcance público</h4>
          <p>${esc(reach.summary || 'A plataforma não informou alcance público.')}</p>
        </div>
      </div>

      <div class="inspect-section">
        <h4>${icon('layers')} Formato e temas</h4>
        <p>Formato: ${esc(content.format || 'não informado')}.</p>
        ${
          hashtags.length
            ? `<div class="dep-chips">${hashtags
                .map((tag) => `<span class="dep-chip route">${esc(tag)}</span>`)
                .join('')}</div>`
            : ''
        }
      </div>

      <div class="inspire-note">
        <span class="inspect-status-icon">${icon('info')}</span>
        <div>
          <strong>Métricas públicas usadas como proxy</strong>
          <p>Alcance real, impressões e demografia são privados da conta. A recriação usa esta análise como referência de posicionamento — sem copiar marca, textos ou mídia.</p>
          ${
            limitations.length
              ? `<ul class="inspect-blockers">${limitations
                  .map((item) => `<li>${esc(item)}</li>`)
                  .join('')}</ul>`
              : ''
          }
        </div>
      </div>
    </div>
    <footer class="inspect-actions">
      <button class="btn primary" type="button" data-action="create-inspiration">${icon('sparkles')} Recriar com a mesma ideia</button>
      <button class="btn ghost" type="button" data-action="dismiss-inspiration">${icon('x')} Fechar análise</button>
    </footer>
  </section>`;
}

/* ---------- home ---------- */

function renderHome() {
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

function renderProjectList() {
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

function renderOpenProjectsStrip() {
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
              <button class="copy-btn" type="button" data-action="copy-preview-link" data-copy="${esc(project.previewUrl)}" title="Copiar link do preview">${icon('copy')}</button>
            </div>`
          : ''
      }
    </div>
  </article>`;
}

/* ---------- workspace ---------- */

function ensureSelectedFile() {
  const files = state.project?.files || [];
  if (!state.selectedFile || !files.some((file) => file.path === state.selectedFile)) {
    state.selectedFile =
      files.find((file) => ['src/App.tsx', 'App.tsx'].includes(file.path))?.path ||
      files[0]?.path ||
      null;
  }
}

function renderWorkspaceTabsList() {
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
      return `<div class="ws-tab ${active ? 'active' : ''}" role="presentation">
        <button class="ws-tab-main" type="button" role="tab" aria-selected="${active}" data-action="switch-project" data-id="${esc(project.id)}" title="${esc(project.name)}">
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
    <div class="ws-tabs-list" id="ws-tabs-list" role="tablist">${renderWorkspaceTabsList()}</div>
    <a class="ws-tab-add" href="#/" title="Abrir outro projeto" aria-label="Abrir outro projeto">${icon('plus')}</a>
  </nav>`;
}

function renderWorkspace() {
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
            ? project.buildLog
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
          <div class="tabs">
            <button class="tab ${state.tab === 'preview' ? 'active' : ''}" type="button" data-action="tab" data-tab="preview">${icon('monitor')} Preview</button>
            <button class="tab ${state.tab === 'validation' ? 'active' : ''}" type="button" data-action="tab" data-tab="validation">${icon(validationRunning ? 'loader' : 'shield', validationRunning ? 'spin' : '')} Validação${validationIssues && !validationRunning ? `<span class="tab-badge">${validationIssues}</span>` : ''}</button>
            <button class="tab ${state.tab === 'code' ? 'active' : ''}" type="button" data-action="tab" data-tab="code">${icon('code')} Código</button>
            <button class="tab ${state.tab === 'versions' ? 'active' : ''}" type="button" data-action="tab" data-tab="versions">${icon('clock')} Histórico</button>
            <button class="tab ${state.tab === 'log' ? 'active' : ''}" type="button" data-action="tab" data-tab="log">${icon('terminal')} Log</button>
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
        <div class="canvas-body">${renderCanvas(project)}</div>
      </section>
      <aside class="chat">
        <div class="chat-head">
          <span class="left">${icon('message')} Conversa</span>
          <span class="count">${(project.messages || []).length}</span>
        </div>
        <div class="messages" id="messages">
          ${renderMessages(project)}
          ${busy ? `<div class="message"><div class="avatar">CS</div><div class="message-body"><div class="typing"><span></span><span></span><span></span></div></div></div>` : ''}
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

function stageStepState(project, index) {
  if (project.status === 'ready') return 'done';
  const stage = String(project.stage || '').toLowerCase();
  if (project.status === 'generating') {
    if (stage.includes('valid') || stage.includes('corrig') || stage.includes('gravando')) {
      return index < 1 ? 'done' : index === 1 ? 'active' : '';
    }
    return index === 0 ? 'active' : '';
  }
  if (project.status === 'building') {
    if (stage.includes('validando preview')) {
      return index < 3 ? 'done' : index === 3 ? 'active' : '';
    }
    return index < 2 ? 'done' : index === 2 ? 'active' : '';
  }
  return '';
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
  return `<div class="preview-wrap">
    <div class="preview-frame ${state.device === 'mobile' ? 'mobile' : ''}">
      <iframe src="${src}" title="Preview do app gerado" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"></iframe>
    </div>
  </div>`;
}

function renderStage(project) {
  const steps = [
    'Gerando código',
    'Validando arquivos',
    'Compilando',
    'Validando preview',
    'Publicando',
  ];
  return `<div class="stage-screen">
    <div class="orb"><div class="orb-core">${icon('sparkles')}</div></div>
    <h2>${esc(project.stage || (project.status === 'building' ? 'Compilando seu app…' : 'Gerando seu app…'))}</h2>
    <p>O modelo está escrevendo React + TypeScript. O preview aparece aqui automaticamente quando o build terminar.</p>
    <div class="stage-steps">
      ${steps
        .map((label, index) => {
          const status = stageStepState(project, index);
          const iconName = status === 'done' ? 'check' : status === 'active' ? 'loader' : 'clock';
          return `<span class="stage-step ${status}">${icon(iconName, status === 'active' ? 'spin' : '')} ${label}</span>`;
        })
        .join('')}
    </div>
  </div>`;
}

function renderErrorView(project) {
  const hasFiles = Boolean(project.files?.length);
  const hasLog = Boolean(project.buildLog);
  const description = hasFiles
    ? 'O código foi gravado, mas o build falhou. Peça uma correção automática ou ajuste pelo chat.'
    : 'O modelo não conseguiu concluir. Tente novamente — o prompt original será enviado de novo.';
  return `<div class="error-panel">
    <div class="error-card">
      <h2>${icon('alert')} A geração parou</h2>
      <p>${description}</p>
      <pre class="error-message">${esc(project.error || 'Erro desconhecido.')}</pre>
      <div class="error-actions">
        ${
          hasLog && hasFiles
            ? `<button class="btn primary" type="button" data-action="fix-build">${icon('wrench')} Corrigir com IA</button>
               <button class="btn" type="button" data-action="rebuild">${icon('refresh')} Tentar build de novo</button>
               <button class="btn" type="button" data-action="tab" data-tab="log">${icon('terminal')} Ver log</button>`
            : `<button class="btn primary" type="button" data-action="retry-generation">${icon('refresh')} Tentar de novo</button>
               ${hasFiles ? `<button class="btn" type="button" data-action="rebuild">${icon('refresh')} Tentar build de novo</button>` : ''}
               ${hasLog ? `<button class="btn" type="button" data-action="tab" data-tab="log">${icon('terminal')} Ver log</button>` : ''}`
        }
      </div>
    </div>
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

function fileKind(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  if (['tsx', 'ts', 'jsx', 'js'].includes(ext)) return 'tsx';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (['json', 'jsonc'].includes(ext)) return 'json';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (['md', 'mdx', 'txt'].includes(ext)) return 'md';
  return 'file';
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
        `<span class="code-line"><span class="ln">${index + 1}</span><span class="lc">${esc(line) || ' '}</span></span>`,
    )
    .join('')}</code></pre>`;
}

function renderMessages(project) {
  return (project.messages || [])
    .map((message) => {
      const user = message.role === 'user';
      const kind = message.kind === 'error' ? ' error' : message.kind === 'info' ? ' info' : '';
      return `<div class="message ${user ? 'user' : 'assistant'}${kind}">
        <div class="avatar">${user ? 'EU' : 'CS'}</div>
        <div class="message-body">
          <div class="bubble">${esc(message.content)}</div>
          <div class="message-time">${fmtTime(message.createdAt)}</div>
        </div>
      </div>`;
    })
    .join('');
}

function afterRenderWorkspace() {
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

function scheduleProjectPoll(delay = 1600) {
  if (state.route.name !== 'project' || !isBusy()) return;
  // Um timer já agendado basta: renderizações frequentes não podem adiar o
  // polling indefinidamente.
  if (state.pollTimer) return;
  state.pollTimer = setTimeout(() => {
    state.pollTimer = null;
    refreshProject();
  }, delay);
}

function scheduleTabsPoll() {
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

async function refreshOpenProjectSummaries() {
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

async function refreshProject() {
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

function scheduleHomePoll() {
  clearTimeout(state.homePollTimer);
  if (state.route.name !== 'home') return;
  const busy = state.projects.some((project) =>
    ['generating', 'building'].includes(project.status),
  );
  // Lista vazia também se atualiza sozinha: cobre aba antiga ou resposta transitória.
  if (!busy && state.projects.length > 0) return;
  state.homePollTimer = setTimeout(refreshHomeProjects, busy ? 3000 : 5000);
}

async function refreshHomeProjects() {
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

/* ---------- actions ---------- */

async function loadVersions() {
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

async function restoreVersion(version) {
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

async function createFromComposer() {
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

async function sendChat() {
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

async function fixBuild() {
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

async function retryGeneration() {
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

async function rebuild() {
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

async function validatePreview() {
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

async function fixFromValidation() {
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

async function deleteProject(id, name) {
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

function openProject(id) {
  if (!id) return;
  if (state.route.name === 'project' && state.route.id === id) return;
  saveWorkspaceStateFor();
  location.hash = projectHash(id);
}

function closeProjectTab(id) {
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

function openProjectWindow(id = state.project?.id) {
  if (!id) return;
  const url = `${location.origin}${location.pathname}#/p/${id}?window=1`;
  const win = window.open(url, `clonestudio-${id}`, 'popup=yes,width=1440,height=900');
  if (!win) {
    showToast('O navegador bloqueou a janela. Permita pop-ups para este painel.', 'error');
    return;
  }
  win.focus();
}

function closeWindow() {
  window.close();
  if (!window.closed) {
    showToast('A janela não pôde ser fechada automaticamente.', 'info');
    location.hash = '#/';
  }
}

/* ---------- skills ---------- */

function renderSkills() {
  const installed = state.skills.filter((skill) => skill.installed).length;
  const installable = state.skills.filter((skill) => skill.status === 'instalável').length;
  const needsConfig = state.skills.filter((skill) => skill.status === 'configuração necessária').length;
  return renderShell(
    'skills',
    `<div class="page">
      ${pageHead(
        'Catálogo',
        'Skills para o agente',
        'Instruções e ferramentas oficiais que podem ser acopladas ao fluxo de geração. As marcadas como instaladas já vêm neste pacote.',
      )}
      <div class="summary-grid">
        <div class="summary-card"><strong>${state.skills.length}</strong><span>skills no catálogo</span></div>
        <div class="summary-card"><strong>${installed}</strong><span>já incluídas no pacote</span></div>
        <div class="summary-card"><strong>${installable}</strong><span>instaláveis via script</span></div>
        <div class="summary-card"><strong>${needsConfig}</strong><span>exigem configuração</span></div>
      </div>
      <div class="note">${icon('info')}
        <div>Instale as skills de terceiros com <code class="mono">.\\scripts\\install-skills.ps1</code>. O script pergunta antes de executar cada instalação e usa os repositórios oficiais.</div>
      </div>
      <div class="catalog-grid">
        ${state.skills
          .map(
            (skill) => `<article class="catalog-card">
              <div class="catalog-top">
                <div>
                  <span class="category">${esc(skill.category)}</span>
                  <h3>${esc(skill.name)}</h3>
                </div>
                <span class="tag ${esc(skill.status.replace(' ', '-'))}">${esc(skill.status)}</span>
              </div>
              <p>${esc(skill.description)}</p>
              ${skill.summary ? `<p class="muted">${esc(skill.summary)}</p>` : ''}
              <div class="code-snippet"><code>${esc(skill.install)}</code><button class="copy-btn" type="button" data-action="copy-text" data-copy="${esc(skill.install)}" title="Copiar comando">${icon('copy')}</button></div>
              <div class="catalog-actions">
                ${skill.repo ? `<a class="link" href="${esc(skill.repo)}" target="_blank" rel="noreferrer">${icon('github')} Repositório</a>` : ''}
                ${skill.installed ? `<span class="badge">SKILL.md incluso</span>` : ''}
                ${skill.license ? `<span class="muted license-text">${esc(skill.license)}</span>` : ''}
              </div>
            </article>`,
          )
          .join('')}
      </div>
    </div>`,
  );
}

/* ---------- integrations ---------- */

function context7StatusText() {
  const status = state.context7Status;
  if (!status) return '';
  if (status.status === 'ok') {
    return `Conectado em ${status.latencyMs} ms · ${status.tools.length} ferramenta(s) · ${status.keyless ? 'sem chave' : 'com chave'}`;
  }
  if (status.status === 'disabled') return 'Desativado por CONTEXT7_ENABLED=off.';
  return `Indisponível: ${status.error || 'erro desconhecido'}`;
}

function renderIntegrations() {
  const summary = state.integrations?.summary || { total: 0, implemented: 0, catalogued: 0 };
  const groups = state.integrations?.groups || [];
  const filter = state.integrationFilter;
  const items = groups
    .flatMap((group) => group.items)
    .filter((item) => filter === 'all' || item.status === filter);
  const categories = [...new Set(items.map((item) => item.category))];
  return renderShell(
    'integrations',
    `<div class="page">
      ${pageHead(
        'Ecossistema',
        'Integrações e ferramentas',
        'Os projetos e serviços que inspiram ou podem ser acoplados ao CloneStudio. Nativos já funcionam; adaptadores têm ponto de extensão; externos rodam como serviços separados.',
      )}
      <div class="summary-grid">
        <div class="summary-card"><strong>${summary.total}</strong><span>ferramentas mapeadas</span></div>
        <div class="summary-card"><strong>${summary.implemented}</strong><span>provedores nativos</span></div>
        <div class="summary-card"><strong>${summary.catalogued}</strong><span>prontas ou catalogadas</span></div>
        <div class="summary-card"><strong>${items.length}</strong><span>no filtro atual</span></div>
      </div>
      <div class="note">${icon('info')}
        <div>Não é viável reimplementar Dyad, Plandex, OpenHands, Cline e outros agentes dentro deste app: eles são concorrentes e exigem runtimes próprios. O CloneStudio implementa o núcleo Lovable e oferece adaptadores/catálogo para o resto.</div>
      </div>
      <div class="filter-row">
        ${SKILL_FILTERS.map(
          ([id, label]) =>
            `<button class="filter-btn ${filter === id ? 'active' : ''}" type="button" data-action="filter-integrations" data-filter="${id}">${label}</button>`,
        ).join('')}
      </div>
      ${
        items.length === 0
          ? '<div class="empty"><h3>Nada neste filtro</h3><p>Experimente outra categoria.</p></div>'
          : categories
              .map((category) => {
                const categoryItems = items.filter((item) => item.category === category);
                return `<div class="group-head"><h2>${esc(category)}</h2><span class="line"></span><span class="count">${categoryItems.length}</span></div>
                <div class="catalog-grid">
                  ${categoryItems
                    .map(
                      (item) => `<article class="catalog-card">
                        <div class="catalog-top">
                          <div><span class="category">${esc(item.kind)}</span><h3>${esc(item.name)}</h3></div>
                          <span class="tag ${esc(item.status)}">${esc(item.status)}</span>
                        </div>
                        <p>${esc(item.description)}</p>
                        <p class="muted"><strong>Requer:</strong> ${esc(item.requires)}</p>
                        ${item.id === 'context7' && state.context7Status ? `<p class="muted context7-status">${esc(context7StatusText())}</p>` : ''}
                        <div class="catalog-actions">
                          ${
                            item.id === 'context7'
                              ? `<button class="btn small" type="button" data-action="test-context7" ${state.context7Busy ? 'disabled' : ''}>${icon(state.context7Busy ? 'loader' : 'refresh', state.context7Busy ? 'spin' : '')} ${state.context7Busy ? 'Testando…' : 'Testar Context7'}</button>`
                              : ''
                          }
                          <a class="link" href="${esc(item.repo)}" target="_blank" rel="noreferrer">${icon('github')} GitHub</a>
                        </div>
                      </article>`,
                    )
                    .join('')}
                </div>`;
              })
              .join('')
      }
    </div>`,
  );
}

/* ---------- providers ---------- */

function dashboardUrl(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return '';
  }
}

function renderProviders() {
  const anyConfigured = state.providers.some((provider) => provider.configured);
  return renderShell(
    'providers',
    `<div class="page">
      ${pageHead(
        'Inferência',
        'Provedores',
        'O CloneStudio fala OpenAI Chat Completions. As chaves ficam somente no backend, no arquivo .env, e nunca chegam ao navegador.',
      )}
      <div class="note">${icon(anyConfigured ? 'check' : 'alert')}
        <div>${anyConfigured ? 'Há pelo menos um provedor configurado. O primeiro da ordem AI_PROVIDER_ORDER que responder será usado.' : 'Nenhum provedor configurado. Preencha FREELLMAPI_BASE_URL e FREELLMAPI_API_KEY no .env e reinicie o servidor.'}</div>
      </div>
      ${state.providers
        .map((provider) => {
          const models = state.models[provider.id];
          return `<div class="provider-card">
            <div>
              <div class="provider-title">
                <span class="dot ${provider.configured ? 'good' : 'bad'}"></span>
                <h3>${esc(provider.label)}</h3>
                <span class="tag ${provider.configured ? 'nativo' : 'externo'}">${provider.configured ? 'configurado' : 'não configurado'}</span>
              </div>
              <p>${esc(provider.description)}</p>
              <div class="provider-meta">
                <span>${esc(provider.envPrefix)}_BASE_URL</span>
                <span>${esc(provider.model || 'modelo padrão não definido')}</span>
                ${provider.baseUrl ? `<span>${esc(provider.baseUrl)}</span>` : ''}
                ${
                  provider.id === 'freellmapi' && provider.baseUrl
                    ? `<a class="link" href="${esc(dashboardUrl(provider.baseUrl))}" target="_blank" rel="noreferrer" title="Abrir dashboard do FreeLLMAPI">${icon('external')} ${esc(dashboardUrl(provider.baseUrl))}</a>`
                    : ''
                }
              </div>
              ${
                models
                  ? models.loading
                    ? `<div class="models-list"><span class="muted">Consultando modelos…</span></div>`
                    : models.error
                      ? `<div class="models-list"><span class="model-error">${esc(models.error)}</span></div>`
                      : `<div class="models-list">${models.models
                          .slice(0, 40)
                          .map((model) => `<span class="model-chip">${esc(model)}</span>`)
                          .join('')}${models.models.length > 40 ? `<span class="model-chip">+${models.models.length - 40}</span>` : ''}</div>`
                  : ''
              }
            </div>
            <div class="catalog-actions">
              ${
                provider.configured
                  ? `<button class="btn small" type="button" data-action="load-models" data-provider="${esc(provider.id)}">${icon('refresh')} Ver modelos</button>`
                  : `<a class="btn small" href="#/integrations">${icon('plug')} Como configurar</a>`
              }
              ${
                provider.id === 'freellmapi' && provider.baseUrl
                  ? `<a class="btn small" href="${esc(dashboardUrl(provider.baseUrl))}" target="_blank" rel="noreferrer">${icon('external')} Abrir dashboard</a>`
                  : ''
              }
            </div>
          </div>`;
        })
        .join('')}
      <div class="note spaced">${icon('info')}
        <div>Variáveis aceitas: <code class="mono">FREELLMAPI_*</code>, <code class="mono">OLLAMA_*</code>, <code class="mono">LOCALAI_*</code> e <code class="mono">LLAMACPP_*</code>. A ordem de tentativa é definida em <code class="mono">AI_PROVIDER_ORDER</code>.</div>
      </div>
    </div>`,
  );
}

/* ---------- events ---------- */

document.addEventListener('submit', (event) => {
  if (event.target.id === 'create-form') {
    event.preventDefault();
    createFromComposer();
  }
  if (event.target.id === 'chat-form') {
    event.preventDefault();
    sendChat();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'prompt') {
    state.promptDraft = event.target.value;
  }
  if (event.target.id === 'chat-input') {
    state.chatDraft = event.target.value;
    scheduleWorkspaceStateSave();
    const button = document.querySelector('#chat-form button[type="submit"]');
    if (button) button.disabled = !state.chatDraft.trim();
  }
});

/* ---------- drag & drop import ---------- */

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

window.addEventListener('hashchange', () => routeChanged());

window.addEventListener('beforeunload', () => {
  clearTimeout(state.workspaceSaveTimer);
  state.workspaceSaveTimer = null;
  saveWorkspaceStateFor();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (state.loading || state.route.name !== 'home') return;
  refreshHomeProjects();
});

init();
