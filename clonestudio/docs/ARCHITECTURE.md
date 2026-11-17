# Arquitetura do CloneStudio AI

## Visão geral

```text
Browser (HTML/CSS/JS puro)
   │ HTTP same-origin (:8787)
   ▼
CloneStudio API (Node.js, ESM, sem dependências de servidor)
   ├── Provider Router ── FreeLLMAPI / Ollama / LocalAI / llama.cpp
   ├── Context7 ───────── MCP → docs atuais + cache → prompt
   ├── Project Store ───── data/projects.json + data/projects/<id>/app
   ├── Generator ──────── prompt → JSON → validação → build Vite
   ├── Preview Validator ─ Playwright + Edge/Chrome → relatório + screenshot
   ├── Preview Server ─── dist em :8788/preview/<id>/ (origem isolada)
   ├── Skills Catalog ─── skills/manifest.json + SKILL.md
   └── Integrations ───── catálogo de ferramentas externas

Template fixo: React 19 + Vite 8 + TypeScript 5.9, sem Tailwind.
```

## Fluxo de criação

1. `POST /api/projects` grava o projeto e inicia um job em memória.
2. O job detecta bibliotecas no pedido e, se necessário, busca documentação atual no Context7 (`server/context7.mjs`).
3. O job chama o provedor com um system prompt rígido, o prompt do usuário e o bloco de documentação.
4. A resposta passa por `generation-core.mjs`:
   - extrai o primeiro objeto JSON válido;
   - escapa caracteres de controle dentro de strings;
   - normaliza `files` (array ou mapa);
   - rejeita caminhos fora de `src/`, extensões inválidas, `src/main.tsx`, arquivos grandes;
   - valida imports relativos e de pacotes permitidos.
5. Os arquivos são gravados; `src/main.tsx` é sempre o do template.
6. O Vite compila em `dist`. O log fica disponível na UI.
7. `previewVersion` incrementa e o projeto fica em `building` com a etapa “Validando preview no navegador”.
8. O `preview-validator.mjs` abre o preview em Edge/Chrome headless, coleta erros, tira um screenshot e grava o relatório. Só então o projeto vira `ready`.

Se o JSON/imports forem inválidos, há **uma** nova tentativa automática com a mensagem de erro como contexto. Se o build falhar, o usuário decide quando acionar “Corrigir build” — o log vira instrução.

## Validação do preview

A validação é executada automaticamente depois de cada build bem-sucedido e também por `POST /api/projects/:id/validate`. Ela usa `playwright-core` com o Microsoft Edge ou o Google Chrome já instalado (`launchServer` + `connect`), sem baixar Chromium por padrão.

O executor coleta:

- erros de console (`console.error`), ignorando ruído benigno como React DevTools e favicon;
- exceções não tratadas (`pageerror`);
- requisições com falha (`requestfailed`);
- respostas HTTP ≥ 400;
- imagens quebradas: `<img>` com `complete && naturalWidth === 0` (URL morta ou bloqueada), listadas com `src` e `alt`;
- detecção de página em branco (sem texto, sem elementos interativos e sem filhos em `#root`).

O relatório (`data/projects/<id>/validation/report.json`) contém status (`passed`, `issues`, `failed`, `unavailable`, `disabled`, `skipped`), contagens, entradas sanitizadas, métricas da página, navegador usado, duração e a instrução de correção gerada por `buildValidationInstruction`. O screenshot fica em `validation/screenshot.png`.

A ação “Corrigir com IA” (`POST /api/projects/:id/fix-validation`) envia essa instrução ao modelo, preserva os arquivos atuais e dispara um novo build + validação.

## Conhecimento via Context7

`server/context7.mjs` fala MCP Streamable HTTP com `https://mcp.context7.com/mcp` (JSON puro ou SSE). A integração funciona sem chave; `CONTEXT7_API_KEY` é opcional.

Antes de chamar o modelo, o gerador detecta menções a bibliotecas compatíveis com o template:

