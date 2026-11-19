import { renderHome } from './pages/home.js';
import { renderIntegrations } from './pages/integrations.js';
import { renderProviders } from './pages/providers.js';
import { renderSkills } from './pages/skills.js';
import { renderWorkspace } from './workspace/render.js';
import { esc } from './ui.js';
import { app, state } from './runtime.js';

let hooks = {};

export function configureRenderer(next) {
  hooks = next;
}

/* Preserva o foco do teclado quando um render recria o DOM. */
function focusSnapshot() {
  const el = document.activeElement;
  if (!el || el === document.body || !app.contains(el)) return null;
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(el.tagName)) return null;
  const action = el.dataset?.action || '';
  if (!el.id && !action) return null;
  return { id: el.id, action, dataset: { ...el.dataset } };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const pool = snapshot.action
    ? [...app.querySelectorAll('[data-action]')].filter(
        (el) => el.dataset.action === snapshot.action,
      )
    : snapshot.id
      ? [document.getElementById(snapshot.id)].filter(Boolean)
      : [];
  const target = pool.find((el) =>
    Object.entries(snapshot.dataset).every(([key, value]) => (el.dataset[key] || '') === value),
  );
  if (target && target !== document.activeElement) target.focus({ preventScroll: true });
}

export function render() {
  const focus = focusSnapshot();
  if (state.loading) {
    app.innerHTML = `<div class="boot"><div class="boot-mark">CS</div><p>Carregando CloneStudio AI…</p></div>`;
    return;
  }
  if (state.route.name === 'project') {
    app.innerHTML = renderWorkspace();
    if (hooks.afterRenderWorkspace) hooks.afterRenderWorkspace();
    restoreFocus(focus);
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
  if (state.route.name === 'home' && hooks.scheduleHomePoll) hooks.scheduleHomePoll();
  restoreFocus(focus);
}

export function renderFatal(error) {
  app.innerHTML = `<div class="boot">
    <div class="boot-mark">CS</div>
    <h1 class="boot-title">Não foi possível carregar o painel</h1>
    <p class="boot-text">${esc(error.message)}</p>
    <a class="btn primary" href="/">Recarregar</a>
  </div>`;
}
