# plataforma-agentes

Plataforma multiagente em hardware restrito (Celeron N4500, 3,78 GB de RAM, sem GPU).
Estado atual: fundação, áreas de análise e a área studio (CloneStudio vendorizado).

## Como reproduzir

    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    Copy-Item .env.example .env        # preencher GROQ_API_KEY e GROQ_MODEL no editor
    .\.venv\Scripts\python.exe scripts\check_env.py
    .\.venv\Scripts\python.exe scripts\smoke_io.py
    .\.venv\Scripts\python.exe scripts\test_llm.py
    .\.venv\Scripts\python.exe -m pytest -q
    .\.venv\Scripts\python.exe scripts\run_finance_demo.py          # LLM falso, offline
    .\.venv\Scripts\python.exe scripts\run_finance_demo.py --live   # LLM real

## Provider em uso

São dois provedores distintos, um por componente:

- **Plataforma Python / CentralIA:** Groq (API em nuvem, tier gratuito). Gemini e
  DeepSeek também estão previstos em `core/llm_client.py`. O modelo vem de
  `GROQ_MODEL` no `.env` (modelos são aposentados com frequência).
- **CloneStudio (área studio):** provedor OpenAI-compatible, FreeLLMAPI por
  padrão, configurado em `FREELLMAPI_*` no `.env` de `clonestudio/`. O modelo vem
  de `FREELLMAPI_MODEL`.

A UI do CentralIA usa somente Groq ou Lovable AI
(`lovable-app/src/lib/server/llm.server.ts`); FreeLLMAPI não é provedor dessa UI.

## Estrutura

- core/: contratos Pydantic, hard gate, tool monitor, permissões, logger JSONL, memória SQLite, cliente LLM
- agents/: base_agent (call_tool final), finance/ (analista, gestor de risco, ferramentas), studio/ (cliente supervisionado)
- pipelines/: Analista -> Risco -> Gate -> Alerta
- scripts/: init_db, smoke tests, demo, studio_cli, studio_api
- clonestudio/: CloneStudio AI inteiro (Node 22, React + Vite), vendorizado e executado como serviço local
- lovable-app/: painel CentralIA (React/Vite/TanStack Router/Supabase). A cópia versionada aqui é a canônica; o working copy externo com `node_modules` não é fonte de edição
- config/studio_hosts.txt: hosts de loopback autorizados para a área studio
- tests/: pytest

## Cenários testados (adversariais)

| Cenário | Resultado esperado |
|---|---|
| LLM devolve texto que não é JSON, vazio, lista ou null | rejeitado (ProposalInvalid) |
| Campo inválido, ausente ou extra (inclui tentativa de "tool_calls") | rejeitado |
| Preço NaN, infinito, zero ou negativo | rejeitado |
| Texto do LLM mandando executar ordem | vira só texto; nenhuma ferramenta é chamada |
| Stop igual à entrada, stop do lado errado ou stop largo demais | rejeitado pelo hard gate |
| Snapshot de equity inconsistente ou dados do portfólio ausentes | rejeitado (falha fechada) |
| Perda diária de -5,0% | rejeitado |
| Ativo fora de ALLOWED_ASSETS | ValueError antes de chamar o LLM |
| Ferramenta de execução de ordem | vetada pelo monitor, bloqueio logado |
| Parâmetro com padrão de código ($(), __import__, ../) | bloqueado pelo monitor |
| emit_alert sem read_portfolio antes | bloqueado (sequência) |
| Mesma ferramenta 3 vezes seguidas | bloqueado (loop) |
| LLM fora do ar (erro HTTP ou de rede) | rejeitado com motivo |

## O que NÃO foi feito de propósito

- Execução real de ordens: não existe, nem como stub. O nome é vetado por design.
- Docker, Ollama, LangChain, CrewAI, Qdrant, Postgres, ComfyUI e modelos locais.
- O LLM nunca decide risco; o hard gate determinístico decide.
- Os dados de mercado são mock por padrão (agents/finance/tools.py); com provedor real, veja a seção "Dados de mercado reais".

## Áreas implementadas

