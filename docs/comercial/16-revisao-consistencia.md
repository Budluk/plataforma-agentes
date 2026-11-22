# 16 — Revisão de consistência das regras (2026-11-22)

Revisão dos contratos puros em `lovable-app/src/lib/core/`. Nenhuma tabela, migration, segredo, deploy ou exposição foi alterado. Todas as mudanças são locais e revertíveis por commit normal.

## Achados corrigidos

| # | Antes | Correção aplicada | Verificação |
|---|---|---|---|
| 1 | `enviar_mensagem` era tratado como escrita comum; `envio_mensagem` é a ação sensível canônica | `seguranca.ts` canonicaliza aliases antes de avaliar capacidade e sensibilidade; testes usam a forma canônica | Teste de regressão em `seguranca-extra.test.ts` |
| 2 | CPF/CNPJ e dados pessoais não eram mascarados pelo `redact` antes da auditoria append-only | `redact.ts` passou a mascarar `cpf`, `cnpj`, `rg`, `documento`, `endereco`, `telefone` e `data_nascimento` | Teste lê `ev.canon` e confirma ausência do CPF |
| 3 | Integração podia rebaixar o escopo exigido (`scope: "read"` para ação de escrita) | Hierarquia `read < write < approve < admin`; override mais fraco é negado | Dois testes de regressão em `seguranca-extra.test.ts` |
| 4 | Hard gate cobria apenas tokens em inglês | `hardGate.ts` inclui os aliases PT-BR de `SENSIBLE_ACTIONS` | Teste em `comercial-extra.test.ts` |
| 5 | `killEngaged` usava coercion truthy em `comercial.ts` e `=== true` nos demais módulos | Uniformizado para `=== true` | Suíte existente de autonomia/kill switch |
| 6 | `snapshotProposalVersion` e `prepareReply` confiavam no `organization_id` recebido | `organizationId` obrigatório no snapshot com checagem; `prepareReply` compara com `conv.organization_id` e usa o tenant da conversa; `prepareReminder` rejeita tenant vazio | Testes em `propostas-extra.test.ts` |
| 7 | `amount_cents` × `qty` podia exceder `Number.MAX_SAFE_INTEGER` | Subtotal validado com `Number.isSafeInteger` antes do cálculo de desconto | Teste com preço e quantidade extremos |
| 8 | Proposta real bloqueada era registrada como `amostra` na auditoria | `redactProposalAudit` aceita a origem da requisição; `prepareProposal` propaga `origin` | Teste de regressão em `propostas-extra.test.ts` |
| 9 | `seguranca.ts` tratava `list_apps` como leitura, mas o registry usa `action: "list"` | `"list"` incluído nas ações de leitura | Suíte existente |
| 10 | `ProposalPending` não previa `origin` | Campo obrigatório `origin: "real" \| "amostra"` adicionado ao contrato pendente | Typecheck |

## Pendente de decisão (não alterado)

- **Fuso dos buckets de analytics.** `crm-dashboard.ts` e `inteligencia.ts` declaram `America/Sao_Paulo`, mas `dashboard.ts` calcula dia/semana/mês com `Date.UTC`. O "dia atual" troca às 21:00 de Brasília. Corrigir isso muda a semântica de `bucketStart`, `shiftBucket`, `periodCounts` e `windowCounts`, além dos testes que hoje afirmam explicitamente buckets em UTC. Como altera números históricos de relatório, foi **registrado e não modificado**; requer aprovação explícita para virar comportamento padrão.

## Consistências confirmadas sem mudança

- `COMMERCIAL_ACTIONS` não contém ação sensível; nenhum token proibido está registrado como permitido.
- `decideAutonomy`, `authorizeCommercialAction`, `evaluateActorPermission`, `prepareProposal` e `evaluateDiscount` exigem aprovação humana para toda ação sensível.
- Kill switch bloqueia em todos os caminhos avaliados.
- Formatação BRL (`pt-BR`) e uso de centavos inteiros são uniformes; a única ressalva era o limite seguro, já corrigido.
- Rótulos `AMOSTRA`, `origin`, `sample` e o `SAMPLE_LABEL` são preservados em propostas e relatórios.

## Segunda revisão — limites API/server/routes

| Achado | Correção aplicada |
|---|---|
| `decideAutonomy` comparava ações sensíveis sem canonicalizar aliases, e `stageMove` repassa `action` como string livre | `canonicalAction` passou a viver em `comercial.ts` (fonte canônica) e é usado em `decideAutonomy`, `seguranca.ts`, `automacoes.ts` e nos grants; teste de regressão cobre `enviar_mensagem` |
| `Number.isSafeInteger` protegia apenas o subtotal por item | Totais por linha e agregados (`subtotal`, `discount`, `tax`, `total`) são validados antes de montar o draft; teste com dois itens válidos cujo soma estoura o limite |

Verificado como consistente: nenhum entrypoint chama `snapshotProposalVersion`, nenhuma server function recebe `organization_id` do cliente, toda mutação usa `requireOperator`, auditoria/approvals/kill switch são escritos apenas por RPCs append-only, não há I/O ou relógio direto no core, nenhuma ação sensível chega a envio/checkout/pagamento sem aprovação e a vitrine `/vendas` não faz checkout nem apresenta dado fictício como real.

## Validação

`typecheck` OK · 26 arquivos / 345 testes OK · `build` OK.
