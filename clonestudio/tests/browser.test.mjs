import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

/**
 * Teste de ponta a ponta das abas e janelas do workspace.
 *
 * Roda contra um servidor de verdade, mas com DATA_DIR temporário e portas
 * livres: nunca toca nos projetos reais nem depende de rede externa. Por isso
 * fica fora do `npm test` padrão e é executado por `npm run test:browser`.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const OPEN_KEY = 'clonestudio.openProjects';
const STATES_KEY = 'clonestudio.workspaceStates';

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  const installed = candidates.find((candidate) => fs.existsSync(candidate));
  if (installed) return installed;
  // No CI, o Chromium é instalado pelo playwright-core.
  try {
    const bundled = chromium.executablePath();
    return bundled && fs.existsSync(bundled) ? bundled : null;
  } catch {
    return null;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs, getLogs) {
  const deadline = Date.now() + timeoutMs;
  let last = 'sem resposta';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await delay(200);
  }
  throw new Error(`O servidor não respondeu em ${url} (${last}).\n${getLogs()}`);
}

function readList(page, key) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || '[]'), key);
}

function readStates(page, key) {
  return page.evaluate(
    (storageKey) => JSON.parse(localStorage.getItem(storageKey) || '{}'),
    key,
  );
}

/**
 * O hash muda antes do app buscar o projeto e renderizar a barra de abas.
 * Esperar o hash sozinho cria corrida; aqui esperamos a ordem real das abas.
 */
function waitForOpenTabs(page, ids) {
  return page.waitForFunction((expected) => {
    const rendered = [...document.querySelectorAll('.ws-tab-main')].map(
      (element) => element.dataset.id,
    );
    return (
      rendered.length === expected.length &&
      rendered.every((id, index) => id === expected[index])
    );
  }, ids);
}

