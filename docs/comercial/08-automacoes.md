# 08 — Automações (Fase 7)

Primitivas puras para descrever e **planejar** automações comerciais. Este módulo não possui executor, fila, agendador, banco, rota ou UI. Um plano aprovado continua sendo apenas um plano.

Arquivo: `lovable-app/src/lib/core/automacoes.ts`.

## Fluxo coberto

1. O chamador informa `organizationId`, `workflow`, `trigger`, `data`, `grants`, `autonomy`, `asOf` e, opcionalmente, `killEngaged`.
2. `planWorkflowRun` valida tudo, aplica o kill switch e avalia gatilho + condições.
3. Cada etapa passa por `authorizeCommercialAction`, que reutiliza o registry único, o hard gate, o escopo do agente, os grants do tenant e os três níveis de autonomia.
4. O resultado contém `status`, etapas planejadas, `canExecute: false`, `requiresApproval`, razões em pt-BR e auditoria redigida.

## Contratos

| Contrato | Papel |
|---|---|
| `Workflow` | define tenant, finalidade, base legal, `dataKeys`, gatilhos, condições, política de retentativa e etapas |
| `WorkflowTrigger` | evento explícito com `event_id`, `entity_id`, `organization_id` e `occurred_at` |
| `evaluateCondition` / `evaluateConditions` | comparações sobre fatos explícitos; dado ausente ou tipo incompatível vira `sem_dados` e bloqueia |
| `WorkflowStep` | `(agent, action, purpose, params)` restrito à matriz comercial aprovada |
| `RetryPolicy` / `planRetry` | até 3 tentativas, backoff de 0–300 s calculado a partir de `asOf`; nunca agenda nada |
| `evaluateAutomationKillSwitch` | um único sinal global interrompe todos os planos |
| `idempotencyKey` | chave determinística `organização|workflow|evento`; sem hash, clock ou I/O |
| `redactAutomationAudit` | só ids, contagens e razões limitadas; valores de `data` e `params` nunca entram na auditoria |
| `validateWorkflowDefinition` | checa duplicatas, campos declarados, escopo agente/ação e parâmetros com aparência de segredo |

## Gatilhos suportados

`lead_criado`, `lead_qualificado`, `oportunidade_movida`, `conversa_recebida`, `proposta_preparada`, `revisao_manual`.

Não existe gatilho de tempo implícito: o instante sempre vem de `asOf`. Um evento com `occurred_at` no futuro é bloqueado.

## Condições

Operadores: `igual`, `diferente`, `maior_que`, `maior_ou_igual`, `menor_que`, `menor_ou_igual`, `contem`, `nao_contem`, `existe`, `nao_existe`, `em`, `fora`. Modos: `todos` ou `qualquer`. Lista vazia não dispara. Caminhos de dados com `__proto__`, `constructor` ou `prototype` são rejeitados.

Minimização: só as chaves listadas em `dataKeys` podem ser fornecidas como fato; qualquer chave extra bloqueia o plano. Condições só podem referenciar chaves declaradas.

## Autonomia e aprovação

- Sem grant do tenant: etapa `bloqueado`, plano `bloqueado`.
- `assistido` ou `semiautonomo`: etapa `aguardando_aprovacao`.
- `autonomo_controlado` com grant: etapa `preparado`.
- `approvalRequired: true` (padrão) mantém `requiresApproval: true` mesmo quando todas as etapas são `preparado`.
- Em nenhum caso `canExecute` deixa de ser `false`.

Ações sensíveis (`envio_mensagem`, `campanha_em_massa`, `checkout`, `pagamento`, `exclusao`, `exportacao_dados` etc.) não pertencem à matriz `COMMERCIAL_ACTIONS` e são rejeitadas na validação da definição. Nenhuma ferramenta nova foi registrada no `toolRegistry.ts`.

## Retentativa

`planRetry` apenas calcula a próxima tentativa: `attempt`, `nextAttemptAt`, `attemptsRemaining`, `requiresApproval: true`. O retry é `automatic: false` — o reinício depende de pessoa e de aprovação. Atingido o limite, a função devolve `bloqueado` sem data.

## Limites desta fase

- Nenhuma migração, tabela, RLS, tipo gerado, segredo, server function, entrypoint, rota ou componente.
- Nenhum envio, campanha, checkout, pagamento, publicação, scrapping ou automação não oficial.
- Nenhum agendador: não existe relógio interno nem disparo por tempo.
- Instâncias de workflow ainda não são lidas do banco; o schema da Fase 2 permanece sem aplicação.
- Planos não são duráveis: esta camada não grava nada.

## Validação

- `npm run typecheck`, `npm test`, `npm run build` e `git diff --check`.
- Testes em `src/test/automacoes.test.ts`: definição, condições, kill switch, retry, planejamento, falha fechada, idempotência e redação de auditoria.
- A suíte permanece sem dados fictícios apresentados como reais; a vitrine `/vendas` continua `AMOSTRA`.
