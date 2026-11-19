import { scheduleWorkspaceStateSave, state } from './runtime.js';
import { createFromComposer, sendChat } from './actions.js';

export function registerEvents() {
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
}
