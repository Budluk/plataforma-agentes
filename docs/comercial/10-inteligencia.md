# 10 — Inteligência comercial (Fase 9)

Contratos puros para consolidar leituras **já calculadas** pelo próprio projeto em uma única leitura comercial. Nenhum número é recalculado, estimado, extrapolado ou preenchido com zero. Nenhuma ação externa é executada.

Arquivo: `lovable-app/src/lib/core/inteligencia.ts`.

## O que entra

`consolidateIntelligence` recebe `organizationId`, `asOf` explícito, `leituras`, `claims` opcionais, grants, autonomia e, opcionalmente, uma camada editorial de IA.

Cada `SupplyReading` declara: `id` único, `modulo` (`dashboard`, `series`, `funil`, `analytics`, `tendencias`, `propostas`, `crm`), `fonte`, `status`, `metricas`, `organizationId` e `asOf` opcionais e `amostra`. Quando `organizationId` ou `asOf` são informados, eles precisam ser **exatamente iguais** aos da consolidação — tenant ou instante divergente abortam a operação. Cada `MetricReading` traz `key`, `label`, `status` (`medido`/`sem_dados`), `valor` já formatado pelo chamador, `unidade` e `severidade` declaradas.

`MoneyClaim` é uma afirmação monetária explícita: `conceito`, `cents` inteiros e `fonteId`. A comparação só acontece entre claims que o chamador declara como o mesmo conceito; o módulo não adivinha que duas métricas são equivalentes.

## Gates

- Reutiliza `authorizeCommercialAction` com `insights_agent` para `ler_dashboard` e `gerar_leitura`, e `checkCommercialTool` para confirmar que ambas são ferramentas de leitura/preparação aceitas pelo `hardGate.ts`.
- Sem grant de `ler_dashboard`, a leitura fica `sem_dados`. Com kill switch ativo, nada é consolidado.
- `assistido` e `semiautonomo` produzem leitura, mas com `requiresApproval: true`. Nenhum nível habilita execução.
- Sem grant de `gerar_leitura`, a camada editorial é descartada (`sem_permissao`) e os achados determinísticos permanecem.

## O que sai

`IntelligenceReading` contém:

- `status`: `medido` (tudo medido), `parcial` (lacunas, divergências ou mistura de fontes reais e `AMOSTRA`) ou `sem_dados`.
- `cobertura_pct`: proporção de métricas medidas entre fontes reais; `null` quando não há base.
- `achados`: cada um com `id` (`A1`, `A2`, ...), evidência (`fonteId`, `fonte`, `modulo`, `metricKey`, `valor`, `unidade`), `severidade` declarada e motivo. Ordenação por severidade e limite configurável (`maxAchados`, 1–50).
- `lacunas`: métricas `sem_dados`, sem valor inferido.
- `divergencias`: claims do mesmo conceito com valores diferentes; nenhum é escolhido como correto.
- `amostras`: fontes ilustrativas com o rótulo `AMOSTRA — dado ilustrativo, não é produto, preço, cliente, venda ou tendência real`. Métricas de amostra nunca viram achado.
- `narrativa`: `sem_camada`, `gerada`, `falhou` ou `sem_permissao`.
- `canSend: false`, `canExecute: false`, `requiresApproval`, `reasons` e `audit`.
- `reading_id`: SHA-256 de JSON canônico (`canonical()` + `sha256hex()`), estável para a mesma leitura.

## Camada editorial

`IntelligenceNarrativeSchema` é rígida: `resumo`, `observacoes` (cada uma com `achadoId` existente) e `limites`. O texto é validado com expressão que **proíbe dígitos** — a IA não pode introduzir valor, data ou percentual. Referência a achado inexistente, saída fora do contrato ou falha de modelo descartam apenas a camada editorial; os números permanecem determinísticos e o PDF registra o motivo.

## Auditoria e PDF

`redactIntelligenceAudit` guarda somente ids/counts/statuses/`as_of`/razões truncadas — sem rótulos de métricas, valores monetários ou identificadores de clientes. `buildIntelligenceReport` produz o mesmo `ReportDocument` dos PDFs de vendas e propostas; `intelligencePrintHtml` usa o renderizador de impressão existente. Nenhuma chamada de modelo, server function ou janela de impressão automática foi adicionada.

## Limites desta fase

- Nenhuma migração, tabela, RLS, tipo gerado, segredo, server function, entrypoint, rota ou componente de UI.
- Nenhuma ferramenta de execução registrada; nenhum envio, campanha, checkout ou pagamento.
- Não lê banco nem tabelas comerciais reais: o schema da Fase 2 continua sem aplicação no Lovable.
- Não sobrescreve `dashboard.ts`, `analytics.ts`, `crm-dashboard.ts`, `pipeline.ts` nem `trends.ts`; consolida apenas o que eles já produzem e o chamador fornece.
- A vitrine `/vendas` segue ilustrativa e rotulada `AMOSTRA`; publicação social continua simulada.

## Validação

- `npm run typecheck`, `npm test`, `npm run build` e `git diff --check`.
- Testes em `src/test/inteligencia.test.ts`: consolidação determinística, cobertura, amostra, limites de severidade, gates, tenant/instante, divergências monetárias, camada editorial, redação de auditoria e PDF.
