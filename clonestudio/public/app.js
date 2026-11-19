import { configureRenderer } from './js/renderer.js';
import { afterRenderWorkspace, scheduleHomePoll } from './js/polling.js';
import { registerEvents } from './js/events.js';
import { registerInteractions } from './js/interactions.js';
import { registerLifecycle } from './js/lifecycle.js';
import { init } from './js/routing.js';

registerEvents();
registerInteractions();
registerLifecycle();
configureRenderer({ afterRenderWorkspace, scheduleHomePoll });
init();
