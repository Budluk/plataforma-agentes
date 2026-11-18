import test from 'node:test';
import assert from 'node:assert/strict';
import { initialInstruction } from '../server/generator.mjs';

test('initialInstruction inclui o prompt do projeto', () => {
  const text = initialInstruction({ prompt: 'Crie um CRM com funil kanban' });
  assert.match(text, /Crie um CRM com funil kanban/);
  assert.doesNotMatch(text, /undefined/);
});

test('initialInstruction usa a instrução explícita quando fornecida', () => {
  const text = initialInstruction(
    { prompt: 'prompt antigo' },
    '',
    'Recrie o acervo de doramas',
  );
  assert.match(text, /Recrie o acervo de doramas/);
  assert.doesNotMatch(text, /prompt antigo/);
});

test('initialInstruction injeta a referência baixada do site', () => {
  const text = initialInstruction({
    prompt: 'Recrie o acervo',
    reference: {
      kind: 'site',
      url: 'https://exemplo.com/acervo',
      title: 'Acervo de Doramas',
      description: 'Catálogo de doramas',
      colors: ['#0d0d0f', '#fff'],
      headings: ['Acervo completo', 'Mais populares'],
      links: [{ label: 'Acervo', href: 'https://exemplo.com/acervo' }],
      images: [{ src: 'https://exemplo.com/poster.jpg', alt: 'Pôster' }],
      text: 'Conteúdo extraído da página de exemplo',
    },
  });
  assert.match(text, /REFERÊNCIA BAIXADA DE https:\/\/exemplo\.com\/acervo/);
  assert.match(text, /Acervo de Doramas/);
  assert.match(text, /Conteúdo extraído da página de exemplo/);
  assert.match(text, /#0d0d0f/);
  assert.match(text, /IMAGENS REAIS ENCONTRADAS/);
  assert.match(text, /https:\/\/exemplo\.com\/poster\.jpg/);
  assert.match(text, /NAVEGAÇÃO E LINKS/);
  assert.match(text, /ESTRUTURA\/SEÇÕES/);
});

test('initialInstruction injeta vídeos reais e instruções de player', () => {
  const text = initialInstruction({
    prompt: 'Recrie o acervo',
    reference: {
      kind: 'site',
      url: 'https://exemplo.com/acervo',
      title: 'Acervo de Doramas',
      text: 'Conteúdo extraído',
      videos: [
        {
          provider: 'youtube',
          id: 'GDTz8sLK3_Q',
          url: 'https://www.youtube.com/watch?v=GDTz8sLK3_Q',
          embedUrl: 'https://www.youtube.com/embed/GDTz8sLK3_Q?rel=0',
          title: 'Classe dos Heróis Fracos',
          poster: 'https://i.ytimg.com/vi/GDTz8sLK3_Q/hqdefault.jpg',
          pageUrl: 'https://exemplo.com/drama/classe-dos-herois-fracos',
        },
        {
          provider: 'file',
          url: 'https://cdn.exemplo.com/filme.mp4',
          embedUrl: '',
          title: 'Filme Direto',
          poster: 'https://cdn.exemplo.com/capa.jpg',
        },
      ],
    },
  });
  assert.match(text, /VÍDEOS\/TRAILERS REAIS ENCONTRADOS/);
  assert.match(text, /https:\/\/www\.youtube\.com\/embed\/GDTz8sLK3_Q\?rel=0/);
  assert.match(text, /Classe dos Heróis Fracos/);
  assert.match(text, /https:\/\/cdn\.exemplo\.com\/filme\.mp4/);
  assert.match(text, /COMO TOCAR OS VÍDEOS/);
  assert.match(text, /iframe/);
  assert.match(text, /video controls/);
  assert.match(text, /allowFullScreen/);
});

test('referência sem vídeos não cria seção de player', () => {
  const text = initialInstruction({
    prompt: 'Recrie o acervo',
    reference: {
      kind: 'site',
      url: 'https://exemplo.com',
      title: 'Exemplo',
      text: 'Conteúdo',
    },
  });
  assert.doesNotMatch(text, /VÍDEOS\/TRAILERS REAIS/);
});

test('referência sem imagens proíbe serviços de placeholder mortos', () => {
  const text = initialInstruction({
    prompt: 'Recrie o acervo',
    reference: {
      kind: 'site',
      url: 'https://exemplo.com',
      title: 'Exemplo',
      text: 'Conteúdo',
    },
  });
  assert.match(text, /via\.placeholder\.com/);
  assert.match(text, /gradientes CSS/);
});

test('initialInstruction não inventa referência quando não existe', () => {
  const text = initialInstruction({ prompt: 'Crie um app de notas' });
  assert.doesNotMatch(text, /REFERÊNCIA BAIXADA/);
});

test('initialInstruction trata inspiração social com originalidade e sem mídia', () => {
  const text = initialInstruction({
    prompt: 'Crie um app original de treinos',
    reference: {
      kind: 'inspiration',
      platform: 'youtube',
      url: 'https://www.youtube.com/@treinoemcasa',
      title: 'Treino em Casa',
      text: 'Plataforma: YouTube\nPúblico estimado: médio (100 mil a 1 mi)',
      images: [{ src: 'https://www.youtube.com/avatar.jpg' }],
      videos: [{ url: 'https://www.youtube.com/watch?v=abc' }],
      links: [{ label: 'Site', href: 'https://exemplo.com' }],
    },
  });
  assert.match(text, /ANÁLISE DE INSPIRAÇÃO/);
  assert.match(text, /Público estimado: médio/);
  assert.match(text, /app ORIGINAL/);
  assert.match(text, /Não copie/);
  assert.match(text, /NÃO invente alcance real/);
  assert.doesNotMatch(text, /IMAGENS REAIS ENCONTRADAS/);
  assert.doesNotMatch(text, /VÍDEOS\/TRAILERS REAIS/);
  assert.doesNotMatch(text, /youtube\.com\/avatar\.jpg/);
  assert.doesNotMatch(text, /youtube\.com\/watch/);
});
