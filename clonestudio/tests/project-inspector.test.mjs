import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProjectEntries, inspectableEntry } from '../server/project-inspector.mjs';

function entry(name, content) {
  return { name, data: Buffer.from(content, 'utf8') };
}

function viteReactProject(extra = {}) {
  return [
    entry(
      'projeto/package.json',
      JSON.stringify({
        name: 'painel-vendas',
        description: 'Painel de vendas com gráficos',
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1',
          'react-router-dom': '^6.26.0',
          'lucide-react': '^0.441.0',
          recharts: '^2.12.7',
          ...(extra.dependencies || {}),
        },
        devDependencies: {
          vite: '^5.4.0',
          typescript: '^5.5.0',
          tailwindcss: '^3.4.0',
          ...(extra.devDependencies || {}),
        },
        scripts: { dev: 'vite', build: 'tsc && vite build' },
      }),
    ),
    entry('projeto/vite.config.ts', 'export default {};'),
    entry('projeto/tsconfig.json', '{"compilerOptions":{}}'),
    entry('projeto/tailwind.config.js', 'export default {};'),
    entry(
      'projeto/src/App.tsx',
      `import Dashboard from './pages/Dashboard';
export default function App() {
  return <Dashboard />;
}`,
    ),
    entry('projeto/src/pages/Dashboard.tsx', 'export default function Dashboard() { return <main />; }'),
    entry('projeto/src/components/StatCard.tsx', 'export default function StatCard() { return <div />; }'),
    entry('projeto/src/index.css', 'body { margin: 0; }'),
    entry('projeto/README.md', '# Painel de Vendas\n\nUm painel completo para acompanhar vendas.'),
  ];
}

test('analisa projeto Vite + React compatível com rotas e componentes', () => {
  const report = analyzeProjectEntries(viteReactProject(), {
    kind: 'github',
    url: 'https://github.com/lucas/painel-vendas',
    repo: { owner: 'lucas', repo: 'painel-vendas' },
    metadata: { description: 'Descrição do GitHub', stars: 42 },
  });

  assert.equal(report.kind, 'github');
  assert.equal(report.name, 'Painel vendas');
  assert.equal(report.stack.frameworkId, 'react-vite');
  assert.equal(report.stack.framework, 'React + Vite');
  assert.equal(report.stack.language, 'TypeScript');
  assert.equal(report.stack.styling, 'Tailwind CSS');
  assert.equal(report.stack.packageManager, '');
  assert.equal(report.compatibility.canCreate, true);
  assert.deepEqual(report.blockers, []);
  assert.ok(report.routes.includes('/Dashboard'));
  assert.ok(report.components.includes('StatCard'));
  assert.ok(report.stats.dependencies >= 6);
  assert.ok(report.scripts.some((script) => script.name === 'build'));

  const labels = report.features.map((feature) => feature.label);
  assert.ok(labels.includes('Interface React'));
  assert.ok(labels.includes('Build com Vite'));
  assert.ok(labels.includes('TypeScript'));
  assert.ok(labels.includes('Páginas e rotas'));
  assert.ok(labels.includes('Gráficos e dashboards'));
  assert.ok(labels.includes('Ícones'));
  assert.ok(labels.includes('Documentação'));
});

test('detecta Next.js e bloqueia a criação com relatório completo', () => {
  const report = analyzeProjectEntries([
    entry(
      'app/package.json',
      JSON.stringify({
        name: 'site-next',
        dependencies: { next: '14.2.0', react: '18.3.1', 'react-dom': '18.3.1' },
      }),
    ),
    entry('app/next.config.mjs', 'export default {};'),
    entry('app/src/App.tsx', 'export default function App() { return null; }'),
    entry('app/src/components/Hero.tsx', 'export default function Hero() { return null; }'),
  ]);

  assert.equal(report.stack.frameworkId, 'next');
  assert.equal(report.compatibility.canCreate, false);
  assert.match(report.compatibility.reason, /Next\.js/);
  assert.ok(report.blockers.length >= 1);
  // Mesmo incompatível, o relatório continua listando o que o projeto tem.
  assert.ok(report.features.length > 0);
  assert.ok(report.components.includes('Hero'));
});

