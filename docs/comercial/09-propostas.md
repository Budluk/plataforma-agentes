# 09 — Propostas e catálogo (Fase 8)

Contratos puros para catálogo, tabela de preço, desconto, montagem de proposta, versionamento e PDF. Nada aqui envia proposta, publica oferta, inicia checkout ou processa pagamento.

Arquivo: `lovable-app/src/lib/core/propostas.ts`.

## Catálogo

`CatalogProduct` exige `organization_id`, `sku`, `name`, `category`, `unit`, `active` e `origin` (`real` | `amostra`). A origem é explícita: nunca é inferida por nome bonito ou preço. Produtos de vitrine entram como `amostra` e recebem o rótulo `AMOSTRA — item ilustrativo, não é produto, preço ou venda real`.

Uma proposta `real` só aceita itens `real`; uma proposta `amostra` só aceita itens `amostra`. Misturar origens bloqueia a preparação.

## Tabela de preço

`PriceTable` usa `currency: "BRL"` e `price_items` com `amount_cents` inteiro, `min_qty`, `max_discount_pct`, `tax_pct` e vigência opcional (`valid_from`/`valid_until`). `resolvePrice` exige `asOf` explícito: sem preço vigente, quantidade inválida ou janela expirada, devolve `sem_dados` — nunca inventa preço.

## Desconto

- Dentro de `max_discount_pct`: ação normal `validar_desconto`, autorizada por `authorizeCommercialAction` com grants do tenant e os três níveis de autonomia.
- Acima do limite: vira `desconto_extraordinario`, ação sensível — `allowed: false`, `requiresApproval: true` em qualquer nível, mesmo com grant explícito.
- Kill switch, grants ausentes ou percentual inválido bloqueiam. A proposta pode ser preparada com desconto extraordinário, mas fica marcada para aprovação; o motivo sobe para `reasons`.

## Proposta

`prepareProposal` exige `organizationId`, proposta, catálogo, tabela de preço, grants, autonomia e `asOf` do chamador. Valida tenant, validade futura explícita, unicidade de SKU, origem, preço vigente e autorização. Todos os cálculos são em centavos inteiros:

```
subtotal = preço_unitário × quantidade
desconto = arredondar(subtotal × desc%)
imposto  = arredondar((subtotal − desconto) × imposto%)
total    = subtotal − desconto + imposto
```

Resultado: `status: "preparado" | "bloqueado"`, `canSend: false`, `canCheckout: false`, `requiresApproval`, `draft` e `audit`. A auditoria guarda só ids, versão, origem, contagem de itens, total e razões limitadas — sem notas, condições de pagamento ou descrições de itens.

## Versionamento

`snapshotProposalVersion` usa `canonical()` + `sha256hex()` do módulo de auditoria, com `created_at` a partir de `asOf` explícito. Cada versão registra `snapshot_id`, `previous_snapshot_id`, `actor` e o snapshot completo. O mesmo rascunho gera o mesmo hash; ids divergentes, ator vazio ou instante inválido geram erro.

## PDF

`buildProposalReport` produz o mesmo `ReportDocument` usado pelo relatório de vendas; `proposalPrintHtml` chama o renderizador existente para a janela de impressão do navegador. Seções: identificação, itens, totais, aprovação/limites e, opcionalmente, “Leitura por IA”.

A camada de IA é apenas editorial e usa `SalesNarrativeSchema`. Se falhar, o PDF traz o aviso e todos os números permanecem determinísticos. Nenhuma chamada de modelo ou server function foi adicionada nesta fase.

## Limites desta fase

- Nenhuma migração, tabela, RLS, tipo gerado, segredo, server function, entrypoint, rota ou componente de UI.
- Nenhuma ferramenta de envio, campanha, checkout ou pagamento registrada.
- Nenhum catálogo real é lido: o schema da Fase 2 ainda não foi aplicado no Lovable.
- Produtos da vitrine continuam ilustrativos e rotulados `AMOSTRA`.
- Publicação social permanece simulada e separada deste módulo.

## Validação

- `npm run typecheck`, `npm test`, `npm run build` e `git diff --check`.
- Testes em `src/test/propostas.test.ts`: catálogo, preço, desconto, preparação, redação de auditoria, versionamento e PDF/IA.
