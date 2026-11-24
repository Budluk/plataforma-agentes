# FASE1_PLANNING.md — Plano detalhado da FASE 1 (Planejamento)

**Projeto:** CentralIA / plataforma-agentes  
**Escopo:** FASE 1 do Prompt Mestre — exclusivamente documental  
**Data:** 24/11/2026  
**Status:** concluída como especificação; nenhuma entrega de código ou schema foi aplicada  
**Referência de estado:** `docs/comercial/17-auditoria-modulos.md` — validação local com 26 arquivos / 350 testes OK; CI verde no commit `1537afe`.  
**Dependências:** A2 bloqueada (Lovable sem créditos e MCP sem login OAuth); A8 bloqueada (gate C fechado). A3–A6 permanecem pausadas.

> Toda tabela, coluna, policy, grant ou server function descrita abaixo é **especificação para o Lovable**, não aplicação. Nenhum código, migration, `drizzle/`, `supabase/`, `.env`, segredo, commit, push, PR, merge, deploy, expose, túnel ou domínio foi executado nesta fase por este trabalho documental. Outras alterações eventualmente presentes na working tree não são objeto deste plano e não foram editadas, revertidas ou avaliadas aqui. Nenhum dado fictício é apresentado como real: a vitrine `/vendas` continua rotulada `AMOSTRA`.

---

## 1. Objetivo e limites

A FASE 1 transforma o diagnóstico da FASE 0 em um plano executável e reversível para as fases seguintes. Ela responde, sem tocar no banco real, às sete perguntas abertas do `docs/IMPLEMENTATION_ROADMAP.md` (linhas 62–79):

1. quais tabelas do schema Fase 2 são necessárias e quais já existem no baseline de 19 tabelas;
2. como `organization_id` será resolvido nas server functions sem atalho cross-tenant por `admin` global;
3. quais dos nove agentes comerciais serão expostos via server functions e UI, em que prioridade e com que critérios de aceite;
4. quais provedores de pagamento serão investigados — sem integração;
5. quais provedores de IA serão mantidos — sem dependência de único fornecedor;
6. como `docs/comercial/01-arquitetura.md` passa a descrever as camadas e a resolução de tenant;
7. quais são os critérios de aceite por módulo e a matriz de permissões humano / agente / integração.

**Regras que permanecem intactas:**

- `requireOperator` continua sendo a guarda das funções da plataforma; **role global `admin` não é autorização de tenant**.
- `hardGate.ts`, `kill_switch`, `toolRegistry.ts`, `canonical.ts` e as RPCs append-only permanecem como fontes únicas de verdade.
- Nenhuma ferramenta de envio, campanha, checkout ou pagamento é registrada nem executada.
- O schema versionado em `lovable-app/src/lib/core/schema-pending.ts` não cria tabelas; é apenas contrato TypeScript pendente.
- A8 não é reavaliada e continua bloqueada.

---

## 2. Fontes consultadas

| Fonte | Uso neste plano |
|---|---|
| `docs/IMPLEMENTATION_ROADMAP.md` | Escopo obrigatório e critérios de conclusão da FASE 1 |
| `docs/SALES_COMMERCE_AUDIT.md` | Baseline de 19 tabelas, problema P6 e classificação da FASE 0 |
| `docs/SECURITY_AND_LGPD.md` | RLS planejada, funções de tenant, P6/P7 |
| `docs/comercial/00-indice.md` | Regras de leitura e estado das autorizações |
| `docs/comercial/01-arquitetura.md` | Camadas atuais e fluxo do agente |
| `docs/comercial/02-modelo-dados.md` | Lista de entidades propostas e invariantes |
| `docs/comercial/03-rls-permissoes.md` | Papéis de tenant, autonomia e matriz existente |
| `docs/comercial/04-lgpd-integracoes.md` | Integrações priorizadas, consentimento e restrições |
| `docs/comercial/06-agentes.md` | Os nove agentes comerciais e regras comuns |
| `docs/comercial/11-seguranca.md` | `evaluateActorPermission` e auditoria encadeada |
| `docs/comercial/12-handoff.md` | Estado A1/A7 concluídas, A2/A8 bloqueadas, A3–A6 pausadas |
| `docs/comercial/13-prompt-lovable.md` | Prompt único ainda não aplicado |
| `docs/comercial/14-plano-testes-isolamento.md` | 14 casos de isolamento (A4), não executados |
| `docs/comercial/16-revisao-consistencia.md` | Decisões de fuso/tenant já registradas |
| `docs/comercial/17-auditoria-modulos.md` | Estado 350 testes / CI verde em `1537afe`; três achados pendentes de decisão |
| `docs/adr/0010-arquitetura-comercial-multitenant.md` | Decisão aprovada como especificação |
| `lovable-app/src/integrations/supabase/types.ts` | Nomes reais das 19 tabelas do baseline (arquivo gerado, não editado) |
| `lovable-app/src/lib/core/schema-pending.ts` | Contratos pendentes de organizations, memberships, grants, leads, opportunities, propostas e consentimentos |
| `lovable-app/src/lib/core/toolRegistry.ts` | Registro único das ferramentas, incluindo as dos nove agentes |
| `lovable-app/src/lib/api/*.functions.ts` e `operator.ts` | Mapeamento atual de entrypoints e do `requireOperator` |
| `lovable-app/src/lib/server/llm.server.ts` | Provedores de IA efetivamente suportados hoje |

