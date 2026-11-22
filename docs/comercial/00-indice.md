# Plataforma comercial CentralIA — documentos de arquitetura (Fase 2)

Este diretório registra o desenho da área comercial sobre o projeto existente. É uma **especificação**, não uma implementação de schema.

- `00-indice.md` — este índice.
- `01-arquitetura.md` — fronteiras entre core, servidor, API e banco; fluxo de uma ação de agente.
- `02-modelo-dados.md` — entidades, relacionamentos e invariantes.
- `03-rls-permissoes.md` — isolamento por tenant, papéis, matriz de autonomia e hard gate.
- `04-lgpd-integracoes.md` — minimização, consentimento, retenção, oposição e integrações.
- `05-especificacao-lovable.md` — instrução a ser enviada ao Lovable para criar tabelas, funções e policies.
- `06-agentes.md` — os nove agentes comerciais da Fase 5, suas ações, ferramentas, autonomia e limites.
- `07-atendimento.md` — contratos de atendimento e WhatsApp da Fase 6, sem envio real.
- `08-automacoes.md` — contratos de workflows e planejamento de automações da Fase 7, sem executor.
- `09-propostas.md` — catálogo, preço BRL, desconto, proposta, versionamento e PDF da Fase 8, sem envio ou checkout.
- `10-inteligencia.md` — consolidação de leituras reais, lacunas, divergências e camada editorial da Fase 9, sem execução.
- `11-seguranca.md` — permissões por ator, LGPD, auditoria encadeada e preflight da Fase 10, sem exposição ou deploy.
- `12-handoff.md` — autorizações pendentes (A1–A8), dependências e critérios de aceite após as 10 fases.

**Regras de leitura**

1. O schema atual (19 tabelas) é o baseline; nada aqui foi aplicado ao banco real.
2. `drizzle/`, `supabase/migrations/`, arquivos gerados e segredos não são editados nesta fase.
3. A vitrine `/vendas` continua ilustrativa; nenhum item desta especificação a transforma em catálogo real automaticamente.
4. O ADR [0010](../adr/0010-arquitetura-comercial-multitenant.md) está como minuta e precisa de aprovação explícita antes de qualquer mudança de schema.