| Biblioteca | Quando busca | ID Context7 |
| --- | --- | --- |
| Recharts | gráficos, charts, dashboards | `/recharts/recharts` |
| Framer Motion | animações, transições, `framer-motion` | `/grx7/framer-motion` |
| Lucide | ícones, `lucide-react` | `/lucide-icons/lucide` |
| clsx | `clsx`, classes condicionais | `/lukeed/clsx` |

Para cada biblioteca, chama a ferramenta `query-docs` e injeta até `CONTEXT7_MAX_CHARS` caracteres no prompt, com aviso para adaptar ao template React 19 + CSS puro. Resultados ficam em cache em memória por `CONTEXT7_CACHE_TTL_MS` (30 min por padrão). Se o Context7 falhar, a geração continua sem docs e registra o motivo em `project.knowledge`.

A UI mostra o selo “Context7” quando houve injeção. `GET /api/context7/status` testa a conexão real; `POST /api/context7/resolve` e `POST /api/context7/docs` expõem as ferramentas MCP para diagnóstico. O conteúdo retornado é tratado como referência não confiável: o system prompt, a lista de imports permitidos e o validador continuam controlando o que entra no projeto.

## Importação por arrasto

`server/importer.mjs` recebe o que o usuário solta no quadro de perguntas. Sites e cópias de app criam um projeto novo na hora; GitHub e `.zip` são analisados primeiro e só criam depois da confirmação:

| Origem | O que acontece |
| --- | --- |
| Link de site | Abre a página em Edge/Chrome headless (`server/site-renderer.mjs`) e extrai o DOM já renderizado: título (`og:title`), descrição, headings, navegação, imagens reais (com `alt`), cores de fundo/texto, fontes, texto e vídeos/trailers. Se não houver navegador, cai no HTML estático (limite de 3 MB, timeout `IMPORT_SITE_TIMEOUT_MS`). A geração recebe essa referência e é instruída a usar as imagens reais, reproduzir a estrutura e não inventar dados. |
| Card de app | Copia os arquivos de `src/` do projeto de origem (sem LLM) e recompila. Só aceita origem `ready`. |
| Link do GitHub | Baixa o `.zip` do repositório via `codeload.github.com`, analisa o conteúdo e só cria o projeto depois que o usuário confirma no painel. |
| Arquivo `.zip` | Descompacta em memória (métodos store/deflate; ZIP64 é rejeitado), analisa o conteúdo e só cria depois da confirmação. |

### Análise antes de criar

GitHub e `.zip` passam por `POST /api/inspect` antes de qualquer projeto existir. `server/project-inspector.mjs` é uma função pura (`analyzeProjectEntries`) que recebe as entradas já descompactadas e devolve:

- **stack**: framework (`react-vite`, `next`, `vue`, …), linguagem, estilos e package manager;
- **rotas** detectadas em `pages/`, `routes/`, `screens/` e `app/` (incluindo `[param]` e `[...catch]`);
- **componentes** em pastas `components/`;
- **dependências** de runtime e dev (até 40) e scripts do `package.json`;
- **funcionalidades** inferidas por dependências e arquivos (rotas, formulários, estado global, gráficos, autenticação, banco, pagamentos, testes, CI/CD, Docker, PWA, mapas, 3D, i18n, etc.);
- **compatibilidade**: `canCreate` só é `true` se o framework for React (de preferência Vite), existir `src/App.tsx`/`App.tsx` e nenhum import de runtime estiver fora de `ALLOWED_PACKAGES` (`react`, `react-dom`, `lucide-react`, `framer-motion`, `recharts`, `clsx`). Caso contrário, `blockers` lista todos os motivos.

O download/descompactação acontece uma única vez. As entradas ficam em um cache em memória com token (`IMPORT_INSPECTION_TTL_MS`, 15 min; `IMPORT_INSPECTION_CACHE`, 8 análises; `IMPORT_INSPECTION_MAX_ENTRIES`, 6000 arquivos). A resposta inclui `token`, e `POST /api/import` com `inspectionToken` reutiliza essas entradas para criar o projeto sem baixar de novo.

