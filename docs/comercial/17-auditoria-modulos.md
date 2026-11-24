# Auditoria local dos módulos restantes (2026-11-23)

Escopo: `publications.ts`, `publications.functions.ts`, `sales-narrative.ts`, `toolRegistry.ts`, `pipeline.ts`, `crm-dashboard.ts`, `pipelines.server.ts` e testes associados. Auditoria local, sem banco, sem MCP, sem exposição e sem deploy.

## Achados corrigidos

1. **`validatePublication` (`publications.ts`)** — `JSON.parse(approval.params_json)` podia lançar `SyntaxError` cru, e `PublishPost.parse` lançava `ZodError` em inglês, ambos sem mensagem operacional em pt-BR. Agora há `try/catch` com `Parâmetros da aprovação ilegíveis.`, validação `safeParse` com `Parâmetros da aprovação fora do contrato.` e o mesmo hash canonical. Nenhuma publicação é liberada com parâmetros corrompidos ou fora do contrato.
2. **`devWrite` (`pipelines.server.ts`)** — o `update` de `explanation`/`warnings`/`metrics` em `dev_outputs` não verificava `error`, mas o fluxo retornava `ok: true`. Agora a falha lança `falha ao registrar metadados do arquivo; a conclusão não foi confirmada`, alinhada à regra de que gravação ausente não pode ser reportada como etapa concluída.

Teste de regressão adicionado em `publication-rules.test.ts`: aprovação com JSON ilegível e com parâmetro fora do contrato são recusadas.

Validação local: `typecheck` OK, `build` OK, 26 arquivos / 346 testes OK. Working tree alterado; sem commit e sem push nesta etapa.

## Achados registrados, sem alteração de semântica

| # | Módulo | Achado | Por que não foi alterado |
|---|--------|--------|--------------------------|
| 1 | `pipeline.ts` | `buildKanbanBoard` soma `total_cents`, `weighted_cents` e `open_cents` sem verificar `Number.isSafeInteger` no agregado; apenas os valores individuais são validados. | Corrigir exige escolher se a coluna inteira fica `sem_dados`, se o card que estoura é descartado ou se o tipo de `total_cents` passa a `number \| null`. Mudança de contrato/decisão de produto. |
| 2 | `crm-dashboard.ts` | `COMMERCIAL_TIMEZONE` declara `America/Sao_Paulo`, mas `bucketStart`/`periodCounts` vêm de `dashboard.ts`, que usa `Date.UTC`. | Já registrado em `16-revisao-consistencia.md`; depende de decisão sobre a semântica dos relatórios. |
| 3 | `crm-dashboard.ts` | `agentPerformance.conversion_pct` pode ultrapassar 100% quando há mais vendas válidas que oportunidades com o mesmo responsável. | As bases são distintas; pode ser intencional. Requer definição do que a métrica representa. |
| 4 | `pipelines.server.ts` | `contentCycle` chama `recordRun` sem incluir o warning de auditoria degenerada no resultado, ao contrário de `salesExecute` e `funnelExecute`. | O retorno de `contentCycle` não tem campo `reasons`; incluí-lo muda a interface consumida pela API. |
| 5 | `publications.functions.ts` | `requestSavedApproval` reutiliza aprovação anterior quando content hash e persona batem, mesmo que a conta ativa da persona tenha mudado desde a proposta original. | `publishSavedContent` valida o hash dos parâmetros aprovados, então a aprovação continua cobrindo os parâmetros originais. Reaproveitar ou invalidar é decisão de produto. |
| 6 | `sales-narrative.ts` | `buildNarrativeFacts` repassa `data: unknown` de `sales`/`funnel` ao bundle do LLM sem esquema próprio nem redaction explícita. | Os dados vêm de cálculos internos, mas o contrato aberto permite campos arbitrários. Reduzir/redactar pode alterar a qualidade da narrativa; depende de decisão LGPD. |

## Estado dos gates

Tipo A (manutenção local). Alvo A inalterado. Nada foi exposto, nenhum deploy/túnel/domínio foi executado, nenhuma `.env` de produção foi editada e nenhum token foi rotacionado.
