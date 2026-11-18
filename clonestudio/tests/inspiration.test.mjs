import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeInspiration,
  buildInspirationReference,
  collectHashtags,
  detectPlatform,
  detectThemes,
  fetchInspiration,
  formatNumber,
  inspirationPrompt,
  inspirationReportText,
  isInspirationUrl,
  parseCount,
  parseFacebookPage,
  parseInstagramPage,
  parseTiktokPage,
  parseYoutubePage,
} from '../server/inspiration.mjs';
import {
  forgetInspiration,
  inspirationProjectName,
  readInspiration,
  rememberInspiration,
} from '../server/inspiration-import.mjs';

function mockResponse(text, { status = 200, contentType = 'text/html' } = {}) {
  const buffer = Buffer.from(text, 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === 'content-type') return contentType;
        if (key === 'content-length') return String(buffer.length);
        return null;
      },
    },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: new Uint8Array(buffer) };
          },
          async cancel() {},
        };
      },
    },
  };
}

const YOUTUBE_HTML = `<!doctype html><html><head>
<title>Treino em Casa - YouTube</title>
<meta name="description" content="descrição genérica" />
</head><body>
<script>var ytInitialData = {
  "channelMetadataRenderer":{"title":"Treino em Casa","description":"Treinos rápidos e saúde para quem tem pouco tempo #fitness #treino","externalId":"UC123","ownerUrls":["http://www.youtube.com/@treinoemcasa"],"avatar":{"thumbnails":[{"url":"https://yt3.googleusercontent.com/avatar-treino.jpg","width":900}]}},
  "channels":[{"subtitle":{"content":"@outrocanal⁩ • ⁨36,7 mil de inscritos⁩"}},{"subtitle":{"content":"@treinoemcasa⁩ • ⁨123 mil de inscritos⁩"}}],
  "subscriberCountText":{"simpleText":"36,7 mil inscritos"},
  "viewCountText":{"runs":[{"text":"585"},{"text":" assistindo"}]}
};</script>
</body></html>`;

const TIKTOK_HTML = `<!doctype html><html><head><title>TikTok</title></head><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
{"suggested":[{"uniqueId":"outro","nickname":"Outro Perfil","followerCount":999}],
"user":{"uniqueId":"rotinadabia","nickname":"Rotina da Bia","signature":"Rotina, organização e lifestyle #vlog #rotina",
"followerCount":52300,"followingCount":120,"heartCount":980000,"videoCount":87}}
</script></body></html>`;

const INSTAGRAM_HTML = `<!doctype html><html><head>
<title>Beleza Natural (@belezanatural) • Instagram photos and videos</title>
<meta name="description" content="1.234 seguidores, 56 seguindo, 78 posts - Beleza Natural (@belezanatural) no Instagram: dicas de skincare e maquiagem" />
</head><body></body></html>`;

const FACEBOOK_HTML = `<!doctype html><html><head>
<title>Receitas da Vó | Facebook</title>
<meta name="description" content="12 mil seguidores, 10 mil curtidas. Receitas fáceis e culinária caseira." />
</head><body></body></html>`;

test('detectPlatform reconhece as quatro plataformas e rejeita o resto', () => {
  assert.equal(detectPlatform('https://www.youtube.com/@canal'), 'youtube');
  assert.equal(detectPlatform('https://youtu.be/abc123'), 'youtube');
  assert.equal(detectPlatform('https://www.tiktok.com/@perfil'), 'tiktok');
  assert.equal(detectPlatform('https://www.instagram.com/perfil/'), 'instagram');
  assert.equal(detectPlatform('https://www.facebook.com/pagina'), 'facebook');
  assert.equal(detectPlatform('https://fb.com/pagina'), 'facebook');
  assert.equal(detectPlatform('https://exemplo.com/canal'), null);
  assert.equal(detectPlatform('ftp://youtube.com/canal'), null);
  assert.equal(detectPlatform('nao e url'), null);
  assert.equal(isInspirationUrl('https://www.tiktok.com/@perfil'), true);
  assert.equal(isInspirationUrl('https://github.com/usuario/repo'), false);
});

