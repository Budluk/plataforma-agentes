import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanVideoTitle,
  extractVideosFromHtml,
  normalizeVideoList,
  parseVideoUrl,
} from '../server/video-core.mjs';

test('parseVideoUrl reconhece YouTube em watch, youtu.be, shorts e embed', () => {
  const watch = parseVideoUrl('https://www.youtube.com/watch?v=GDTz8sLK3_Q');
  assert.equal(watch.provider, 'youtube');
  assert.equal(watch.id, 'GDTz8sLK3_Q');
  assert.equal(watch.embedUrl, 'https://www.youtube.com/embed/GDTz8sLK3_Q?rel=0');
  assert.match(watch.poster, /i\.ytimg\.com/);

  assert.equal(parseVideoUrl('https://youtu.be/GDTz8sLK3_Q?t=30').id, 'GDTz8sLK3_Q');
  assert.equal(parseVideoUrl('https://www.youtube.com/shorts/GDTz8sLK3_Q').id, 'GDTz8sLK3_Q');
  assert.equal(parseVideoUrl('https://www.youtube.com/embed/GDTz8sLK3_Q').id, 'GDTz8sLK3_Q');
});

test('parseVideoUrl rejeita canais, anúncios e URLs vazias', () => {
  assert.equal(parseVideoUrl('https://www.youtube.com/@SuperDoramasoficial'), null);
  assert.equal(parseVideoUrl('https://googleads.g.doubleclick.net/pagead/ads?x=1'), null);
  assert.equal(parseVideoUrl('https://example.com/pagina'), null);
  assert.equal(parseVideoUrl(''), null);
});

test('parseVideoUrl reconhece Vimeo, Dailymotion e arquivos diretos', () => {
  const vimeo = parseVideoUrl('https://vimeo.com/123456789');
  assert.equal(vimeo.provider, 'vimeo');
  assert.equal(vimeo.embedUrl, 'https://player.vimeo.com/video/123456789');

  const daily = parseVideoUrl('https://www.dailymotion.com/video/x8abcd');
  assert.equal(daily.provider, 'dailymotion');
  assert.equal(daily.embedUrl, 'https://www.dailymotion.com/embed/video/x8abcd');

  assert.equal(parseVideoUrl('https://cdn.example.com/trailer.mp4').provider, 'file');
  assert.equal(parseVideoUrl('https://cdn.example.com/master.m3u8').provider, 'hls');
});

test('normalizeVideoList remove duplicatas e preserva título/poster', () => {
  const videos = normalizeVideoList([
    { url: 'https://www.youtube.com/watch?v=GDTz8sLK3_Q', title: 'Classe dos Heróis Fracos' },
    { url: 'https://youtu.be/GDTz8sLK3_Q', title: 'Duplicado' },
    { url: 'https://cdn.example.com/trailer.mp4', title: 'Direto', poster: 'https://cdn.example.com/capa.jpg' },
  ]);
  assert.equal(videos.length, 2);
  assert.equal(videos[0].title, 'Classe dos Heróis Fracos');
  assert.equal(videos[0].embedUrl, 'https://www.youtube.com/embed/GDTz8sLK3_Q?rel=0');
  assert.equal(videos[1].poster, 'https://cdn.example.com/capa.jpg');
});

test('extractVideosFromHtml encontra trailerUrl escapado de SPA', () => {
  const html = `<html><head>
    <meta property="og:title" content="Classe dos Heróis Fracos (2022): Onde Assistir o Dorama · Super Doramas">
    </head><body>
    <script>self.__next_f.push([1,"{\\"trailerUrl\\":\\"https://www.youtube.com/watch?v=GDTz8sLK3_Q\\"}"])</script>
    </body></html>`;
  const videos = extractVideosFromHtml(html, 'https://doramasonline.com.br/drama/classe-dos-herois-fracos-200709');
  assert.equal(videos.length, 1);
  assert.equal(videos[0].provider, 'youtube');
  assert.equal(videos[0].id, 'GDTz8sLK3_Q');
  assert.equal(videos[0].title, 'Classe dos Heróis Fracos');
});

test('extractVideosFromHtml pega video, source, iframe, og:video e JSON-LD', () => {
  const html = `<html><head>
    <meta property="og:video" content="https://cdn.example.com/filme.mp4">
    <meta property="og:title" content="Filme Exemplo">
    <script type="application/ld+json">{"@type":"VideoObject","name":"Trailer oficial","contentUrl":"https://cdn.example.com/trailer.webm","thumbnailUrl":"https://cdn.example.com/capa.jpg"}</script>
    </head><body>
    <video poster="https://cdn.example.com/poster.jpg"><source src="https://cdn.example.com/video.mp4" type="video/mp4"></video>
    <iframe src="https://www.youtube.com/embed/GDTz8sLK3_Q" title="Trailer"></iframe>
    <iframe src="https://googleads.g.doubleclick.net/pagead/ads?x=1"></iframe>
    </body></html>`;
  const videos = extractVideosFromHtml(html, 'https://exemplo.com/filme');
  const providers = videos.map((video) => video.provider).sort();
  assert.deepEqual(providers, ['file', 'file', 'file', 'youtube']);
  assert.ok(videos.some((video) => video.id === 'GDTz8sLK3_Q'));
  assert.ok(videos.some((video) => video.title === 'Trailer oficial'));
  assert.ok(videos.every((video) => video.url.includes('doubleclick') === false));
});

test('cleanVideoTitle remove sufixos de site e ano', () => {
  assert.equal(
    cleanVideoTitle('Classe dos Heróis Fracos (2022): Onde Assistir o Dorama · Super Doramas'),
    'Classe dos Heróis Fracos',
  );
  assert.equal(cleanVideoTitle('To LOVE-Ru (2008): Onde Assistir o Dorama'), 'To LOVE-Ru');
  assert.equal(cleanVideoTitle('Amor à Primavera'), 'Amor à Primavera');
});
