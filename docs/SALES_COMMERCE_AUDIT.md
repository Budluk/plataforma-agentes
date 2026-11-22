# SALES_COMMERCE_AUDIT.md — Auditoria FASE 0

**Projeto:** CentralIA / plataforma-agentes  
**Repositório:** `C:\Users\Lucas\OneDrive\Documentos\Projeto Padrão\plataforma-agentes`  
**Branch:** `main` (sincronizada com `origin/main`)  
**Working tree:** limpo  
**Data da auditoria:** 22/11/2026  
**Escopo:** FASE 0 — auditoria e planejamento apenas. Nenhuma alteração destrutiva, nenhuma remoção de módulo, nenhuma edição de migration.

---

## 1. ESTRUTURA DO REPOSITÓRIO

### Raiz (`plataforma-agentes/`)

| Caminho | Tipo | Descrição |
|---------|------|-----------|
| `AGENTS.md` | arquivo | Regras de ouro e estado das autorizações A1–A8 |
| `README.md` | arquivo | Visão geral do repositório |
| `.gitignore`, `pytest.ini`, `requirements.txt`, `requirements.lock`, `.env.example` | config | Config Python/pytest |
| `core/` | diretório | Lógica pura Python (contracts, hard_gate, tool_registry, tool_monitor) |
| `config/` | diretório | Listas de allowlist (domínios, imports, hosts) |
| `data/` | diretório | Bancos SQLite locais (`smoke.db`, `sqlite.db`) e logs |
| `docs/` | diretório | Documentação (`comercial/`, `adr/`) |
| `lovable-app/` | diretório | Aplicação principal (TypeScript + TanStack Start + Supabase) |
| `clonestudio/` | diretório | CloneStudio (Node, servidor local, preview isolado) |
| `pipelines/` | diretório | Pipelines Python (sales, funnel, research, etc.) |
| `scripts/` | diretório | Scripts CLI Python (studio_api, init_db, run_*_demo, verify_gates.ps1) |
| `tests/` | diretório | Testes Python (pytest) |
| `agents/` | diretório | Diretório vazio / não explorado em detalhe |

### `lovable-app/` (aplicação principal — foco da expansão comercial)

| Caminho | Descrição |
|---------|-----------|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | Configuração do app |
| `supabase/config.toml` | `project_id = "ponnkovdhzxedislhmpp"` |
| `AGENTS.md` | Regras específicas do Lovable + arquitetura CentralIA |
| `src/routes/` | Rotas TanStack Router (`_authenticated/`, `api/`, `__root.tsx`, etc.) |
| `src/routes/_authenticated/_app/` | Páginas autenticadas (`vendas.tsx`, `studio.tsx`, `agentes.tsx`, `painel.tsx`, etc.) |
| `src/lib/core/` | Módulos puros de negócio (40 arquivos `.ts`) |
| `src/lib/server/` | Orquestração server-side (`.server.ts`) |
| `src/lib/api/` | Entry points de server functions (`.functions.ts`) |
| `src/integrations/supabase/` | Cliente Supabase, tipos, auth |
| `src/test/` | Testes Vitest (23 arquivos) |
| `src/components/` | Componentes UI (shadcn/radix) |

### `docs/comercial/` — documentação comercial existente (16 arquivos)

`00-indice.md`, `01-arquitetura.md`, `02-modelo-dados.md`, `03-rls-permissoes.md`, `04-lgpd-integracoes.md`, `05-especificacao-lovable.md`, `06-agentes.md`, `07-atendimento.md`, `08-automacoes.md`, `09-propostas.md`, `10-inteligencia.md`, `11-seguranca.md`, `12-handoff.md`, `13-prompt-lovable.md`, `14-plano-testes-isolamento.md`, `15-script-sql-manual.md`

### `docs/adr/` — ADRs (11 arquivos)

