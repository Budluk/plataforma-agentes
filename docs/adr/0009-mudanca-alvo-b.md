# ADR-0009 — Minuta: mudança do alvo A para o alvo B (sem exposição autorizada)

- Status: **MINUTA — aguardando aprovação explícita. Este documento NÃO autoriza exposição.**
- Data: 2026-11-20
- Fase do plano: gate A→B
- Relação: estende o [ADR-0001](./0001-loopback-only.md); depende do [ADR-0007](./0007-preparacao-alvo-b-cloudflare-tunnel.md) e do [ADR-0008](./0008-isolamento-build-appcontainer.md). O ADR-0001 continua em vigor até esta minuta ser aprovada.

## Contexto

O operador pediu a construção de um túnel. O pedido foi classificado como **tipo C (mudança de alvo)** pelos gates de entrega, porque qualquer túnel — inclusive um *quick tunnel* `cloudflared tunnel --url ...` — cria uma URL publicamente alcançável ou altera a superfície de rede. O estado medido em 2026-11-20 é:

- CloneStudio escuta apenas em `127.0.0.1:8787`; `GET /api/health` responde HTTP 200.
- `cloudflared` não está instalado; `ngrok` não está instalado.
- `clonestudio/.env` contém apenas `HOST=127.0.0.1` e `PREVIEW_PUBLIC_URL=` vazio.
- `CLONESTUDIO_PUBLIC_HOST`, `CLONESTUDIO_API_TOKEN` e `CLONESTUDIO_BUILD_ISOLATION` não estão definidos.
- Não existe host interno definitivo, política de Access/WARP, nem ADR aprovando a mudança de alvo.

A preparação de código já existe: validação de Host estendida por um host público explícito, token Bearer e rate limiting obrigatórios com host público, e isolamento real do build via AppContainer + Job Object (ADR-0008). O [runbook do túnel](../../clonestudio/docs/CLOUDFLARE_TUNNEL.md) registra os gates e o plano de execução. Nada disso foi executado.

## Decisão proposta

Mudar o alvo de **A (loopback, sem auth)** para **B (rede interna, atrás de Cloudflare Access + WARP)** somente quando **todos** os pré-requisitos abaixo estiverem verificados e o operador tiver aprovado esta decisão por escrito. Até lá, nenhum comando de túnel, nenhuma alteração de `HOST` e nenhuma edição de `.env`.

O bind do CloneStudio **continua em `127.0.0.1`** no alvo B: o túnel aponta para o loopback, sem abrir portas no firewall. Nunca usar `HOST=0.0.0.0`/`::`, *quick tunnel*, ngrok ou túnel improvisado.

### Pré-requisitos (todos obrigatórios)

- [ ] Hostname interno definitivo (ex.: `studio.interna.example.com`) com DNS gerenciado na Cloudflare.
- [ ] Cloudflare Access com política restrita ao operador, mais WARP ou rota privada equivalente. O endpoint não pode ser alcançável por qualquer pessoa na internet.
- [x] Código do CloneStudio aceita um único host explícito em `CLONESTUDIO_PUBLIC_HOST`, sem redirects (ADR-0007).
- [x] Token Bearer e rate limiting por IP obrigatórios quando houver host público (ADR-0007).
- [x] Isolamento real do build com AppContainer + Job Object, `CLONESTUDIO_BUILD_ISOLATION=required` no boot (ADR-0008).
- [x] Painel envia `Authorization: Bearer` via Cloud Secret `STUDIO_API_TOKEN`; valor fora do repositório.
- [ ] Token definitivo criado como Cloud Secret no Lovable e replicado no `.env` do CloneStudio.
- [ ] CI verde nos jobs `python`, `studio-node` e `studio-browser`.
- [ ] **Aprovação explícita do operador para esta mudança de alvo.**

## Plano quando os pré-requisitos existirem

1. Criar o túnel e o hostname na conta Cloudflare, com `service` apontando para `http://127.0.0.1:8787`.
2. Aplicar a política de Access/WARP e confirmar que o hostname só responde para o operador dentro da rede interna.
3. Definir no `.env` do CloneStudio: `CLONESTUDIO_PUBLIC_HOST=<host>`, `CLONESTUDIO_API_TOKEN=<valor do Cloud Secret>` e `CLONESTUDIO_BUILD_ISOLATION=required`. O boot falha se faltar token ou se o isolamento não estiver `required`.
4. No painel, informar em Configurações: `STUDIO_BASE_URL=https://<host>` e `STUDIO_ALLOWED_HOSTS=<host>` (somente o host definitivo). O token `STUDIO_API_TOKEN` vai em Cloud Secret do Lovable, nunca em arquivo versionado.
5. Validar, pelo túnel, `GET /api/health` e uma mutação simples em projeto de teste com `DATA_DIR` temporário. Não usar projetos reais.
6. Registrar o resultado aqui, mudar o status de "MINUTA" para "aceito" e atualizar `lovable-app/roadmap.md`. Os itens do túnel só podem ser marcados após teste real.

## Validação planejada

```powershell
curl.exe -i https://<host>/api/health
```

Resposta esperada: JSON com `"ok": true`, `name`, `version` e `providers`. Depois, repetir uma mutação em `DATA_DIR` temporário e confirmar que a auditoria registra o evento sem corpo de prompt ou resposta bruta (ADR-0004).

## Rollback

- Parar o processo `cloudflared`.
- Remover `CLONESTUDIO_PUBLIC_HOST` do `.env` e reiniciar o servidor.
- Restaurar `STUDIO_BASE_URL=http://127.0.0.1:8787` no painel e retirar o host externo de `STUDIO_ALLOWED_HOSTS`.
- Confirmar que `GET http://127.0.0.1:8787/api/health` volta a responder e que nenhuma rota pública permanece ativa.

## Limites que permanecem

- Alvo C (exposição pública) continua proibido sem decisão ainda mais ampla.
- Nenhuma credencial de Cloudflare, token ou chave entra no repositório.
- A auditoria nunca guarda bodies brutos; a plataforma nunca executa código gerado.
- Enquanto este ADR estiver como MINUTA, a resposta para qualquer pedido de túnel é: **nada foi exposto**.
