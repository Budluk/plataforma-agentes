# ADR-0006 — Branch `centralia/lote-1-acoes` substituída pelo painel CentralIA

- Status: aceito
- Data: 2026-11-19
- Fase do plano: não ligada às fases do CloneStudio (decisão de escopo)

## Contexto

A branch remota `centralia/lote-1-acoes` contém cinco commits com um protótipo de
operações autônomas: `ActionGateway` (proposta/execução separadas, aprovação de uso
único, `params_hash`, kill switch, limite de frequência e auditoria encadeada em
SQLite), geração de conteúdo com LLM, publicação simulada e coleta de tendências via
RSS.

A mesclagem com `main` é tecnicamente limpa e os testes passam em worktree temporário
(859 testes, contra 806 do `main`). Porém, o próprio `docs/autonomia/ROADMAP.md` da
branch marca o trabalho como `Status: planejamento`, com coleta "em andamento", passos
2 a 8 pendentes e publicação real desabilitada. Além disso, o `ActionGateway` da branch
não usa `tool_registry` / `AGENT_TOOL` e registra ações sob nomes próprios
(`publish.post`), ficando fora do registro central de ferramentas do projeto.

O painel CentralIA (aplicação `lovable-app`) já implementa conteúdo, tendências,
publicações e aprovações com banco no Lovable Cloud e interface funcional. Manter as
duas implementações criaria duas fontes de verdade para aprovação e auditoria (SQLite
local contra tabelas do painel).

## Decisão

Não mesclar `centralia/lote-1-acoes` no `main`. Manter a branch remota preservada
como histórico, sem exclusão e sem desenvolvimento adicional. O painel CentralIA é a
implementação ativa de conteúdo, tendências, publicações e aprovações.

Uma futura paridade em Python (por exemplo, operações autônomas servidas pela
API `plataforma-agentes`) exigirá novo ADR que revogue este, definindo: integração com
o registro central de ferramentas, fonte única de aprovação/auditoria e escopo da
publicação real.

## Consequências

- O `main` continua com 806 testes e sem as dependências de escopo da branch; nenhuma
  funcionalidade nova entra em produção por esta decisão.
- A branch permanece disponível como referência histórica, inclusive para eventual
  reaproveitamento de ideias; nenhum código é apagado.
- Não há second gate de aprovação nem divergência entre auditoria SQLite e o painel.
- Este ADR documenta decisão de escopo; não altera o alvo A do ADR-0001.
