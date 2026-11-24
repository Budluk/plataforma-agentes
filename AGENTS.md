# CentralIA — instruções para agentes (raiz do repositório)

Este repositório é o **plataforma-agentes** da CentralIA. A aplicação principal vive em `lovable-app/`.

## Regras de ouro

1. **Não reescrever histórico publicado.** Não faça force push, rebase, amend ou squash de commits já pushados para `main` — isso reescreve o histórico no lado do Lovable e o usuário perde o histórico do projeto.
2. **Commits em `main` sincronizam com Lovable.** Mantenha a branch em estado de funcionamento (`typecheck`, `test` e `build` verdes).
3. **Database é gerenciado pelo Lovable.** Não adicione nem edite `supabase/migrations/` ou `drizzle/` à mão. Peça ao Lovable (via editor ou MCP `send_message`) para mudar o schema.
4. **Não edite arquivos gerados.** Arquivos com cabeçalho de "automatically generated" não devem ser tocados manualmente.
5. **IA gateway no Lovable.** Mantenha chamadas de modelo no gateway do Lovable e nunca coloque `LOVABLE_API_KEY` no código do navegador.
6. **Segredos gerenciados pelo Lovable.** Não coloque valores de secret/token no repositório.
7. **Sem exposição, deploy, túnel, domínio ou rotação de token de produção sem autorização explícita separada.** O gate A→B (Alvo B) requer: hostname interno definitivo, Cloudflare Access + WARP/rota privada, token definitivo em Cloud Secret e ADR aprovando A→B com CI verde.

## Onde está cada coisa

- Regras específicas do Lovable: `lovable-app/AGENTS.md`
- Documentação comercial (Fases 2–10): `docs/comercial/`
- ADRs (decisões de arquitetura): `docs/adr/`
- Prompt pronto para o Lovable (Fase 2): `docs/comercial/13-prompt-lovable.md`
- Plano de testes de isolamento (A4): `docs/comercial/14-plano-testes-isolamento.md`
- Roteiro SQL manual alternativo (não executado): `docs/comercial/15-script-sql-manual.md`
- Revisão de consistência das regras: `docs/comercial/16-revisao-consistencia.md`
- Auditoria dos módulos restantes: `docs/comercial/17-auditoria-modulos.md`
- Planejamento da FASE 1 do Prompt Mestre: `docs/FASE1_PLANNING.md`
- Tipos preparados para o schema Fase 2 (não criam tabelas): `lovable-app/src/lib/core/schema-pending.ts`
- Testes extras de regras comerciais: `lovable-app/src/test/*-extra.test.ts`

## Estado atual (2026-11-24)

- A1 concluído (ADR 0010 aprovado).
- A7 concluído (commits `8edbc37`, `57069ca`, `7d084ef`, `dd26c85`, `92ec01d`, `4d9999b` pushados, sem PR).
- FASE 0 do Prompt Mestre concluída: seis documentos em `docs/`, commit `1330288`, sem alteração de código.
- FASE 1 concluída como planejamento documental: `docs/FASE1_PLANNING.md`, `docs/IMPLEMENTATION_ROADMAP.md` e `docs/comercial/01-arquitetura.md`. Nenhuma tabela, migration, segredo ou `.env` alterado.
- Dependências Drizzle removidas em `2b18d5c` (não eram importadas). Último commit pushado: `1537afe`, sincronizado com `origin/main`, CI verde (`45439688124`).
- Validação do lote mais recente: `typecheck` OK, 26 arquivos / 350 testes OK, `build` OK.
- A2 bloqueado: sem créditos no Lovable e MCP sem `send_message` nem recursos. O schema da Fase 2 não foi aplicado.
- A3–A6 pausadas: dependem de A2.
- A8 bloqueado: gate C fechado (faltam hostname, Cloudflare, token em Cloud Secret e ADR aprovando A→B com CI verde). Nada foi exposto e nenhum comando de túnel foi executado.
