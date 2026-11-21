import fs from 'node:fs';
import { truncateText } from './validation-core.mjs';

let playwrightModule;

export function windowsBrowserCandidates() {
  return [
    {
      name: 'msedge',
      path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    },
    {
      name: 'msedge',
      path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    },
    {
      name: 'chrome',
      path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
    {
      name: 'chrome',
      path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    },
  ];
}

export function launchCandidates() {
  const candidates = [];
  const explicit = String(process.env.PREVIEW_BROWSER_CHANNEL || '').trim();
  if (explicit) {
    candidates.push(
      /[\\/]/.test(explicit)
        ? { name: 'custom', executablePath: explicit }
        : { name: explicit, channel: explicit },
    );
  }
  if (process.platform === 'win32') {
    for (const candidate of windowsBrowserCandidates()) {
      if (fs.existsSync(candidate.path)) {
        candidates.push({ name: candidate.name, executablePath: candidate.path });
      }
    }
  }
  candidates.push({ name: 'msedge', channel: 'msedge' });
  candidates.push({ name: 'chrome', channel: 'chrome' });
  candidates.push({ name: 'chromium', channel: null });
  return candidates;
}

export async function loadPlaywright() {
  if (playwrightModule === undefined) {
    playwrightModule = await import('playwright-core').catch((error) => ({ error }));
  }
  return playwrightModule?.chromium ? playwrightModule : null;
}

export async function launchBrowser(playwright, extra = {}) {
  const attempts = [];
  const extraArgs = Array.isArray(extra.args) ? extra.args.filter((item) => typeof item === 'string') : [];
  for (const candidate of launchCandidates()) {
    const options = {
      headless: true,
      timeout: 15000,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        ...extraArgs,
      ],
    };
    if (candidate.executablePath) options.executablePath = candidate.executablePath;
    if (candidate.channel) options.channel = candidate.channel;
    let server = null;
    try {
      server = await playwright.chromium.launchServer(options);
      const browser = await playwright.chromium.connect(server.wsEndpoint());
      return {
        browser,
        server,
        pid: server.process()?.pid || null,
        name: candidate.name,
        attempts,
      };
    } catch (error) {
      attempts.push(`${candidate.name}: ${truncateText(error.message, 220)}`);
      if (server) await server.kill().catch(() => {});
    }
  }
  return { browser: null, server: null, pid: null, name: null, attempts };
}

export function forceStopBrowser(launch) {
  try {
    if (launch.pid) {
      process.kill(launch.pid, 'SIGKILL');
    } else if (launch.server) {
      launch.server.kill().catch(() => {});
    }
  } catch {
    // o processo já pode ter encerrado
  }
  launch.browser?.close().catch(() => {});
}