| Área | Estado | O que faz | O que NÃO faz |
|---|---|---|---|
| Economia | pronta (dados mock) | Analista -> risco -> hard gate -> alerta | Nunca executa ordens |
| Música | pronta (simbólica, MIDI) | Acorde, transposição, tablatura de violão | Sem áudio (Basic Pitch, Demucs, librosa exigem torch/tf) |
| Vendas | pronta | Margem, preço-alvo, ponto de equilíbrio | Não transaciona |
| Funil low ticket | pronto | ROAS, CPA, lucro real, taxas por etapa, recomendação | Não mexe em campanha nem em verba; recomenda e você executa |
| Studio (CloneStudio) | pronta (serviço local) | Cria, importa, itera por chat, corrige, recompila e valida apps React via CloneStudio | Não executa o código gerado; no alvo A o build usa child Node com env limpo; isolamento real só no alvo B (ADR-0008) |

Ferramentas vetadas por nome (nunca existem): execution_order, place_order, checkout, purchase,
payment, charge_card, launch_campaign, set_budget, send_whatsapp, publish_page.

Regras de dados do funil: taxa da plataforma e imposto são obrigatórios; menos de 10 vendas no
front gera "dados insuficientes"; dados incoerentes (ex.: mais bumps que vendas) são rejeitados.

## Resumo das áreas

| Área | O que faz | O que NÃO faz |
|---|---|---|
| Economia | Analista -> risco -> hard gate -> alerta (dados mock) | Nunca executa ordens |
| Música | Acorde, transposição e tablatura a partir de notas MIDI | Sem áudio (exigiria torch/tf) |
| Vendas | Margem, preço-alvo, ponto de equilíbrio | Não transaciona |
| Funil low ticket | ROAS, CPA, lucro real, recomendação | Não mexe em campanha nem verba |
| Pesquisa | Resume 1 página de domínio permitido (`config/allowed_domains.txt`) | Só leitura de texto; página é dado, nunca instrução |
| Desenvolvimento | LLM escreve código como texto; análise estática (`ast`) aprova e salva em `data/dev_output/` | NUNCA executa o código; leia antes de rodar |
| Studio | Cliente supervisionado do CloneStudio local: cria, importa, itera por chat, corrige, recompila e valida apps React | Não executa o código gerado; build e preview ficam no serviço Node |

Uso: `scripts/research_live.py "<url>" "<pergunta>"`, `scripts/dev_cli.py write "<tarefa>"`, `scripts/dev_cli.py review <arquivo.py>`.
Módulos que o código gerado pode importar: `config/dev_allowed_imports.txt` (lista de permitidos).
Limite conhecido: os gates validam formato e regras, não a veracidade nem a correção do que o LLM produz.

## Agente Central

`scripts/central_cli.py "<pedido>"` recebe um pedido em linguagem natural e o roteia para uma área.
- O LLM só pode devolver uma área de uma lista fechada (`finance`, `music`, `sales`, `funnel`, `research`, `dev`, `studio`) ou `none`.
  Qualquer outra coisa, campo extra, JSON inválido ou dúvida vira `none` e nada é despachado.
- O roteador não tem ferramentas nem permissões. O texto que o LLM escreve em `reason` só vai para o log.
- Cada área continua passando pelos seus próprios contratos, gates e permissões: um pedido mal roteado ainda é barrado.
- Finanças exige uma fonte de portfólio real; sem ela, recusa (não inventa dados).
- Revisão de código não passa pelo roteador: use `scripts/dev_cli.py review <arquivo.py>`.

## CloneStudio (área studio)

O CloneStudio inteiro está vendorizado em `clonestudio/` (Node 22, React 19 + Vite 8). Ele roda
como processo separado: a plataforma Python nunca importa nem executa o JavaScript dele.

A área `studio` é a mais supervisionada da plataforma. Cada ação passa por:

1. contrato Pydantic fechado (`agents/studio/contracts.py`);
2. gate determinístico (`agents/studio/gate.py`): lista fechada de ações, descrição de 10 a 2000
   caracteres, sem URL, sem caractere de controle e `project_id` em UUID;
3. `BaseAgent.call_tool` → monitor de 5 cabeças + permissões + log JSONL;
4. cliente HTTP local (`agents/studio/client.py`): só `http`, só hosts de
   `config/studio_hosts.txt`, sem redirecionamento, teto de 64 KB, timeout e resposta reduzida a
   campos conhecidos (nunca `files`, `buildLog`, `messages` ou `prompt`).

Ações: `health`, `list`, `create`, `status`, `validate`, `messages`, `fix`, `fix-validation`,
`rebuild`, `retry`, `versions`, `restore`, `import` (site, repositório do GitHub ou cópia de um app
existente) e `inspiration`/`inspiration_create` (análise pública de canal/página e criação de um app
original a partir dela). `studio_health` é obrigatório antes de qualquer outra ferramenta (regra de
sequência do monitor).

