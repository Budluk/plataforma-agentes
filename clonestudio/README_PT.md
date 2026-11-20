# CloneStudio AI — construtor de apps estilo Lovable

Descreva um app em português, receba código React + TypeScript, veja o build acontecer de verdade e itere por chat. O CloneStudio AI é um clone local do fluxo essencial do Lovable, usando inferência gratuita via FreeLLMAPI e sem enviar chaves para o navegador.

## Status

O MVP está funcional de ponta a ponta:

- criação de projeto a partir de um prompt;
- geração assíncrona com polling e etapas visíveis;
- validação determinística de JSON, caminhos e imports;
- build real com Vite;
- preview isolado em iframe, em outra porta/origem;
- validação automática do preview em navegador headless real, com erros de console/rede, detecção de tela em branco e screenshot;
- correção por IA a partir do relatório de validação;
- documentação atualizada de bibliotecas via Context7/MCP (Recharts, Framer Motion, Lucide e clsx) injetada no prompt de geração;
- chat para alterar o app e corrigir erros de build;
- histórico de versões: cada build bem-sucedido vira uma versão restaurável, com recompilação e preservação do estado atual antes da troca;
- visualização de arquivos e log de build;
- catálogo de Skills, Integrações e Provedores.

Testado através do FreeLLMAPI com `gpt-oss-120b` (OVH keyless) e fallback para `qwen3.8-27b`/`qwen3.5-397b`: geração inicial, build, preview, criação/edição/exclusão de notas, busca, favoritos, troca de tema e correção de CSS por chat.

## Requisitos

- Windows 10/11.
- Node.js `^20.19.0 || >=22.12.0` (testado com Node 22.14).
- FreeLLMAPI local em `http://127.0.0.1:3001/v1` **ou** outro provedor OpenAI-compatible.
- Microsoft Edge ou Google Chrome instalado para a validação do preview. O `playwright-core` usa o navegador do sistema e não baixa Chromium por padrão.
- 4 GB de RAM são suficientes porque o modelo roda fora da máquina. Não instale modelos grandes localmente.

## Início rápido

1. Inicie o FreeLLMAPI com o script (usa Node 22 e a pasta permanente em `C:\Users\Lucas\Tools\freellmapi`):

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start-freellmapi.ps1
```

O script valida a porta `3001`, inicia o gateway em segundo plano, espera o `/api/ping` responder e grava logs em `C:\Users\Lucas\Tools\freellmapi\logs`. Para encerrar, rode `.\scripts\start-freellmapi.ps1 -Stop`. Se preferir iniciar manualmente, use `npm run dev -w server` dentro da pasta do FreeLLMAPI com Node `>=20.18 <25`.

2. Confira a chave unificada e o endpoint no `.env` do CloneStudio:

```dotenv
FREELLMAPI_BASE_URL=http://127.0.0.1:3001/v1
FREELLMAPI_API_KEY=freellmapi-...
FREELLMAPI_MODEL=gpt-oss-120b
FREELLMAPI_FALLBACK_MODELS=qwen3.8-27b,qwen3.5-397b,nvidia/nemotron-3-ultra-550b-a55b:free
```

3. Inicie o CloneStudio:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start.ps1
```

4. Abra `http://127.0.0.1:8787`.

O painel usa a porta `8787`; o preview dos apps gerados usa `8788`, em uma origem separada. Na primeira geração, o servidor instala as dependências fixas do template (React 19, Vite 8, TypeScript 5.9, lucide-react, framer-motion, recharts e clsx). Isso pode levar alguns minutos; depois o `package.json` do template é sincronizado automaticamente e os builds seguintes reaproveitam o `node_modules` por junction.

## Desempenho

O painel foi ajustado para não reler o projeto inteiro a cada atualização:

