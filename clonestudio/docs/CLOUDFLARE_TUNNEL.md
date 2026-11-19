# Cloudflare Tunnel — preparação para o alvo B

Este runbook registra a **preparação** para expor o CloneStudio em rede interna
(alvo B). Ele **não** autoriza exposição e **não** deve ser executado agora.
A decisão está no [ADR-0007](../../docs/adr/0007-preparacao-alvo-b-cloudflare-tunnel.md),
que mantém o [ADR-0001](../../docs/adr/0001-loopback-only.md) em vigor.

## Estado atual (verificado)

- `cloudflared` não está instalado; `ngrok` não está instalado.
- `clonestudio/.env`: `HOST=127.0.0.1`, `PREVIEW_PUBLIC_URL=` vazio.
- O servidor escuta apenas em loopback (`server/index.mjs:79`).
- `assertTrustedRequest` recusa mutações `/api/` com `Host` diferente de loopback
  ou de `HOST`. Desde a preparação do item 2, o código aceita também um único
  hostname explícito em `CLONESTUDIO_PUBLIC_HOST`; o valor continua vazio, então
  o comportamento efetivo segue sendo somente loopback.
- `CLONESTUDIO_API_TOKEN` é opcional no alvo A e obrigatório se
  `CLONESTUDIO_PUBLIC_HOST` estiver definido. O servidor falha no boot se o host
  público existir sem token.
- Com host público, o limite é 120 requisições/minuto por IP (ajustável em
  `CLONESTUDIO_RATE_LIMIT_PER_MIN`); sem host público, o limite fica desligado
  a menos que `CLONESTUDIO_RATE_LIMIT_ENABLED=1`.
- O painel aceita HTTPS apenas para host permitido em `STUDIO_ALLOWED_HOSTS` e
  já envia `Authorization: Bearer <token>` quando `STUDIO_API_TOKEN` está
  definido como Cloud Secret. O valor fica fora do repositório; sem a variável,
  o cliente segue sem header de autenticação (comportamento do alvo A).

## O que não fazer

- Não rodar `cloudflared tunnel --url http://127.0.0.1:8787`: o *quick tunnel*
  gera uma URL pública `*.trycloudflare.com` (alvo C), não rede interna.
- Não instalar ngrok nem outro túnel improvisado.
- Não trocar `HOST` por `0.0.0.0`/`::` nem abrir portas no firewall.
- Não adicionar hosts arbitrários a `STUDIO_ALLOWED_HOSTS` no painel.
- Não colocar tokens do Cloudflare, chaves ou credenciais no repositório.

## Pré-requisitos para o alvo B

Todos devem estar prontos antes de qualquer comando de túnel:

- [ ] Conta Cloudflare e hostname interno definitivo (por exemplo
      `studio.interna.example.com`) com DNS gerenciado na Cloudflare.
- [ ] Cloudflare Access com política restrita ao operador, mais WARP ou rota
      privada equivalente. O endpoint não pode ser alcançável por qualquer
      pessoa na internet.
- [x] CloneStudio com validação de Host estendida por um host público explícito
      (`CLONESTUDIO_PUBLIC_HOST`): código e testes prontos, bind permanece em
      `127.0.0.1` e o valor continua vazio até existir hostname definitivo.
- [x] Autenticação e rate limiting na API do CloneStudio: código pronto, com
      token Bearer e limite por IP obrigatórios quando houver host público. O
      painel já envia o token via Cloud Secret `STUDIO_API_TOKEN`; falta o valor
      definitivo do host.
- [x] Isolamento real do build e sandbox de rede. Implementado conforme o
      [ADR-0008](../../docs/adr/0008-isolamento-build-appcontainer.md):
      AppContainer sem capabilities + Job Object, workspace efêmero e cache de
      `node_modules` somente leitura. `CLONESTUDIO_BUILD_ISOLATION=required` é
      obrigatório no boot quando houver `CLONESTUDIO_PUBLIC_HOST`. Testes
      `windows-only` confirmam `NET_DENIED=EACCES`, negação de leitura a arquivo
      fora do workspace e cópia apenas do `dist` de volta. Build real do Vite
      com cache quente: ~7 s, pico de ~219 MB. Exposição em B segue bloqueada
      até o ADR de mudança de alvo.
- [ ] Novo ADR aprovando a mudança de A para B, com CI verde.

## Plano quando os pré-requisitos existirem

1. Criar o túnel e o hostname na conta Cloudflare, com `service` apontando para
   `http://127.0.0.1:8787`. O bind do CloneStudio permanece loopback.
2. Aplicar a política de Access/WARP e confirmar que o hostname só responde para
   o operador dentro da rede interna.
3. Definir no `.env` do CloneStudio: `CLONESTUDIO_PUBLIC_HOST=<host>`,
   `CLONESTUDIO_API_TOKEN=<valor do Cloud Secret>` e
   `CLONESTUDIO_BUILD_ISOLATION=required`. O boot falha se faltar token ou se o
   isolamento não estiver `required`. Validar
   que `assertTrustedRequest` aceita apenas esse host, além do loopback.
4. No painel, informar em Configurações:
   - `STUDIO_BASE_URL=https://<host>`;
   - `STUDIO_ALLOWED_HOSTS=<host>` (somente o host definitivo).
   O token `STUDIO_API_TOKEN` vai em **Cloud Secret** do Lovable, com o mesmo
   valor de `CLONESTUDIO_API_TOKEN` do `.env` do CloneStudio — nunca em arquivo
   versionado, nunca em `.env` do painel.
5. Validar, pelo túnel, `GET /api/health` e uma mutação simples em um projeto de
   teste com `DATA_DIR` temporário. Não usar projetos reais nesse teste.
6. Registrar o resultado no ADR de mudança de alvo e atualizar
   `lovable-app/roadmap.md` (os itens do túnel só podem ser marcados após teste real).

## Validação planejada

```powershell
curl.exe -i https://<host>/api/health
```

A resposta esperada é JSON com `"ok": true`, `name`, `version` e `providers`.
Depois, repetir uma mutação em `DATA_DIR` temporário e confirmar que o audit
registra o evento sem corpo de prompt ou resposta bruta.

## Rollback

- Parar o processo `cloudflared`.
- Remover `CLONESTUDIO_PUBLIC_HOST` do `.env` e reiniciar o servidor.
- Restaurar `STUDIO_BASE_URL=http://127.0.0.1:8787` no painel e retirar o host
  externo de `STUDIO_ALLOWED_HOSTS`.
- Confirmar que `GET http://127.0.0.1:8787/api/health` volta a responder e que
  nenhuma rota pública permanece ativa.