test('parseCount entende sufixos, milhares e decimais', () => {
  assert.equal(parseCount('123 mil inscritos'), 123000);
  assert.equal(parseCount('1,5 mi'), 1500000);
  assert.equal(parseCount('4.567.890 visualizações'), 4567890);
  assert.equal(parseCount('12,5 mil'), 12500);
  assert.equal(parseCount('15,8 mi de inscritos'), 15800000);
  assert.equal(parseCount('15,8 milhões de inscritos'), 15800000);
  assert.equal(parseCount('980'), 980);
  assert.equal(parseCount(52300), 52300);
  assert.equal(parseCount(''), null);
  assert.equal(parseCount('sem números'), null);
  assert.equal(formatNumber(1234567), '1.234.567');
  assert.equal(formatNumber(null), 'não informado');
});

test('parseYoutubePage extrai inscritos do próprio canal sem confundir canais relacionados', () => {
  const report = parseYoutubePage(YOUTUBE_HTML, 'https://www.youtube.com/@treinoemcasa');
  assert.equal(report.platform, 'youtube');
  assert.equal(report.title, 'Treino em Casa');
  assert.equal(report.handle, '@treinoemcasa');
  assert.equal(report.metrics.followers, 123000);
  assert.equal(report.metrics.totalViews, null);
  assert.equal(report.metrics.posts, null);
  assert.equal(report.metrics.totalLikes, null);
  assert.equal(report.avatar, 'https://yt3.googleusercontent.com/avatar-treino.jpg');
  assert.deepEqual(report.hashtags, ['#fitness', '#treino']);
  assert.ok(report.limitations.some((item) => /total de visualizações/i.test(item)));
});

test('parseYoutubePage falha fechado quando o handle não aparece na página', () => {
  const html =
    '<html><head><title>Canal</title></head><body>{"channels":[{"subtitle":{"content":"@outro⁩ • ⁨36,7 mil de inscritos⁩"}}]}</body></html>';
  const report = parseYoutubePage(html, 'https://www.youtube.com/@canalx');
  assert.equal(report.metrics.followers, null);
  assert.ok(report.limitations.some((item) => /não expôs o número de inscritos/i.test(item)));
});

test('parseTiktokPage extrai seguidores, curtidas e bio', () => {
  const report = parseTiktokPage(TIKTOK_HTML, 'https://www.tiktok.com/@rotinadabia');
  assert.equal(report.platform, 'tiktok');
  assert.equal(report.title, 'Rotina da Bia');
  assert.equal(report.handle, '@rotinadabia');
  assert.equal(report.metrics.followers, 52300);
  assert.equal(report.metrics.following, 120);
  assert.equal(report.metrics.totalLikes, 980000);
  assert.equal(report.metrics.posts, 87);
  assert.match(report.description, /lifestyle/);
});

test('parseInstagramPage usa a descrição pública e avisa quando falta métrica', () => {
  const report = parseInstagramPage(INSTAGRAM_HTML, 'https://www.instagram.com/belezanatural/');
  assert.equal(report.platform, 'instagram');
  assert.equal(report.handle, '@belezanatural');
  assert.equal(report.metrics.followers, 1234);
  assert.equal(report.metrics.following, 56);
  assert.equal(report.metrics.posts, 78);
  assert.equal(report.limitations.length, 0);
});

test('parseInstagramPage falha fechado quando a página não expõe métricas', () => {
  const html = '<html><head><title>Instagram</title></head><body>Faça login</body></html>';
  const report = parseInstagramPage(html, 'https://www.instagram.com/privado/');
  assert.equal(report.metrics.followers, null);
  assert.ok(report.limitations.some((item) => /não expôs seguidores/i.test(item)));
});

test('parseFacebookPage extrai seguidores e curtidas públicas', () => {
  const report = parseFacebookPage(FACEBOOK_HTML, 'https://www.facebook.com/receitasdavo');
  assert.equal(report.platform, 'facebook');
  assert.equal(report.metrics.followers, 12000);
  assert.equal(report.metrics.totalLikes, 10000);
  assert.equal(report.limitations.length, 0);
});

test('collectHashtags e detectThemes classificam o conteúdo', () => {
  const tags = collectHashtags('Dicas #fitness #saude #fitness #123 #fff');
  assert.deepEqual(tags, ['#fitness', '#saude']);
  const themes = detectThemes('Treino, academia e saúde para hipertrofia');
  assert.ok(themes.includes('fitness e saúde'));
});