---

## 3. Decisão 1 — Schema Fase 2: necessário vs. já existente

O baseline confirmado tem **19 tabelas**. O documento `02-modelo-dados.md` propõe **37 tabelas físicas novas e 1 view**. A leitura anterior de que "todas são novas" é ajustada neste plano: `audit_events` e `approvals` já existem e devem ser **reaproveitadas**, nunca duplicadas. Nenhuma tabela abaixo foi criada nesta fase.

### 3.1 Baseline de 19 tabelas — destino comercial planejado

| Tabela baseline | Classificação | Destino no plano |
|---|---|---|
| `action_calls` | reuso com extensão | Registrar chamadas de ferramentas; se registrar contexto comercial, acrescentar `organization_id` e filtrar por tenant. Somente via Lovable. |
| `agent_runs` | reuso com extensão | Histórico de execuções; acrescentar `organization_id` quando a execução for comercial. |
| `agent_settings` | reuso global | Prompts/temperatura por agente da plataforma; nunca conter dado de tenant. |
| `alerts` | reuso global | Alertas da plataforma; fora do escopo comercial até decisão explícita. |
| `approvals` | **já existente — reuso obrigatório** | Aprovações humanas; acrescentar `organization_id` e exigir papel do aprovador no tenant. Não criar `approval_events` como substituto. |
| `audit_events` | **já existente — reuso obrigatório** | Cadeia de auditoria atual; acrescentar `organization_id` nos eventos comerciais. Preservar `detail` canônico e `ts_exact`; não resserializar. |
| `capabilities` | reuso global | Seed derivado de `toolRegistry.ts`; não é grant de tenant. |
| `content_drafts` | reuso global | Conteúdo editorial atual; fora do comércio até decisão de produto. |
| `dev_outputs` | reuso restrito | Saídas de desenvolvimento do operador; não usar para dados de clientes. |
| `event_logs` | reuso com extensão | Logs de streams; quando o stream for comercial, acrescentar `organization_id`. |
| `kill_switch` | reuso global | Continua com `id = 1` e falha fechada; não vira por tenant nesta especificação. |
| `personas` | reuso global | Personas editoriais; fora do comércio. |
| `portfolio` | reuso global | Finanças pessoais existentes; fora do comércio. |
| `publish_dryrun` | reuso global | Registro de publicação do site; fora do comércio. |
| `research_notes` | reuso global | Notas de pesquisa; fora do comércio. |
| `runtime_settings` | reuso global | Configurações da plataforma e do studio; nunca por tenant nesta fase. |
| `site_publications` | reuso público | Cópia pública já liberada; endpoint `readSitePublications` continua sem dado de tenant. |
| `trend_observations` | reuso global | Observações de tendências; fora do comércio. |
| `user_roles` | reuso global | Role global do operador; **não** substitui `memberships`. |

**Consequência direta:** a role global em `user_roles` e o RPC `has_role(..., 'admin')` continuam valendo para administração da plataforma, mas não leem nem gravam dados comerciais de tenant.

### 3.2 Tabelas novas realmente necessárias