test('bloqueia imports que o template não instala', () => {
  const report = analyzeProjectEntries([
    entry(
      'pkg/package.json',
      JSON.stringify({
        name: 'app',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      }),
    ),
    entry('pkg/src/App.tsx', "import { Button } from '@mui/material';\nexport default function App() { return <Button />; }"),
  ]);

  assert.equal(report.compatibility.canCreate, false);
  assert.equal(report.unsupportedImports[0].name, '@mui/material');
  assert.match(report.blockers.join(' '), /@mui\/material/);
});

test('analisa ZIP sem package.json usando App.tsx e o nome do arquivo', () => {
  const report = analyzeProjectEntries(
    [
      entry('src/App.tsx', 'export default function App() { return <h1>Oi</h1>; }'),
      entry('src/components/Card.tsx', 'export default function Card() { return <div />; }'),
    ],
    { kind: 'zip', filename: 'meu-app-react.zip' },
  );

  assert.equal(report.kind, 'zip');
  assert.equal(report.name, 'Meu app react');
  assert.equal(report.compatibility.canCreate, true);
  assert.equal(report.packagePath, '');
  assert.ok(report.components.includes('Card'));
});

test('ZIP vazio ou sem App.tsx não pode ser criado', () => {
  const report = analyzeProjectEntries([entry('README.md', '# Apenas documentação')], {
    kind: 'zip',
    filename: 'vazio.zip',
  });

  assert.equal(report.compatibility.canCreate, false);
  assert.match(report.blockers.join(' '), /App\.tsx/);
});

test('ignora imports de testes e configuração ao avaliar compatibilidade', () => {
  const report = analyzeProjectEntries([
    entry(
      'pkg/package.json',
      JSON.stringify({
        name: 'app-com-testes',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        devDependencies: { vitest: '^2.0.0', '@testing-library/react': '^16.0.0' },
      }),
    ),
    entry('pkg/src/App.tsx', 'export default function App() { return <h1>Oi</h1>; }'),
    entry('pkg/src/App.test.tsx', "import { render } from '@testing-library/react';\nrender(<div />);"),
    entry('pkg/src/setupTests.ts', "import '@testing-library/jest-dom';"),
    entry('pkg/vitest.config.ts', "import { defineConfig } from 'vitest/config';\nexport default defineConfig({});"),
  ]);

  assert.equal(report.compatibility.canCreate, true);
  assert.deepEqual(report.unsupportedImports, []);
  assert.ok(report.features.some((feature) => feature.label === 'Testes automatizados'));
});

test('lê package.json com BOM sem perder dependências', () => {
  const report = analyzeProjectEntries([
    entry(
      'pkg/package.json',
      `\uFEFF${JSON.stringify({
        name: 'app-bom',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', 'lucide-react': '^0.4.0' },
        devDependencies: { tailwindcss: '^3.4.0', vite: '^5.4.0' },
      })}`,
    ),
    entry('pkg/src/App.tsx', 'export default function App() { return <h1>Oi</h1>; }'),
  ]);

  assert.equal(report.stats.dependencies, 5);
  assert.equal(report.stack.styling, 'Tailwind CSS');
  assert.equal(report.compatibility.canCreate, true);
});

test('inspectableEntry ignora binários e dependências instaladas', () => {
  assert.equal(inspectableEntry('src/App.tsx'), true);
  assert.equal(inspectableEntry('package.json'), true);
  assert.equal(inspectableEntry('node_modules/react/index.js'), false);
  assert.equal(inspectableEntry('public/logo.png'), false);
  assert.equal(inspectableEntry('dist/assets/app.js'), false);
  assert.equal(inspectableEntry(''), false);
});
