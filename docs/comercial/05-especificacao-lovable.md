# 05 — Especificação a enviar ao Lovable (Fase 2)

Este documento é o texto a ser enviado ao Lovable **somente após aprovação do ADR-0010**. Não foi aplicado. Não substitui revisão do time nem testes de RLS.

## Pedido

> Crie, no projeto Supabase conectado, as tabelas e políticas descritas em `docs/comercial/02-modelo-dados.md` e `03-rls-permissoes.md`, mantendo o padrão já existente de funções append-only para `audit_events`, `approvals` e `kill_switch`.
>
> Requisitos obrigatórios:
>
> 1. Toda tabela comercial com `organization_id uuid not null` referenciando `organizations(id)`.
> 2. `created_at`/`updated_at` com a precisão existente, `created_by uuid` referenciando `auth.users(id)` quando aplicável.
> 3. RLS habilitado em todas as tabelas novas; policies por `memberships`, `agent_grants` e `integration_grants`, com funções `security definer` e `search_path = ''`.
> 4. Nenhuma policy usando somente `has_role(auth.uid(),'admin')` para dados de tenant.
> 5. `consent_events`, `audit_events`, `approval_events` e `opportunity_moves` append-only: somente INSERT por funções de banco; sem UPDATE/DELETE para o cliente.
> 6. `document_token` como HMAC; a chave deve ficar em Cloud Secret, nunca no repositório ou no browser.
> 7. Valores monetários em `bigint` centavos, `currency text` padrão `BRL`.
> 8. Timestamps com offset; exibição em `America/Sao_Paulo` feita na aplicação.
> 9. `pipeline_stages` com as 11 etapas padrão, configuráveis por tenant.
> 10. `workflow_runs`/`workflow_steps` com `attempts`, `status`, `error_summary` e limites de tentativa.
> 11. Tipos gerados pelo Lovable devem ser atualizados após a criação das tabelas; não editar à mão.
> 12. Criar Índices: `organization_id`, `lead_id`, `opportunity_id`, `contact_id`, `conversation_id`, `proposal_id`, `created_at`.
> 13. Criar política de storage para `attachments`, com `organization_id` no path e URLs controladas.
> 14. Não criar nenhuma função que envie mensagens, campanhas, pagamentos ou execute código.

## Validação a pedir junto

- Dois tenants de teste, um usuário em cada um e um operador: confirmar que nenhum vê dados do outro.
- Um agente com grant de leitura e outro sem grant: confirmar bloqueio.
- Tentativa de UPDATE em tabela append-only: confirmar falha.
- Inserção de proposta com desconto acima de `max_discount_pct`: confirmar recusa ou criação de `approvals`.
- Exportação de dados: confirmar que exige aprovação e gera auditoria.

## O que este projeto fará depois que o Lovable aplicar

1. Atualizar os tipos gerados (feito pelo próprio Lovable).
2. Implementar server functions com `requireOperator` e resolução de tenant.
3. Registrar novas ferramentas no `toolRegistry`, sem nomes de execução vetados.
4. Implementar gates puros e testes na Fase 3 em diante.
5. Executar CI completa antes de qualquer entrega.

## Fora desta especificação

- Mudanças em `drizzle/`, `supabase/migrations/`, segredos, domínio, túnel, exposição pública.
- Alteração do hard gate para permitir envio real ou campanhas.
- Qualquer dado de cliente real em ambiente de teste.