As ondas abaixo são **ordem de aplicação proposta**, não autorização para aplicar. A aplicação depende de A2 e da execução do prompt em `13-prompt-lovable.md`.

| Onda | Tabelas | Por que são necessárias | Dependência |
|---|---|---|---|
| 0 — núcleo | `organizations`, `memberships`, `agent_grants`, `integration_grants` | Sem elas não existe resolução de tenant nem grant de agente/integração. São pré-requisito de A3/A4. | A2 |
| 1 — CRM e funil | `people`, `companies`, `contacts`, `lead_sources`, `leads`, `lead_scores`, `pipeline_stages`, `opportunities`, `opportunity_moves`, `activities`, `consent_events` | Cobrem FASE 3 (CRM) e FASE 4 (leads/pipeline) com histórico e base legal. `consent_events` é append-only. | Onda 0 + A3/A4 |
| 2 — atendimento, automações, catálogo e propostas | `addresses`, `tags`, `entity_tags`, `notes`, `attachments`, `products`, `price_tables`, `price_items`, `proposals`, `proposal_items`, `proposal_versions`, `orders`, `order_items`, `conversations`, `messages`, `message_templates`, `workflows`, `workflow_runs`, `workflow_steps` | Necessárias às FASES 5–8. Nenhuma cria envio, checkout, pagamento ou publicação automática. | Onda 1 + A4/A5 |
| 3 — LGPD e inteligência | `data_subject_requests`, `retention_policies`, `forecasts`, `customer_360` (view) | A view depende de CRM, oportunidades, propostas e consentimentos; antecipá-la geraria uma consolidação vazia. | Ondas 1–2 |

### 3.3 Entidades que **não** devem ser criadas como tabelas novas

| Nome citado em documentos anteriores | Decisão da FASE 1 |
|---|---|
| `activity_log` | Não criar. Usar `activities` para histórico de CRM e `audit_events` (com `organization_id`) para auditoria de ações. |
| `approval_events` | Não criar. Reaproveitar `approvals` + cadeia de `audit_events`. |
| `payments` | Não criar agora. FASE 9 decidirá o modelo depois da investigação de provedores; nada de webhook ou tokenização nesta fase. |
| `customer_360` como tabela | Não criar. É view somente leitura, na onda 3. |
| `audit_events` comercial duplicado | Não criar. Estender o existente via Lovable. |

**Invariantes confirmados da especificação:** toda linha comercial pertence a exatamente um `organization_id`; `document_token` é HMAC com chave em Cloud Secret (nunca no repositório); `document_last4` é só conferência visual; nenhuma tabela guarda segredo, token de API ou corpo bruto de prompt/resposta de LLM; `origin: real | amostra` é obrigatório em propostas e itens.

---

## 4. Decisão 2 — Resolução de `organization_id` nas server functions

### 4.1 Algoritmo obrigatório (especificação para FASE 2/A5)

1. `requireSupabaseAuth` fornece `context.userId` e `context.claims` da sessão autenticada.
2. RPC `current_organization_ids()` devolve a lista de tenants ativos do usuário em `memberships`.
3. O `organization_id` enviado pelo cliente, quando existir, é tratado como **seleção**, nunca como autoridade: só é aceito se pertencer à lista da etapa 2. Caso contrário, falha fechada com `tenant_nao_autorizado`.
4. Sem `organization_id` no payload: usar o tenant único quando houver exatamente um; com zero ou mais de um, falhar com `tenant_ausente` / `tenant_multiplo`. Nunca escolher automaticamente o primeiro.
5. Verificar `has_tenant_role(p_org, p_roles)` conforme a ação: leitura (`viewer+`), escrita comercial (`seller+`), aprovação (`manager+`) ou administração do tenant (`admin`/`owner`).
6. Para ações de agente, verificar também `agent_grants.actions`, autonomia, `kill_switch` e `toolRegistry` antes de qualquer preparação.
7. Injetar `organization_id` no contexto da server function e no `Runtime`, de modo que toda auditoria registre tenant, `actor`, `action`, `run_id` e `ts_exact`.
8. Usar RPCs append-only existentes para auditoria, aprovações e kill switch; nunca gravar essas tabelas diretamente.
9. O cliente `service_role` em `client.server.ts` continua proibido em caminhos que leem dados de tenant (problema P7).