`README.md`, `0001-loopback-only.md`, `0002-build-sandbox-sem-docker.md`, `0003-fila-duravel-sem-redis.md`, `0004-auditoria-sem-corpo.md`, `0005-sse-opt-in.md`, `0006-centralia-branch-substituida.md`, `0007-preparacao-alvo-b-cloudflare-tunnel.md`, `0008-isolamento-build-appcontainer.md`, `0009-mudanca-alvo-b.md`, `0010-arquitetura-comercial-multitenant.md`

---

## 2. STACK DE TECNOLOGIAS

### Frontend / Fullstack (`lovable-app`)

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| React | `^19.2.0` | Interface |
| React DOM | `^19.2.0` | Interface |
| TanStack Router | `1.170.41` | Roteamento |
| TanStack React Start | `1.168.60` | SSR / server functions |
| TanStack React Query | `^5.101.1` | Cache / server state |
| Supabase JS | `^2.119.1` | Cliente Supabase |
| Lovable AI Gateway | `@lovable.dev/ai-gateway: ^0.1.13` | LLM via gateway |
| Lovable Cloud Auth JS | `@lovable.dev/cloud-auth-js: ^1.3.0` | Autenticação |
| Zod | `^3.25.76` | Validação / schemas |
| Tailwind CSS | `^4.2.1` | Estilização |
| Radix UI (vários) | `^1.x` | Componentes UI acessíveis |
| React Hook Form | `^7.71.2` | Formulários |
| Recharts | `^2.15.4` | Gráficos |
| date-fns | `^4.1.0` | Datas |
| Vite | `8.1.5` | Build / dev server |
| Vitest | `^4.1.10` | Testes |
| TypeScript | `^5.8.3` | Tipagem |

> Atualização 2026-11-22: `drizzle-orm` e `drizzle-kit` foram **removidos** do `package.json` no commit `2b18d5c` porque não eram importados em nenhum arquivo de `src/`. O banco continua gerenciado pelo Lovable.

### Backend Python (raiz do repo)

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| httpx | `0.28.1` | HTTP client (scripts Python) |
| pydantic | `2.14.3` | Validação (scripts Python) |
| pytest | `9.2.0` | Testes Python |
| python-dotenv | `1.2.4` | Variáveis de ambiente |

### CloneStudio

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| Node | `^20.19.0 \|\| >=22.12.0` | Runtime |
| playwright-core | `^1.65.1` | Automação de navegador |

---

## 3. ARQUITETURA ATUAL

### Camadas

```
UI  (src/routes/_authenticated/_app/)
│
API / Server Functions (src/lib/api/*.functions.ts)
│   ← requireOperator (admin global + supabase auth)
│
Orquestração server (src/lib/server/*.server.ts)
│   ← Runtime, pipelines, LLM via llm.server.ts
│
Core puro (src/lib/core/*.ts)
│   ← Sem I/O, unit-testável, compartilhado client/server
│
Banco Supabase/Postgres (gerenciado pelo Lovable)
│   ← 19 tabelas, sem multi-tenant comercial
```

### Roteamento

- **TanStack Router** (`@tanstack/react-router`).
- Rotas geradas em `src/routeTree.gen.ts` (não editar manualmente).
- `src/router.tsx` cria o router com contexto de `queryClient`.
- Rotas autenticadas sob `src/routes/_authenticated/`.

### Server functions existentes (em `src/lib/api/`)

| Arquivo | Funções relevantes para comércio |
|---------|----------------------------------|
| `agents.functions.ts` | `runSales`, `runFunnel`, `writeSalesNarrative`, `getAccess`, `getOverview`, `runCentral`, etc. |
| `control.functions.ts` | Aprovações, kill switch, auditoria (`ctl_publish_site`, etc.) |
| `publications.functions.ts` | Publicação de site (dry-run, aprovação) |
| `settings.functions.ts`, `content.functions.ts`, `studio.functions.ts` | Configurações, conteúdo, studio |

Todas as funções de mutação são guardadas por **`requireOperator`** (exige `requireSupabaseAuth` + role `admin` via RPC `has_role`).

### Banco de dados (Supabase)

