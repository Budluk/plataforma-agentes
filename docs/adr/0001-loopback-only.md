# ADR-0001 — Manter exposição apenas loopback (alvo A)

- Status: aceito
- Data: 2026-11-19
- Fase do plano: 0 (gate)

## Contexto

A plataforma roda em uma máquina leve (Celeron N4500, 3,78 GB de RAM, sem GPU), com FreeLLMAPI remoto e Node 22. Havia três alvos possíveis de exposição:

- **A** — manter `127.0.0.1`, sem autenticação;
- **B** — expor em rede interna;
- **C** — expor publicamente.

O CloneStudio já valida `HOST` no boot (`assertLoopbackHost`) e a API Python da área studio também só aceita loopback. Auth e rate limiting custariam processo/estado extra e não foram pedidos para o uso atual.

## Decisão

Adotar o **alvo A**. Não implementar autenticação nem rate limiting na Fase 2; ela fica explicitamente condicional a uma mudança para B ou C. Toda a configuração continua com bind em loopback por padrão e rejeita qualquer outro `HOST`.

## Consequências

- Superfície de rede mínima e nenhum custo de memória com auth/sessões.
- A proteção depende do bind local e do firewall do sistema; qualquer exposição futura exige revisar auth, rate limiting, CSP e o sandbox de build **antes** de mudar o alvo.
- Nenhum token de provedor é necessário para acessar o painel local; ele não deve ser compartilhado com usuários não confiáveis.