**Erros padronizados em pt-BR:** `tenant_ausente`, `tenant_multiplo`, `tenant_nao_autorizado`, `papel_insuficiente`, `grant_ausente`, `kill_ativo`. Nenhum erro devolve dados de outro tenant.

### 4.2 Separação de middlewares

| Middleware | Guarda | Uso |
|---|---|---|
| `requireOperator` (atual, `operator.ts`) | `requireSupabaseAuth` + `has_role(..., 'admin')` | Permanece para administração da plataforma: overview global, configurações, studio, kill switch global. Não é guarda de dado comercial. |
| `requireTenantContext` (novo, a especificar em FASE 2) | `requireSupabaseAuth` + `current_organization_ids()` + seleção validada | Entrypoints comerciais. Não exige role global. |
| `requireTenantRole(papel)` (novo, composição) | `requireTenantContext` + `has_tenant_role` | Escrita, aprovação e administração dentro do tenant. |

`requireOperator` não é removido nem enfraquecido; ele deixa de ser usado como único critério para dados comerciais.

### 4.3 Mapeamento dos entrypoints existentes

| Arquivo | Funções | Classificação | Ajuste planejado |
|---|---|---|---|
| `api/agents.functions.ts` | `getAccess` | Autenticação | Continua informando `isOperator` da plataforma; não vira indicador de acesso a tenant. |
| `api/agents.functions.ts` | `getOverview`, `getFinanceState`, `checkMarket`, `runCentral`, `runFinance`, `runMusic`, `runResearch`, `runDevWrite`, `runDevReview`, `listDevOutputs`, `listHistory`, `listEventLogs` | Plataforma | Permanecem com `requireOperator`. Se passarem a exibir dado comercial, precisam de filtro por `requireTenantContext`; até lá não são entrypoints comerciais. |
| `api/agents.functions.ts` | `runSales`, `runFunnel`, `writeSalesNarrative` | Vitrine / AMOSTRA | Hoje não resolvem tenant. Continuam operando sobre dados fornecidos/ilustrativos e rotulados `AMOSTRA`. Ao ligar FASE 4, passam a `requireTenantContext` + `agent_grants` e leem tabelas reais filtradas. |
| `api/control.functions.ts` | `listApprovals`, `decideApproval`, `executeApproval`, `getAudit` | Plataforma com impacto comercial | `approvals` e `audit_events` ganham `organization_id`; listagens filtram por tenant; aprovar exige `manager+` no tenant, nunca apenas `admin` global. `executeApproval` valida o tenant da aprovação antes de executar. |
| `api/control.functions.ts` | `killSwitch` | Segurança global | Permanece global e com confirmação `SIM` para liberar; não ganha tenant. |
| `api/publications.functions.ts` | `listPublications`, `requestSavedApproval`, `publishSavedContent` | Publicação do site | Continua fora do comércio; se publicar proposta/conteúdo de tenant no futuro, exige `requireTenantContext` e aprovação específica. `readSitePublications` permanece público e sem dado de tenant. |
| `api/content.functions.ts` | `listPersonas`, `savePersona`, `runContentCycle`, `listContent`, `getTrendReport`, `importTrendCsv`, `collectTrends` | Editorial | Fora do escopo comercial; sem mudança de tenant nesta fase. |
| `api/settings.functions.ts` | `getSettings`, `saveSettings`, `getAgentSettings`, `saveAgentSettings`, `getAgentLogs` | Configuração global | Permanece `requireOperator`; prompts de agentes não podem conter dado de tenant. |
| `api/studio.functions.ts` | `runStudio`, `getStudioInfo` | Studio local | Permanece `requireOperator`, loopback/hosts permitidos e linhas fechadas de ação → gate → monitor → permissão. Sem dados de tenant. |

### 4.4 Verificação planejada

Reutilizar os 14 casos de `docs/comercial/14-plano-testes-isolamento.md`, em especial T1, T3, T5, T6, T7, T8, T10, T11 e T12 — todos bloqueantes para A5. Acrescentar, na FASE 2, teste unitário de `requireTenantContext` para os quatro estados: tenant único, múltiplo, ausente e spoofado. A pendência de tenant em auxiliares já corrigida em `16-revisao-consistencia.md` (item 6) serve como precedente: `organization_id` nunca é confiado ao chamador.

---

