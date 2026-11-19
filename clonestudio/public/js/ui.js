import { ICONS, STATUS, VALIDATION_STATE } from './constants.js';
import { state } from './runtime.js';

export function icon(name, extra = '') {
  const paths = ICONS[name] || ICONS.sparkles;
  return `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export function isGithubUrl(value) {
  try {
    return /^(www\.)?github\.com$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function isInspirationUrl(value) {
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
export function statusInfo(status) {
  return STATUS[status] || STATUS.generating;
}

export function validationInfo(project = state.project) {
  const validation = project?.validation || null;
  const status = validation?.status || 'none';
  return {
    validation,
    status,
    ...(VALIDATION_STATE[status] || VALIDATION_STATE.none),
  };
}

export function knowledgeChip(project) {
  const knowledge = project?.knowledge;
  if (!knowledge || knowledge.status !== 'used') return '';
  const names = (knowledge.libraries || [])
    .filter((library) => library.chars > 0)
    .map((library) => library.name);
  if (names.length === 0) return '';
  return `<span class="knowledge-chip" title="Documentação atual do Context7 injetada no prompt: ${esc(names.join(', '))}">${icon('book')} Context7: ${esc(names.join(', '))}</span>`;
}

export function referenceChip(project) {
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

export function validationIssueCount(validation) {
  if (!validation) return 0;
  if (validation.counts && Number.isFinite(validation.counts.total)) {
    return validation.counts.total;
  }
  return ['consoleErrors', 'pageErrors', 'failedRequests', 'httpErrors', 'brokenImages'].reduce(
    (total, key) => total + (Array.isArray(validation[key]) ? validation[key].length : 0),
    0,
  );
}

export function fmtDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

export function isBusy(project = state.project) {
  return Boolean(project && ['generating', 'building'].includes(project.status));
}

export function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function relTime(iso) {
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

export function initial(name) {
  const match = String(name || 'A').trim().match(/[a-zA-Z0-9À-ÿ]/);
  return match ? match[0].toUpperCase() : 'A';
}

export function configuredProvider() {
  return state.providers.find((provider) => provider.configured) || null;
}
export function formatMetric(value) {
  const number = Number(value);
  if (value == null || !Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('pt-BR').format(number);
}
export function stageStepState(project, index) {
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
export function errorKindOf(project) {
  if (project.errorKind) return project.errorKind;
  return project.buildLog && project.files?.length ? 'build' : 'generation';
}
export function fileKind(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  if (['tsx', 'ts', 'jsx', 'js'].includes(ext)) return 'tsx';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (['json', 'jsonc'].includes(ext)) return 'json';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (['md', 'mdx', 'txt'].includes(ext)) return 'md';
  return 'file';
}
export function context7StatusText() {
  const status = state.context7Status;
  if (!status) return '';
  if (status.status === 'ok') {
    return `Conectado em ${status.latencyMs} ms · ${status.tools.length} ferramenta(s) · ${status.keyless ? 'sem chave' : 'com chave'}`;
  }
  if (status.status === 'disabled') return 'Desativado por CONTEXT7_ENABLED=off.';
  return `Indisponível: ${status.error || 'erro desconhecido'}`;
}
export function dashboardUrl(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return '';
  }
}
