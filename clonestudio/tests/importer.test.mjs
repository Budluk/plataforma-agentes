import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  assertPublicHttpUrl,
  describeSiteFetchFailure,
  extractImagesFromHtml,
  extractLinksFromHtml,
  extractPage,
  findEscapingImports,
  isTransientSiteStatus,
  parseGithubUrl,
  pickProjectFiles,
  resolveUrl,
  shortSitePrompt,
  shouldRetrySiteFetch,
  unzipEntries,
} from '../server/importer.mjs';

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.content, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = typeof zlib.crc32 === 'function' ? zlib.crc32(data) : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('assertPublicHttpUrl aceita sites públicos', () => {
  assert.equal(assertPublicHttpUrl('https://example.com/pagina').hostname, 'example.com');
});

test('assertPublicHttpUrl bloqueia destinos locais e privados', () => {
  for (const url of [
    'http://localhost:8787/',
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://172.20.1.1/',
    'http://192.168.0.1/',
    'http://169.254.1.1/',
    'http://[::1]/',
    'http://intranet.local/',
    'file:///c:/segredo.txt',
    'https://user:senha@example.com/',
  ]) {
    assert.throws(() => assertPublicHttpUrl(url), /inválido|locais|http|permitid/i, url);
  }
});

test('parseGithubUrl extrai repositório e branch', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/facebook/react'), {
    owner: 'facebook',
    repo: 'react',
    branch: '',
    url: 'https://github.com/facebook/react',
  });
  assert.equal(
    parseGithubUrl('https://github.com/facebook/react/tree/main/packages').branch,
    'main/packages',
  );
  assert.equal(parseGithubUrl('https://gitlab.com/a/b'), null);
  assert.equal(parseGithubUrl('https://github.com/apenas-um'), null);
});

test('unzipEntries lê ZIP deflate e respeita o filtro', () => {
  const zip = makeZip([
    { name: 'app/src/App.tsx', content: 'export default function App(){return null}' },
    { name: 'app/node_modules/x/index.js', content: 'lixo' },
  ]);
  const entries = unzipEntries(zip, { allow: (name) => !name.includes('node_modules') });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'app/src/App.tsx');
});

test('unzipEntries rejeita buffer inválido', () => {
  assert.throws(() => unzipEntries(Buffer.from('não é um zip')), /inválido|corrompido/i);
});

test('pickProjectFiles remove pasta raiz e renomeia .jsx para .tsx', () => {
  const zip = makeZip([
    { name: 'meu-app/src/App.tsx', content: 'export default function App(){return null}' },
    { name: 'meu-app/src/components/Card.jsx', content: 'export default function Card(){return null}' },
    { name: 'meu-app/src/main.tsx', content: 'import App from "./App"' },
    { name: 'meu-app/src/index.css', content: 'body{margin:0}' },
    { name: 'meu-app/node_modules/lixo/index.js', content: 'lixo' },
  ]);
  const files = pickProjectFiles(unzipEntries(zip));
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, ['src/App.tsx', 'src/components/Card.tsx', 'src/index.css']);
});

test('pickProjectFiles copia imagens e fontes como base64', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const zip = makeZip([
    { name: 'meu-app/src/App.tsx', content: 'import logo from "./logo.svg";\nexport default function App(){return <img src={logo} />}' },
    { name: 'meu-app/src/logo.svg', content: svg },
    { name: 'meu-app/src/assets/fundo.svg', content: svg },
    { name: 'meu-app/node_modules/x/logo.svg', content: svg },
  ]);
  const files = pickProjectFiles(unzipEntries(zip));
  const asset = files.find((file) => file.path === 'src/logo.svg');
  assert.ok(asset);
  assert.equal(asset.encoding, 'base64');
  assert.equal(Buffer.from(asset.content, 'base64').toString('utf8'), svg);
  assert.ok(files.some((file) => file.path === 'src/assets/fundo.svg'));
  assert.ok(!files.some((file) => file.path.includes('node_modules')));
});

test('pickProjectFiles rejeita projeto sem App React', () => {
  const zip = makeZip([
    { name: 'next-app/app/page.tsx', content: 'export default function Page(){return null}' },
    { name: 'next-app/package.json', content: '{"name":"x"}' },
  ]);
  assert.throws(() => pickProjectFiles(unzipEntries(zip)), /React\/Vite|App\.tsx/i);
});

