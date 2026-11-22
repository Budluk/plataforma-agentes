# 13 — Prompt único para o Lovable (Fase 2)

Este arquivo contém **um único bloco pronto para colar** no chat do editor do Lovable. Ele consolida `02-modelo-dados.md`, `03-rls-permissoes.md` e `05-especificacao-lovable.md` para que a Fase 2 possa ser aplicada em uma única interação.

- Status: **pronto para envio**. O ADR [0010](../adr/0010-arquitetura-comercial-multitenant.md) foi aprovado em 2026-11-21 (A1).
- Não foi aplicado. O Lovable MCP está desconectado, então a aplicação deve ser feita por você no editor.
- Não substitui revisão humana nem os testes de isolamento entre tenants da seção final.
- Fora de escopo: edição manual de `supabase/migrations/` ou `drizzle/`, segredos, domínio, túnel, exposição e alteração do hard gate.

## Prompt — copiar o bloco abaixo

```text
Aplique a Fase 2 da plataforma comercial multi-tenant no projeto Supabase conectado. Use o editor do Lovable para criar tabelas, funções e policies; não edite migrations à mão. Atualize os tipos gerados ao final e rode as validações listadas no fim.

O ADR-0010 foi aprovado como especificação. Respeite o schema existente (19 tabelas) e o padrão append-only já usado por audit_events, approvals e kill_switch.

REGRAS GLOBAIS OBRIGATÓRIAS
1. Toda tabela comercial com organization_id uuid not null referenciando organizations(id).
2. created_at/updated_at com a precisão existente; created_by uuid referenciando auth.users(id) quando aplicável. Tabelas append-only não têm updated_at.
3. RLS habilitado em todas as tabelas novas; policies resolvidas por memberships, agent_grants e integration_grants, com funções security definer e search_path = ''. Nenhuma policy confia em organization_id enviado pelo cliente.
4. Nenhuma policy usando somente has_role(auth.uid(),'admin') para dados de tenant. O papel global admin serve para administração do sistema, não como atalho cross-tenant.
5. Append-only: consent_events, activity_log, audit_events comerciais, approval_events e opportunity_moves aceitam somente INSERT por funções de banco; sem UPDATE/DELETE para o cliente.
6. document_token é HMAC com chave em Cloud Secret, nunca no repositório nem no browser. document_last4 serve apenas para conferência visual. CPF/CNPJ não são armazenados em claro.
7. Valores monetários em bigint centavos; currency text com padrão BRL.
8. Timestamps com offset; exibição em America/Sao_Paulo feita na aplicação.
9. pipeline_stages com as 11 etapas padrão, configuráveis por tenant, nesta ordem: lead_recebido, lead_identificado, primeiro_contato, qualificacao, reuniao_demo, proposta_enviada, negociacao, fechamento, venda_ganha, venda_perdida, pos_venda.
10. workflow_runs e workflow_steps com attempts, status, error_summary e limites de tentativa.
11. Atualize os tipos gerados ao final; não os edite à mão.
12. Crie índices em organization_id, lead_id, opportunity_id, contact_id, conversation_id, proposal_id e created_at.
13. Crie política de storage para attachments, com organization_id no path e URLs controladas.
14. Não crie nenhuma função que envie mensagens, campanhas, pagamentos ou execute código. Nenhuma ferramenta de envio real, checkout ou pagamento.

NÚCLEO MULTI-TENANT
- organizations: id, name, slug unico, timezone padrao America/Sao_Paulo, currency padrao BRL, active.
- memberships: organization_id, user_id, role (owner, admin, manager, seller, viewer), active.
- agent_grants: organization_id, agent_id, actions text[], autonomy, active.
- integration_grants: organization_id, integration, scopes text[], active, expires_at.

CRM
- people: display_name, document_token, document_last4, document_kind (cpf, cnpj, none), consent_status, owner_user_id.
- companies: name, document_token, document_last4, segment, size_band, website, owner_user_id.
- contacts: person_id?, company_id?, kind (email, phone, whatsapp, other), value, verified_at, preferred_channel, opted_out, locale.
- addresses: person_id?, company_id?, line1, line2, city, state, postal_code, country padrao BR.
- tags / entity_tags: tag por tenant e vinculo polimorfico entity_type/entity_id.
- notes: entity_type, entity_id, author, body, visible_to_agent.
- attachments: entity_type, entity_id, storage_path, mime, size_bytes, uploaded_by.
- activities: entity_type, entity_id, kind, direction, subject, body, due_at, completed_at, owner_user_id, source.
- customer_360: view consolidada de pessoa/empresa, contatos, atividades, oportunidades, propostas e consentimentos do tenant.

LEADS E FUNIL
- lead_sources: key, label, authorized, legal_basis.
- leads: person_id?, company_id?, source_id, status, fit_score, interest_score, ability_score, urgency_score, interaction_score, score, score_status, score_reason, owner_user_id, next_action.
- lead_scores: lead_id, snapshot, reasons, computed_at, model_version.
- opportunities: lead_id?, person_id?, company_id?, title, stage_id, amount_cents, probability, expected_close_date, owner_user_id, next_activity_at, loss_reason, won_at, lost_at.

CATALOGO, PROPOSTAS E VENDAS
- products: sku, name, description, category, unit, active, rules.
- price_tables / price_items: vigencia, currency BRL, amount_cents, min_qty, max_discount_pct.
- proposals: opportunity_id, customer_id, version, status, valid_until, subtotal_cents, discount_cents, tax_cents, total_cents, payment_terms, approval_id, created_by.
- proposal_items: proposal_id, product_id?, description, qty, unit_price_cents, discount_pct, tax_pct.
- proposal_versions: snapshot JSON imutavel da proposta, version, created_at, actor.
- orders / order_items: vinculo com proposta, amount_cents, paid_at, status. Sem integracao de pagamento.
- Regra: nenhum agente cria preco, desconto ou condicao fora de price_items.max_discount_pct. Desconto extraordinario gera approvals.

ATENDIMENTO E AUTOMACOES
- conversations: contact_id, channel, subject, status, priority, assignee_user_id, agent_id?, last_message_at.
- messages: conversation_id, direction, body, template_id?, sent_at, delivered_at, approved_by, source_id.
- message_templates: channel, key, body, variables, active, approved_at.
- workflows: key, trigger, conditions, steps, active, version.
- workflow_runs: workflow_id, trigger_ref, status, attempts, started_at, finished_at, error_summary.
- workflow_steps: run_id, step, status, actor, detail, created_at.

LGPD E INTELIGENCIA
- consent_events: data_subject_ref, purpose, legal_basis, channel, granted_at, revoked_at, source, evidence_ref. Append-only.
- data_subject_requests: kind (acesso, correcao, exclusao, oposicao, portabilidade), status, due_at, resolved_at, actor.
- retention_policies: entity_type, retention_days, basis, active.
- forecasts: scope, period, value_cents, confidence, inputs, limitations, computed_at.

PAPEIS DE TENANT
- viewer: leitura; sem escrita, aprovacao ou administracao.
- seller: leitura; escrita de proprios registros e funil; pode solicitar aprovacao.
- manager: leitura e escrita; pode aprovar vendas e propostas.
- admin: leitura e escrita; aprova; administra o tenant exceto permissoes sensiveis.
- owner: tudo, inclusive permissoes sensiveis.

RLS POR GRUPO
- organizations, memberships: SELECT membro; INSERT/UPDATE owner/admin; DELETE owner.
- agent_grants, integration_grants: SELECT/INSERT/UPDATE admin/owner; DELETE owner.
- CRM (people, companies, contacts, addresses, notes, attachments): SELECT membro; INSERT/UPDATE seller nos proprios e manager+ em geral; DELETE admin+ com auditoria.
- activities, tags: SELECT membro; INSERT/UPDATE seller+; DELETE admin+.
- leads, lead_scores, opportunities, opportunity_moves: SELECT membro; INSERT/UPDATE seller+; DELETE admin+.
- products, price_tables, price_items: SELECT membro; INSERT/UPDATE admin/owner; DELETE owner.
- proposals, proposal_items, proposal_versions: SELECT/INSERT/UPDATE seller+ respeitando max_discount_pct; DELETE admin+.
- conversations, messages, templates: SELECT membro ou responsavel; INSERT/UPDATE seller+, envio requer aprovacao/permissao explicita; DELETE admin+.
- workflows, workflow_runs, workflow_steps: SELECT/INSERT/UPDATE admin/owner; DELETE owner.
- consent_events, audit_events: SELECT admin/owner; INSERT somente funcoes append-only; DELETE ninguem.
- data_subject_requests, retention_policies, forecasts: SELECT/INSERT/UPDATE admin/owner; DELETE owner.

AUTONOMIA
- Analisar pipeline e gerar insights: assistido/semiautonomo recomenda; autonomo controlado executa leitura e registra.
- Criar rascunho de lead, tarefa ou proposta: assistido recomenda; semiautonomo prepara e pede aprovacao; autonomo cria dentro de limites.
- Mover oportunidade de etapa: humano executa; semiautonomo com aprovacao; autonomo somente se agent_grants.actions contem a acao.
- Sugestao de resposta ao cliente: sempre rascunho + aprovacao; envio real continua vetado pelo hard gate.
- Desconto dentro da tabela: humano aplica; semiautonomo com aprovacao; autonomo ate max_discount_pct.
- Desconto extraordinario, preco, campanha em massa, exclusao, exportacao, contratos, financas e permissoes: sempre aprovacao humana.
- kill_switch e assertNoExecutionTool continuam ativos e inalterados. Toda server function comercial deve checar o kill switch antes de qualquer mutacao.

INVARIANTES
1. Toda linha comercial pertence a exatamente um organization_id.
2. Lead duplicado so e unificado com confirmacao humana e registro em activity_log.
3. Toda previsao traz confidence, inputs e limitations; sem dados, status sem_dados.
4. Toda mensagem enviada por agente passa por aprovacao ou permissao explicita e registrada.
5. Nenhuma tabela guarda segredo, token de API ou corpo bruto de prompt/resposta de LLM.
6. Toda mutacao relevante registra run_id, organization_id, actor, action, entity_type, entity_id, resumo redigido, ts_exact e resultado. Nunca prompt, resposta bruta, token ou corpo de mensagem sensivel.

VALIDACOES OBRIGATORIAS (informe o resultado de cada uma)
- Dois tenants de teste, um usuario em cada um e um operador: confirmar que nenhum ve dados do outro.
- Um agente com grant de leitura e outro sem grant: confirmar bloqueio.
- Tentativa de UPDATE em tabela append-only: confirmar falha.
- Insercao de proposta com desconto acima de max_discount_pct: confirmar recusa ou criacao de approvals.
- Exportacao de dados: confirmar que exige aprovacao e gera auditoria.
- Confirmar que os tipos gerados foram atualizados e que nenhum segredo foi escrito no repositorio.
```

## Depois que o Lovable aplicar

Só então A3–A6 podem retomar: conferir os tipos gerados, implementar server functions com `requireOperator` e resolução de tenant, registrar ferramentas no `toolRegistry` sem nomes vetados e executar a CI completa.

## Referências

- `01-arquitetura.md` — fronteiras entre core, servidor, API e banco.
- `02-modelo-dados.md` — entidades e relacionamentos.
- `03-rls-permissoes.md` — RLS, papéis, autonomia e hard gate.
- `04-lgpd-integracoes.md` — consentimento, retenção e integrações.
- `05-especificacao-lovable.md` — instrução original em formato de pedido.
- `12-handoff.md` — autorizações A1–A8 e critérios de aceite.
