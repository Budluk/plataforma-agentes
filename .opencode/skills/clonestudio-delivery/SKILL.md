---
name: CloneStudio Delivery Gates
description: Applies plataforma-agentes delivery gates before git, PR, merge or exposure. Use when the user asks to commit, push, open a PR, merge, publish, expose, change host, set up a tunnel or domain, configure Cloudflare, rotate API tokens, or edit production .env; also when CLONESTUDIO_PUBLIC_HOST, STUDIO_API_TOKEN, cloudflared or CLONESTUDIO_BUILD_ISOLATION appears in context.
---

# CloneStudio Delivery Gates

Este repositorio tem regras de entrega que nao existem em nenhuma skill publica.
Siga-as **antes** de agir. Skill e instrucao, nao trava de sistema: ela nao
substitui aprovacao humana nem permissoes configuradas no `opencode.json`.

## 1. Classifique o pedido

| Tipo | Exemplo | Acao |
|---|---|---|
| **A — manutencao** | correcao de bug, teste, docs, refactor | Trabalha normalmente; mantenha `HOST=127.0.0.1`. |
| **B — preparacao** | codigo/testes para tunel, ADR, runbook | Pode editar arquivos. **Nunca expor.** |
| **C — mudanca de alvo** | "colocar no ar", dominio, Cloudflare, host publico | Entra no gate de exposicao e para. |

Na duvida, classifique como **C**.

## 2. Leia antes de qualquer acao

- `docs/adr/0001-loopback-only.md` — alvo A ainda vigora.
- `docs/adr/0007-preparacao-alvo-b-cloudflare-tunnel.md` — autoriza so preparacao.
- `docs/adr/0008-isolamento-build-appcontainer.md` — isolamento do build.
- `clonestudio/docs/CLOUDFLARE_TUNNEL.md` — runbook e gates do alvo B.

Detalhes em [references/gates.md](references/gates.md).

## 3. Gate de exposicao (fail closed)

Se for tipo **C**, verifique os quatro bloqueios. Se **qualquer um** faltar,
**pare** e reporte a lista. Nao execute comando de tunel, nao edite `.env` de
producao, nao altere `HOST`.

1. Hostname interno definitivo (DNS na Cloudflare).
2. Cloudflare Access com politica restrita **e** WARP/rota privada.
3. Token definitivo (`CLONESTUDIO_API_TOKEN` / Cloud Secret `STUDIO_API_TOKEN`).
4. Novo ADR aprovando A -> B, com CI verde.

Proibido em qualquer circunstancia:

- `cloudflared tunnel --url ...` (quick tunnel gera URL publica `*.trycloudflare.com` = alvo C).
- ngrok ou tunel improvisado; `HOST=0.0.0.0`/`::`; abrir portas no firewall.
- Colocar token, chave ou credencial em arquivo versionado.

## 4. Meça o estado real antes de afirmar algo

Nunca presuma. Confira e so entao relate:

```powershell
Get-NetTCPConnection -LocalPort 8787 | Select-Object LocalAddress,LocalPort,State
curl.exe -i http://127.0.0.1:8787/api/health
git -c credential.https://github.com.helper=manager status --short --branch
```

Ao ler `clonestudio/.env`, **nunca** copie valores de `*_TOKEN`, `*_KEY` ou
`*_SECRET` para a resposta: substitua por `<REDACTED>`. Esperado no alvo A:
`HOST=127.0.0.1`, `PREVIEW_PUBLIC_URL=` vazio, `CLONESTUDIO_PUBLIC_HOST=` vazio,
`CLONESTUDIO_BUILD_ISOLATION=off`, listener apenas em loopback.

## 5. Antes de git: aprovacao explicita

Sem aprovacao explicita do usuario para **esta** acao: nenhum `commit`, `push`,
abertura de PR ou merge. Aprovacao para PR **nao** autoriza merge; pedida nova.
Se o pedido for de commit/push, confirme primeiro o que sera incluido.

## 6. Verificacao com evidencia

So diga "passou" depois de rodar e ler exit code. Matriz em
[references/git-workflow.md](references/git-workflow.md):

- Python: `.\.venv\Scripts\python.exe scripts\check_env.py` e `... -m pytest -q`
- Node: `npm run check`, `npm test`, `npm run test:browser` (em `clonestudio/`)
- Git: `git diff --check`

Testes destrutivos **somente** em `DATA_DIR` temporario. Instancia real em
`127.0.0.1:8787` e projetos reais ficam intactos.

## 7. Regras de PR

- Titulo e body **ASCII-only**. Use `scripts/check-ascii.mjs` antes de chamar a API.
  texto nao-ASCII ja causou `400 {"message":"Problems parsing JSON"}`.
- Token de git via `git credential fill`, nunca echo; `gh` nao esta instalado.
- Merge via REST somente com CI verde.
- Helper global de credential do git esta quebrado nesta maquina: use
  `git -c credential.https://github.com.helper=manager ...`.

## 8. Seguranca e auditoria

- A plataforma nunca executa codigo gerado fora do sandbox.
- Auditoria nao guarda corpo bruto de request, prompt ou resposta do modelo.
- Token do painel vai em **Cloud Secret** do Lovable; valor nunca no repo.
- `CLONESTUDIO_BUILD_ISOLATION=off` no alvo A; `required` so com host publico
  aprovado. Valor invalido, host sem `required` ou `required` fora do Windows
  quebra o boot — e isso e intencional (fail closed).

## 9. Formato da resposta

1. Classificacao (A/B/C) e gates com status OK/pendente.
2. Comandos executados + exit codes observados.
3. Arquivos alterados (se houver).
4. Proxima decisao que depende do usuario.
5. Se bloqueado: "Nada foi exposto" explicitamente.
