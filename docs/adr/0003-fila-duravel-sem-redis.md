# ADR-0003 — Fila durável sem Redis

- Status: aceito
- Data: 2026-11-19
- Fase do plano: 3

## Contexto

Geração, rebuild e restore viviam em um `Map` em memória. Um restart do servidor transformava projetos em `interrupted`, mesmo quando o workspace estava íntegro. Redis resolveria a durabilidade, mas adicionaria outro processo e memória a uma máquina já restrita.

## Decisão

Implementar `server/job-queue.mjs` com registros em `<DATA_DIR>/jobs.json`, escrita atômica (`.tmp` + `renameWithRetry`), estados `queued | running | succeeded | failed | cancelled`, chave de idempotência determinística e concorrência máxima de 2 jobs no mesmo processo. O `buildChain` existente continua serializando os builds do Vite. No boot, jobs `running` viram `cancelled` (o processo anterior morreu) e jobs `queued` são retomados com os mesmos runners das rotas.

## Consequências

- Estado sobrevive a restart sem serviço adicional; `/api/health` expõe `queued`, `runningJobs` e `concurrency`.
- Idempotência evita duplicar o mesmo pedido após restart; o histórico é limitado por `CLONESTUDIO_JOB_HISTORY`.
- Não é fila distribuída: se houvesse mais de um processo servidor, seria necessário Redis (ou outro broker) e revisão desta decisão.
