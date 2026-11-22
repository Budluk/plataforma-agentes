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

## Estado atual (2026-11-21)

- A1 concluído (ADR 0010 aprovado).
- A7 concluído (commits `8edbc37` e `57069ca` pushados, sem PR).
- A2 bloqueado: sem créditos no Lovable e MCP sem login OAuth. O schema da Fase 2 não foi aplicado.
- A8 bloqueado: gate C fechado (faltam hostname, Cloudflare, token em Cloud Secret, ADR aprovado e CI verde).
- Feature de PDF com IA commitada em `dd26c85`.