O histórico de versões guarda o `src/` de cada build bem-sucedido no CloneStudio. `versions` só lê a
lista (número, rótulo, tipo, data e quantidade de arquivos) e `restore` recompila a versão escolhida,
salvando antes o estado atual como `pre-restore` para não perder trabalho. A restauração aceita
apenas `project_id` e `version` (inteiro de 1 a 1.000.000).

A inspiração de redes sociais (`inspiration`) aceita apenas URL pública de YouTube, TikTok, Instagram
ou Facebook e devolve a análise já reduzida a campos conhecidos: plataforma, título, descrição,
handle, métricas públicas (seguidores/inscritos, curtidas, posts), estimativa de porte do público,
alcance público, temas, hashtags e limitações — nunca o HTML, o avatar nem os links da página. O
token da análise vale por 15 minutos e é o único dado aceito por `inspiration_create`, que também
aceita uma ideia opcional (10 a 2.000 caracteres). O app criado é original: a plataforma não copia
marca, textos, fotos ou vídeos e não baixa mídia. Números ausentes ficam vazios; alcance real,
impressões e demografia não são inventados.

A importação aceita apenas `http`/`https` público: nada de loopback, faixa privada, link-local,
credenciais na URL, fragmento ou host fora de `github.com` no modo repositório. A resolução de DNS,
o bloqueio de rebinding e os redirecionamentos são feitos pelo próprio serviço Node
(`clonestudio/server/net-safety.mjs`), que fixa o IP validado na conexão. Importação de `.zip`
continua só no painel do CloneStudio: o arquivo não passa pela plataforma.

Início do serviço (Node 22):

    cd clonestudio
    Copy-Item .env.example .env    # preencher FREELLMAPI_*
    node server/index.mjs          # painel em http://127.0.0.1:8787

Uso pela plataforma:

    .\.venv\Scripts\python.exe scripts\studio_cli.py health
    .\.venv\Scripts\python.exe scripts\studio_cli.py create "loja de café com carrinho"
    .\.venv\Scripts\python.exe scripts\studio_cli.py list
    .\.venv\Scripts\python.exe scripts\studio_cli.py status <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py validate <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py message <project_id> "troque o azul por verde"
    .\.venv\Scripts\python.exe scripts\studio_cli.py fix <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py fix-validation <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py rebuild <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py retry <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py versions <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py restore <project_id> 2
    .\.venv\Scripts\python.exe scripts\studio_cli.py import-site https://exemplo.com
    .\.venv\Scripts\python.exe scripts\studio_cli.py import-github https://github.com/usuario/repo
    .\.venv\Scripts\python.exe scripts\studio_cli.py import-app <project_id>
    .\.venv\Scripts\python.exe scripts\studio_cli.py inspiration https://www.youtube.com/@LofiGirl
    .\.venv\Scripts\python.exe scripts\studio_cli.py create-inspiration <token> "app de foco e estudo"

Ou pelo agente central: `scripts\central_cli.py "crie um app de notas com etiquetas"`,
`"importar https://exemplo.com"`, `"corrigir a validação <project_id>"`,
`"versões <project_id>"`, `"restaurar a versão 2 <project_id>"`,
`"inspiração https://www.youtube.com/@LofiGirl"` ou
`"criar inspiração <token> app de foco e estudo"`.

### API HTTP local (opcional)

`scripts/studio_api.py` expõe as mesmas 17 ferramentas por HTTP em loopback, sem dependência
nova (só a stdlib). Cada requisição continua passando por contrato, gate, monitor, permissões e
log JSONL; a API não executa código gerado.

    .\.venv\Scripts\python.exe scripts\studio_api.py
    # Studio API em http://127.0.0.1:8790 (auth=loopback)

| Método | Rota | Uso |
|---|---|---|
| GET | `/health` | liveness da API (não chama o CloneStudio) |
| GET | `/tools` | lista as 17 ferramentas e seus parâmetros |
| GET | `/tools/<nome>` | esquema de uma ferramenta |
| POST | `/tools/<nome>` | executa a ferramenta com um objeto JSON |
| POST | `/run` | texto livre para `StudioPipeline.run` |

