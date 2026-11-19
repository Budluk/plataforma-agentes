# ADR-0005 — SSE opt-in com fallback para polling

- Status: aceito
- Data: 2026-11-19
- Fase do plano: 5

## Contexto

O painel acompanha gerações com polling (1,6 s no projeto, 3–5 s na home). Para poucas abas isso é suficiente e simples; trocar por SSE obrigatório criaria mais uma dependência de conexão longa justamente numa máquina pequena.

## Decisão

Tornar SSE opcional (`CLONESTUDIO_SSE_ENABLED=1`, padrão `0`):

- `GET /api/events` só é servido com a flag ligada; desligado, responde 404 e o painel continua no polling.
- O barramento `server/change-events.mjs` publica apenas `scope`, `id` e `revision`. Nenhum prompt, arquivo ou resposta bruta trafega no stream.
- Avisos são coalescidos (150 ms), com keepalive de 20 s e limite de 20 conexões.
- O cliente reutiliza `refreshProject` / `refreshHomeProjects` / `refreshOpenProjectSummaries`; se o EventSource falhar, volta aos timers existentes.

## Consequências

- Com a flag desligada não há custo nem conexão extra — o comportamento é o de antes.
- Ligado, reduz requisições ociosas sem criar um novo caminho de dados: o SSE só diz *quando* buscar; as rotas normais dizem *o quê*.
- Nenhum dado sensível é exposto pelo stream, e o limite de conexões protege o processo.