No frontend, a UI guarda `state.inspection` e renderiza um card com stack, estatísticas, funcionalidades, dependências, rotas e o status de compatibilidade. O botão “Criar site do GitHub”/“Criar site do ZIP” só aparece quando `compatibility.canCreate` é verdadeiro; quando não é, o relatório completo é exibido e nenhum projeto é criado. Colar um link do GitHub no compositor também abre a análise em vez de gerar na hora.

Metadados do repositório (descrição, estrelas, licença, linguagem, tópicos) vêm da API pública do GitHub com timeout de 5 s. `GITHUB_TOKEN` é opcional e só aumenta o limite de requisições; se a API falhar, a análise continua a partir do ZIP.

Regras de segurança e compatibilidade:

- apenas `http://` e `https://`; URLs locais/privadas (`localhost`, `127/10/172.16-31/192.168/169.254`, `.local`, IPv6 privado) são bloqueadas, inclusive depois de redirects;
- limites de download (`IMPORT_MAX_BYTES`) e de código gravado (`IMPORT_MAX_SOURCE_BYTES`);
- `.zip` aceita somente os métodos `store`/`deflate` e **rejeita ZIP64 de propósito** (marcadores `0xFFFFFFFF` em tamanhos ou offset do diretório central) com a mensagem “ZIP64 não é suportado. Compacte em um .zip comum.”. O limite de 20 MB é checado antes de descompactar, e cada entrada também tem limite de tamanho descompactado para barrar zip bombs;
- somente projetos Vite/React com `src/App.tsx` (ou `App.tsx` na raiz); `.js/.jsx` viram `.tsx`, `main.tsx` e `index.css` do template são garantidos;
- imagens, fontes, áudio e vídeo dentro de `src/` (ou na raiz do app) são copiados como base64 para o build resolver imports como `./logo.svg` e `./assets/fundo.webp` (limite `IMPORT_MAX_ASSET_BYTES`, 8 MB);
- o import roda em memória (`isImporting`) e atualiza o projeto para `building` → `ready`/`error`, com mensagem no chat ao terminar.

No frontend, o compositor aceita `dragover`/`drop` de `text/uri-list`, `Files` e do tipo interno `application/x-clonestudio-project` (usado pelos cards). Soltar fora do quadro é bloqueado para o navegador não abrir o arquivo/link.

### Vídeos e trailers

`server/video-core.mjs` centraliza o parsing e a normalização:

- `parseVideoUrl` reconhece YouTube (`watch`, `shorts`, `live`, `youtu.be`, `embed`), Vimeo, Dailymotion e arquivos diretos (`.mp4/.webm/.mov`) ou streams (`.m3u8/.mpd`); rejeita canais, anúncios (`doubleclick`, `googlesyndication`, `googleads`) e páginas comuns.
- `normalizeVideoList` deduplica por `provider:id` (ou URL) e preserva título, poster e `pageUrl`.
- `extractVideosFromHtml` lê `og:video`, `<video>/<source>`, iframes, âncoras, JSON-LD e URLs soltas em scripts — inclusive `\"trailerUrl\":\"https://www.youtube.com/watch?v=...\"` do payload RSC/Next.js.

No renderer, `collectVideosInPage` lê o DOM depois da hidratação, clica em “Trailer”/“Assistir” quando nenhum vídeo apareceu e, em páginas de listagem, `enrichVideosFromDetailPages` busca até 8 fichas de cards (timeout de 6 s por ficha, 4 em paralelo) para casar cada título com seu trailer. O resultado vai para `reference.videos`.

O gerador lista os vídeos reais e exige um player funcional: modal com `<iframe src={embedUrl} allowFullScreen referrerPolicy="strict-origin-when-cross-origin">` para YouTube/Vimeo, ou `<video controls poster={poster}>` para arquivo direto. O iframe/vídeo é desmontado ao fechar o modal, e itens sem vídeo não mostram botão de trailer. O preview libera `frame-src` para `https:`/`http:`/`blob:` e usa `referrer-policy: strict-origin-when-cross-origin`, necessário para o embed do YouTube.