test('extractPage lê título, cores e texto sem scripts', () => {
  const html = `<!doctype html><html><head><title>Meu &amp; App</title>
    <meta name="description" content="Uma descrição">
    <style>:root{--brand:#ff0055}</style></head>
    <body><h1>Olá mundo</h1><h2>Recursos</h2>
    <script>var segredo = 1</script><p>Texto visível</p></body></html>`;
  const page = extractPage(html, 'https://exemplo.com');
  assert.equal(page.title, 'Meu & App');
  assert.equal(page.description, 'Uma descrição');
  assert.ok(page.colors.includes('#ff0055'));
  assert.ok(page.headings.includes('Olá mundo'));
  assert.match(page.text, /Texto visível/);
  assert.doesNotMatch(page.text, /segredo/);
  assert.equal(page.kind, 'site');
});

test('shortSitePrompt usa a instrução do usuário ou um fallback', () => {
  const reference = { url: 'https://exemplo.com', title: 'Exemplo' };
  assert.equal(shortSitePrompt(reference, '  Crie um painel  '), 'Crie um painel');
  assert.match(shortSitePrompt(reference, ''), /inspirado em Exemplo/);
});

test('resolveUrl transforma caminhos relativos em absolutos', () => {
  assert.equal(
    resolveUrl('/poster.jpg', 'https://site.com/acervo?x=1'),
    'https://site.com/poster.jpg',
  );
  assert.equal(
    resolveUrl('img/a.png', 'https://site.com/acervo/'),
    'https://site.com/acervo/img/a.png',
  );
  assert.equal(resolveUrl('data:image/png;base64,xx', 'https://site.com'), '');
  assert.equal(resolveUrl('javascript:alert(1)', 'https://site.com'), '');
});

test('extractImagesFromHtml pega og:image, src, data-src e srcset', () => {
  const html = `<html><head><meta property="og:image" content="/capa.jpg"></head><body>
    <img src="poster-1.jpg" alt="Primeiro">
    <img data-src="/poster-2.webp" alt="Segundo">
    <img srcset="small.jpg 480w, large.jpg 1024w" alt="Terceiro">
    <img src="/icone.svg" alt="Ícone">
    <img src="data:image/png;base64,abc" alt="Data">
    <img src="poster-1.jpg" alt="Duplicado">
  </body></html>`;
  const images = extractImagesFromHtml(html, 'https://site.com/acervo/');
  assert.deepEqual(
    images.map((image) => image.src),
    [
      'https://site.com/capa.jpg',
      'https://site.com/acervo/poster-1.jpg',
      'https://site.com/poster-2.webp',
      'https://site.com/acervo/large.jpg',
    ],
  );
  assert.equal(images[1].alt, 'Primeiro');
});

test('extractLinksFromHtml devolve rótulo e URL absoluta', () => {
  const html = `<nav>
    <a href="/acervo">Acervo</a>
    <a href="https://externo.com/top">Top 100</a>
    <a href="/acervo">Acervo</a>
  </nav>`;
  const links = extractLinksFromHtml(html, 'https://site.com/');
  assert.deepEqual(links, [
    { label: 'Acervo', href: 'https://site.com/acervo' },
    { label: 'Top 100', href: 'https://externo.com/top' },
  ]);
});

test('extractPage inclui imagens e links da página', () => {
  const html = `<html><head><title>Acervo</title></head><body>
    <a href="/sobre">Sobre</a>
    <img src="/poster.jpg" alt="Pôster">
    <p>Texto</p></body></html>`;
  const page = extractPage(html, 'https://site.com/acervo');
  assert.equal(page.images[0].src, 'https://site.com/poster.jpg');
  assert.equal(page.links[0].href, 'https://site.com/sobre');
  assert.equal(page.rendered, false);
});

test('extractPage inclui vídeos de og:video e trailerUrl', () => {
  const html = `<html><head>
    <meta property="og:video" content="https://cdn.site.com/filme.mp4">
    <meta property="og:title" content="Filme Exemplo">
    </head><body>
    <script>{"trailerUrl":"https://www.youtube.com/watch?v=GDTz8sLK3_Q"}</script>
    </body></html>`;
  const page = extractPage(html, 'https://site.com/filme');
  const providers = page.videos.map((video) => video.provider).sort();
  assert.deepEqual(providers, ['file', 'youtube']);
  assert.ok(page.videos.some((video) => video.embedUrl === 'https://www.youtube.com/embed/GDTz8sLK3_Q?rel=0'));
});

test('unzipEntries limita a quantidade de arquivos', () => {
  const zip = makeZip([
    { name: 'app/src/App.tsx', content: 'export default function App(){return null}' },
    { name: 'app/src/a.tsx', content: 'export const a = 1' },
    { name: 'app/src/b.tsx', content: 'export const b = 1' },
  ]);
  assert.throws(() => unzipEntries(zip, { maxEntries: 2 }), /arquivos demais/i);
});