- o conteúdo de `src/` fica em cache por `mtime`/tamanho e a varredura é reaproveitada por `SOURCE_SCAN_TTL_MS` (5 s por padrão);
- durante geração/build, o polling usa `GET /api/projects/:id?files=0` e busca o detalhe completo uma única vez ao terminar;
- `data/projects.json` é gravado em lote com debounce de `PERSIST_DELAY_MS` (150 ms); criação, exclusão e mensagens gravam na hora;
- estáticos do painel e do preview respondem com `ETag`/`304`, e os arquivos com hash em `assets/` usam cache imutável de 1 ano.

Para desligar o agrupamento ou o cache de varredura, defina `PERSIST_DELAY_MS=0` ou `SOURCE_SCAN_TTL_MS=0` no `.env`.

## Como usar

- **Dashboard:** descreva o app e clique em “Gerar app”.
- **Workspace:** acompanhe as etapas, veja o preview, abra o código ou o log de build.
- **Histórico:** a aba lista as versões criadas a cada build bem-sucedido (até 30, configurável em `MAX_VERSIONS`). "Restaurar" copia o `src/` da versão escolhida, recompila e valida o app de novo; se o estado atual ainda não estiver salvo, ele vira uma versão antes da troca, então a restauração também pode ser desfeita.
- **Abas e janelas:** cada projeto aberto ganha uma aba no topo, com status ao vivo. Feche pela tecla do meio ou pelo “x”; as abas e o estado de cada uma (preview/código/log, desktop/mobile, arquivo selecionado e rascunho do chat) são mantidos ao recarregar. O botão de janela abre o projeto em um pop-up separado, útil para comparar dois apps lado a lado.
- **Chat:** peça alterações (“adicione um filtro”, “troque a paleta”, “corrija o build”). O modelo recebe o conjunto atual de arquivos e devolve a versão completa.
- **Corrigir build:** quando o Vite falha, o log vira contexto para uma nova tentativa.
- **Validação:** depois de cada build bem-sucedido, o app é aberto em Edge/Chrome headless. A aba mostra screenshot, erros de console, exceções, requisições com falha, respostas HTTP ≥ 400 e imagens quebradas (URL que não carregou). “Corrigir com IA” envia esse relatório como contexto.
- **Context7:** quando o pedido menciona gráficos, animações, ícones ou classes condicionais, o gerador busca documentação atual via MCP e injeta no prompt. O selo “Context7” no projeto mostra o que foi usado; em Integrações, “Testar Context7” verifica a conexão real. Funciona sem chave; `CONTEXT7_API_KEY` é opcional.
- **Arrastar e soltar:** arraste um link de site, um card de app já criado, um link do GitHub ou um arquivo `.zip` para o quadro de perguntas. O CloneStudio baixa o conteúdo e cria um projeto novo na hora: sites são abertos em Edge/Chrome headless para capturar o DOM já renderizado (textos, navegação, imagens reais, cores de fundo/texto, fontes e vídeos/trailers) e viram um app gerado com essa referência; cards são copiados sem LLM. GitHub e `.zip` passam primeiro por uma **análise**: o painel mostra stack, rotas, componentes, dependências e todas as funcionalidades detectadas, e só então exibe o botão “Criar site do GitHub”/“Criar site do ZIP”. Se o projeto não for compatível com o template React + Vite, o relatório completo aparece sem criar nada. Soltar fora do quadro apenas mostra um aviso, sem abrir o arquivo no navegador.
- **Vídeos e trailers:** o importador de sites procura `<video>`, `<source>`, iframes, links e payloads de SPA (ex.: `trailerUrl` do Next.js), além de abrir as fichas dos primeiros cards de uma listagem para achar o trailer de cada título. A referência guarda `url`/`embedUrl` reais, e o gerador é instruído a criar um player funcional: modal com `<iframe>` para YouTube/Vimeo ou `<video controls>` para arquivo direto. O preview libera `frame-src` para o embed e usa `strict-origin-when-cross-origin` para o player do YouTube funcionar.
- **Inspiração de redes sociais:** cole (ou arraste) um link de canal/página do YouTube, TikTok, Instagram ou Facebook. O CloneStudio lê apenas dados públicos — sem login, sem burlar bloqueios e sem baixar vídeos ou mídia — e mostra título, bio, seguidores/inscritos, curtidas públicas, temas e hashtags, estimando o porte do público e o alcance público. Alcance real, impressões e demografia são privados da conta: a tela deixa claro que os números são um proxy. “Recriar com a mesma ideia” cria um app **original**, com nome, textos, identidade visual e mídia próprios; a marca e o conteúdo do canal analisado não são copiados. Quando a plataforma não expõe uma métrica, o campo fica vazio em vez de inventar números.
- **Importação de páginas com login:** o importador acessa só a versão pública. Se a URL redirecionar para uma tela de entrada, a referência é essa tela e o conteúdo interno não é lido. O gerador recria o login como **demonstração**: aceita qualquer credencial, não autentica na conta real e exibe um aviso claro.
- **Abrir:** abre o preview em uma nova aba.
- **Skills/Integrações/Provedores:** catálogo e configuração do ecossistema.

