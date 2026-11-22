# 02 — Modelo de dados comercial (especificação para o Lovable)

Todas as tabelas abaixo são **novas**. Nenhuma foi criada nesta fase. Colunas de auditoria padrão em todas: `organization_id`, `created_at`, `updated_at`, `created_by`. Tabelas append-only (`consent_events`, `activity_log`, `audit_events` comercial) não têm `updated_at`.

## Núcleo multi-tenant

| Tabela | Finalidade | Campos principais |
|---|---|---|
| `organizations` | Tenant raiz | `id`, `name`, `slug` único, `timezone` padrão `America/Sao_Paulo`, `currency` padrão `BRL`, `active` |
| `memberships` | Humanos por tenant | `organization_id`, `user_id`, `role` (`owner`,`admin`,`manager`,`seller`,`viewer`), `active` |
| `agent_grants` | Permissões de agentes | `organization_id`, `agent_id`, `actions` (text[]), `autonomy`, `active` |
| `integration_grants` | Permissões de integrações | `organization_id`, `integration`, `scopes` (text[]), `active`, `expires_at` |

## CRM

| Tabela | Finalidade | Campos principais |
|---|---|---|
| `people` | Pessoas físicas | `organization_id`, `display_name`, `document_token` (hash HMAC), `document_last4`, `document_kind` (`cpf`,`cnpj`,`none`), `consent_status`, `owner_user_id` |
| `companies` | Empresas | `organization_id`, `name`, `document_token`, `document_last4`, `segment`, `size_band`, `website`, `owner_user_id` |
| `contacts` | Pontos de contato | `organization_id`, `person_id?`, `company_id?`, `kind` (`email`,`phone`,`whatsapp`,`other`), `value`, `verified_at`, `preferred_channel`, `opted_out`, `locale` |
| `addresses` | Endereços | `organization_id`, `person_id?`, `company_id?`, `line1`, `line2`, `city`, `state`, `postal_code`, `country` padrão `BR` |
| `tags` / `entity_tags` | Segmentação | tag por tenant, vínculo polimórfico com `entity_type`/`entity_id` |
| `notes` | Anotações | `organization_id`, `entity_type`, `entity_id`, `author`, `body`, `visible_to_agent` |
| `attachments` | Arquivos | `organization_id`, `entity_type`, `entity_id`, `storage_path`, `mime`, `size_bytes`, `uploaded_by` |
| `activities` | Histórico e tarefas | `organization_id`, `entity_type`, `entity_id`, `kind`, `direction`, `subject`, `body`, `due_at`, `completed_at`, `owner_user_id`, `source` |
| `customer_360` (view) | Ficha consolidada | junção de pessoa/empresa, contatos, atividades, oportunidades, propostas e consentimentos do tenant |

Documentos sensíveis (CPF/CNPJ) não são armazenados em claro: `document_token` é HMAC com chave em Cloud Secret; `document_last4` serve apenas para conferência visual. O valor integral só entra se houver finalidade e base legal registradas.

## Leads e funil

| Tabela | Finalidade | Campos principais |
|---|---|---|
| `lead_sources` | Origens configuráveis | `organization_id`, `key`, `label`, `authorized`, `legal_basis` |
| `leads` | Lead | `organization_id`, `person_id?`, `company_id?`, `source_id`, `status`, `fit_score`, `interest_score`, `ability_score`, `urgency_score`, `interaction_score`, `score`, `score_status`, `score_reason`, `owner_user_id`, `next_action`, `created_at` |
| `lead_scores` | Histórico de score | `organization_id`, `lead_id`, `snapshot`, `reasons`, `computed_at`, `model_version` |
| `pipeline_stages` | Etapas configuráveis | `organization_id`, `key`, `label`, `position`, `probability_default`, `active` |
| `opportunities` | Oportunidade | `organization_id`, `lead_id?`, `person_id?`, `company_id?`, `title`, `stage_id`, `amount_cents`, `probability`, `expected_close_date`, `owner_user_id`, `next_activity_at`, `loss_reason`, `won_at`, `lost_at` |
| `opportunity_moves` | Histórico do Kanban | `organization_id`, `opportunity_id`, `from_stage_id`, `to_stage_id`, `actor`, `reason`, `moved_at` |