test('analyzeInspiration calcula público, alcance e engajamento', () => {
  const base = parseYoutubePage(YOUTUBE_HTML, 'https://www.youtube.com/@treinoemcasa');
  const report = analyzeInspiration(base);
  assert.equal(report.audience.size, 'médio');
  assert.match(report.audience.summary, /123\.000 seguidores/);
  assert.equal(report.reach.level, 'médio');
  assert.equal(report.metrics.engagementRate, null);
  assert.deepEqual(report.content.themes, ['fitness e saúde']);
  assert.ok(report.limitations.some((item) => /Alcance real, impressões/i.test(item)) === false);
});

test('analyzeInspiration adiciona limitação de alcance em Instagram/Facebook', () => {
  const base = parseInstagramPage(INSTAGRAM_HTML, 'https://www.instagram.com/belezanatural/');
  const report = analyzeInspiration(base);
  assert.ok(
    report.limitations.some((item) => /Alcance real, impressões e dados demográficos/i.test(item)),
  );
  assert.match(report.audience.summary, /seguidores/);
});

test('inspirationReportText não expõe undefined e a referência é original', () => {
  const report = analyzeInspiration(
    parseTiktokPage(TIKTOK_HTML, 'https://www.tiktok.com/@rotinadabia'),
  );
  const text = inspirationReportText(report);
  assert.doesNotMatch(text, /undefined/);
  assert.match(text, /Plataforma: TikTok/);
  assert.match(text, /Limitações:/);
  const reference = buildInspirationReference(report);
  assert.equal(reference.kind, 'inspiration');
  assert.deepEqual(reference.images, []);
  assert.deepEqual(reference.videos, []);
  const prompt = inspirationPrompt(report);
  assert.match(prompt, /app original/i);
  assert.match(prompt, /Não copie/);
  assert.doesNotMatch(prompt, /Rotina da Bia/);
});

test('fetchInspiration baixa HTML público e complementa com oEmbed', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/oembed')) {
      return mockResponse(
        JSON.stringify({ title: 'Canal de Treino', author_name: '@treinoemcasa' }),
        { contentType: 'application/json' },
      );
    }
    return mockResponse(YOUTUBE_HTML);
  };
  const report = await fetchInspiration('https://www.youtube.com/@treinoemcasa', { fetchImpl });
  assert.equal(report.platform, 'youtube');
  assert.equal(report.metrics.followers, 123000);
  assert.ok(calls.some((url) => url.includes('youtube.com/oembed')));
});

test('fetchInspiration rejeita links que não são de redes suportadas', async () => {
  await assert.rejects(
    fetchInspiration('https://exemplo.com/canal', { fetchImpl: async () => mockResponse('') }),
    /Link não reconhecido/,
  );
});

test('nome do projeto usa a ideia do usuário ou o tema, nunca a marca do canal', () => {
  const report = analyzeInspiration(
    parseTiktokPage(TIKTOK_HTML, 'https://www.tiktok.com/@rotinadabia'),
  );
  assert.equal(inspirationProjectName(report), 'App de lifestyle e rotina');
  assert.equal(
    inspirationProjectName(report, 'app de foco e estudo com timer'),
    'App de foco e estudo com timer',
  );
  assert.equal(inspirationProjectName(report, 'https://www.tiktok.com/@rotinadabia'),
    'App de lifestyle e rotina');
  assert.doesNotMatch(inspirationProjectName(report), /Rotina da Bia/);
});

test('cache de inspiração guarda por token e esquece depois de usar', () => {
  const report = analyzeInspiration(
    parseYoutubePage(YOUTUBE_HTML, 'https://www.youtube.com/@treinoemcasa'),
  );
  const token = rememberInspiration(report);
  assert.equal(typeof token, 'string');
  assert.ok(token.length >= 32);
  const cached = readInspiration(token);
  assert.equal(cached.platform, 'youtube');
  assert.equal(cached.metrics.followers, 123000);
  assert.equal(readInspiration('token-inexistente'), null);
  assert.equal(readInspiration(''), null);
  assert.equal(readInspiration(null), null);
  forgetInspiration(token);
  assert.equal(readInspiration(token), null);
  const outro = rememberInspiration(report);
  assert.notEqual(outro, token);
  forgetInspiration(outro);
});
