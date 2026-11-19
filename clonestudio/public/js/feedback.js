import { state, toastEl } from './runtime.js';

export function showToast(message, kind = 'info') {
  clearTimeout(state.toastTimer);
  toastEl.textContent = message;
  toastEl.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  toastEl.className = `toast show ${kind}`;
  state.toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, 4200);
}

export function copyText(text) {
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