test('unzipEntries rejeita ZIP cujo conteúdo descompactado estoura o limite', () => {
  const zip = makeZip([
    { name: 'app/src/App.tsx', content: 'x'.repeat(4096) },
  ]);
  assert.throws(() => unzipEntries(zip, { maxBytes: 1024 }), /grande demais/i);
});

test('unzipEntries bloqueia bomba de descompressão declarada', () => {
  // 4 MB de zeros compactam para poucos KB, mas o cabeçalho declara 4 MB.
  const zip = makeZip([
    { name: 'app/src/App.tsx', content: '0'.repeat(4 * 1024 * 1024) },
  ]);
  assert.ok(zip.length < 100_000, 'o ZIP de teste precisa ser pequeno');
  assert.throws(() => unzipEntries(zip, { maxBytes: 200_000 }), /grande demais/i);
});

test('findEscapingImports aponta imports relativos que saem de src/', () => {
  const offenders = findEscapingImports([
    {
      path: 'src/App.tsx',
      content: 'import dados from "../../data/projects.json?raw";\nexport default function App(){return null}',
    },
    {
      path: 'src/components/Card.tsx',
      content: 'import { helper } from "../../server/helper";\nexport default function Card(){return null}',
    },
  ]);
  assert.equal(offenders.length, 2);
  assert.match(offenders[0], /data\/projects\.json/);
});

test('findEscapingImports aceita imports relativos dentro de src/', () => {
  const offenders = findEscapingImports([
    {
      path: 'src/App.tsx',
      content: 'import Card from "./components/Card";\nimport css from "./index.css";\nexport default function App(){return null}',
    },
    {
      path: 'src/components/Card.tsx',
      content: 'import texto from "../texto.txt?raw";\nexport default function Card(){return null}',
    },
  ]);
  assert.deepEqual(offenders, []);
});

test('pickProjectFiles bloqueia import que escapa de src/', () => {
  const zip = makeZip([
    {
      name: 'app/src/App.tsx',
      content: 'import dados from "../../data/projects.json?raw";\nexport default function App(){return null}',
    },
  ]);
  assert.throws(() => pickProjectFiles(unzipEntries(zip)), /fora de src|não é permitido/i);
});

test('pickProjectFiles aceita imports internos de src/', () => {
  const zip = makeZip([
    {
      name: 'app/src/App.tsx',
      content: 'import Card from "./components/Card";\nexport default function App(){return <Card />}',
    },
    { name: 'app/src/components/Card.tsx', content: 'export default function Card(){return null}' },
  ]);
  const files = pickProjectFiles(unzipEntries(zip));
  assert.ok(files.some((file) => file.path === 'src/components/Card.tsx'));
});

test('isTransientSiteStatus reconhece erros temporários', () => {
  for (const status of [408, 425, 429, 500, 503, 599]) {
    assert.equal(isTransientSiteStatus(status), true, `HTTP ${status} deve ser temporário`);
  }
  for (const status of [0, 200, 301, 400, 403, 404, 410, 422]) {
    assert.equal(isTransientSiteStatus(status), false, `HTTP ${status} não é temporário`);
  }
});

test('shouldRetrySiteFetch só repete falhas sem conteúdo e com indício temporário', () => {
  assert.equal(shouldRetrySiteFetch({ status: 429 }), true);
  assert.equal(shouldRetrySiteFetch({ status: 503 }), true);
  assert.equal(shouldRetrySiteFetch({ elapsedMs: 3000 }), true);
  assert.equal(shouldRetrySiteFetch({ elapsedMs: 20000 }), false);
  assert.equal(shouldRetrySiteFetch({ timedOut: true }), false);
  assert.equal(shouldRetrySiteFetch({ status: 404, elapsedMs: 3000 }), false);
  assert.equal(shouldRetrySiteFetch({ status: 403, elapsedMs: 3000 }), false);
  assert.equal(shouldRetrySiteFetch({ status: 500, rendered: { title: 'app' } }), false);
  assert.equal(shouldRetrySiteFetch({ staticReference: { title: 'app' } }), false);
});

test('describeSiteFetchFailure orienta o usuário conforme a falha', () => {
  assert.match(describeSiteFetchFailure({ timedOut: true }), /demorou mais de \d+s.*Tente novamente/);
  assert.match(describeSiteFetchFailure({ status: 403 }), /bloqueou a leitura automática/);
  assert.match(describeSiteFetchFailure({ status: 404 }), /página não foi encontrada/);
  assert.match(describeSiteFetchFailure({ status: 429 }), /HTTP 429.*Aguarde alguns segundos/);
  assert.match(describeSiteFetchFailure({ status: 503 }), /erro temporário \(HTTP 503\)/);
  assert.match(describeSiteFetchFailure(), /Não foi possível ler a página do site/);
});