## Estrutura

```text
CloneStudioAI/
├── server/
│   ├── index.mjs            API HTTP + arquivos estáticos
│   ├── env.mjs              carregamento do .env
│   ├── storage.mjs          projetos, arquivos, versões, cache de src/ e persistência
│   ├── http-cache.mjs       ETag, If-None-Match e cache de assets
│   ├── preview-origin.mjs   origem do preview/frame-src validada contra o Host
│   ├── providers.mjs        roteamento OpenAI-compatible + fallback
│   ├── generator.mjs        pipeline de geração, validação e build
│   ├── job-queue.mjs        fila durável e recuperação de jobs
│   ├── queue-lock.mjs       lock adaptivo de jobs.json entre processos
│   ├── audit.mjs            JSONL com redação, rotação e retenção por idade
│   ├── api-guard.mjs        Bearer, rate limit e validação de Host
│   ├── generation-core.mjs  parser/validador puro e testável
│   ├── validation-core.mjs  filtros, classificação e instrução de correção
│   ├── preview-validator.mjs executor Playwright + relatório e screenshot
│   ├── browser.mjs          detecção e lançamento de Edge/Chrome (Playwright)
│   ├── site-renderer.mjs    renderiza o site e extrai DOM, imagens, cores e vídeos
│   ├── video-core.mjs       parsing/normalização de YouTube, Vimeo e arquivos de vídeo
│   ├── context7.mjs         cliente MCP, detecção de libs e cache de docs
│   ├── importer.mjs         download/importação de site, GitHub, .zip e cópia de app
│   ├── inspiration.mjs      análise pública de YouTube, TikTok, Instagram e Facebook
│   ├── inspiration-import.mjs cache de análises e criação de projeto inspirado
│   ├── project-inspector.mjs análise de stack, rotas, dependências e funcionalidades
│   ├── preview.mjs          servidor de preview isolado
│   ├── skills.mjs           catálogo de Skills
│   └── integrations.mjs     catálogo de ferramentas externas
├── templates/base/          React 19 + Vite 8 + TypeScript 5.9 fixo
├── public/                  UI do CloneStudio (HTML/CSS/JS puro)
├── data/
│   ├── projects.json        metadados dos projetos
│   ├── jobs.json            estado da fila (protegido por jobs.lock/)
│   ├── audit.jsonl          auditoria com redação e retenção por idade
│   └── projects/<id>/       app/ (código, node_modules e dist) e versions/<n>/ (src + meta.json)
├── tests/                   testes do parser/validador, cache HTTP, storage, rede e navegador
└── docs/
```

## Pipeline de geração

```text
Prompt
  → Context7/MCP (docs atuais das bibliotecas detectadas, com cache)
  → provedor OpenAI-compatible (FreeLLMAPI)
  → extração de JSON tolerante (fences, texto ao redor, control chars)
  → validação de caminhos, extensões, tamanho e imports
  → gravação de src/ (src/main.tsx é fixo)
  → build Vite
  → validação headless (Edge/Chrome) + screenshot
  → dist/ servido em http://127.0.0.1:8788/preview/<id>/
  → iframe com sandbox
```