Etapas padrão sugeridas: `lead_recebido`, `lead_identificado`, `primeiro_contato`, `qualificacao`, `reuniao_demo`, `proposta_enviada`, `negociacao`, `fechamento`, `venda_ganha`, `venda_perdida`, `pos_venda`. A ordem é configurável por tenant.

## Catálogo, propostas e vendas

| Tabela | Finalidade | Campos principais |
|---|---|---|
| `products` | Produtos/serviços | `organization_id`, `sku`, `name`, `description`, `category`, `unit`, `active`, `rules` |
| `price_tables` / `price_items` | Tabelas de preço | vigência, `currency` `BRL`, `amount_cents`, `min_qty`, `max_discount_pct` |
| `proposals` | Proposta | `organization_id`, `opportunity_id`, `customer_id`, `version`, `origin` (`real`/`amostra`, obrigatório), `status`, `valid_until`, `subtotal_cents`, `discount_cents`, `tax_cents`, `total_cents`, `payment_terms`, `approval_id`, `created_by` |
| `proposal_items` | Itens | `proposal_id`, `product_id?`, `description`, `origin` (`real`/`amostra`), `sample` (boolean), `qty`, `unit_price_cents`, `discount_pct`, `tax_pct` |
| `proposal_versions` | Histórico imutável | snapshot JSON da proposta, `version`, `created_at`, `actor` |
| `orders` / `order_items` | Venda concluída | vínculo com proposta, `amount_cents`, `paid_at`, `status` — sem integração de pagamento nesta fase |

Regra: nenhum agente cria preço, desconto ou condição fora de `price_items.max_discount_pct`. Desconto extraordinário gera `approvals`.

## Atendimento e automações

| Tabela | Finalidade | Campos principais |
|---|---|---|
| `conversations` | Conversa unificada | `organization_id`, `contact_id`, `channel`, `subject`, `status`, `priority`, `assignee_user_id`, `agent_id?`, `last_message_at` |
| `messages` | Mensagem | `conversation_id`, `direction`, `body`, `template_id?`, `sent_at`, `delivered_at`, `approved_by`, `source_id` |
| `message_templates` | Modelos | `organization_id`, `channel`, `key`, `body`, `variables`, `active`, `approved_at` |
| `workflows` | Automação | `organization_id`, `key`, `trigger`, `conditions`, `steps`, `active`, `version` |
| `workflow_runs` | Execução | `workflow_id`, `trigger_ref`, `status`, `attempts`, `started_at`, `finished_at`, `error_summary` |
| `workflow_steps` | Log por passo | `run_id`, `step`, `status`, `actor`, `detail`, `created_at` |

## LGPD e inteligência

| Tabela | Finalidade | Campos principais |
|---|---|---|
| `consent_events` | Append-only | `organization_id`, `data_subject_ref`, `purpose`, `legal_basis`, `channel`, `granted_at`, `revoked_at`, `source`, `evidence_ref` |
| `data_subject_requests` | Titular | `organization_id`, `kind` (`acesso`,`correcao`,`exclusao`,`oposicao`,`portabilidade`), `status`, `due_at`, `resolved_at`, `actor` |
| `retention_policies` | Retenção | `organization_id`, `entity_type`, `retention_days`, `basis`, `active` |
| `forecasts` | Previsão | `organization_id`, `scope`, `period`, `value_cents`, `confidence`, `inputs`, `limitations`, `computed_at` |

## Invariantes

1. Toda linha comercial pertence a exatamente um `organization_id`.
2. Lead duplicado só é unificado com confirmação humana e registro em `activity_log`.
3. Toda previsão traz `confidence`, `inputs` e `limitations`; sem dados, `status: "sem_dados"`.
4. Toda mensagem enviada por agente passa por aprovação ou por permissão explícita e registrada.
5. Nenhuma tabela guarda segredo, token de API ou corpo bruto de prompt/resposta de LLM.
