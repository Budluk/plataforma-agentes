import { pageHead, renderShell } from '../cards.js';
import { esc, icon } from '../ui.js';
import { state } from '../runtime.js';

export function renderSkills() {
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
      <h2 class="sr-only">Catálogo de skills</h2>
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
              <div class="code-snippet"><code>${esc(skill.install)}</code><button class="copy-btn" type="button" data-action="copy-text" data-copy="${esc(skill.install)}" title="Copiar comando" aria-label="Copiar comando de instalação de ${esc(skill.name)}">${icon('copy')}</button></div>
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
