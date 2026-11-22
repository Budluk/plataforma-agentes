# 14 — Plano de testes de isolamento (A4)

Plano de verificação do isolamento por tenant, permissões de humanos/agentes/integrações e limites de auditoria. **Não foi executado.** Só pode rodar depois de A2 (schema aplicado) e A3 (tipos gerados).

## Pré-requisitos

- Duas organizações de teste: `org_a` e `org_b`, criadas pelo Lovable.
- Usuário `user_a` membro de `org_a` (`seller`), usuário `user_b` membro de `org_b` (`viewer`) e `operator` sem membership em nenhuma das duas.
- Agente `agent_read` com `agent_grants` de leitura em `org_a`; agente `agent_none` sem grant.
- Integração `integration_ok` com `integration_grants` ativo em `org_a`; integração `integration_expired` com `expires_at` no passado.
- Dados de teste: um lead, uma oportunidade e uma proposta em cada tenant. **Nenhum dado real de cliente.**

A simulação de sessão deve usar os mecanismos do Supabase (`set local role authenticated` e `set local request.jwt.claims`) ajustados às funções `security definer` efetivamente criadas pelo Lovable. O plano abaixo é independente da sintaxe exata dessas funções.

## Casos de teste

| ID | Cenário | Passo | Resultado esperado | Evidência |
|---|---|---|---|---|
| T1 | Leitura entre tenants por humano | `user_a` consulta `leads` filtrando `organization_id = org_b` | Zero linhas; `org_b` invisível | Contagem retornada = 0 com `user_a` |
| T2 | Leitura por humano do próprio tenant | `user_a` consulta `leads` de `org_a` | Somente linhas de `org_a` | Ids retornados conferem com `org_a` |
| T3 | Operador global sem membership | `operator` consulta `leads` | Zero linhas — papel global `admin` **não** é atalho cross-tenant | Contagem = 0 |
| T4 | Agente com grant | `agent_read` consulta `leads` de `org_a` com ação permitida | Leitura permitida | Registro de auditoria com `actor = agent_read` |
| T5 | Agente sem grant | `agent_none` tenta a mesma leitura | Negado; nenhum dado retornado | Erro de RLS/ausência de grant |
| T6 | Integração expirada | `integration_expired` tenta ler `contacts` de `org_a` | Negado por `expires_at` | Nenhuma linha retornada |
| T7 | spoofing de `organization_id` | Cliente envia `organization_id = org_b` em INSERT com `user_a` | Valor do cliente ignorado ou rejeitado; nunca grava em `org_b` | Linha criada em `org_a` ou operação recusada |
| T8 | Tabela append-only | Tentativa de UPDATE em `consent_events` e em `opportunity_moves` | Falha; nenhuma linha alterada | Erro do trigger/policy |
| T9 | Desconto fora do limite | Proposta com desconto acima de `max_discount_pct` | Recusa ou criação de `approvals`; proposta não aprovada automaticamente | Registro de aprovação ou erro |
| T10 | Exportação de dados | Agente solicita exportação de `people` de `org_a` | Exige aprovação e gera auditoria | `approval_events` + `audit_events` com `actor` |
| T11 | Envio por agente | Agente tenta enviar mensagem sem template aprovado | Bloqueado; `canSend = false`; hard gate intacto | Nenhuma linha em `messages` com `sent_at` |
| T12 | Kill switch | Ativar kill switch e tentar mutação comercial | Mutação recusada | Auditoria registra bloqueio |
| T13 | Redação da auditoria | Inserir texto sensível em `detail` e ler `audit_events` | Nenhum prompt, token, CPF ou corpo de mensagem bruto no log | Inspeção do `detail` |
| T14 | Tipos gerados | Comparar tipos do Supabase com as tabelas criadas | Tipos atualizados pelo Lovable; nenhum editado à mão | Diff de tipos sem edição manual |

## Critério de aceite

Todos os 14 casos passam. Qualquer falha em T1, T3, T5, T6, T7, T8, T10, T11 ou T12 **bloqueia A5** — não é aceitável seguir com leitura real enquanto houver vazamento entre tenants ou mutação sem aprovação.

## Registro de execução

Ao executar, preencher: data, autor, schema aplicado (hash/versão do Lovable), resultado por caso e evidência anexada. Este arquivo permanece como plano até que os resultados sejam reais — nenhum resultado deve ser presumido ou preenchido como sucesso sem execução.

## Relação

- `02-modelo-dados.md` — tabelas e campos.
- `03-rls-permissoes.md` — papéis, policies, autonomia e hard gate.
- `13-prompt-lovable.md` — pedido que cria as policies testadas aqui.
- `12-handoff.md` — autorização A4 e critérios de aceite.
