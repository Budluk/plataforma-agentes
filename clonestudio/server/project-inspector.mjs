import { ALLOWED_PACKAGES } from './generation-core.mjs';

const CODE_EXT = /\.(tsx|ts|jsx|js|mjs|cjs)$/i;
const TEXT_EXT =
  /\.(tsx|ts|jsx|js|mjs|cjs|css|scss|sass|less|json|md|mdx|html|yml|yaml|toml|txt)$/i;
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|zip|tar|gz|7z|rar|pdf|exe|dll|so|dylib|wasm|class|jar|psd|ai|sketch|fig)$/i;
const IGNORED_DIR =
  /(^|\/)(node_modules|\.git|dist|build|\.next|\.nuxt|out|coverage|\.turbo|\.cache|\.vercel)\//i;
const MAX_TEXT_READ = 220_000;
const MAX_FEATURES = 28;
const MAX_ROUTES = 24;
const MAX_COMPONENTS = 24;
const MAX_DEPS = 40;

const ALLOWED_RUNTIME = new Set(ALLOWED_PACKAGES);

const FEATURE_RULES = [
  {
    deps: ['react-router-dom', 'react-router', '@tanstack/react-router', 'wouter'],
    label: 'Rotas e navegação',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['react-hook-form', 'formik', 'react-final-form', '@tanstack/react-form'],
    label: 'Formulários',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['zod', 'yup', 'valibot', 'joi', 'superstruct'],
    label: 'Validação de dados',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['zustand', 'redux', '@reduxjs/toolkit', 'jotai', 'recoil', 'mobx'],
    label: 'Estado global',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['@tanstack/react-query', 'swr', 'axios', 'ky', 'ofetch'],
    label: 'Consumo de API',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['framer-motion', 'motion', '@react-spring/web', 'react-transition-group'],
    label: 'Animações',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['recharts', 'chart.js', 'react-chartjs-2', 'echarts', 'echarts-for-react', 'apexcharts', 'react-apexcharts', '@nivo/core'],
    label: 'Gráficos e dashboards',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['lucide-react', 'react-icons', '@heroicons/react', '@radix-ui/react-icons'],
    label: 'Ícones',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['@supabase/supabase-js', 'firebase', 'next-auth', '@auth/core', '@clerk/nextjs', '@clerk/clerk-react', 'lucia'],
    label: 'Autenticação e backend',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['prisma', '@prisma/client', 'drizzle-orm', 'mongoose', 'sequelize', 'typeorm', 'kysely'],
    label: 'Banco de dados',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['stripe', '@stripe/stripe-js', '@paddle/paddle-js'],
    label: 'Pagamentos',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['vitest', 'jest', '@playwright/test', 'cypress', '@testing-library/react', '@testing-library/jest-dom'],
    label: 'Testes automatizados',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['eslint', 'prettier', 'biome'],
    label: 'Qualidade de código',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['openai', '@anthropic-ai/sdk', 'groq-sdk', '@google/generative-ai', 'ai'],
    label: 'Recursos de IA',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['mapbox-gl', 'leaflet', 'react-leaflet', 'react-map-gl', '@vis.gl/react-google-maps'],
    label: 'Mapas',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['socket.io', 'socket.io-client', 'pusher-js', 'ably'],
    label: 'Tempo real',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['cloudinary', 'uploadthing', '@uploadthing/react', 'react-dropzone', 'react-dropzone-uploader'],
    label: 'Upload de arquivos',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['i18next', 'react-i18next', 'next-intl', 'react-intl'],
    label: 'Internacionalização',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['three', '@react-three/fiber', '@react-three/drei'],
    label: 'Cenas 3D',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['monaco-editor', '@monaco-editor/react', '@tiptap/react', 'codemirror', '@codemirror/state'],
    label: 'Editor de texto/código',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['@tanstack/react-table', 'ag-grid-react', 'react-data-grid'],
    label: 'Tabelas de dados',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['react-big-calendar', '@fullcalendar/react', 'react-day-picker'],
    label: 'Calendário e datas',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['sonner', 'react-hot-toast', 'react-toastify', 'notistack'],
    label: 'Notificações',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['next-themes', 'react-toggle-dark-mode'],
    label: 'Tema claro/escuro',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['@dnd-kit/core', 'react-dnd', 'react-beautiful-dnd', '@hello-pangea/dnd'],
    label: 'Arrastar e soltar',
    detail: (dep) => `Usa ${dep}`,
  },
  {
    deps: ['date-fns', 'dayjs', 'luxon', 'moment'],
    label: 'Manipulação de datas',
    detail: (dep) => `Usa ${dep}`,
  },
];

