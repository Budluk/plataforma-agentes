# ADR-0007 — Preparação para o alvo B com Cloudflare Tunnel (sem exposição)

- Status: aceito para preparação; exposição depende de gate explícito
- Data: 2026-11-19
- Fase do plano: gate B (preparação)
- Relação: estende o ADR-0001, que continua em vigor até a mudança de alvo ser aprovada

## Contexto

O ADR-0001 fixou o alvo A: `127.0.0.1`, sem autenticação. O operador solicitou
preparar o **alvo B (rede interna)** usando Cloudflare Tunnel, sem domínio próprio
ainda e sem expor nada neste momento.

O painel CentralIA já suporta o destino remoto sem alteração de código:
`src/lib/server/studio.server.ts` aceita `https://` somente para um host listado em
`STUDIO_ALLOWED_HOSTS`, sem redirects, com teto de resposta e redução de campos.
O CloneStudio, porém, continua com bind loopback e validação rígida de Host:

- `server/index.mjs:79` mantém `HOST = assertLoopbackHost(...)`;
- `server/index.mjs:189` rejeita com 403 qualquer mutação `/api/` cujo `Host`
  não seja loopback nem igual a `HOST`;
- `.env` mantém `HOST=127.0.0.1` e `PREVIEW_PUBLIC_URL=` vazio.

Consequência prática: um túnel apontando para `127.0.0.1:8787` hoje responderia
`GET /api/health`, mas os POSTs seriam recusados. Além disso, o *quick tunnel* do
Cloudflare (`cloudflared tunnel --url http://127.0.0.1:8787`) cria uma URL pública
`*.trycloudflare.com`: isso é exposição na internet (alvo C), não rede interna.
Sem domínio e sem Cloudflare Access/WARP, o alvo B não pode ser ativado.

## Decisão

Autorizar **somente preparação documental** para o alvo B:

- criar este ADR e o runbook `clonestudio/docs/CLOUDFLARE_TUNNEL.md`;
- não instalar `cloudflared`, não gerar credenciais, não alterar `.env`,
  não abrir portas e não modificar o painel;
- manter o ADR-0001 e o alvo A integralmente em vigor;
- não usar *quick tunnel* nem ngrok sob esta decisão.

Antes de qualquer exposição em B, todos os itens abaixo devem estar concluídos e
aprovados em novo ADR/PR:

1. hostname interno definitivo e Cloudflare Access/WARP (ou rota privada), de modo
   que o túnel não seja uma URL pública;
2. extensão da validação do CloneStudio com um host público explícito e isolado
   (por exemplo `CLONESTUDIO_PUBLIC_HOST`), preservando o bind loopback e os testes
   de Host/CSRF/DNS rebinding;
3. autenticação e rate limiting na API do CloneStudio;
4. container/VM e sandbox de rede para o build — o hardening da Fase 4 não é
   isolamento de segurança real;
5. configuração no painel: `STUDIO_BASE_URL=https://<host>` e inclusão do host em
   `STUDIO_ALLOWED_HOSTS`, com health check e uma mutação validados pelo túnel.

## Consequências

- Nenhuma superfície de rede nova, nenhuma dependência nova e nenhum segredo no
  repositório nesta etapa.
- Os dois itens pendentes em `lovable-app/roadmap.md` continuam abertos; a
  configuração do painel só muda quando o host definitivo existir.
- O `main` permanece com 806 testes e com o comportamento atual de loopback.
- A mudança para B exigirá aprovação explícita, CI verde e novo ADR que revogue
  este estado de preparação; a mudança para C exigiria decisão ainda mais ampla.
