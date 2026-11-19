# Workflow de git, PR e merge

## 0. Aprovacao

- Aprovacao para **commit/push** nao autoriza PR.
- Aprovacao para **abrir PR** nao autoriza merge: peca aprovacao nova.
- Antes de qualquer acao, mostre `git status --short` e o que entrara.

Nesta maquina o helper global de credential esta quebrado; prefixe comandos git
de rede com:

```powershell
git -c credential.https://github.com.helper=manager <comando>
```

`gh` nao esta instalado: use a API REST com token obtido via `git credential fill`.

## 1. Pre-flight (rodar e ler exit code)

```powershell
# raiz do repo
.\.venv\Scripts\python.exe scripts\check_env.py
.\.venv\Scripts\python.exe -m pytest -q
git diff --check

# em clonestudio/
npm run check
npm test
npm run test:browser
```

Referencia: Node 192 testes, browser 19, Python 807. Numeros diferentes exigem
explicacao antes de prosseguir.

## 2. Texto ASCII-only do PR

Nao-ASCII no titulo/body ja produziu `400 {"message":"Problems parsing JSON"}`.

```powershell
node .opencode/skills/clonestudio-delivery/scripts/check-ascii.mjs "Titulo do PR"
Get-Content .\body.txt -Raw | node .opencode/skills/clonestudio-delivery/scripts/check-ascii.mjs
```

Exit codes: `0` = ASCII, `1` = contem nao-ASCII, `2` = sem entrada.

## 3. Token sem vazamento

```powershell
$ cred = "protocol=https`nhost=github.com`n`n" |
    git -c credential.https://github.com.helper=manager credential fill |
    Out-String
$token = ($cred | ConvertFrom-StringData).password
```

Nunca fazer `echo $token`, nunca colocar em arquivo do repo, nunca incluir em
log ou output. Use apenas no header `Authorization: Bearer ...` da chamada REST.

## 4. PR e merge

1. Criar PR com titulo e body validados como ASCII.
2. Checar status da CI via API; **so** prosseguir se todos os checks estiverem verdes.
3. Pedir aprovacao explicita para o merge.
4. Fazer merge via REST (squash quando for o padrao do repositorio).
5. Reportar URL do PR/run da CI e o commit final.

## 5. Regras de conteudo

- Nada de token, chave, host publico ou segredo em arquivos versionados.
- Auditoria nao guarda corpo bruto de request, prompt ou resposta do modelo.
- Nao executar codigo gerado fora do sandbox.
- Testes destrutivos somente com `DATA_DIR` temporario; instancia real em
  `127.0.0.1:8787` e projetos reais intactos.