## Fluxo de iteração

`POST /api/projects/:id/messages` adiciona a mensagem do usuário e inicia outro job. O prompt inclui:

- as últimas mensagens da conversa (sem mensagens de erro de UI);
- o dump completo dos arquivos atuais (até ~70 mil caracteres);
- a instrução nova.

O modelo devolve o conjunto completo de arquivos. Não há aplicação de diff, o que simplifica a validação e evita estados parciais.

## Armazenamento

```text
data/projects.json
[
  {
    "id": "uuid",
    "name": "…",
    "prompt": "…",
    "status": "generating|building|ready|error",
    "stage": "Consultando o modelo",
    "messages": [{ "role": "user", "kind": "chat", "content": "…" }],
    "buildLog": "…",
    "previewVersion": 2,
    "provider": "freellmapi",
    "model": "nvidia/…",
    "knowledge": {
      "provider": "context7",
      "status": "used|skipped|error|disabled",
      "libraries": [{ "name": "Recharts", "id": "/recharts/recharts", "chars": 3574 }],
      "chars": 5947,
      "reason": null,
      "fetchedAt": "…"
    },
    "validation": {
      "status": "passed|issues|failed|unavailable|disabled|skipped|running",
      "checkedAt": "…",
      "counts": { "console": 0, "page": 0, "requests": 0, "http": 0, "total": 0 },
      "screenshot": true
    }
  }
]
```

Os arquivos ficam em `data/projects/<id>/app/`. `node_modules` é uma **junction** para `templates/base/node_modules`, porque todas as apps usam o mesmo conjunto fixo de dependências. Isso evita reinstalar dependências por projeto.

As gravações de `projects.json` são agrupadas com debounce de `PERSIST_DELAY_MS` (150 ms). `createProject`, `deleteProject`, `addMessage` e o encerramento do servidor gravam imediatamente (`flushPersistence`), então uma queda no meio de um build perde no máximo a última etapa intermediária.

## Desempenho e cache

- **Cache de `src/`:** `storage.mjs` guarda por projeto os caminhos, `mtimeMs` e tamanho dos arquivos. A varredura é reaproveitada por `SOURCE_SCAN_TTL_MS` (5 s) e o conteúdo só é relido quando `mtime`/tamanho mudam. `writeGeneratedFiles`, importação e exclusão invalidam o cache.
- **Contagem barata:** `projectSummary` usa a contagem do último snapshot, sem nova varredura a cada card; qualquer leitura de arquivos atualiza os caminhos.
- **Polling leve:** `GET /api/projects/:id?files=0` devolve o projeto sem `files`. O painel usa essa rota a cada 1,6 s durante `generating`/`building` e busca o detalhe completo uma única vez quando o status muda para `ready`/`error`.
- **HTTP condicional:** `server/http-cache.mjs` gera `ETag` fraco a partir de tamanho + `mtime` e trata `If-None-Match` com `304`. Estáticos do painel usam `no-cache` (revalidam sempre) e o preview usa `no-cache` para HTML; arquivos em `assets/` (hash do Vite) usam `public, max-age=31536000, immutable`.
- **Rebuild imediato:** `requestRebuild` marca o projeto como `building` antes de responder, para o painel iniciar o polling sem esperar o próximo ciclo.

Para comparar, use `curl.exe -H "If-None-Match: <etag>" -i http://127.0.0.1:8787/app.js` (espera `304`) e meça `GET /api/projects/:id?files=0` durante um rebuild.

## Abas e janelas

As abas são resolvidas no cliente, sem rota nova no backend. `public/app.js` guarda em `localStorage` a lista `clonestudio.openProjects` e o estado de cada aba em `clonestudio.workspaceStates` (aba interna, desktop/mobile, arquivo selecionado e rascunho do chat). Ao alternar de projeto, o estado atual é salvo e o da aba de destino é restaurado.

