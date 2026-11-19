import { configuredProvider, esc, formatMetric, icon } from './ui.js';
import { state } from './runtime.js';

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

export function renderShell(active, content) {
  return `<div class="shell">
    <button class="skip-link" type="button" data-action="skip-main">Pular para o conteúdo</button>
    ${renderSidebar(active)}
    <main class="main" id="main" tabindex="-1">${content}</main>
  </div>`;
}

export function pageHead(eyebrow, title, description) {
  return `<header class="page-head">
    <div>
      <span class="eyebrow">${icon('sparkles')} ${esc(eyebrow)}</span>
      <h1>${esc(title)}</h1>
      <p>${esc(description)}</p>
    </div>
  </header>`;
}
export function renderInspectionCard(inspection) {
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
  const totalDeps = deps.length + extraDeps;
  const createLabel =
    inspection.kind === 'github' ? 'Criar site do GitHub' : 'Criar site do ZIP';

  return `<section class="inspect-card" aria-live="polite">
    <header class="inspect-head">
      <span class="inspect-source">${icon(inspection.kind === 'github' ? 'github' : 'download')} ${esc(inspection.sourceLabel || 'Projeto analisado')}</span>
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
              <h4><span class="inspect-section-icon">${icon('bolt')}</span> O que ele pode fazer <span class="inspect-section-count">${features.length}</span></h4>
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
              <h4><span class="inspect-section-icon">${icon('layers')}</span> Dependências principais <span class="inspect-section-count">${totalDeps}</span></h4>
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
              <h4><span class="inspect-section-icon">${icon('code')}</span> Rotas detectadas <span class="inspect-section-count">${inspection.routes.length}</span></h4>
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
export function renderInspirationCard(report) {
  const metrics = report.metrics || {};
  const audience = report.audience || {};
  const reach = report.reach || {};
  const content = report.content || {};
  const stats = [
    ['Público', audience.sizeLabel || 'desconhecido'],
    ['Seguidores', formatMetric(metrics.followers)],
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
      <span class="inspect-source">${icon('trending')} Inspiração · ${esc(report.platformLabel || report.platform)}</span>
      <h3>${esc(report.title || report.handle || 'Página analisada')}</h3>
      <p>${esc(report.description || 'Sem descrição pública disponível.')}</p>
      <div class="inspect-tags">
        ${report.handle ? `<span class="inspect-tag">${esc(report.handle)}</span>` : ''}
        ${themes.map((theme) => `<span class="inspect-tag">${esc(theme)}</span>`).join('')}
        <a class="inspect-tag" href="${esc(report.url)}" target="_blank" rel="noreferrer">${icon('external')} Abrir página</a>
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
          <h4><span class="inspect-section-icon">${icon('users')}</span> Público estimado</h4>
          <p>${esc(audience.summary || 'Sem métricas públicas suficientes para estimar o público.')}</p>
        </div>
        <div class="inspect-section">
          <h4><span class="inspect-section-icon">${icon('eye')}</span> Alcance público</h4>
          <p>${esc(reach.summary || 'A plataforma não informou alcance público.')}</p>
        </div>
      </div>

      <div class="inspect-section">
        <h4><span class="inspect-section-icon">${icon('layers')}</span> Formato e temas ${hashtags.length ? `<span class="inspect-section-count">${hashtags.length}</span>` : ''}</h4>
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
