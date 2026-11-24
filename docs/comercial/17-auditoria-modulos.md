# Auditoria local dos módulos restantes (2026-11-24)

Escopo: `publications.ts`, `publications.functions.ts`, `sales-narrative.ts`, `toolRegistry.ts`, `pipeline.ts`, `crm-dashboard.ts`, `dashboard.ts`, `pipelines.server.ts` e testes associados. Auditoria local, sem banco, sem MCP, sem exposição e sem deploy.

## Achados corrigidos

1. **`validatePublication` (`publications.ts`)** — `JSON.parse(approval.params_json)` podia lançar `SyntaxError` cru, e `PublishPost.parse` lançava `ZodError` em inglês, ambos sem mensagem operacional em pt-BR. Agora há `try/catch` com `Parâmetros da aprovação ilegíveis.`, validação `safeParse` com `Parâmetros da aprovação fora do contrato.` e o mesmo hash canonical. Nenhuma publicação é liberada com parâmetros corrompidos ou fora do contrato.
2. **`devWrite` (`pipelines.server.ts`)** — o `update` de `explanation`/`warnings`/`metrics` em `dev_outputs` não verificava `error`, mas o fluxo retornava `ok: true`. Agora a falha lança `falha ao registrar metadados do arquivo; a conclusão não foi confirmada`, alinhada à regra de que gravação ausente não pode ser reportada como etapa concluída.
3. **`buildKanbanBoard` (`pipeline.ts`)** — apenas os valores individuais eram validados; as somas podiam estourar `Number.MAX_SAFE_INTEGER`. Agora `safeAdd` devolve `null` quando o agregado deixa de ser inteiro seguro: cards que estouram a coluna são descartados e contados em `invalid_amounts`, e `open_cents` passa a `number | null` (nulo quando a soma não é mensurável). `weighted_cents`/`weighted_open_cents` também ficam nulos nesse caso. Nenhum número aproximado é apresentado como valor real.
4. **Fuso dos analytics (`dashboard.ts`, `crm-dashboard.ts`)** — os buckets usavam `Date.UTC` enquanto os módulos declaravam `America/Sao_Paulo`. Agora `DASHBOARD_TIMEZONE` é a fonte única e `bucketStart`, `shiftBucket`, `periodCounts`, `windowCounts` e `dayKey` usam o calendário de Brasília. A semântica dos períodos mudou: o dia troca à meia-noite local; ver `16-revisao-consistencia.md`.
5. **`buildNarrativeFacts` (`sales-narrative.ts`)** — `data: unknown` de `sales`/`funnel` seguia ao bundle do LLM sem redaction nem limite. Agora passa por `redact()` e por um teto de 2.000 caracteres serializados; acima disso o campo vira `[dados omitidos: excede o limite]`. Testes confirmam que CPF, token e texto longo não chegam ao prompt.

### Testes de regressão

- `publication-rules.test.ts`: aprovação com JSON ilegível ou parâmetro fora do contrato é recusada.
- `pipeline.test.ts`: card que estoura a coluna é descartado; `open_cents` é `null` quando a soma não é segura.
- `dashboard.test.ts`: início de semana em Brasília, fronteira 00:00Z e chaves de dia/mês.
- `sales-narrative.test.ts`: dados sensíveis mascarados, limite aplicado e contrato segue válido.

Validação local: `typecheck` OK, `build` OK, 26 arquivos / 350 testes OK.

## Achados registrados, sem alteração de semântica

| # | Módulo | Achado | Por que não foi alterado |
|---|--------|--------|--------------------------|
| 1 | `crm-dashboard.ts` | `agentPerformance.conversion_pct` pode ultrapassar 100% quando há mais vendas válidas que oportunidades com o mesmo responsável. | As bases são distintas; pode ser intencional. Requer definição do que a métrica representa. |
| 2 | `pipelines.server.ts` | `contentCycle` chama `recordRun` sem incluir o warning de auditoria degenerada no resultado, ao contrário de `salesExecute` e `funnelExecute`. | O retorno de `contentCycle` não tem campo `reasons`; incluí-lo muda a interface consumida pela API. |
| 3 | `publications.functions.ts` | `requestSavedApproval` reutiliza aprovação anterior quando content hash e persona batem, mesmo que a conta ativa da persona tenha mudado desde a proposta original. | `publishSavedContent` valida o hash dos parâmetros aprovados, então a aprovação continua cobrindo os parâmetros originais. Reaproveitar ou invalidar é decisão de produto. |

Os três pontos foram levados ao plano da FASE 1 (`docs/FASE1_PLANNING.md`) como decisões a serem tomadas com o operador antes de qualquer ligação a banco ou UI real.

## Estado dos gates

Tipo A (manutenção local). Alvo A inalterado. A2 e A8 permanecem bloqueadas. Nada foi exposto, nenhum deploy/túnel/domínio foi executado, nenhuma `.env` de produção foi editada e nenhum token foi rotacionado.
