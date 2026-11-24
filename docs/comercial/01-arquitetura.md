# 01 — Arquitetura comercial

> Atualização da FASE 1 (2026-11-24): as camadas físicas seguem as mesmas; o que muda é a explicitação das responsabilidades de tenant, grants e auditoria dentro delas. O plano completo está em `docs/FASE1_PLANNING.md`. A2 continua bloqueada — nada abaixo foi aplicado ao banco.

## Camadas (físicas inalteradas)

| Camada | Diretório | Papel na área comercial |
|---|---|---|
| Contratos e regras puras | `lovable-app/src/lib/core/` | Zod schemas, cálculo de score, matriz de autonomia, formatação BRL, sem I/O |
| Orquestração | `lovable-app/src/lib/server/*.server.ts` | Resolver tenant, carregar dados, chamar LLM, auditar, aplicar gates |
| Entrypoints | `lovable-app/src/lib/api/*.functions.ts` | Sempre `requireOperator`, retorno via `outcomeDto`/`toJson` |
| Banco | Supabase/Postgres gerenciado pelo Lovable | Tabelas, RLS, funções append-only de auditoria/approvals/kill switch |
| UI | `lovable-app/src/routes/_authenticated/_app/` | Extensão do `NAV`, páginas por módulo, componentes existentes |

Nenhuma camada física nova é introduzida. As responsabilidades abaixo passam a ser explícitas dentro dessas camadas:

| Responsabilidade transversal | Onde vive | Papel |
|---|---|---|
| Contexto de tenant | `src/lib/api/operator.ts` + entrypoints + `src/lib/server/*.server.ts` | Resolver `organization_id` da sessão e de `memberships`, nunca do payload |
| Grants e política | `src/lib/core/commercial-agents.ts`, `seguranca.ts` + `agent_grants`/`integration_grants` | Aplicar papel do tenant, autonomia, kill switch e hard gate antes da ação |
| Auditoria | `canonical.ts` + RPCs append-only existentes | Registrar `run_id`, `organization_id`, `actor`, `action`, resumo redigido e `ts_exact` |

Um módulo comercial não pode chamar Supabase diretamente do browser; toda mutação passa por server function.

## Resolução de tenant (detalhamento da FASE 1)

A role global `admin` do operador continua sendo a guarda da plataforma, mas **nunca** é atalho de leitura ou escrita cross-tenant. A sequência obrigatória para qualquer entrypoint comercial é:

1. `requireSupabaseAuth` fornece `userId` e `claims` da sessão.
2. `current_organization_ids()` devolve os tenants ativos do usuário em `memberships`.
3. Um `organization_id` enviado pelo cliente é apenas **seleção**: só vale se estiver na lista da etapa 2; caso contrário, falha fechada.
4. Sem seleção: usar o tenant único; com zero ou vários tenants, falhar com `tenant_ausente` / `tenant_multiplo` — nunca escolher o primeiro automaticamente.
5. `has_tenant_role(organization_id, papéis)` aplica o papel mínimo da ação: `viewer` para leitura, `seller` para escrita comercial, `manager` para aprovação, `admin`/`owner` para administração do tenant.
6. Ações de agente ainda exigem `agent_grants.actions`, autonomia, `kill_switch` desligado e ferramenta presente no `toolRegistry`.
7. O `organization_id` resolvido é injetado no contexto da server function e no `Runtime`, e acompanha toda auditoria.

`requireOperator` permanece para funções da plataforma (overview, configurações, studio, kill switch global). Entrypoints comerciais usarão `requireTenantContext` e `requireTenantRole`, a especificar na FASE 2. A vitrine `/vendas` continua operando com dados `AMOSTRA` e sem resolução de tenant até a ligação real da FASE 4. O mapeamento por arquivo está em `docs/FASE1_PLANNING.md`, seção 4.3.

## Fluxo de uma ação de agente

1. Usuário autenticado aciona entrypoint `requireOperator`.
2. Servidor resolve `organization_id` a partir da sessão e `memberships` — nunca do payload.
3. Servidor verifica `kill_switch` e a permissão do agente em `agent_grants`.
4. Ferramenta é validada pelo `toolRegistry` e pelo `ToolMonitor` (veto → registry → params → sequência → rate).
5. LLM é chamado por `llm.server.ts`, com contrato rígido e saída em JSON validado.
6. Resultado é calculado por código puro; campos ausentes viram `status: "sem_dados"`.
7. Auditoria registra `run_id`, `organization_id`, `agent_id`, `tool`, resumo e `ts_exact` via função de banco; sem prompt/resposta bruta.
8. Se a ação for sensível, cria `approvals` e devolve "preparado, aguardando aprovação" — nunca executa.

## Classificação dos entrypoints

| Classe | Entrypoints | Regra de tenant |
|---|---|---|
| Plataforma | `getOverview`, `getFinanceState`, `runCentral`, `runFinance`, `runMusic`, `runResearch`, `runDev*`, `listHistory`, `listEventLogs`, `settings.functions.ts`, `studio.functions.ts`, `killSwitch` | `requireOperator`; não leem dado comercial de tenant |
| Vitrine `AMOSTRA` | `runSales`, `runFunnel`, `writeSalesNarrative`, páginas de `/vendas` | Dados ilustrantes e rotulados; sem catálogo real, checkout ou pagamento |
| Comercial real (planejado) | Leituras e preparações dos nove agentes, CRM, pipeline, propostas, atendimento e analytics | `requireTenantContext` + `requireTenantRole` + grants; somente após A2–A5 |
| Aprovação e auditoria | `listApprovals`, `decideApproval`, `executeApproval`, `getAudit` | `approvals` e `audit_events` com `organization_id`; aprovador com papel no tenant |

`publications.functions.ts` permanece no fluxo de publicação do site, com confirmação `SIM` e cópia pública já liberada; se passar a publicar conteúdo de tenant, exigirá seleção de tenant validada e aprovação específica.

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

A FASE 1 separa duas frentes de investigação, ambas sem execução:

- **Pagamentos:** investigar Stripe, Mercado Pago, PayPal e provedores brasileiros (Pix, boleto e cartão nacional) quanto a BRL, webhooks assinados, idempotência, reembolsos, assinaturas e tokenização. Somente documentação pública; qualquer integração depende de ADR específico e de validação do provedor, nunca do retorno do navegador.
- **IA:** manter Lovable AI Gateway (caminho padrão, sujeito a créditos) e Groq (quando `GROQ_API_KEY` estiver configurada) atrás de `llm.server.ts`, sem chamada direta a SDK de provedor nos agentes e sem chave em browser/repositório.

A auditoria local `docs/comercial/17-auditoria-modulos.md` registra 26 arquivos / 350 testes OK e CI verde no commit `1537afe`; cinco achados foram corrigidos no lote de 2026-11-24 e os três restantes seguem sem mudança de semântica, destinados a decisões no plano da FASE 1. A8 permanece bloqueada: nenhum deploy, expose, túnel ou domínio foi feito.
