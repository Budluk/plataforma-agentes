# 12 — Handoff e autorizações pendentes

Estado ao final do roadmap de 10 fases: as Fases 1–10 estão entregues como relatórios, contratos puros e documentação. FASE 1 do Prompt Mestre concluída como planejamento documental em 2026-11-24. Execução das autorizações, atualizado em 2026-11-24: **A1 e A7 concluídas; A2 e A8 bloqueadas; A3–A6 pausadas**.

## Estado atual

- **A1 concluída:** ADR 0010 aprovado como especificação.
- **A7 concluída:** commit `8edbc37` ("Add multi-tenant commercial platform contracts (phases 2-10)") commitado e pushado para `main`; 37 arquivos, 8.260 inserções. Verificação isolada do commit: typecheck OK e 258 testes/21 arquivos. **Nenhum PR foi aberto** — isso exigiria aprovação explícita separada. A feature de PDF com IA ficou de fora deste commit e depois foi autorizada e commitada em `dd26c85` (ver abaixo).
- Nada foi mesclado, deployado, exposto, tunelado ou associado a domínio.
- Nenhuma `.env` de produção foi editada e nenhum token foi rotacionado.
- **A2 bloqueada:** a conta Lovable não tem créditos para executar o prompt e o MCP não completou o login OAuth (sem `send_message` e sem recursos). O schema da Fase 2 não foi aplicado e os tipos do Supabase não foram gerados. O prompt pronto está em `13-prompt-lovable.md`; o plano de verificação em `14-plano-testes-isolamento.md`; o roteiro SQL alternativo, **não executado e não autorizado**, em `15-script-sql-manual.md`.
- **Feature de PDF com IA:** commitada em `dd26c85` ("Add AI-written sales narrative layer for PDF reports"); 10 arquivos, 588 inserções, 74 remoções. Não há mais nada da feature no working tree.
- **Refatoração de relógio:** `validatePublication` em `src/lib/core/publications.ts` recebe agora `now: number` como parâmetro obrigatório (sem default `Date.now()`); o relógio do sistema fica na camada de API (`src/lib/api/publications.functions.ts`), mantendo o core puro e injetável.
- **Revisão dos contratos:** sem `any`, `TODO`, `console` ou relógio/I/O direto nos módulos comerciais; todas as datas derivam de parâmetros explícitos. Nenhum ajuste necessário.
- **CI:** `.github/workflows/ci.yml` adicionado — roda `typecheck`, `test` e `build` em todo push/PR a `main`. Pré-requisito do gate A8 (CI verde) já satisfeito como artefato; ainda falta a execução verde no GitHub após A2 ser aplicada.
- **AGENTS.md raiz:** criado em `AGENTS.md`, apontando para `lovable-app/AGENTS.md` e resumindo regras de ouro + estado atual das autorizações.
- **Limpeza de dependências:** `drizzle-kit` e `drizzle-orm` removidos do `package.json` (não importados em nenhum arquivo; commit `2b18d5c`).
- **Tipos pendentes para schema:** `src/lib/core/schema-pending.ts` criado com interfaces TypeScript para o schema Fase 2 (organizations, memberships, agent_grants, leads, opportunities, proposals, consent_events, etc.). Não cria tabelas nem migrations; é apenas contrato para quando A2 for desbloqueado.
- **Testes adicionais:** 4 novos arquivos de teste (`comercial-extra`, `seguranca-extra`, `automacoes-extra`, `propostas-extra`) cobrindo hard gate, RLS, LGPD, cadeia de auditoria, versionamento de propostas, descontos, automações e regressões de consistência. Total naquele ponto: 26 arquivos, 345 testes. Total atual (2026-11-24): 26 arquivos, 350 testes, todos verdes.
- **Página `/vendas` reforçada:** banner `AMOSTRA` mais visível no topo, disclaimer expandido, nenhum dado fictício apresentado como real.
- **FASE 0 do Prompt Mestre concluída:** seis documentos criados em `docs/` (`SALES_COMMERCE_AUDIT.md`, `SALES_COMMERCE_ARCHITECTURE.md`, `REPOSITORY_EVALUATION.md`, `IMPLEMENTATION_ROADMAP.md`, `SECURITY_AND_LGPD.md`, `TEST_STRATEGY.md`) — commit `1330288`, sem alteração de código.
- **Revisão de consistência (16-revisao-consistencia.md):** 12 divergências corrigidas nos contratos puros e nos limites API/server (aliases sensíveis, redação de CPF/CNPJ, escopo de integração, hard gate PT-BR, kill switch, tenant em auxiliares, safe integer por item e agregado, proveniência da amostra, coluna `origin` no schema previsto). O ponto pendente do fuso foi resolvido em 2026-11-24: buckets passaram a usar `America/Sao_Paulo`, com mudança de semântica documentada.
- **Lotes posteriores em `main`:** `c3fd1ab` (testes extras, `/vendas` reforçado, docs e 12 divergências), `0cb12b3` (correção do CI), `1537afe` (duas correções de auditoria, teste de regressão e `17-auditoria-modulos.md`), `a16e65b` (Kanban, fuso, redaction e planejamento da FASE 1). CI verde em `45439688124` para `1537afe`; o CI de `a16e65b` está em verificação. Nenhum PR foi aberto.
- **Auditoria dos módulos restantes (17-auditoria-modulos.md):** cinco achados corrigidos — parse de aprovação fail closed, `devWrite` sem conclusão falsa, agregados do Kanban com inteiro seguro e `null` quando não mensuráveis, fuso de Brasília nos buckets e redaction/limite nos dados livres da narrativa. Três pontos de semântica seguem registrados para decisão com o operador.
- **FASE 1 do Prompt Mestre:** planejamento documental concluído em `docs/FASE1_PLANNING.md`, com mapeamento de tenant, priorização dos nove agentes, provedores apenas investigados e critérios de aceite. `docs/comercial/01-arquitetura.md` e `docs/IMPLEMENTATION_ROADMAP.md` atualizados. Nenhuma tabela, migration, segredo, `.env`, deploy ou exposição foi alterado. A2 e A8 continuam bloqueadas.
- **A8 bloqueada (tipo C):** classificação C, gate B fail closed. Nada foi exposto e nenhum comando de túnel foi executado. Faltam hostname interno definitivo, Cloudflare Access + WARP/rota privada, token definitivo em Cloud Secret e novo ADR aprovando A→B com CI verde. O ADR 0009 segue como minuta.
- O ADR [0010](../adr/0010-arquitetura-comercial-multitenant.md) foi aprovado em 2026-11-21 como especificação; não autoriza escrita manual de schema, exposição nem envio real.
- As Fases 3–10 não leem banco nem executam ações externas: são primitivas determinísticas que recebem dados do chamador.
- A vitrine `/vendas` segue ilustrativa e rotulada `AMOSTRA`; publicação social continua simulada.

