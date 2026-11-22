# ADR-0010 — Arquitetura comercial multi-tenant (Fase 2)

- Status: **APROVADO em 2026-11-21 para a arquitetura comercial.** Não autoriza escrita manual de schema, exposição de rede, envio real, campanha, checkout ou pagamento. A aplicação do schema depende do editor do Lovable; a execução real depende de ADR específico e integração oficial.
- Data: 2026-11-21
- Fase do plano: Fase 2 — Arquitetura e banco de dados comercial
- Relação: respeita [ADR-0001](./0001-loopback-only.md), [ADR-0004](./0004-auditoria-sem-corpo.md) e o gate A→B de [ADR-0009](./0009-mudanca-alvo-b.md). Não altera o alvo A do CloneStudio.

## Contexto

A auditoria da Fase 1 confirmou que o schema versionado tem 19 tabelas, sem entidades comerciais, sem `tenant_id` e com RLS baseado apenas em `has_role(auth.uid(),'admin')`. O prompt mestre pede CRM, prospecção, funil, agentes, atendimento, automações, propostas e inteligência, com isolamento por organização, LGPD e autonomia controlada.

Também confirmou duas restrições duras do código atual:

- `src/lib/core/hardGate.ts` veta, por token, ferramentas como `send_whatsapp`, `launch_campaign`, `checkout` e `payment`.
- `src/lib/api/*.functions.ts` são todos `requireOperator`, e as escritas de auditoria/approvals/kill switch passam por funções de banco append-only.

## Decisão

1. **Isolamento por `organization_id` em toda tabela comercial nova** e nas tabelas de auditoria existentes que passarem a registrar contexto comercial. Nenhuma leitura ou escrita sem tenant resolvido no servidor.
2. **RLS por associação**, não por role global: `memberships` para humanos, `agent_grants` para agentes e `integration_grants` para integrações. A role `admin` continua sendo a guarda do operador da plataforma, não um atalho para dados de tenants.
3. **Papéis de tenant**: `owner`, `admin`, `manager`, `seller`, `viewer`. Permissões mínimas por tabela e por ação; agente nunca herda permissão humana automática.
4. **Três níveis de autonomia** — `assistido`, `semiautonomo`, `autonomo_controlado` — com matriz explícita de ações que sempre exigem aprovação humana.
5. **Hard gate preservado**: envio real, campanhas, checkout e pagamento continuam vetados como ferramentas executáveis. O que a Fase 2 permite é **preparar** rascunhos e pedir aprovação; execução real depende de ADR novo, integração oficial e testes.
6. **Schema gerenciado pelo Lovable**: este ADR e os documentos em `docs/comercial/` são especificação. Nenhum arquivo em `drizzle/` ou `supabase/migrations/` será editado à mão.
7. **Exposição B/C permanece fora de escopo**, conforme ADR-0001/0009.

## Consequências

- Toda server function comercial precisará resolver `organization_id` a partir da sessão e da associação, nunca de parâmetro do cliente.
- Toda tabela nova precisa de `organization_id`, `created_at`/`updated_at` com precisão existente, `created_by` e policy RLS.
- Toda ação de agente será registrada com `run_id`, `tenant_id`, `agent_id`, `tool`, resumo redigido e `ts_exact`, sem prompt/resposta bruta.
- Prospecção só poderá usar fontes públicas autorizadas, com finalidade, base legal, minimização e oposição registradas.
- O custo é um número maior de tabelas e policies; o benefício é evitar vazamento cross-tenant e dados fictícios apresentados como reais.

## Validação planejada

- Testes unitários dos contratos e da matriz de autonomia em `src/test/`.
- Revisão das policies pelo Lovable e teste de isolamento com dois tenants e um operador.
- CI verde nos jobs `python`, `ui`, `studio-node`, `studio-browser`.

## Limites que permanecem

- Nenhuma chave de API em repositório ou browser.
- Nenhum dado pessoal coletado sem base legal e finalidade registradas.
- Nenhum agente com permissão de envio, desconto, exclusão, exportação ou alteração de permissões sem aprovação humana.
- A aprovação cobre apenas a especificação. Nada acima é considerado implementado até o schema ser aplicado no Lovable, os tipos serem gerados e as policies RLS passarem no teste de isolamento entre dois tenants.