## 5. Decisão 3 — Exposição dos nove agentes comerciais

Prioridades: **P0** já exposto e rotulado `AMOSTRA`; **P1** primeira leva real após A2–A5; **P2** após persistência de CRM/funil/propostas; **P3** após gates específicos. Nenhuma prioridade autoriza envio, campanha, checkout ou pagamento.

| # | `agent_id` | Prioridade | Exposição planejada (server function / UI) | Critério de aceite |
|---|---|---|---|---|
| 1 | `prospector_agent` | P1 (FASE 4) | `avaliarFonte` / `prepararLead`; tela "Fontes e leads" | Só fontes públicas autorizadas com `legal_basis` registrada; nenhum contato; lead preparado com `status` explícito e tenant resolvido. |
| 2 | `qualifier_agent` | P1 (FASE 4) | `calcularScore` / `qualificarLead`; detalhe do lead | Números vêm de `scoreLead`; cada score traz razões; sem dados vira `sem_dados`; nenhuma hipótese apresentada como confirmada. |
| 3 | `crm_steward_agent` | P2 (FASE 3) | `detectarDuplicatas` / `previsualizarMerge` / `segmentarContatos`; tela "Contatos" | Merge apenas com confirmação humana e registro em `activities`/auditoria; segmentação não altera consentimento nem `opted_out`. |
| 4 | `pipeline_agent` | P1 (FASE 4) | `montarKanban` / `moverOportunidade`; tela "Pipeline" | Movimento só com `agent_grants.actions` e kill switch desligado; toda mudança gera `opportunity_moves` com `actor` e tenant. |
| 5 | `funnel_agent` | **P0 (reuso)** | `runFunnel` existente; `/vendas` (AMOSTRA) e depois dashboard real | Reusa `analyze_funnel` do registry, sem novo tool; ao ligar dados reais, filtra por tenant e mantém rótulo `AMOSTRA` na vitrine. |
| 6 | `sales_agent` | **P0 (reuso)** | `runSales` existente; `/vendas` (AMOSTRA) e depois margem real | Reusa `compute_margin`, `suggest_price`, `break_even`; nunca altera `price_items` nem aplica desconto fora da tabela. |
| 7 | `proposal_agent` | P2 (FASE 8) | `prepararProposta` / `validarDesconto`; tela "Propostas" | Saída `ProposalPreparation` com `canSend: false`, `canCheckout: false`; desconto acima de `max_discount_pct` vira `approvals`, nunca proposta aprovada. |
| 8 | `followup_agent` | P3 (FASE 5) | `rascunharResposta`, `prepararLembrete`, `carregarConversa`, `validarTemplate`, `avaliarJanela`, `prepararOptout`; tela "Atendimento" | Somente rascunho; respeita `opted_out`, janela 24h e template aprovado; nenhuma linha em `messages` com `sent_at` por agente. |
| 9 | `insights_agent` | P3 (FASE 11) | `lerDashboard` / `gerarLeitura`; tela "Analytics" | `IntelligenceReading` consolida leituras existentes; camada editorial sem dígitos; `canSend: false` e `canExecute: false`. |

**Regras comuns de exposição:** uma ferramenta por ação, sempre a partir de `toolRegistry.ts`; `decideAutonomy` é a única fonte da decisão; `evaluateActorPermission` aplica tenant → kill switch → hard gate → ação sensível → `agent_grants`; saída validada por `CommercialAgentProposal` ou pelo contrato específico; auditoria com `run_id`, `organization_id`, `agent_id`, `tool`, resumo redigido e `ts_exact`, sem prompt/resposta bruta.

---

## 6. Decisão 4 — Provedores de pagamento: apenas investigação

Nenhum provedor será integrado, contactado, credenciado ou chamado nesta fase. O resultado esperado é uma matriz de decisão documentada na FASE 9, com links públicos e data de consulta — sem taxas, limites ou disponibilidade presumidos.