Exemplos (PowerShell):

    Invoke-RestMethod http://127.0.0.1:8790/tools/studio_list_apps -Method Post -Body '{}' -ContentType 'application/json'
    Invoke-RestMethod http://127.0.0.1:8790/tools/studio_create_app -Method Post -Body '{"prompt":"loja de café com carrinho"}' -ContentType 'application/json'
    Invoke-RestMethod http://127.0.0.1:8790/run -Method Post -Body '{"text":"listar meus apps"}' -ContentType 'application/json'

Respostas: `{"ok": true, "data": ..., "reasons": []}` com HTTP 200 em sucesso e HTTP 422
quando o gate, o monitor ou o cliente recusa. Erros de formato são 400, ferramenta desconhecida
404, corpo acima de 64 KB 413 e token ausente/errado 401. POST com corpo exige
`Content-Type: application/json` (415) e `Host` fora de loopback é recusado (400). O bind é
sempre loopback (`STUDIO_API_HOST` aceita só `127.0.0.1` ou `localhost`); `STUDIO_API_PORT`
padrão é 8790.
Se `STUDIO_API_TOKEN` estiver definido (mínimo 16 caracteres), todas as rotas exigem
`Authorization: Bearer <token>`. Sem token, a proteção é o bind em loopback.

A API é uma porta de entrada para outros agentes/processos locais; o agente central continua
usando a biblioteca Python diretamente, e o `studio_cli.py` continua sendo o caminho mais curto
para testar sem LLM.

Limites: no alvo A o build roda em um child Node com ambiente sanitizado e o preview em servidor
separado, no workspace do CloneStudio (`clonestudio/data/`). A plataforma não executa o código
gerado; o build roda `npm install --ignore-scripts` no child, com guard contra config alterada —
nesse alvo isso **não é isolamento de segurança real** (o child usa o mesmo usuário do servidor).
Para o alvo B, `CLONESTUDIO_BUILD_ISOLATION=required` ativa AppContainer + Job Object no Windows
(ADR-0008). A plataforma não aceita URL como descrição. O CloneStudio precisa de Node 22 e de um
provedor OpenAI-compatible (FreeLLMAPI por padrão).
A análise de inspiração lê só HTML público e falha fechada: YouTube expõe inscritos, título,
descrição e palavras-chave; TikTok costuma exigir login; Instagram e Facebook bloqueiam leitura
anônima com frequência. Alcance real, impressões e demografia não são públicos e nunca são
inventados.

## Produção (alvo A — loopback)

O plano de produção foi concluído com exposição **apenas em loopback**. As decisões
estão em [`docs/adr/`](docs/adr/README.md):

| Item | Onde | Efeito |
|---|---|---|
| Auditoria | `clonestudio/server/audit.mjs` | JSONL em `<DATA_DIR>/audit.jsonl`, com `request_id` e redação; nunca grava corpo, prompt ou resposta bruta |
| Fila durável | `clonestudio/server/job-queue.mjs` | Jobs em `<DATA_DIR>/jobs.json`, estados `queued|running|succeeded|failed|cancelled`, retomada no boot e concorrência 2 |
| Sandbox de build | `clonestudio/server/build-sandbox.mjs` | Env do child sanitizado, `npm install --ignore-scripts`, guard de config e CSP do preview sem `unsafe-eval` por padrão |
| SSE opt-in | `clonestudio/server/sse.mjs` | `GET /api/events` desligado por padrão (`CLONESTUDIO_SSE_ENABLED=1`); só avisa `scope`/`id`/`revision`, com fallback para polling |

Autenticação Bearer e rate limiting por IP já estão implementados em `clonestudio/server/api-guard.mjs`.
No alvo A o token fica vazio e o limitador (120 req/min por IP de socket) só é criado com
`CLONESTUDIO_PUBLIC_HOST` ou `CLONESTUDIO_RATE_LIMIT_ENABLED=1`. No alvo B, `CLONESTUDIO_PUBLIC_HOST` exige
`CLONESTUDIO_BUILD_ISOLATION=required`, que usa AppContainer + Job Object no Windows (ADR-0008); no
alvo A o build segue em child Node com env limpo e **não é isolamento de segurança real**. O `HOST`
continua restrito a loopback no boot, e nenhum modelo local foi adicionado (FreeLLMAPI remoto).

Validação final em `main`: `pytest -q` (807), `check_env.py`, `pip check`, `npm run check`,
`npm test` (194), `npm run test:browser` (19) e, em `lovable-app/`, `bun run typecheck`,
`bun run test` (97) e `bun run build`. O job `ui` do CI executa essas três checagens; `lint`
fica de fora por dívida de formatação Prettier pré-existente.