## Autorizações necessárias

| ID | Autorização | Por quê | Depende de |
|---|---|---|---|
| A1 | Aprovar o ADR 0010 | É a porta de entrada para qualquer mudança de schema comercial | Leitura humana do ADR |
| A2 | Aplicar o schema da Fase 2 **no Lovable** | Cria tabelas, funções e policies; `supabase/migrations/` e `drizzle/` não podem ser editados à mão | A1 |
| A3 | Gerar os tipos do Supabase | Os contratos passam a ter tipagem real para as novas tabelas | A2 |
| A4 | Aprovar RLS, `memberships`, `agent_grants` e `integration_grants` iniciais | Define o isolamento por tenant e as permissões de humanos/agentes/integrações | A2, A3 |
| A5 | Ligar as Fases 3–10 a servidor, rotas e UI | Transforma contratos puros em leituras reais; mantém `requireOperator` e gates | A2–A4 |
| A6 | ADR específico para WhatsApp Business API e e-mail oficiais | Integração real exige consentimento, template aprovado e ambiente autorizado | A1, A4 |
| A7 | Autorizar commit/push/PR | Versiona o trabalho; o branch publicado não pode ter histórico reescrito | Escopo definido pelo operador: só Fases 2–10 |
| A8 | Autorizar deploy, expose, tunnel ou domínio | Muda ambiente; o preflight precisa estar `pronto` e a autorização deve ser explícita e separada | A7 + gates do ADR 0007 |