- **Tabelas atuais (19):** `action_calls`, `agent_runs`, `agent_settings`, `alerts`, `approvals`, `audit_events`, `capabilities`, `content_drafts`, `dev_outputs`, `event_logs`, `kill_switch`, `personas`, `portfolio`, `publish_dryrun`, `research_notes`, `runtime_settings`, `site_publications`, `trend_observations`, `user_roles`.
- **Não existem** `supabase/migrations/` nem `drizzle/` no `lovable-app/`. Banco gerenciado pelo Lovable. As dependências Drizzle foram removidas em `2b18d5c` (antes: instaladas e não usadas).
- **Schema comercial Fase 2 NÃO aplicado:** não há `organizations`, `memberships`, `agent_grants`, `leads`, `opportunities`, `proposals`, etc.
- **RLS:** implementado via policies do Supabase, mas apenas para role `admin` global. Não há isolamento por `organization_id`.
- **Tipos gerados:** `src/integrations/supabase/types.ts` (arquivo gerado, não editar).

### Kill switch

- Tabela `kill_switch` com 1 linha (`id=1`).
- `killState()` faz `.eq("id", 1).maybeSingle()`. Se a linha não existir, falha fechada (considera engajado).
- Todas as escritas de auditoria/approvals/kill switch passam por funções de banco append-only (`ctl_append_audit_exact`, `ctl_create_approval`, `ctl_kill_engage`).

---

## 4. O QUE FOI ENCONTRADO

### Funcionalidades existentes (por classificação)

#### Implementadas e testadas (módulos puros de `core/`)

- **`comercial.ts`**: `decideAutonomy()`, `checkCommercialTool()`, `scoreLead()`, `formatBRLFromCents()`, `Forecast`, níveis de autonomia, matriz de acesso.
- **`commercial-agents.ts`**: 9 agentes comerciais, `authorizeCommercialAction()`, `commercialToolAllowed()`, hard gate.
- **`hardGate.ts`**: `FORBIDDEN_TOOL_TOKENS` (vetado: checkout, payment, send_whatsapp, launch_campaign, etc.).
- **`toolRegistry.ts`**: Registro único de ferramentas; nenhuma ferramenta de execução sensível registrada.
- **`canonical.ts`**: JSON canônico compatível com Python, `sha256hex`, `auditCanon`, `auditHash`.
- **`sales.ts`**: `checkSalesRequest()`, `checkFunnelRequest()`, `marginPct()`, `markupPct()`, `priceForMargin()`, `breakEvenUnits()`, `analyzeFunnel()`.
- **`sales-report.ts`**, **`sales-narrative.ts`**, **`print-report.ts`**: Geração de relatórios PDF determinístico e com IA.
- **`atendimento.ts`**: Canais, opt-out, janela 24h, templates, `prepareReply`, `prepareReminder`, `evaluateSendGate`.
- **`automacoes.ts`**: Workflows, condições, kill switch, retry, `planWorkflowRun` (sem executor).
- **`propostas.ts`**: Catálogo, preço, desconto, versionamento (canonical + sha256).
- **`inteligencia.ts`**: `consolidateIntelligence()`, camada editorial sem dígitos.
- **`seguranca.ts`**: `evaluateActorPermission()`, `evaluateProcessing()`, `evaluateDataSubjectRequest()`, cadeia de auditoria, `evaluateProductionReadiness()`.
- **`crm.ts`**: `detectDuplicates()`, `previewMerge()`, `importContactsCsv()`.

#### Implementadas parcialmente (server functions e UI)

- **`agents.functions.ts`**: `runSales`, `runFunnel`, `writeSalesNarrative` existem e funcionam, mas não resolvem `organization_id` de sessão, não usam `agent_grants`, não têm isolamento comercial.
- **`vendas.tsx`**: Vitrine demonstrativa completa (margem, preço, equilíbrio, diagnóstico de funil, PDF determinístico + IA), mas **apenas ilustrativa** — sem catálogo real, sem checkout, sem pagamento. Todos os dados rotulados `AMOSTRA`.
- **Outras rotas** (`studio.tsx`, `agentes.tsx`, `painel.tsx`): existem, mas não foram detalhadas nesta auditoria.

#### Não implementadas (bloqueadas por A2)