| Provedor / família | Perguntas de investigação | Critério de inclusão na comparação |
|---|---|---|
| Stripe | Cobertura BRL, Pix e cartão no Brasil; assinaturas; webhooks assinados e idempotência; reembolsos; tokenização; antifraude | Documentação pública oficial; ambiente de teste sem dado de cliente; ADR específico antes de qualquer chamada |
| Mercado Pago | Pix, boleto, cartão nacional, assinaturas, reembolsos, notificações e idempotência | Mesmos critérios; atenção à separação entre conta de teste e produção |
| PayPal | Cartão internacional, BRL/USD/EUR, checkout e reembolsos; compatibilidade com o modelo BRL | Mesmos critérios; avaliar se agrega algo além dos provedores locais |
| Provedores brasileiros (ex.: Stone, PagSeguro, Cielo/Getnet, Efi e Pix direto via instituição) | Pix, boleto, cartão nacional, antecipação, conciliação, webhooks, reembolsos e regime regulatório | Mesmos critérios; nenhum contrato, chave ou conta será criado agora |

**Especificação de segurança para a futura integração:** nenhum dado completo de cartão no repositório; liberação de acesso somente após webhook assinado ou consulta confiável ao provedor; nunca confiar no retorno do navegador; pedidos, itens, pagamentos e reembolsos modelados com centavos inteiros; segredos apenas em Cloud Secrets; logs redigidos.

---

## 7. Decisão 5 — Provedores de IA a manter

| Provedor | Estado atual | Decisão da FASE 1 |
|---|---|---|
| Lovable AI Gateway | `llm.server.ts` usa `@lovable.dev/ai-gateway` quando não há `GROQ_API_KEY`; modelo padrão `openai/gpt-6-astra`; depende de créditos do workspace (A2 bloqueada) | Manter como caminho padrão. Nenhuma chave em browser ou repositório. Erro 402 continua mapeado para "créditos de IA esgotados no workspace". |
| Groq | Usado quando `GROQ_API_KEY` está configurada; modelo padrão `openai/gpt-oss-20b`, sobreponível por `GROQ_MODEL` | Manter como alternativa. Nenhuma nova chave, conta ou modelo é adicionado nesta fase. |

**Sem dependência de único fornecedor:** a abstração `LLM` (`provider`, `model`, `complete`) em `llm.server.ts` permanece o único ponto de chamada; agentes, prompts e pipelines não chamam SDK de provedor diretamente. A seleção continua por configuração de ambiente/settings, sem tocar nos agentes. Critérios de aceite futuros: troca de provedor por configuração com os mesmos contratos de saída; testes com provedor simulado; nenhuma chave em log, resposta ou repositório; `getSettings`/`getOverview` informam apenas o provedor ativo, nunca o segredo.

---

## 8. Decisão 6 — Atualização da arquitetura

`docs/comercial/01-arquitetura.md` passa a descrever explicitamente:

1. **Camadas físicas inalteradas** — core puro, orquestração, entrypoints, banco gerenciado pelo Lovable e UI.
2. **Responsabilidades transversais agora explícitas** — contexto de tenant, grants/política e auditoria — implementadas dentro das camadas existentes, sem novo diretório.
3. **Resolução de tenant** — sessão → `current_organization_ids()` → seleção validada → `has_tenant_role` → `agent_grants` → `kill_switch` → `toolRegistry` → auditoria.
4. **Classificação dos entrypoints** — plataforma vs. vitrine `AMOSTRA` vs. comercial real.
5. **Integrações** — inventário de investigação de pagamentos e a manutenção dos dois provedores de IA, sem nova integração instalada.

A atualização é documental; nenhuma camada de código é criada na FASE 1.

---

## 9. Decisão 7 — Plano por módulo, aceite e permissões

### 9.1 Critérios de aceite planejados por módulo

Estes critérios são **definições de pronto para fases posteriores**, não resultados obtidos na FASE 1.

