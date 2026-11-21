# CentralIA — painel do operador

Painel web da plataforma de agentes. O operador despacha ações fechadas, acompanha resultados,
revisa aprovações e auditoria, ajusta parâmetros em tempo real e controla o kill switch. As regras
de negócio são determinísticas; o modelo apenas interpreta a intenção do pedido.

## Stack

TanStack Start · React · TypeScript · Tailwind CSS v4 · Supabase (Lovable Cloud) · Bun · Vitest.

## Comandos

```sh
bun install --frozen-lockfile
bun run dev          # servidor de desenvolvimento
bun run typecheck    # tsc --noEmit
bun run test         # vitest run
bun run build        # build de produção
```

`bun run lint` existe, mas o job `ui` do CI não o executa por dívida de formatação Prettier
pré-existente. A versão do Bun é fixada no workflow `.github/workflows/ci.yml`.

## Arquitetura

- Lógica pura (contratos, gates, parsers, cálculos) em `src/lib/core/`, sem I/O.
- Orquestração no servidor em `src/lib/server/*.server.ts`.
- Entradas chamáveis pelo navegador em `src/lib/api/*.functions.ts`, todas protegidas por
  `requireOperator` — toda ação de agente é restrita ao operador.
- Auditoria e aprovações usam JSON canônico compatível com Python (`src/lib/core/canonical.ts`) e
  `ts_exact`; nunca resserializar o texto `detail` armazenado, para não quebrar a cadeia de hashes.
- Escritas de auditoria, aprovação e kill switch passam por funções do banco (triggers append-only).
- LLM em `src/lib/server/llm.server.ts`: Groq quando `GROQ_API_KEY` está definida; Lovable AI
  otherwise. Nenhuma chamada de modelo vai para o navegador.
- Resultados de server functions são JSON simples, embrulhados com `outcomeDto`/`toJson`.
- Configurações e preferências por agente são lidas a cada requisição; prompts customizados
  complementam (nunca substituem) os contratos e gates fixos.
- Nomes de ferramentas, agente dono, parâmetros e sequência vêm somente de
  `src/lib/core/toolRegistry.ts`.
- O cliente do CloneStudio (`src/lib/server/studio.server.ts`) é o único ponto que fala com o
  serviço local: HTTP apenas em loopback, HTTPS somente para host explicitamente listado em
  `STUDIO_ALLOWED_HOSTS`, sem redirects, com teto de resposta e campos filtrados.

## Operação

Schema, migrations, arquivos gerados e segredos são administrados no Lovable — não editar
`supabase/migrations/`, `drizzle/` nem arquivos com cabeçalho de geração automática.
`LOVABLE_API_KEY` nunca entra em código de navegador; chaves privadas ficam em Cloud Secrets.

Para expor o CloneStudio além de `127.0.0.1` é obrigatório um novo ADR aprovado e autorização
explícita. Nenhum túnel, domínio ou host público faz parte deste projeto neste momento.
