const BENIGN_CONSOLE_PATTERNS = [
  /download the react devtools/i,
  /favicon\.ico/i,
  /resizeobserver loop (limit exceeded|completed with undelivered notifications)/i,
  /\[vite\] connect/i,
  /\[vite\] disconnected/i,
];

const BENIGN_REQUEST_PATTERNS = [/favicon\.ico/i];

const MAX_REPORT_ENTRIES = 15;

export function truncateText(value, limit = 500) {
  const text = String(value ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function isBenignConsoleError(entry) {
  const text = typeof entry === 'string' ? entry : `${entry?.text || ''} ${entry?.location || ''}`;
  return BENIGN_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isBenignRequestFailure(entry) {
  const url = typeof entry === 'string' ? entry : entry?.url || '';
  const error = typeof entry === 'string' ? '' : entry?.error || '';
  if (BENIGN_REQUEST_PATTERNS.some((pattern) => pattern.test(url))) return true;
  if (/ERR_ABORTED/i.test(error) && /^(blob:|data:)/i.test(url)) return true;
  return false;
}

export function sanitizeConsoleEntry(entry) {
  return {
    type: String(entry?.type || 'error'),
    text: truncateText(entry?.text, 600),
    location: truncateText(entry?.location, 240),
  };
}

export function sanitizePageError(entry) {
  return {
    message: truncateText(entry?.message || entry, 600),
    stack: truncateText(entry?.stack, 700),
  };
}

export function sanitizeFailedRequest(entry) {
  return {
    method: String(entry?.method || 'GET').toUpperCase(),
    url: truncateText(entry?.url, 500),
    error: truncateText(entry?.error, 300),
  };
}

export function sanitizeHttpError(entry) {
  return {
    status: Number(entry?.status) || 0,
    method: String(entry?.method || 'GET').toUpperCase(),
    url: truncateText(entry?.url, 500),
  };
}

export function sanitizeBrokenImage(entry) {
  return {
    src: truncateText(entry?.src, 500),
    alt: truncateText(entry?.alt, 120),
  };
}

function dedupe(entries, keyFn) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    const key = keyFn(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
}

export function sanitizeValidationEntries({
  consoleErrors = [],
  pageErrors = [],
  failedRequests = [],
  httpErrors = [],
  brokenImages = [],
} = {}) {
  const consoleEntries = dedupe(
    consoleErrors.filter((entry) => !isBenignConsoleError(entry)).map(sanitizeConsoleEntry),
    (entry) => entry.text,
  ).slice(0, MAX_REPORT_ENTRIES);
  const pageEntries = dedupe(pageErrors.map(sanitizePageError), (entry) => entry.message).slice(
    0,
    MAX_REPORT_ENTRIES,
  );
  const requestEntries = dedupe(
    failedRequests
      .filter((entry) => !isBenignRequestFailure(entry))
      .map(sanitizeFailedRequest),
    (entry) => `${entry.method} ${entry.url} ${entry.error}`,
  ).slice(0, MAX_REPORT_ENTRIES);
  const httpEntries = dedupe(
    httpErrors
      .filter((entry) => !isBenignRequestFailure(entry))
      .map(sanitizeHttpError),
    (entry) => `${entry.status} ${entry.url}`,
  ).slice(0, MAX_REPORT_ENTRIES);
  const imageEntries = dedupe(
    brokenImages.map(sanitizeBrokenImage),
    (entry) => entry.src,
  ).slice(0, MAX_REPORT_ENTRIES);

  return {
    consoleErrors: consoleEntries,
    pageErrors: pageEntries,
    failedRequests: requestEntries,
    httpErrors: httpEntries,
    brokenImages: imageEntries,
  };
}

export function summarizeValidation(entries = {}) {
  const counts = {
    console: (entries.consoleErrors || []).length,
    page: (entries.pageErrors || []).length,
    requests: (entries.failedRequests || []).length,
    http: (entries.httpErrors || []).length,
    images: (entries.brokenImages || []).length,
  };
  return {
    ...counts,
    total: counts.console + counts.page + counts.requests + counts.http + counts.images,
  };
}

export function validationStatus({
  navigationError = '',
  blank = false,
  consoleErrors = [],
  pageErrors = [],
  failedRequests = [],
  httpErrors = [],
  brokenImages = [],
} = {}) {
  if (navigationError) return 'failed';
  if (blank) return 'issues';
  const total =
    consoleErrors.length +
    pageErrors.length +
    failedRequests.length +
    httpErrors.length +
    brokenImages.length;
  return total > 0 ? 'issues' : 'passed';
}

function bulletList(items, formatter, limit = 10) {
  const visible = items.slice(0, limit);
  const lines = visible.map((item) => `- ${formatter(item)}`);
  if (items.length > visible.length) {
    lines.push(`- …e mais ${items.length - visible.length} ocorrência(s).`);
  }
  return lines.join('\n');
}

export function buildValidationInstruction(report = {}) {
  const entries = sanitizeValidationEntries(report);
  const lines = [
    'O app compilou, mas a validação automática do preview em navegador real encontrou problemas em tempo de execução. Corrija a causa raiz, preserve todas as funcionalidades e o visual atual e devolva o conjunto completo de arquivos.',
  ];

  if (report.navigationError) {
    lines.push('', `FALHA AO ABRIR A PÁGINA:\n- ${truncateText(report.navigationError, 700)}`);
  }
  if (report.blank) {
    lines.push(
      '',
      'PÁGINA EM BRANCO:\n- A página abriu sem texto visível e sem elementos interativos. Verifique erros de renderização, imports e o componente raiz.',
    );
  }
  if (entries.consoleErrors.length) {
    lines.push(
      '',
      `ERROS DE CONSOLE:\n${bulletList(entries.consoleErrors, (entry) =>
        entry.location ? `${entry.text} (${entry.location})` : entry.text,
      )}`,
    );
  }
  if (entries.pageErrors.length) {
    lines.push(
      '',
      `EXCEÇÕES NÃO TRATADAS:\n${bulletList(entries.pageErrors, (entry) => entry.message)}`,
    );
  }
  if (entries.failedRequests.length) {
    lines.push(
      '',
      `REQUISIÇÕES COM FALHA:\n${bulletList(
        entries.failedRequests,
        (entry) => `${entry.method} ${entry.url} — ${entry.error}`,
      )}`,
    );
  }
  if (entries.httpErrors.length) {
    lines.push(
      '',
      `RESPOSTAS HTTP DE ERRO:\n${bulletList(
        entries.httpErrors,
        (entry) => `${entry.status} ${entry.method} ${entry.url}`,
      )}`,
    );
  }
  if (entries.brokenImages.length) {
    lines.push(
      '',
      `IMAGENS QUEBRADAS (não carregaram):\n${bulletList(
        entries.brokenImages,
        (entry) => (entry.alt ? `${entry.src} (alt: ${entry.alt})` : entry.src),
      )}\n- Troque por URLs válidas, use as imagens da referência ou substitua por um placeholder CSS/SVG local. Nunca use via.placeholder.com, placehold.it ou dummyimage.com.`,
    );
  }

  return truncateText(lines.join('\n'), 7800);
}