| Módulo / fase | Critérios de aceite planejados | Gate |
|---|---|---|
| Schema e tenant (A2–A4 / FASE 2) | Tabelas aplicadas pelo Lovable; tipos gerados sem edição manual; 14 casos de isolamento executados e aprovados; `admin` global sem acesso cross-tenant (T3); nenhuma tabela nova duplica `audit_events`/`approvals`. | A2 + A3 + A4 |
| CRM e pipeline (FASE 3–4) | CRUD de pessoas/empresas/leads; importação CSV testada; duplicatas com preview e confirmação humana; score com razões e `sem_dados`; Kanban com `opportunity_moves` e tenant correto. | A4 + A5 |
| Agentes comerciais (FASE 4) | Nove agentes mapeados conforme a tabela da seção 5; execução só com grant, kill switch desligado e ferramenta registrada; nenhuma ação sensível executada; vitrine permanece `AMOSTRA`. | A4 + A5 |
| Atendimento (FASE 5) | Caixa de entrada funcional com dados reais ou estados vazios; `opted_out` e janela 24h respeitados; rascunhos sem envio; nenhum envio real sem ADR oficial. | A6 |
| Automações (FASE 6) | Gatilho → condição → ação com logs; retentativas limitadas; duplicidade evitada; kill switch testado; nenhuma automação sem grant válido. | A5 |
| Catálogo e propostas (FASE 7–8) | Produtos versionados com canonical/sha256; downloads protegidos; proposta com `origin` obrigatório; desconto dentro de `max_discount_pct` ou approval; sem checkout. | A5 |
| Pagamentos (FASE 9) | Matriz de investigação documentada com fontes públicas; ADR específico; webhook assinado e idempotente; pagamento aprovado só libera acesso após confirmação confiável; sem cartão completo no repositório. | ADR próprio + A5 |
| Marketing e analytics (FASE 10–11) | Campanha paga exige aprovação; indicadores com dados reais e `sem_dados` quando ausentes; decisão documentada sobre fuso dos buckets e sobre `conversion_pct`. | A5 + decisões pendentes |
| Segurança, LGPD e auditoria (FASE 12) | 14 casos de isolamento verdes; redaction de CPF/CNPJ/token; append-only intacto; `evaluateProductionReadiness()` = `pronto`; A8 ainda exige autorização separada. | A4 + A8 separada |
| IA (transversal) | Provedor selecionado por configuração; contratos rígidos validados; sem prompt/resposta bruta em log; sem dependência de único fornecedor. | A2 para créditos Lovable |
| UI e vitrine (transversal) | Navegação nova sem quebrar rotas existentes; `/vendas` continua `AMOSTRA` e sem checkout; estados vazios em vez de números inventados. | A5 |

### 9.2 Matriz de permissões — humano / agente / integração

`—` significa "nunca nesta especificação". "Papel" é sempre papel **no tenant**, nunca role global da plataforma.

| Ação | Humano (papel mínimo no tenant) | Agente (`agent_grants` + autonomia) | Integração (`integration_grants`) | Aprovação humana | Gate |
|---|---|---|---|---|---|
| Ler CRM, leads, pipeline e dashboards | `viewer` | `actions` de leitura; qualquer autonomia; `canExecute: false` | escopo `read`, não expirado | não | tenant + kill switch |
| Criar/editar lead, contato, tarefa | `seller` | `semiautonomo`/`autonomo_controlado` com ação e limites | escopo `write` no mesmo tenant | quando proposto por agente semiautônomo | tenant + grant |
| Mover oportunidade de etapa | `seller` | `autonomo_controlado` somente se `actions` contém a ação | escopo `write` | não, se grant válido; sim nos demais níveis | tenant + grant + auditoria |
| Calcular score, margem, funil e leituras | `viewer` | assistido/semiautônomo/autônomo para leitura; números de código puro | escopo `read` | não | tenant + `sem_dados` |
| Preparar proposta e validar desconto | `seller` | `semiautonomo`; `ProposalPreparation` com `canSend`/`canCheckout` falsos | escopo `write` apenas se aprovado em ADR | obrigatória para sair do rascunho | tabela de preço + tenant |
| Aprovar proposta/venda | `manager` | — | — | sim, humano | `approvals` + auditoria |
| Desconto extraordinário, preço, contrato, finança, permissão | `admin`/`owner` | — | — | sempre | hard gate + ADR |
| Rascunhar resposta/lembrete | `seller` | `assistido`; nunca envia | escopo `read` para carregar conversa | envio humano | opt-out + janela 24h |
| Enviar mensagem | `seller` com template aprovado e consentimento | — | somente após ADR oficial (WhatsApp Business/e-mail) | sim | hard gate + A6 |
| Criar/executar automação | `admin`/`owner` | `autonomo_controlado` com grant explícito e kill desligado | escopo `admin`, não expirado | ações em massa sempre | kill switch + logs |
| Excluir, exportar dado pessoal | `admin`/`owner` | — | — | sempre | LGPD + auditoria |
| Publicar conteúdo no site | `admin`/`owner` | — | — | confirmação `SIM` e aprovação válida | `ctl_publish_site` |
| Configuração global, kill switch, studio, personas | operador da plataforma (`requireOperator`) | — | — | `SIM` para liberar kill | fora do tenant |
| Acesso de suporte a dado de tenant | operador global **somente com membership ou grant de suporte aprovado e auditado** | — | — | sim | sem atalho cross-tenant |
| Role global `admin` sozinha | acesso à plataforma, nunca a dado comercial | — | — | — | P6 corrigido na FASE 2 |

