# Gates do alvo B — detalhe

Fonte: `clonestudio/docs/CLOUDFLARE_TUNNEL.md`, ADR-0001, ADR-0007, ADR-0008.

## Bloqueios (todos precisam estar resolvidos antes de exposicao)

- [ ] **Hostname interno definitivo** — nao existe ate o usuario informar.
      Exemplo do runbook: `studio.interna.example.com`, DNS gerenciado na Cloudflare.
- [ ] **Cloudflare Access + WARP/rota privada** — politica restrita ao operador.
      O endpoint nao pode ser alcancavel por qualquer pessoa na internet.
- [ ] **Token definitivo** — mesmo valor em `CLONESTUDIO_API_TOKEN` (`.env` do
      CloneStudio) e Cloud Secret `STUDIO_API_TOKEN` (painel/Lovable). Nunca em arquivo.
- [ ] **ADR de mudanca A -> B aprovado**, com CI verde. ADR-0007 nao serve: ele
      autoriza apenas preparacao.

## Estado basico verificado (remedir, nao confiar)

- `cloudflared` e `ngrok` nao instalados.
- `clonestudio/.env`: `HOST=127.0.0.1`, `PREVIEW_PUBLIC_URL=` vazio.
- Listener apenas em `127.0.0.1:8787`.
- `assertTrustedRequest` recusa mutacoes `/api/` com `Host` diferente de loopback
  ou de `HOST`; aceita um unico `CLONESTUDIO_PUBLIC_HOST` explicito (ainda vazio).
- Sem host publico, token e rate limiting sao opcionais; com host publico, viram
  obrigatorios e o boot falha se faltarem.
- `CLONESTUDIO_BUILD_ISOLATION=off` no alvo A; `required` e obrigatorio com host
  publico. Windows 11 Home: AppContainer sem capabilities de rede + Job Object,
  workspace efemero e cache de `node_modules` somente leitura.

## Nunca fazer

- `cloudflared tunnel --url http://127.0.0.1:8787` — quick tunnel publico (alvo C).
- Instalar ngrok ou outro tunel improvisado.
- `HOST=0.0.0.0` / `::`, abrir portas no firewall.
- Adicionar host arbitrario em `STUDIO_ALLOWED_HOSTS`.
- Rodar teste de mutacao pelo tunel em projeto real: usar `DATA_DIR` temporario.
- Marcar os itens do túnel em `lovable-app/roadmap.md` sem teste real pelo hostname.

## Quando os gates existirem (plano do runbook)

1. Tune com `service` apontando para `http://127.0.0.1:8787`; bind permanece loopback.
2. Aplicar Access/WARP e confirmar que so o operador interno alcanca o host.
3. Ajustar `.env`: `CLONESTUDIO_PUBLIC_HOST`, `CLONESTUDIO_API_TOKEN`,
   `CLONESTUDIO_BUILD_ISOLATION=required`.
4. Painel: `STUDIO_BASE_URL=https://<host>` e `STUDIO_ALLOWED_HOSTS=<host>`;
   token apenas em Cloud Secret.
5. `curl.exe -i https://<host>/api/health` -> JSON com `"ok": true`, `name`,
   `version` e `providers`. Depois, mutacao simples em `DATA_DIR` temporario.
6. Registrar resultado no ADR de mudanca e atualizar o roadmap.

## Template quando bloqueado

```
Classificacao: C (mudanca de alvo)
Gate B: BLOQUEADO
  [ ] hostname interno definitivo
  [ ] Cloudflare Access + WARP
  [ ] token definitivo (Cloud Secret)
  [ ] ADR de mudanca A->B aprovado com CI verde
Nada foi exposto. Nenhum comando de tunel foi executado.
Posso seguir apenas com preparacao (codigo/docs). Quer que eu faca isso?
```

## Rollback (se exposicao chegou a acontecer)

Parar `cloudflared`; remover `CLONESTUDIO_PUBLIC_HOST` do `.env` e reiniciar;
restaurar `STUDIO_BASE_URL=http://127.0.0.1:8787` e limpar `STUDIO_ALLOWED_HOSTS`;
confirmar que `GET http://127.0.0.1:8787/api/health` responde e que nenhuma rota
publica continua ativa.
