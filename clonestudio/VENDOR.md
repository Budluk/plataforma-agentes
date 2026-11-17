# CloneStudio AI (vendorizado)

Cópia do app CloneStudio AI v0.2.0 (React 19 + Vite 8 + Node 22), integrada como serviço
local da área `studio`. A plataforma Python não importa nem executa este código: fala com ele
apenas por HTTP em loopback.

Origem: repositório CloneStudioAI, commit `760456f` (histórico de versões com restauração).

Fora desta cópia, de propósito:

- `.git/` (o histórico fica no repositório de origem);
- `node_modules/` e `templates/base/node_modules/` (instalados localmente);
- `data/` (projetos e builds ficam no workspace do serviço);
- `.env` (segredos);
- `.github/` (o CI do CloneStudio não roda a partir daqui).

## Rodar

    cd clonestudio
    npm install
    Copy-Item .env.example .env    # preencher FREELLMAPI_*
    node server/index.mjs

O painel abre em `http://127.0.0.1:8787` e o preview em `http://127.0.0.1:8788`.
Na primeira geração, o próprio CloneStudio instala as dependências de `templates/base`
(React, Vite, TypeScript) com `npm install`.

## Atualizar

Copie novamente o código-fonte do CloneStudio, excluindo os itens acima, e rode a suíte Python:

    .\.venv\Scripts\python.exe -m pytest -q