### 9.3 Achados herdados de `docs/comercial/17-auditoria-modulos.md`

A auditoria corrigiu `validatePublication`, `devWrite`, os agregados do Kanban, o fuso dos buckets e a redaction dos dados livres da narrativa. Restam três pontos de decisão; a FASE 1 **não altera semântica** e apenas destina cada decisão:

| # | Achado restante | Destino no plano |
|---|---|---|
| 1 | `agentPerformance.conversion_pct` pode passar de 100% | Definir significado da métrica em FASE 11; não alterado aqui. |
| 2 | `contentCycle` não repassa warning de auditoria degenerada | Decidir inclusão de `reasons` em FASE 2/6 sem quebrar interface; não alterado aqui. |
| 3 | Aprovação reaproveitada após troca da conta da persona | Decidir revalidar ou invalidar em FASE 8; hash original continua cobrindo os parâmetros aprovados; não alterado aqui. |

Os itens já corrigidos (Kanban, fuso e redaction) estão registrados em `17-auditoria-modulos.md` e não voltam a constar como pendentes.

---

## 10. Critérios de conclusão da FASE 1

| Critério do roadmap | Resultado documental |
|---|---|
| Documento de arquitetura atualizado aprovado | `docs/comercial/01-arquitetura.md` atualizado com tenant resolution e responsabilidades explícitas; aguarda aprovação formal do operador. |
| Matriz de permissões humano / agente / integração definida | Seção 9.2. |
| Lista de provedores de pagamento e IA selecionados para investigação/manutenção | Seções 6 e 7. Nenhuma integração realizada. |
| Nenhum código alterado por esta entrega documental | Confirmado. Apenas três documentos foram alterados/criados: este arquivo, `docs/comercial/01-arquitetura.md` e o registro de conclusão em `docs/IMPLEMENTATION_ROADMAP.md`. Alterações de código eventualmente presentes na working tree são externas a esta fase e não foram tocadas aqui. |

**Não concluído nesta fase, por bloqueio externo:** aplicação do schema (A2), geração de tipos (A3), execução dos 14 testes de isolamento (A4), ligação real de server functions (A5), integrações oficiais (A6) e qualquer exposição (A8).

---

## 11. Próximos passos

1. Obter aprovação humana deste plano e da arquitetura atualizada.
2. Desbloquear A2: créditos no Lovable e login OAuth do MCP; enviar `13-prompt-lovable.md` **no editor do Lovable**, sem editar migrations à mão.
3. A3: conferir os tipos gerados; não editar `types.ts` manualmente.
4. A4: executar os 14 casos de `14-plano-testes-isolamento.md`; qualquer falha nos casos bloqueantes impede A5.
5. A5: implementar `requireTenantContext`/`requireTenantRole`, migrar entrypoints comerciais e expor agentes na ordem P1 → P2 → P3, preservando a suíte verde (350 testes no estado atual) e a CI verde.
6. Investigar pagamentos e registrar decisão em ADR próprio antes de qualquer integração.
7. A8 permanece fechada até hostname interno, Cloudflare Access + WARP, Cloud Secret e ADR A→B aprovado com CI verde.

---

## 12. Registro documental desta fase

- `docs/FASE1_PLANNING.md` — criado: plano detalhado, sete decisões, critérios de aceite e matriz de permissões.
- `docs/comercial/01-arquitetura.md` — atualizado: camadas existentes com responsabilidades explícitas e resolução de tenant.
- `docs/IMPLEMENTATION_ROADMAP.md` — atualizado apenas com registro de conclusão da FASE 1, preservando o texto já publicado.

Nenhum commit, push, PR, deploy, expose, túnel, domínio, rotação de token ou edição de `.env`/segredo foi realizado por este trabalho.