function normalizeName(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}

function toText(entry, limit = MAX_TEXT_READ) {
  if (!entry) return '';
  const data = Buffer.isBuffer(entry.data)
    ? entry.data
    : Buffer.from(String(entry.data ?? ''), 'utf8');
  return data.subarray(0, limit).toString('utf8').replace(/^\uFEFF/, '');
}

function stripRootFolder(entries) {
  if (entries.length === 0) return entries;
  const first = normalizeName(entries[0].name).split('/')[0];
  if (!first || !entries.every((entry) => normalizeName(entry.name).startsWith(`${first}/`))) {
    return entries;
  }
  return entries.map((entry) => ({
    ...entry,
    name: normalizeName(entry.name).slice(first.length + 1),
  }));
}

function cleanEntries(entries) {
  return stripRootFolder(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => ({ ...entry, name: normalizeName(entry.name) }))
      .filter((entry) => entry.name && !BINARY_EXT.test(entry.name) && !IGNORED_DIR.test(entry.name)),
  );
}

function readJsonEntry(entries, name) {
  const entry = entries.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!entry) return null;
  try {
    return JSON.parse(toText(entry));
  } catch {
    return null;
  }
}

function readPackageJson(entries) {
  const candidates = entries
    .filter((entry) => /(^|\/)package\.json$/i.test(entry.name))
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  const entry = candidates[0];
  if (!entry) return { pkg: null, path: '' };
  try {
    return { pkg: JSON.parse(toText(entry)), path: entry.name };
  } catch {
    return { pkg: null, path: entry.name };
  }
}

function dependenciesOf(pkg) {
  if (!pkg || typeof pkg !== 'object') return {};
  const runtime = pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
  const dev = pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {};
  return { ...dev, ...runtime };
}

function depVersion(deps, names) {
  for (const name of names) {
    if (deps[name]) return { name, version: String(deps[name]) };
  }
  return null;
}

function detectFramework(pkg, entries, deps) {
  const has = (name) => Boolean(deps[name]);
  const hasFile = (pattern) => entries.some((entry) => pattern.test(entry.name));
  if (has('next')) return { id: 'next', label: 'Next.js' };
  if (has('nuxt')) return { id: 'nuxt', label: 'Nuxt (Vue)' };
  if (has('@angular/core')) return { id: 'angular', label: 'Angular' };
  if (has('@sveltejs/kit') || has('svelte')) return { id: 'svelte', label: 'Svelte' };
  if (has('astro')) return { id: 'astro', label: 'Astro' };
  if (has('@remix-run/react') || has('remix')) return { id: 'remix', label: 'Remix' };
  if (has('gatsby')) return { id: 'gatsby', label: 'Gatsby' };
  if (has('vue')) return { id: 'vue', label: 'Vue' };
  if (has('react')) {
    if (has('vite') || hasFile(/(^|\/)vite\.config\./i)) {
      return { id: 'react-vite', label: 'React + Vite' };
    }
    return { id: 'react', label: 'React' };
  }
  if (hasFile(/(^|\/)vite\.config\./i) && hasFile(/(^|\/)App\.(tsx|ts|jsx|js)$/i)) {
    return { id: 'react-vite', label: 'React + Vite' };
  }
  if (hasFile(/(^|\/)App\.(tsx|ts|jsx|js)$/i)) return { id: 'react', label: 'React' };
  return { id: 'unknown', label: 'Não identificado' };
}

function detectLanguage(entries) {
  if (
    entries.some((entry) => /(^|\/)tsconfig(\.[^/]+)?\.json$/i.test(entry.name)) ||
    entries.some((entry) => /\.(tsx|ts)$/i.test(entry.name))
  ) {
    return 'TypeScript';
  }
  if (entries.some((entry) => /\.(jsx|js|mjs|cjs)$/i.test(entry.name))) return 'JavaScript';
  return 'Desconhecida';
}

function detectStyling(entries, deps) {
  const has = (name) => Boolean(deps[name]);
  if (has('tailwindcss') || entries.some((entry) => /(^|\/)tailwind\.config\./i.test(entry.name))) {
    return 'Tailwind CSS';
  }
  if (has('sass') || entries.some((entry) => /\.(scss|sass)$/i.test(entry.name))) return 'Sass/SCSS';
  if (has('styled-components')) return 'styled-components';
  if (has('@emotion/react') || has('@emotion/styled')) return 'Emotion';
  if (entries.some((entry) => /\.module\.css$/i.test(entry.name))) return 'CSS Modules';
  if (entries.some((entry) => /\.css$/i.test(entry.name))) return 'CSS';
  return 'Não identificado';
}

