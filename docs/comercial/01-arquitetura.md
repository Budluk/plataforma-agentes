# 01 — Arquitetura comercial

## Camadas (inalteradas)

| Camada | Diretório | Papel na área comercial |
|---|---|---|
| Contratos e regras puras | `lovable-app/src/lib/core/` | Zod schemas, cálculo de score, matriz de autonomia, formatação BRL, sem I/O |
| Orquestração | `lovable-app/src/lib/server/*.server.ts` | Resolver tenant, carregar dados, chamar LLM, auditar, aplicar gates |
| Entrypoints | `lovable-app/src/lib/api/*.functions.ts` | Sempre `requireOperator`, retorno via `outcomeDto`/`toJson` |
| Banco | Supabase/Postgres gerenciado pelo Lovable | Tabelas, RLS, funções append-only de auditoria/approvals/kill switch |
| UI | `lovable-app/src/routes/_authenticated/_app/` | Extensão do `NAV`, páginas por módulo, componentes existentes |

Nenhuma camada nova é introduzida. Um módulo comercial não pode chamar Supabase diretamente do browser; toda mutação passa por server function.

## Fluxo de uma ação de agente

1. Usuário autenticado aciona entrypoint `requireOperator`.
2. Servidor resolve `organization_id` a partir da sessão e `memberships` — nunca do payload.
3. Servidor verifica `kill_switch` e a permissão do agente em `agent_grants`.
4. Ferramenta é validada pelo `toolRegistry` e pelo `ToolMonitor` (veto → registry → params → sequência → rate).
5. LLM é chamado por `llm.server.ts`, com contrato rígido e saída em JSON validado.
6. Resultado é calculado por código puro; campos ausentes viram `status: "sem_dados"`.
7. Auditoria registra `run_id`, `tenant_id`, `agent_id`, `tool`, resumo e `ts_exact` via função de banco; sem prompt/resposta bruta.
8. Se a ação for sensível, cria `approvals` e devolve "preparado, aguardando aprovação" — nunca executa.

## Autonomia

Os níveis são `assistido`, `semiautonomo` e `autonomo_controlado`. A matriz completa está em `03-rls-permissoes.md`. O princípio é: **quanto maior o efeito externo, mais aprovação**. Mesmo no nível autônomo controlado, descontos extraordinários, preços, campanhas em massa, exclusões, exportações, contratos, compromissos financeiros e permissões exigem humano.

## Hard gate existente

`src/lib/core/hardGate.ts` barra ferramentas cujo nome contém `send_whatsapp`, `launch_campaign`, `checkout`, `payment` e outros tokens de execução. O desenho comercial respeita isso:

- ferramentas de **leitura/preparação** podem entrar no `toolRegistry`;
- ferramentas de **envio/cobrança** continuam fora até ADR específico, integração oficial e testes em ambiente autorizado;
- o botão global de parada continua sendo o `kill_switch` atual.

## Dados e tempo

- Moeda: BRL. Valores monetários modelados em centavos inteiros (`amount_cents`) para evitar deriva de ponto flutuante.
- Fuso: `America/Sao_Paulo` para exibição; comparações e armazenamento seguem o padrão ISO com offset já usado em `dashboard.ts`.
- Nenhum renderer lê relógio: `generatedAt`/`asOf` são sempre parâmetros explícitos.

## Integrações

Nenhuma integração é instalada nesta fase. O desenho prevê conectores futuros atrás de `integration_grants`, com escopo por tenant, segredos em Cloud Secrets e logs redigidos. WhatsApp apenas via Business API oficial; publicação social permanece simulada.
