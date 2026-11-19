import { pageHead, renderShell } from '../cards.js';
import { dashboardUrl, esc, icon } from '../ui.js';
import { state } from '../runtime.js';

export function renderProviders() {
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
      <h2 class="sr-only">Provedores disponíveis</h2>
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