O status das abas vem do resumo de `/api/projects`. Se uma aba em segundo plano estiver em `generating`/`building`, o painel atualiza apenas a barra de abas a cada 4 s, sem re-renderizar o preview da aba ativa. O botão de janela abre a mesma SPA em um pop-up com `?window=1`; a rota é detectada pelo hash ou pelo nome `clonestudio-<id>` da janela, que também troca o botão “voltar” por “fechar janela”.

## Preview isolado

O preview é servido por um segundo servidor HTTP em `PREVIEW_PORT` (8788). Ficar em outra porta dá uma origem diferente da do painel, então mesmo com `allow-same-origin` no sandbox o app gerado não consegue ler o DOM, o `localStorage` ou a API do CloneStudio.

CSP do preview permite scripts, estilos inline, imagens externas e chamadas HTTP locais; o app gerado é tratado como conteúdo não confiável.

## API

| Método | Rota | Função |
| --- | --- | --- |
| GET | `/api/health` | status, provedores e jobs |
| GET | `/api/config` | configuração pública (sem chaves) |
| GET | `/api/projects` | lista resumida |
| POST | `/api/projects` | cria e inicia geração |
| POST | `/api/inspect` | analisa GitHub/`.zip` e devolve relatório + `inspectionToken` |
| POST | `/api/import` | importa site, app, GitHub ou `.zip` e cria um projeto (aceita `inspectionToken`) |
| GET | `/api/projects/:id` | detalhe + arquivos + mensagens (`?files=0` omite os arquivos) |
| DELETE | `/api/projects/:id` | remove projeto e arquivos |
| POST | `/api/projects/:id/messages` | iteração por chat |
| POST | `/api/projects/:id/fix` | corrigir build com o log |
| POST | `/api/projects/:id/fix-validation` | corrigir problemas encontrados na validação |
| POST | `/api/projects/:id/retry` | gerar de novo a partir do prompt original (erro sem arquivos) |
| POST | `/api/projects/:id/rebuild` | recompilar sem LLM (inclui nova validação) |
| POST | `/api/projects/:id/validate` | validar o preview sob demanda |
| GET | `/api/projects/:id/validation` | último relatório de validação |
| GET | `/api/projects/:id/validation/screenshot` | screenshot PNG da validação |
| GET | `/api/providers` | provedores configurados |
| GET | `/api/providers/:id/models` | lista de modelos (proxy autenticado) |
| GET | `/api/skills` | catálogo de Skills |
| GET | `/api/integrations` | catálogo de ferramentas |
| GET | `/api/context7/status` | testa a conexão MCP e lista ferramentas |
| POST | `/api/context7/resolve` | resolve nome de biblioteca para ID Context7 |
| POST | `/api/context7/docs` | busca documentação atual de uma biblioteca |
| POST | `/api/ai/chat` | chat genérico com fallback |

## Limites e evolução

Para produção, os próximos passos são: autenticação, rate limiting, fila persistente (Redis), workers isolados por container, SSE em vez de polling, sandbox de rede para o build e auditoria de prompts. O MVP roda apenas em `127.0.0.1`.

A validação é controlada por `PREVIEW_VALIDATION`, `PREVIEW_VALIDATION_TIMEOUT_MS`, `PREVIEW_VALIDATION_HOST` e `PREVIEW_BROWSER_CHANNEL`. Com `PREVIEW_VALIDATION=off`, o build continua funcionando e o relatório registra `disabled`.

O Context7 é controlado por `CONTEXT7_ENABLED`, `CONTEXT7_BASE_URL`, `CONTEXT7_API_KEY`, `CONTEXT7_TIMEOUT_MS`, `CONTEXT7_MAX_LIBRARIES`, `CONTEXT7_MAX_CHARS` e `CONTEXT7_CACHE_TTL_MS`. Com `CONTEXT7_ENABLED=off`, o gerador não faz chamadas MCP e registra `disabled`.
