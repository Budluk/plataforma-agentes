# Índice de decisões de arquitetura (ADRs)

Este diretório registra as decisões tomadas no **plano de produção** do CloneStudio (alvo A — exposição apenas loopback). Cada ADR é curto, aceito e imutável: mudanças futuras devem gerar um novo ADR que referencie o anterior.

| ADR | Título | Fase | Decisão em uma linha |
| --- | --- | --- | --- |
| [0001](./0001-loopback-only.md) | Manter exposição apenas loopback (alvo A) | 0 | Sem auth/rate limiting enquanto o alvo for `127.0.0.1` |
| [0002](./0002-build-sandbox-sem-docker.md) | Sandbox de build sem Docker | 4 | Env limpo, `--ignore-scripts` e CSP rígida — **não** é isolamento real |
| [0003](./0003-fila-duravel-sem-redis.md) | Fila durável sem Redis | 3 | Jobs em `<DATA_DIR>/jobs.json`, sem processo extra |
| [0004](./0004-auditoria-sem-corpo.md) | Auditoria com redação e sem corpo | 1 | JSONL com `request_id`, sem prompt nem resposta bruta |
| [0005](./0005-sse-opt-in.md) | SSE opt-in com fallback para polling | 5 | Desligado por padrão; stream leva só `scope`/`id`/`revision` |

## Estado do plano

- **Fase 0** ✅ gate A definido (ADR-0001)
- **Fase 1** ✅ auditoria (ADR-0004)
- **Fase 2** ⏭️ pulada — auth/rate limiting são condicionais aos alvos B/C
- **Fase 3** ✅ fila durável (ADR-0003)
- **Fase 4** ✅ hardening de build sem Docker (ADR-0002)
- **Fase 5** ✅ SSE opt-in com fallback (ADR-0005)
- **Fase 6** ✅ documentação e validação final

## Limites que permanecem

O hardening da Fase 4 reduz a superfície de ataque, mas **não é isolamento de segurança real**: o build roda com o mesmo usuário do servidor. Para exposição em rede (alvos B/C) seriam necessários container/VM, auth, rate limiting e uma nova decisão explícita.

As dívidas antes listadas aqui foram fechadas: agentes e pipelines derivam os nomes de ferramentas de `core.tool_registry` (sem literais `studio_*`, `get_market_data` etc. duplicados), e o gate de música rejeita acordes com mais de 6 notas antes de chamar `to_guitar_tab`. O agente de funil também passou a ter identidade própria (`funnel_agent`) no registro, nas permissões e na auditoria, em vez de compartilhar `sales_agent`.