function writeDist(id, storage, title) {
  storage.ensureProjectWorkspace(id);
  const dist = storage.distDir(id);
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1></body></html>`,
    'utf8',
  );
}

test('abas, janelas e persistência do workspace', async (t) => {
  const browserPath = findBrowser();
  if (!browserPath) {
    t.skip('Navegador não encontrado; defina EDGE_PATH/CHROME_PATH ou instale o Chromium.');
    return;
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clonestudio-browser-'));
  process.env.DATA_DIR = temp;
  const storage = await import('../server/storage.mjs');

  const alpha = storage.createProject({ prompt: 'App Alfa para o teste de abas', name: 'Alfa Browser' });
  const beta = storage.createProject({ prompt: 'App Beta para o teste de abas', name: 'Beta Browser' });
  for (const [project, title] of [
    [alpha, 'Alfa Browser'],
    [beta, 'Beta Browser'],
  ]) {
    writeDist(project.id, storage, title);
    storage.updateProject(project.id, {
      status: 'ready',
      stage: '',
      error: null,
      description: `Projeto ${title} criado pelo teste de navegador.`,
      model: 'test/model',
      previewVersion: 1,
    });
  }
  await storage.flushPersistence();

  const port = await freePort();
  const previewPort = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/`;

  const logs = [];
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATA_DIR: temp,
      HOST: '127.0.0.1',
      PORT: String(port),
      PREVIEW_PORT: String(previewPort),
      CONTEXT7_ENABLED: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  const getLogs = () => logs.join('').trim() || '(sem saída do servidor)';

  let browser = null;
  let context = null;
  let page = null;

  t.after(async () => {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (!server.killed) server.kill();
    await Promise.race([once(server, 'exit'), delay(4000)]).catch(() => {});
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  await waitForServer(`http://127.0.0.1:${port}/api/health`, 20000, getLogs);
  await waitForServer(`http://127.0.0.1:${previewPort}/preview/${alpha.id}/`, 20000, getLogs);

  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--disable-gpu', '--no-first-run'],
  });
  context = await browser.newContext({ viewport: { width: 1360, height: 900 } });

  const errors = [];
  const track = (target) => {
    target.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    target.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
  };
  context.on('page', track);

  page = await context.newPage();
  page.setDefaultTimeout(15000);
  track(page);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#project-list .project-card');

  await t.test('1. a página inicial lista os dois projetos', async () => {
    assert.equal(await page.locator('#project-list .project-card').count(), 2);
    const names = await page.locator('#project-list .project-card h3').allTextContents();
    assert.deepEqual(names.sort(), ['Alfa Browser', 'Beta Browser']);
  });

  await t.test('2. abrir um projeto cria aba ativa e persiste a lista', async () => {
    await page.locator(`#project-list .project-card[data-id="${alpha.id}"]`).click();
    await page.waitForSelector('.workspace');
    await page.waitForFunction((id) => location.hash === `#/p/${id}`, alpha.id);
    assert.equal(await page.locator('.ws-tab').count(), 1);
    assert.equal(
      await page.locator('.ws-tab.active .ws-tab-main').getAttribute('data-id'),
      alpha.id,
    );
    assert.deepEqual(await readList(page, OPEN_KEY), [alpha.id]);
  });

  await t.test('3. a aba Código fica salva no estado do projeto', async () => {
    await page.click('[data-action="tab"][data-tab="code"]');
    await page.waitForSelector('.code-view');
    const states = await readStates(page, STATES_KEY);
    assert.equal(states[alpha.id]?.tab, 'code');
  });

  await t.test('4. a visualização mobile fica salva no estado do projeto', async () => {
    await page.click('[data-action="tab"][data-tab="preview"]');
    await page.click('[data-action="device"][data-device="mobile"]');
    await page.waitForSelector('.preview-frame.mobile');
    const states = await readStates(page, STATES_KEY);
    assert.equal(states[alpha.id]?.device, 'mobile');
  });

  await t.test('5. o rascunho do chat é salvo após o debounce', async () => {
    await page.fill('#chat-input', 'Rascunho que deve sobreviver à troca de aba');
    await delay(400);
    const states = await readStates(page, STATES_KEY);
    assert.equal(states[alpha.id]?.chatDraft, 'Rascunho que deve sobreviver à troca de aba');
  });

  await t.test('6. abrir o segundo projeto mantém duas abas na ordem', async () => {
    await page.click('[data-action="tab"][data-tab="code"]');
    await page.waitForSelector('.code-view');
    await page.click('.ws-tab-add');
    await page.waitForSelector('#project-list .project-card');
    await page.locator(`#project-list .project-card[data-id="${beta.id}"]`).click();
    await page.waitForFunction((id) => location.hash === `#/p/${id}`, beta.id);
    await waitForOpenTabs(page, [alpha.id, beta.id]);
    assert.equal(await page.locator('.ws-tab').count(), 2);
    assert.deepEqual(await readList(page, OPEN_KEY), [alpha.id, beta.id]);
  });

  await t.test('7. voltar para a primeira aba restaura o estado salvo', async () => {
    await page.locator(`.ws-tab-main[data-id="${alpha.id}"]`).click();
    await page.waitForFunction((id) => location.hash === `#/p/${id}`, alpha.id);
    await page.waitForSelector('.code-view');
    assert.equal(
      await page.locator('.ws-tab.active .ws-tab-main').getAttribute('data-id'),
      alpha.id,
    );
    assert.equal(await page.inputValue('#chat-input'), 'Rascunho que deve sobreviver à troca de aba');
  });

  await t.test('8. fechar a aba ativa seleciona a próxima', async () => {
    await page.locator('.ws-tab.active .ws-tab-close').click();
    await page.waitForFunction((id) => location.hash === `#/p/${id}`, beta.id);
    await waitForOpenTabs(page, [beta.id]);
    assert.equal(await page.locator('.ws-tab').count(), 1);
    assert.equal(
      await page.locator('.ws-tab.active .ws-tab-main').getAttribute('data-id'),
      beta.id,
    );
    assert.deepEqual(await readList(page, OPEN_KEY), [beta.id]);
    assert.equal((await readStates(page, STATES_KEY))[alpha.id], undefined);
  });

  await t.test('9. clique do meio fecha a última aba e volta ao início', async () => {
    await page.locator('.ws-tab-main').click({ button: 'middle' });
    await page.waitForFunction(() => location.hash === '#/');
    await waitForOpenTabs(page, []);
    assert.equal(await page.locator('.ws-tab').count(), 0);
    assert.deepEqual(await readList(page, OPEN_KEY), []);
  });

  await t.test('10. recarregar o painel restaura as abas abertas', async () => {
    await page.locator(`#project-list .project-card[data-id="${alpha.id}"]`).click();
    await page.waitForSelector('.workspace');
    await page.click('.ws-tab-add');
    await page.waitForSelector('#project-list .project-card');
    await page.locator(`#project-list .project-card[data-id="${beta.id}"]`).click();
    await page.waitForFunction((id) => location.hash === `#/p/${id}`, beta.id);
    await waitForOpenTabs(page, [alpha.id, beta.id]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.workspace');
    await page.waitForFunction(() => document.querySelectorAll('.ws-tab').length === 2);
    assert.equal(
      await page.locator('.ws-tab.active .ws-tab-main').getAttribute('data-id'),
      beta.id,
    );
    assert.deepEqual(await readList(page, OPEN_KEY), [alpha.id, beta.id]);
  });

  let popup = null;

  await t.test('11. abrir em janela separada usa ?window=1', async () => {
    const popupPromise = context.waitForEvent('page');
    await page.click('[data-action="open-project-window"]');
    popup = await popupPromise;
    popup.setDefaultTimeout(15000);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForSelector('.workspace');
    assert.ok(
      popup.url().includes(`#/p/${beta.id}?window=1`),
      `URL inesperada da janela: ${popup.url()}`,
    );
  });

  await t.test('12. a janela separada mostra fechar e esconde abrir em outra janela', async () => {
    assert.equal(await popup.locator('[data-action="close-window"]').count(), 1);
    assert.equal(await popup.locator('[data-action="open-project-window"]').count(), 0);
  });

  await t.test('13. a janela separada é reconhecida pelo hash e pelo window.name', async () => {
    assert.equal(await popup.evaluate(() => /[?&]window=1/.test(location.hash)), true);
    assert.equal(await popup.evaluate(() => window.name), `clonestudio-${beta.id}`);
  });

  await t.test('14. fechar a janela separada não afeta o painel principal', async () => {
    await popup.close();
    await page.bringToFront();
    assert.equal(await page.locator('.workspace').count(), 1);
    assert.equal(await page.locator('.ws-tab').count(), 2);
  });

  await t.test('15. análise de inspiração mostra público, alcance e aviso de proxy', async () => {
    await page.route('**/api/inspiration/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          token: 'token-de-teste',
          inspiration: {
            platform: 'youtube',
            platformLabel: 'YouTube',
            url: 'https://www.youtube.com/@treinoemcasa',
            title: 'Treino em Casa',
            description: 'Treinos rápidos e saúde',
            handle: '@treinoemcasa',
            avatar: '',
            metrics: {
              followers: 123000,
              following: null,
              posts: null,
              totalViews: null,
              totalLikes: null,
              totalComments: null,
              engagementRate: null,
            },
            hashtags: ['#fitness'],
            links: [],
            limitations: ['Total de visualizações do canal não é público.'],
            audience: {
              size: 'médio',
              sizeLabel: 'médio (100 mil a 1 mi)',
              summary: 'Público estimado: 123.000 seguidores/inscritos.',
              signals: [],
            },
            reach: {
              level: 'médio',
              summary: 'Alcance público estimado: 123.000 seguidores/inscritos.',
              publicMetrics: {},
            },
            content: {
              themes: ['fitness e saúde'],
              format: 'vídeos longos e Shorts',
              hashtags: ['#fitness'],
              pillars: ['fitness e saúde'],
            },
          },
        }),
      });
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#create-form');
    await page.fill('#prompt', 'https://www.youtube.com/@treinoemcasa');
    await page.click('#create-form button[type="submit"]');
    await page.waitForSelector('.inspire-card');
    const text = await page.locator('.inspire-card').innerText();
    assert.match(text, /Treino em Casa/);
    assert.match(text, /Público estimado/);
    assert.match(text, /Alcance público/);
    assert.match(text, /Métricas públicas usadas como proxy/);
    assert.match(text, /123\.000/);
    await page.click('[data-action="dismiss-inspiration"]');
    assert.equal(await page.locator('.inspire-card').count(), 0);
    await page.unroute('**/api/inspiration/analyze');
  });

  await t.test('16. acessibilidade: rótulos, contraste, atalho e abas por teclado', async () => {
    await page.goto(`${baseUrl}?a11y=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#prompt');

    const basics = await page.evaluate(() => {
      const name = (el) =>
        el.getAttribute('aria-label') ||
        (el.labels && [...el.labels].map((label) => label.textContent).join(' ').trim()) ||
        el.textContent.replace(/\s+/g, ' ').trim() ||
        el.getAttribute('title') ||
        '';
      const visible = (el) => {
        const style = getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          el.getBoundingClientRect().width > 0
        );
      };
      const unnamed = [...document.querySelectorAll('button, a[href], textarea, iframe')]
        .filter(visible)
        .filter((el) => !name(el))
        .map((el) => el.outerHTML.slice(0, 80));
      const style = getComputedStyle(document.documentElement);
      const sample = (value) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.append(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        return rgb;
      };
      const parse = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
      const lum = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a, b) => {
        const l1 = lum(parse(a));
        const l2 = lum(parse(b));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      return {
        promptLabel: name(document.getElementById('prompt')),
        unnamed,
        mutedContrast: contrast(
          sample(style.getPropertyValue('--muted-2')),
          sample(style.getPropertyValue('--panel')),
        ),
      };
    });
    assert.match(basics.promptLabel, /aplicativo/i);
    assert.deepEqual(basics.unnamed, []);
    assert.ok(basics.mutedContrast >= 4.5, `contraste muted-2/panel: ${basics.mutedContrast}`);

    // Primeiro Tab alcança o atalho e Enter leva o foco para o conteúdo.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), 'skip-main');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');

    await page.goto(`${baseUrl}#/p/${alpha.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#view-tab-preview');
    const chatLabel = await page.evaluate(() => {
      const el = document.getElementById('chat-input');
      return el.labels?.length ? el.labels[0].textContent.trim() : el.getAttribute('aria-label');
    });
    assert.match(chatLabel, /altera/i);

    await page.locator('#view-tab-preview').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const tabs = await page.evaluate(() => ({
      selected: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
      focused: document.activeElement?.id,
      controls: [...document.querySelectorAll('[role="tab"]')].every((el) =>
        document.getElementById(el.getAttribute('aria-controls') || ''),
      ),
    }));
    assert.equal(tabs.selected, 'view-tab-validation');
    assert.equal(tabs.focused, 'view-tab-validation');
    assert.equal(tabs.controls, true);
  });

  await t.test('17. nenhum erro de console ou de página', async () => {
    assert.deepEqual(errors, []);
  });
});
