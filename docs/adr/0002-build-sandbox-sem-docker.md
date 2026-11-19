# ADR-0002 — Sandbox de build sem Docker

- Status: aceito
- Data: 2026-11-19
- Fase do plano: 4

## Contexto

O código gerado pelo LLM é compilado pelo Vite em um workspace do CloneStudio. A regra do repositório proíbe Docker/Ollama/LangChain e a máquina não tem folga para um container. Ainda assim, era inaceitável que o child do build recebesse chaves de provedor do processo servidor.

## Decisão

Fazer hardening **sem** container:

- `server/build-sandbox.mjs` monta o ambiente do child removendo chaves/tokens/prefixos de provedor, limpando credencial de proxy e forçando `--max-old-space-size` (padrão 512 MB).
- `npm install --ignore-scripts` e `assertSafeBuildConfig` rejeitam `vite.config.*`/`.npmrc` gerados, arquivos fixos alterados e hooks de instalação.
- CSP do preview sem `'unsafe-eval'` por padrão (`PREVIEW_ALLOW_UNSAFE_EVAL=1` é escape hatch), com `base-uri 'none'`, `object-src 'none'` e `form-action 'none'`.
- Timeouts e `killTree` existentes foram preservados.

## Consequências

- Reduz vazamento acidental de segredos e o risco de um script de instalação hostil.
- **Não é isolamento de segurança real**: o build continua rodando com o mesmo usuário do servidor. Código malicioso determinado ainda pode afetar o filesystem e os processos locais.
- Exposição pública (alvos B/C) exigiria container/VM e uma mudança explícita de escopo, revisando esta decisão.