Ordem executada: **A1 → A2 (bloqueada) → A7 → A8 (bloqueada)**. A3–A6 dependem de A2. A ordem recomendada original era A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8; o operador autorizou A7 com escopo reduzido antes de A2 ser desbloqueada.

## O que cada fase deixou pronto

| Fase | Artefato principal | O que falta para produção |
|---|---|---|
| 2 | `src/lib/core/comercial.ts`, `docs/comercial/00–05`, ADR 0010 | Aprovar ADR e aplicar schema (A1, A2) |
| 3 | `src/lib/core/crm.ts`, `crm-dashboard.ts` | Tabelas e tipos reais; ligar dashboard (A2–A5) |
| 4 | `src/lib/core/pipeline.ts` | Persistência de leads/funil e RLS (A2–A5) |
| 5 | `src/lib/core/commercial-agents.ts`, `prompts.ts` | Grants reais e orquestração de servidor (A4, A5) |
| 6 | `src/lib/core/atendimento.ts` | ADR de integração oficial; envio continua vetado (A6) |
| 7 | `src/lib/core/automacoes.ts` | Nenhum executor: apenas planejamento (A5 se algum dia autorizado) |
| 8 | `src/lib/core/propostas.ts` | Preços/tabelas reais; checkout continua vetado (A2–A5) |
| 9 | `src/lib/core/inteligencia.ts` | Leituras reais consolidadas; IA editorial sem dígitos (A5) |
| 10 | `src/lib/core/seguranca.ts` | Preflight `pronto` com estados lidos do banco (A2–A5) |

## Critérios de aceite

- **A2:** tabelas e funções criadas pelo Lovable; nenhum arquivo gerado ou de migration editado à mão.
- **A3:** tipos gerados automaticamente, sem edição manual.
- **A4:** teste de isolamento com dois tenants — nenhuma leitura cruzada, nem por humano, agente ou integração.
- **A5:** suíte atual (22 arquivos / 264 testes) preservada e também verde com integração; `toolRegistry.ts` segue como única fonte de nomes de ferramentas.
- **A7:** branch publicado sem rebase/amend/squash de histórico já enviado ao Lovable.
- **A8:** `evaluateProductionReadiness` com status `pronto` **e** autorização explícita separada; mesmo assim `canExpose`/`canDeploy`/`canCommit` permanecem `false` nesta camada.

## Nunca sem autorização explícita

commit · push · PR · merge · deploy · expose · tunnel · domínio · rotação de token · edição de `.env` de produção · envio real · campanha · checkout · pagamento · alteração de permissões sensíveis.

## Próxima ação sugerida

1. **Desbloquear A2:** copie o bloco de `13-prompt-lovable.md` no editor do Lovable e informe quando as tabelas, funções, policies e os tipos gerados estiverem prontos. A3–A6 retomam na sequência.
2. **Desbloquear A8:** informe o hostname interno definitivo, configure Cloudflare Access + WARP/rota privada, registre o token definitivo como Cloud Secret e aprove um ADR A→B com CI verde. Até lá, nada será exposto.
3. **Decidir a feature de PDF com IA:** já commitada em `dd26c85`; não há mais nada pendente para ela.

Sem uma dessas ações, não há mais nada executável no roadmap.