A validação roda automaticamente após o build e também pelo botão “Validar preview”. Ela usa `playwright-core` com o Edge/Chrome do sistema, coleta erros de console, exceções, requisições com falha e respostas HTTP ≥ 400, detecta página em branco e salva o screenshot em `data/projects/<id>/validation/screenshot.png`. O relatório fica ao lado, em `report.json`.

O modelo só pode escrever em `src/` e só pode importar:

`react`, `react-dom`, `lucide-react`, `framer-motion`, `recharts`, `clsx` e arquivos relativos existentes.

Imports inválidos, `src/main.tsx`, caminhos fora de `src/` e pacotes desconhecidos são rejeitados antes do build. Em caso de JSON/imports inválidos, há uma segunda tentativa automática com o erro como contexto.

## Segurança

- Chaves ficam apenas no `.env` do backend e nunca são devolvidas pela API.
- O servidor escuta em `127.0.0.1` por padrão.
- O preview roda em outra porta/origem e em iframe com `sandbox`.
- Não há endpoint para executar comandos arbitrários enviados pelo cliente.
- Código gerado é tratado como não confiável: validação de imports e CSP restritiva no preview.
- Autenticação Bearer (`CLONESTUDIO_API_TOKEN`) e rate limiting por IP já existem em `server/api-guard.mjs`. No alvo A o token fica vazio; o limitador (120 req/min por IP de socket) só é ativado com `CLONESTUDIO_PUBLIC_HOST` ou `CLONESTUDIO_RATE_LIMIT_ENABLED=1`. Toda rota `/api/`, inclusive GET, valida o `Host`; a origem dos iframes de preview passa pela mesma validação (`server/preview-origin.mjs`). Para exposição são obrigatórios TLS, hostname interno, `CLONESTUDIO_BUILD_ISOLATION=required` e os gates do [ADR-0007](../docs/adr/0007-preparacao-alvo-b-cloudflare-tunnel.md); fila durável e auditoria já estão presentes.

## Integrações

A lista de projetos que inspiraram ou podem ser acoplados ao CloneStudio está em [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). O catálogo marca honestamente o que é nativo, o que é skill, o que é adaptador e o que é um serviço externo.

Não é viável reimplementar Dyad, Plandex, OpenHands, Cline, Open Interpreter e Trae Agent dentro deste app: são agentes completos, concorrentes entre si, com runtimes, sandboxes e requisitos próprios. O CloneStudio implementa o núcleo do Lovable e deixa pontos de extensão para eles.

## Testes

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run test:browser
```

A suíte padrão tem 201 testes: parser/validador de geração, Context7, importação (ZIP bomb e imports que escapam), segurança de rede/SSRF, validação de `Host` em `/api/`, origem do preview, health operacional, retenção de auditoria, cache HTTP, cache de `src/`, persistência agrupada, histórico de versões (snapshot, deduplicação, limite e restauração), auditoria, fila durável com lock entre processos, auth/rate limit e isolamento de build.

O `npm.cmd run test:browser` é separado porque abre o Edge headless. Ele sobe um servidor com `DATA_DIR` temporário e portas livres, cria dois projetos descartáveis e verifica 19 comportamentos de abas, janelas, persistência, acessibilidade e SSE, sem tocar nos seus projetos nem depender de rede externa.

## Configuração de provedores

O roteador tenta os provedores na ordem de `AI_PROVIDER_ORDER`, ignorando os que não têm URL. Cada provedor usa `*_BASE_URL`, `*_API_KEY` e `*_MODEL`. Para adicionar outro provedor OpenAI-compatible, edite `server/providers.mjs` ou use um dos quatro adaptadores existentes.

## Configuração do Context7

O Context7 usa o endpoint público `https://mcp.context7.com/mcp` e funciona sem chave. As variáveis ficam no `.env`:

