# Plataforma comercial CentralIA — documentos de arquitetura (Fase 2)

Este diretório registra o desenho da área comercial sobre o projeto existente. É uma **especificação**, não uma implementação de schema.

| Doc | Conteúdo | Status |
|-----|----------|--------|
| `00-indice.md` | este índice | feito |
| `01-arquitetura.md` | fronteiras entre core, servidor, API e banco; fluxo de uma ação de agente | feito |
| `02-modelo-dados.md` | entidades, relacionamentos e invariantes | feito |
| `03-rls-permissoes.md` | isolamento por tenant, papéis, matriz de autonomia e hard gate | feito |
| `04-lgpd-integracoes.md` | minimização, consentimento, retenção, oposição e integrações | feito |
| `05-especificacao-lovable.md` | instrução a ser enviada ao Lovable para criar tabelas, funções e policies | feito |
| `06-agentes.md` | os nove agentes comerciais da Fase 5, suas ações, ferramentas, autonomia e limites | feito |
| `07-atendimento.md` | contratos de atendimento e WhatsApp da Fase 6, sem envio real | feito |
| `08-automacoes.md` | contratos de workflows e planejamento de automações da Fase 7, sem executor | feito |
| `09-propostas.md` | catálogo, preço BRL, desconto, proposta, versionamento e PDF da Fase 8, sem envio ou checkout | feito |
| `10-inteligencia.md` | consolidação de leituras reais, lacunas, divergências e camada editorial da Fase 9, sem execução | feito |
| `11-seguranca.md` | permissões por ator, LGPD, auditoria encadeada e preflight da Fase 10, sem exposição ou deploy | feito |
| `12-handoff.md` | autorizações pendentes (A1–A8), dependências e critérios de aceite após as 10 fases | feito |
| `13-prompt-lovable.md` | prompt único, pronto para colar no editor do Lovable, consolidando `02`, `03` e `05` | pronto, aguarda Lovable |
| `14-plano-testes-isolamento.md` | 14 casos para validar RLS, grants, append-only, aprovação e kill switch (A4) | pronto, aguarda A2/A3 |
| `15-script-sql-manual.md` | roteiro SQL alternativo para o Supabase, **não executado**, com avisos de divergência | não autorizado |
| `16-revisao-consistencia.md` | divergências corrigidas nos contratos puros e um ponto de fuso pendente de decisão | concluída; fuso aguarda decisão |

**Regras de leitura**

1. O schema atual (19 tabelas) é o baseline; nada aqui foi aplicado ao banco real.
2. `drizzle/`, `supabase/migrations/`, arquivos gerados e segredos não são editados nesta fase.
3. A vitrine `/vendas` continua ilustrativa; nenhum item desta especificação a transforma em catálogo real automaticamente.
4. O ADR [0010](../adr/0010-arquitetura-comercial-multitenant.md) foi **aprovado em 2026-11-21 como especificação** (A1). Isso autoriza enviar o prompt ao Lovable, mas **não** autoriza escrever `supabase/migrations/` ou `drizzle/` à mão, expor rede nem executar envios reais.
5. O schema da Fase 2 ainda não foi aplicado: o Lovable MCP está desconectado e nenhuma `send_message` está disponível. Use `13-prompt-lovable.md` no editor do Lovable para desbloquear A2–A6.
