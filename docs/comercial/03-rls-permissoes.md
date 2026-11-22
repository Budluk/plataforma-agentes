# 03 — RLS, permissões e autonomia

## Modelo de acesso

Três categorias de ator, com grant independente:

| Ator | Origem | Onde a permissão vive |
|---|---|---|
| Humano | `auth.uid()` | `memberships(organization_id, user_id, role)` |
| Agente | `agent_id` do CentralIA | `agent_grants(organization_id, agent_id, actions, autonomy)` |
| Integração | conector externo | `integration_grants(organization_id, integration, scopes, expires_at)` |

Funções `security definer` com `search_path = ''` resolvem o tenant e a permissão sem recursão de RLS. Nenhuma policy confia em `organization_id` enviado pelo cliente.

## Papéis de tenant

| Papel | Leitura | Escrita comercial | Aprovação | Administração do tenant |
|---|---|---|---|---|
| `viewer` | sim | não | não | não |
| `seller` | sim | próprios registros e funil | pode solicitar | não |
| `manager` | sim | sim | pode aprovar vendas/propostas | não |
| `admin` | sim | sim | sim | sim, exceto permissões sensíveis |
| `owner` | sim | sim | sim | sim |

O papel global `admin` do operador da plataforma continua existindo para administração do sistema, mas **não** é usado como atalho de leitura cross-tenant. Acesso de suporte a dados de tenant deve ser explícito, auditado e aprovado.

## Políticas RLS por tabela

| Grupo | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `organizations`, `memberships` | membro do tenant | `owner`/`admin` | `owner` |
| `agent_grants`, `integration_grants` | `admin`/`owner` | `admin`/`owner` | `owner` |
| CRM (`people`, `companies`, `contacts`, `addresses`, `notes`, `attachments`) | membro | `seller` nos próprios, `manager`+ em geral | `admin`+ com auditoria |
| `activities`, `tags` | membro | `seller`+ | `admin`+ |
| `leads`, `lead_scores`, `opportunities`, `opportunity_moves` | membro | `seller`+ | `admin`+ |
| `products`, `price_tables`, `price_items` | membro | `admin`/`owner` | `owner` |
| `proposals`, `proposal_items`, `proposal_versions` | `seller`+ | `seller`+ com `max_discount_pct` | `admin`+ |
| `conversations`, `messages`, `templates` | membro ou responsável | `seller`+; envio requer aprovação/permissão | `admin`+ |
| `workflows`, `workflow_runs`, `workflow_steps` | `admin`/`owner` | `admin`/`owner` | `owner` |
| `consent_events`, `audit_events` | `admin`/`owner` | somente funções append-only | **ninguém** |
| `data_subject_requests`, `retention_policies`, `forecasts` | `admin`/`owner` | `admin`/`owner` | `owner` |

## Matriz de autonomia

| Ação | Assistido | Semiautônomo | Autônomo controlado |
|---|---|---|---|
| Analisar pipeline, gerar insights | IA recomenda | IA recomenda | IA executa leitura e registra |
| Criar rascunho de lead/tarefa/proposta | IA recomenda | IA prepara e pede aprov | IA cria dentro de limites |
| Mover oportunidade de etapa | humano executa | aprovação | permitido se `agent_grants.actions` contém a ação |
| Suggest de resposta ao cliente | IA recomenda | IA prepara, humano envia | rascunho + aprovação (envio real vetado pelo hard gate) |
| Desconto dentro da tabela | humano aplica | aprovação | permitido até `max_discount_pct` |
| Desconto extraordinário / preço | aprovação humana | aprovação humana | **sempre aprovação humana** |
| Campanha em massa | aprovação humana | aprovação humana | **sempre aprovação humana** |
| Exclusão, exportação, contratos, finanças, permissões | aprovação humana | aprovação humana | **sempre aprovação humana** |

## Hard gate e kill switch

- `assertNoExecutionTool` continua bloqueando `send_whatsapp`, `launch_campaign`, `checkout`, `payment`, `submit_form`, `git_push`, etc.
- O botão global de interromper automações continua sendo o `kill_switch` atual; toda server function comercial deve checá-lo antes de qualquer mutação.
- Qualquer exceção ao hard gate exige ADR novo, integração oficial, teste em ambiente autorizado e aprovação explícita.

## Auditoria

Toda mutação relevante registra: `run_id`, `organization_id`, `actor` (usuário/agente/integração), `action`, `entity_type`, `entity_id`, resumo redigido, `ts_exact` e resultado. Nunca prompt, resposta bruta, token ou corpo de mensagem sensível. A cadeia de hashes existente em `lovable-app/src/lib/core/canonical.ts` é preservada; `detail` armazenado não é resserializado.