```dotenv
CONTEXT7_ENABLED=on
CONTEXT7_BASE_URL=https://mcp.context7.com/mcp
CONTEXT7_API_KEY=
CONTEXT7_TIMEOUT_MS=12000
CONTEXT7_MAX_LIBRARIES=2
CONTEXT7_MAX_CHARS=6000
CONTEXT7_CACHE_TTL_MS=1800000
```

A integração só consulta a rede quando detecta Recharts, Framer Motion, Lucide ou clsx no pedido, e guarda o resultado em cache por 30 minutos. Se o Context7 falhar ou demorar, a geração continua sem documentação e o motivo fica registrado no projeto. `CONTEXT7_API_KEY` é opcional e serve para aumentar os limites de uso.

## Limitações conhecidas

- Builds podem demorar em máquinas com OneDrive/antivírus ativos, porque `node_modules` é compartilhado por junction.
- A validação adiciona cerca de 20 a 40 segundos ao build e depende de Edge/Chrome instalados. Sem navegador, o status fica `unavailable` e o app continua utilizável.
- O modelo pode esquecer imports ou usar props de animação em tags erradas; o prompt e o validador reduzem, mas não eliminam isso. Use “Corrigir build” ou peça ajustes no chat.
- Sem multiusuário. A fila é persistente em `DATA_DIR/jobs.json` e retoma jobs `queued` no boot; os que estavam `running` quando o processo morreu viram `cancelled` (projetos e arquivos permanecem). `DATA_DIR/jobs.lock/` serializa a leitura→fusão→gravação entre processos e descarta locks abandonados após `CLONESTUDIO_JOB_LOCK_STALE_MS` (padrão 60 s); a deduplicação por projeto continua sendo por processo. A auditoria remove registros com mais de `CLONESTUDIO_AUDIT_RETENTION_DAYS` (padrão 30; `0` desliga) do arquivo atual e dos backups, preservando linhas sem timestamp identificável. A autenticação Bearer só é exigida quando `CLONESTUDIO_API_TOKEN` está configurado; o rate limit de 120 req/min por IP de socket é ativado por `CLONESTUDIO_PUBLIC_HOST` ou `CLONESTUDIO_RATE_LIMIT_ENABLED=1`, independentemente do token. `GET /api/health` informa `queue`, `buildIsolation` e `auth` (apenas estados, sem token).
- O Context7 público tem limites de uso e pode ficar indisponível. A geração degrada sem bloquear, mas o selo de conhecimento pode não aparecer.
- A importação de GitHub/.zip aceita apenas projetos Vite/React com `src/App.tsx` (ou `App.tsx` na raiz). Next.js, Vue e arquivos `.less/.scss` não são convertidos. Dependências fora de React, lucide-react, framer-motion, recharts e clsx não são instaladas automaticamente. A análise antes de criar já avisa sobre esses bloqueios e mostra todas as funções detectadas, sem criar o projeto.
- **Páginas atrás de login:** o importador lê apenas a versão pública. Se a URL redirecionar para uma tela de entrada, essa é a referência capturada e o conteúdo interno não é acessado. Telas de login clonadas são demonstrações: aceitam qualquer credencial, não autenticam na conta real e exibem um aviso de demonstração.
- O preview é estático (`dist`), não um dev server com HMR. Cada iteração gera um novo build.
- O histórico guarda apenas o `src/` de cada versão (o build é refeito na restauração). Recompilar sem mudar o código não cria versão nova, e o limite padrão é 30 versões por projeto (`MAX_VERSIONS`). Se a restauração não compilar, o projeto fica em erro e a versão anterior do estado atual continua disponível no histórico.
- O nome do projeto pode vir do prompt quando o modelo não devolve `name`.
- A análise de inspiração usa somente HTML público: YouTube expõe inscritos, título, descrição e palavras-chave (views, vídeos e curtidas do canal não são públicos na página inicial); TikTok varia e costuma exigir login; Instagram e Facebook bloqueiam leitura anônima com frequência. Nesses casos os campos ficam vazios e a tela lista as limitações. Alcance real, impressões e demografia nunca são estimados sem métrica pública.
