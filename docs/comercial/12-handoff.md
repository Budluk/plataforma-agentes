# 12 — Handoff e autorizações pendentes

Estado ao final do roadmap de 10 fases: as Fases 1–10 estão entregues como relatórios, contratos puros e documentação. **Nenhuma autorização abaixo foi executada.**

## Estado atual

- Nada foi commitado, pushado, mesclado, deployado, exposto, tunelado ou associado a domínio.
- Nenhuma `.env` de produção foi editada e nenhum token foi rotacionado.
- O schema da Fase 2 não foi aplicado; os tipos do Supabase não foram gerados; o Lovable MCP não está conectado.
- O ADR [0010](../adr/0010-arquitetura-comercial-multitenant.md) continua como minuta.
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
| A7 | Autorizar commit/push/PR | Versiona o trabalho; o branch publicado não pode ter histórico reescrito | A1–A6 estáveis |
| A8 | Autorizar deploy, expose, tunnel ou domínio | Muda ambiente; o preflight precisa estar `pronto` e a autorização deve ser explícita e separada | A7 + testes em ambiente autorizado |

Ordem recomendada: **A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8**.

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

Diga explicitamente qual autorização deseja iniciar — normalmente **A1 (aprovar o ADR 0010)**. Enquanto isso, posso preparar, sem enviar nada:

1. uma revisão do texto do ADR 0010 para aprovação;
2. o conteúdo de `05-especificacao-lovable.md` convertido em mensagem pronta para o editor do Lovable;
3. um plano de testes de isolamento entre dois tenants para A4.