## Regras do hard gate (Economia)

Código: `core/hard_gate.py`. O gate lê só dados validados (nunca texto do LLM). Qualquer regra violada rejeita, e dado ausente também rejeita.

| Regra | Valor | Rejeita quando |
|---|---|---|
| Perda diária | -2.0% | `daily_pnl_pct <= -2.0` |
| Distância do stop | 5.0% | o stop fica a mais de 5.0% da entrada |
| Retorno/risco | 1.5 | (alvo - entrada) / (entrada - stop) abaixo de 1.5 |
| Coerência dos níveis | - | LONG exige stop < entrada < alvo; SHORT, o inverso |
| Portfólio | - | equity ausente ou <= 0, ou `equity_snapshot_consistent = False` |

Não existem limites de tamanho de posição nem de exposição total: o sistema só emite alertas, não dimensiona nem executa ordens.
Se isso mudar, essas regras precisam ser criadas e testadas antes.

## Demo offline (LLM falso)

`FakeLLM` (em `core/llm_client.py`) devolve um texto fixo, sem rede. Os cenários e as respostas fixas ficam em `SCENARIOS`, em `scripts/run_finance_demo.py`; com `--live`, os cenários cuja resposta fixa é um JSON válido chamam o modelo real.

## Modelo do LLM e versões

`GROQ_MODEL` no `.env`. A lista de modelos muda por conta e com o tempo; para ver a da sua:

    .\.venv\Scripts\python.exe -c "import os,httpx; from dotenv import load_dotenv; load_dotenv(); r=httpx.get('https://api.groq.com/openai/v1/models',headers={'Authorization':'Bearer '+os.getenv('GROQ_API_KEY','').strip()},timeout=30); print(r.status_code); [print(m['id']) for m in sorted(r.json().get('data',[]),key=lambda m:m['id'])]"

Em uso: `openai/gpt-oss-20b`. O `llama-3.1-8b-instant` deu 404 nesta conta.
O limite de tokens por resposta vem de `LLM_MAX_TOKENS` (padrão 3000); a área dev pede 6000
na própria chamada, para não cortar código de até 250 linhas. Resposta cortada pelo provedor
(`finish_reason=length`) continua sendo erro explícito — o limite usado aparece na mensagem.
Dependências: `requirements.txt` (5 diretas, versão exata) e `requirements.lock` (todas, para reproduzir o ambiente).
Gates de aceitação: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\verify_gates.ps1`.


## Dados de mercado reais (somente leitura)

Uso: `.\.venv\Scripts\python.exe scripts\market_check.py` (cotação dos 5 ativos) e
`.\.venv\Scripts\python.exe scripts\finance_live.py PETR4` (análise com preço real e LLM real).

| Ativo | Fonte | Tipo | Idade máxima aceita |
|---|---|---|---|
| PETR4, VALE3, ITUB4 | brapi.dev (sem token) | último negócio (atraso do plano gratuito: reportado em até 15 min, não verificado) | 5 dias (a B3 fecha à noite, em fins de semana e feriados) |
| BTCUSDT | data-api.binance.vision | último preço, 24h | 2 minutos |
| EURUSD | api.frankfurter.dev (taxas de referência do BCE) | taxa diária de referência, NÃO é cotação de negociação | 5 dias |

Regras: só GET, só https, só hosts de `config/market_data_hosts.txt`, sem redirecionamento, resposta limitada a 200 KB,
URLs fixas no código (nada do usuário ou do LLM entra na URL). Se a API falhar, a análise é rejeitada: não há volta para os
preços de mentira. O LLM só recebe números e rótulos fixos. O preço de entrada proposto pelo LLM é rejeitado se ficar a
mais de 2.0% do preço de mercado. O alerta registra a fonte e a idade do preço.

O portfólio NÃO vem de nenhuma corretora: é o arquivo `data/portfolio.json`, escrito por você
(`{"equity": 10000.0, "daily_pnl_pct": 0.0, "equity_snapshot_consistent": true}`). Se ele não existir ou tiver mais de 24 h,
o hard gate rejeita. Como o gate não consegue verificar esses números, ele só é tão confiável quanto o que você escreve ali.

Limites: o sistema só emite alertas e não executa ordens. As regras de risco são marcadores de posição, e não recomendação financeira.
Os três serviços são gratuitos, podem mudar o formato, impor limites ou sair do ar; nesses casos a análise é rejeitada com o motivo.
