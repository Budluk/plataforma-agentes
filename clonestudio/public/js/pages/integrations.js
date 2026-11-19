import { pageHead, renderShell } from '../cards.js';
import { context7StatusText, esc, icon } from '../ui.js';
import { state } from '../runtime.js';
import { SKILL_FILTERS } from '../constants.js';

export function renderIntegrations() {
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
