import { saveWorkspaceStateFor, state } from './runtime.js';
import { routeChanged } from './routing.js';
import { refreshHomeProjects } from './polling.js';

export function registerLifecycle() {
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
}