function detectPackageManager(entries) {
  if (entries.some((entry) => /(^|\/)pnpm-lock\.yaml$/i.test(entry.name))) return 'pnpm';
  if (entries.some((entry) => /(^|\/)yarn\.lock$/i.test(entry.name))) return 'Yarn';
  if (entries.some((entry) => /(^|\/)bun\.lockb?$/i.test(entry.name))) return 'Bun';
  if (entries.some((entry) => /(^|\/)package-lock\.json$/i.test(entry.name))) return 'npm';
  return '';
}

function appEntry(entries) {
  return (
    entries.find((entry) => /^src\/App\.(tsx|ts|jsx|js)$/i.test(entry.name)) ||
    entries.find((entry) => /^App\.(tsx|ts|jsx|js)$/i.test(entry.name)) ||
    null
  );
}

function listRoutes(entries) {
  const routes = [];
  for (const entry of entries) {
    if (!CODE_EXT.test(entry.name)) continue;
    const path = entry.name.replace(/^src\//i, '');
    let prefix = '';
    if (/^(pages|routes|screens)\//i.test(path)) {
      prefix = path.split('/')[0].toLowerCase();
    } else if (/^app\//i.test(path)) {
      prefix = 'app';
    } else {
      continue;
    }
    const rest = path.slice(prefix.length + 1);
    const segments = rest.split('/').filter(Boolean);
    const file = segments.pop() || '';
    const base = file.replace(CODE_EXT, '');
    if (/^(layout|loading|error|not-found|template|default|global-error|_app|_document)$/i.test(base)) {
      continue;
    }
    if (prefix === 'app' && !/^(page|route)$/i.test(base)) continue;
    const routeSegments =
      prefix === 'app'
        ? segments
        : [...segments, ...(base === 'index' ? [] : [base])];
    const route =
      '/' +
      routeSegments
        .map((segment) =>
          segment
            .replace(/^\[\.\.\.(.+)\]$/, '*')
            .replace(/^\[(.+)\]$/, ':$1'),
        )
        .filter(Boolean)
        .join('/');
    if (!routes.includes(route)) routes.push(route);
    if (routes.length >= MAX_ROUTES) break;
  }
  return routes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function listComponents(entries) {
  const components = [];
  for (const entry of entries) {
    if (!CODE_EXT.test(entry.name) || !/(^|\/)components?\//i.test(entry.name)) continue;
    const name = entry.name.split('/').pop().replace(CODE_EXT, '');
    if (!name || components.includes(name)) continue;
    components.push(name);
    if (components.length >= MAX_COMPONENTS) break;
  }
  return components.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function packageNameOf(specifier) {
  const spec = String(specifier || '').trim();
  if (!spec) return '';
  if (/^(\.|\/|@\/|~\/|#)/.test(spec)) return '';
  if (/^(https?:|data:|node:|blob:)/i.test(spec)) return '';
  if (/\.(css|scss|sass|less|styl|svg|png|jpe?g|gif|webp|avif|ico|json|md|mdx|txt|woff2?|ttf|otf|mp4|webm)$/i.test(spec)) {
    return '';
  }
  if (spec.startsWith('@types/')) return '';
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

function scanUnsupportedImports(entries) {
  const hasSrc = entries.some((entry) => entry.name.startsWith('src/'));
  const isToolingFile = (name) =>
    /(^|\/)(__tests__|__mocks__|tests?)\//i.test(name) ||
    /\.(test|spec)\.(tsx|ts|jsx|js|mjs|cjs)$/i.test(name) ||
    /(^|\/)(setupTests|setup-tests|vitest\.setup|jest\.setup)\.(tsx|ts|jsx|js)$/i.test(name) ||
    /(^|\/)(vite|vitest|tailwind|postcss|eslint|playwright|cypress|jest|babel)\.config\.(tsx|ts|jsx|js|mjs|cjs)$/i.test(
      name,
    );
  const sourceEntries = entries.filter((entry) => {
    if (!CODE_EXT.test(entry.name) || isToolingFile(entry.name)) return false;
    if (hasSrc) return entry.name.startsWith('src/');
    return !entry.name.includes('/');
  });

  const unsupported = new Map();
  const record = (specifier, file) => {
    const name = packageNameOf(specifier);
    if (!name || ALLOWED_RUNTIME.has(name)) return;
    if (!unsupported.has(name)) unsupported.set(name, new Set());
    const files = unsupported.get(name);
    if (files.size < 4) files.add(file);
  };

  for (const entry of sourceEntries) {
    const text = toText(entry);
    for (const match of text.matchAll(/^\s*import\s+([^'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
      if (/^\s*type\b/.test(match[1])) continue;
      record(match[2], entry.name);
    }
    for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
      record(match[1], entry.name);
    }
    for (const match of text.matchAll(/^\s*export\s+([^'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
      if (/^\s*type\b/.test(match[1])) continue;
      record(match[2], entry.name);
    }
    for (const match of text.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      record(match[1], entry.name);
    }
    for (const match of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      record(match[1], entry.name);
    }
  }

  return [...unsupported.entries()]
    .map(([name, files]) => ({ name, files: [...files] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function readmeSummary(entries) {
  const entry =
    entries.find((item) => /^README(\.md|\.mdx|\.txt)?$/i.test(item.name)) ||
    entries.find((item) => /(^|\/)README(\.md|\.mdx|\.txt)?$/i.test(item.name));
  if (!entry) return '';
  const lines = toText(entry, 60_000).split(/\r?\n/);
  for (const line of lines) {
    const text = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[#*_`>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < 12) continue;
    if (/^(badge|build|license|version|npm|yarn|pnpm|tests?|coverage|downloads?|stars?)\b/i.test(text)) {
      continue;
    }
    return text.slice(0, 280);
  }
  return '';
}

function inferFeatures({ entries, deps, framework, language, styling, routes, components, pkg }) {
  const features = [];
  const seen = new Set();
  const add = (label, detail) => {
    if (!label || seen.has(label) || features.length >= MAX_FEATURES) return;
    seen.add(label);
    features.push({ label, detail: String(detail || '').slice(0, 160) });
  };

  if (framework.id === 'react-vite' || framework.id === 'react') {
    add('Interface React', 'Componentes declarativos com React');
  }
  if (framework.id === 'react-vite') add('Build com Vite', 'Compilação rápida com Vite');
  if (language === 'TypeScript') add('TypeScript', 'Código com tipagem estática');
  if (routes.length > 0) add('Páginas e rotas', `${routes.length} rota(s) detectada(s)`);
  if (components.length > 0) {
    add('Componentes reutilizáveis', `${components.length} componente(s) detectado(s)`);
  }
  if (styling !== 'Não identificado') add('Estilos', styling);

  for (const rule of FEATURE_RULES) {
    const found = depVersion(deps, rule.deps);
    if (found) add(rule.label, rule.detail(found.name));
  }

  const hasFile = (pattern) => entries.some((entry) => pattern.test(entry.name));
  if (hasFile(/(^|\/)\.github\/workflows\//i)) add('CI/CD', 'GitHub Actions configurado');
  if (hasFile(/(^|\/)(Dockerfile|docker-compose\.ya?ml)$/i)) add('Docker', 'Container configurado');
  if (hasFile(/(^|\/)(vercel\.json|netlify\.toml)$/i)) add('Deploy', 'Configuração de Vercel/Netlify');
  if (
    hasFile(/(^|\/)(manifest\.webmanifest|manifest\.json)$/i) &&
    hasFile(/(^|\/)(service-worker|sw)\.(js|ts)$/i)
  ) {
    add('PWA', 'Manifest e service worker');
  }
  if (hasFile(/(^|\/)\.env\.(example|sample)$/i)) {
    add('Variáveis de ambiente', '.env de exemplo incluído');
  }
  if (hasFile(/(^|\/)(supabase|prisma|drizzle)\//i)) add('Backend e banco', 'Pasta de backend/banco detectada');
  if (hasFile(/(^|\/)(tests?|__tests__)\//i) || hasFile(/\.(test|spec)\.(tsx|ts|jsx|js)$/i)) {
    add('Testes', 'Arquivos de teste incluídos');
  }
  if (hasFile(/^README(\.md|\.mdx|\.txt)?$/i)) add('Documentação', 'README incluído');
  if (pkg?.private) add('Projeto privado', 'package.json marcado como private');

  return features;
}

function buildDependencies(pkg) {
  const runtime = pkg?.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
  const dev = pkg?.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {};
  const toList = (value) =>
    Object.entries(value)
      .map(([name, version]) => ({ name, version: String(version) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, MAX_DEPS);
  return {
    runtime: toList(runtime),
    dev: toList(dev),
    total: Object.keys(runtime).length + Object.keys(dev).length,
  };
}

function buildScripts(pkg) {
  if (!pkg?.scripts || typeof pkg.scripts !== 'object') return [];
  return Object.entries(pkg.scripts)
    .map(([name, command]) => ({ name, command: String(command) }))
    .slice(0, 20);
}

function prettifyName(value) {
  const cleaned = String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const shortened =
    cleaned.length > 52 ? `${cleaned.slice(0, 52).replace(/\s+\S*$/, '')}…` : cleaned;
  return shortened.replace(/^\w/, (char) => char.toUpperCase());
}

/**
 * Analisa um projeto já descompactado e devolve um relatório legível:
 * stack, rotas, componentes, dependências, funcionalidades e compatibilidade.
 * Função pura (não baixa nada e não cria projeto).
 */
export function analyzeProjectEntries(entries, options = {}) {
  const files = cleanEntries(entries);
  const { pkg, path: packagePath } = readPackageJson(files);
  const deps = dependenciesOf(pkg);
  const framework = detectFramework(pkg, files, deps);
  const language = detectLanguage(files);
  const styling = detectStyling(files, deps);
  const packageManager = detectPackageManager(files);
  const routes = listRoutes(files);
  const components = listComponents(files);
  const unsupportedImports = scanUnsupportedImports(files);
  const app = appEntry(files);
  const readme = readmeSummary(files);
  const dependencies = buildDependencies(pkg);
  const scripts = buildScripts(pkg);
  const sourceFiles = files.filter((entry) => CODE_EXT.test(entry.name) || /\.css$/i.test(entry.name));
  const codeLines = sourceFiles.reduce((total, entry) => {
    const text = toText(entry, 80_000);
    return total + (text ? text.split(/\r?\n/).length : 0);
  }, 0);
  const features = inferFeatures({
    entries: files,
    deps,
    framework,
    language,
    styling,
    routes,
    components,
    pkg,
  });

  const blockers = [];
  const incompatibleFrameworks = new Set([
    'next',
    'nuxt',
    'vue',
    'svelte',
    'angular',
    'astro',
    'remix',
    'gatsby',
  ]);
  if (incompatibleFrameworks.has(framework.id)) {
    blockers.push(
      `O projeto usa ${framework.label}. O CloneStudio cria apenas apps React + Vite; esse projeto não pode ser importado automaticamente.`,
    );
  }
  if (!app) {
    blockers.push('Não encontrei src/App.tsx (ou App.tsx) no pacote para usar como app principal.');
  }
  if (unsupportedImports.length > 0) {
    const names = unsupportedImports.slice(0, 8).map((item) => item.name).join(', ');
    const extra = unsupportedImports.length > 8 ? ` e mais ${unsupportedImports.length - 8}` : '';
    blockers.push(
      `O app importa pacotes que não vêm no template: ${names}${extra}. O build não os instalaria.`,
    );
  }
  if (files.length === 0) {
    blockers.push('O pacote não tem arquivos de texto legíveis para analisar.');
  }

  const repo = options.repo || null;
  const rawName =
    pkg?.name ||
    repo?.repo ||
    String(options.filename || '').replace(/\.zip$/i, '') ||
    'Projeto';
  const name = prettifyName(rawName) || 'Projeto';
  const description =
    String(pkg?.description || options.metadata?.description || readme || '').trim().slice(0, 320) ||
    'Sem descrição no projeto.';
  const canCreate = blockers.length === 0;

  return {
    kind: options.kind === 'zip' ? 'zip' : 'github',
    source: options.url || options.filename || '',
    sourceLabel:
      options.kind === 'zip'
        ? `ZIP · ${options.filename || 'projeto.zip'}`
        : `GitHub · ${repo ? `${repo.owner}/${repo.repo}` : 'repositório'}`,
    name,
    rawName,
    description,
    url: options.url || '',
    filename: options.filename || '',
    repo: options.metadata || null,
    repoName: repo ? `${repo.owner}/${repo.repo}` : '',
    packagePath,
    stack: {
      framework: framework.label,
      frameworkId: framework.id,
      language,
      styling,
      packageManager,
    },
    stats: {
      files: files.length,
      sourceFiles: sourceFiles.length,
      codeLines,
      routes: routes.length,
      components: components.length,
      dependencies: dependencies.total,
    },
    routes,
    components,
    dependencies,
    scripts,
    features,
    unsupportedImports,
    blockers,
    compatibility: {
      canCreate,
      reason: canCreate
        ? 'Projeto compatível com o template React + Vite.'
        : blockers.join(' '),
    },
    analyzedAt: new Date().toISOString(),
  };
}

export function inspectableEntry(name) {
  const value = normalizeName(name);
  return Boolean(value) && TEXT_EXT.test(value) && !BINARY_EXT.test(value) && !IGNORED_DIR.test(value);
}
