# ADR-0004 — Auditoria com redação e sem corpo de requisição

- Status: aceito
- Data: 2026-11-19
- Fase do plano: 1

## Contexto

Para operar o CloneStudio era necessário correlacionar requisições, jobs e chamadas ao modelo. Registrar corpo de requisição, prompt ou resposta bruta criaria um segundo depósito de segredos e dados gerados, contrariando as regras do projeto.

## Decisão

`server/audit.mjs` grava JSONL em `<DATA_DIR>/audit.jsonl` com:

- `request_id` propagado por `AsyncLocalStorage` (`server/request-context.mjs`);
- redação de chaves/tokens/prefixos sensíveis, inclusive dentro de texto livre;
- eventos de API, job e modelo com metadados (status, duração, provedor, contagens, hashes);
- `PROMPT_VERSION = hashText(SYSTEM_PROMPT)`, que muda automaticamente se o prompt for editado;
- rotação por tamanho (`CLONESTUDIO_AUDIT_MAX_BYTES` / `CLONESTUDIO_AUDIT_BACKUPS`).

Nenhum corpo de requisição, prompt ou resposta bruta do modelo é registrado; avisos de rejeição mostram só motivo e metadados.

## Consequências

- É possível correlacionar uma falha sem expor o texto que a originou.
- A auditoria não permite reconstruir o prompt exato — isso é intencional.
- A rotação limita o consumo de disco; arquivos antigos são descartados conforme a configuração.