- **Schema comercial Fase 2**: `organizations`, `memberships`, `agent_grants`, `leads`, `opportunities`, `proposals`, `consent_events`, etc. Não existem no banco real.
- **RLS por tenant**: não existe no código TS; depende do schema Fase 2.
- **Tipos do Supabase para comércio**: não gerados (dependem de A2/A3).
- **Integrações reais**: WhatsApp, e-mail, checkout, pagamento, webhooks — todos vetados pelo hard gate ou não integrados.

### Problemas identificados (resumo)

| ID | Problema | Impacto |
|----|----------|---------|
| P1 | Schema Fase 2 não aplicado (bloqueado A2 — sem créditos Lovable, MCP desconectado) | Todos os módulos comerciais são contratos puros sem banco real; sem isolamento por tenant |
| P2 | `drizzle-kit`/`drizzle-orm` em `devDependencies` mas não usados | **RESOLVIDO** em `2b18d5c`: dependências removidas; nenhuma importação em `src/` |
| P3 | Vitrine `/vendas` apenas ilustrativa | Não é uma loja real; intencional até Fase 8 + A2 |
| P4 | Nenhum teste de integração com Supabase/RLS | Sem validação de isolamento entre tenants |
| P5 | `npm test` / `typecheck` / `build` não executados nesta sessão | **RESOLVIDO** em 2026-11-22: `typecheck` OK, 26 arquivos / 345 testes OK, `build` OK |
| P6 | `requireOperator` exige role `admin` global (atalho cross-tenant) | Risco de segurança: admin global acessa dados de qualquer tenant |
| P7 | `client.server.ts` usa service role key que bypassa RLS | Risco elevado se usado incorretamente em funções comerciais |
| P8 | Tipos do Supabase gerados automaticamente (`types.ts`) | Risco de divergência entre tipos TS e schema real após A2 |

---

## 5. CLASSIFICAÇÃO POR MÓDULO (conforme exigência do prompt)

| Módulo | Classificação | Justificativa |
|--------|--------------|---------------|
| Core puro (comercial, comercial-agents, hardGate, toolRegistry, canonical, sales, sales-report, atendimento, automacoes, propostas, inteligencia, seguranca, crm) | Implementada e testada | Módulos puros sem I/O, cobertos por testes Vitest |
| Server functions | Implementada parcialmente | Existem e são guardadas por `requireOperator`, mas sem resolução de tenant ou isolamento comercial |
| Rotas e UI (`vendas.tsx`) | Implementada parcialmente / Existe apenas visualmente | Funciona como vitrine demonstrativa completa; não é catálogo real (sem banco, sem checkout) |
| Supabase / Banco | Não implementada (para comércio) | 19 tabelas genéricas; schema Fase 2 não aplicado |
| RLS / Isolamento por tenant | Não implementada | Não existe no código TS; depende de A2 |
| Agentes de IA comerciais | Implementada e testada (contratos puros) | 9 agentes definidos, matriz de autonomia, hard gate; não ligados a server/UI/banco |
| Testes (Vitest) | Implementada e testada | 23 arquivos de teste; não executados nesta sessão |
| Documentação (docs/comercial, docs/adr) | Implementada | Especificação completa; ADR-0010 aprovado; prompt pronto para Lovable |

---

## 6. PRÓXIMA ETAPA

A auditoria FASE 0 está concluída. Nenhuma alteração foi feita no código.

**Ação crítica para continuar:** desbloquear A2 — aplicar o prompt de `docs/comercial/13-prompt-lovable.md` no editor do Lovable (requer créditos no Lovable + login OAuth do MCP via `/mcps`).

Após A2, a sequência recomendada é:
- **A3:** Gerar tipos do Supabase (não editar à mão).
- **A4:** Executar plano de isolamento em `docs/comercial/14-plano-testes-isolamento.md`.
- **A5:** Ligar server functions comerciais com `requireOperator` + resolução de `organization_id`.

Quando o relatório for aprovado, a implementação deve seguir `docs/IMPLEMENTATION_ROADMAP.md`.
