# 07 — Atendimento e WhatsApp (Fase 6)

Contratos puros para atendimento, com foco em WhatsApp. **Nenhuma mensagem é enviada por esta fase.** O envio real depende de ADR novo, integração oficial (WhatsApp Business API), template aprovado, consentimento e testes em ambiente autorizado.

## Canais

| Canal | Status | Regra |
|---|---|---|
| `whatsapp_business_api` | suportado (somente oficial) | única forma de WhatsApp permitida; sem contas pessoais, `whatsapp_web` ou bibliotecas não oficiais |
| `email` | suportado como rascunho | domínio verificado e opt-out na integração futura |
| `painel` | suportado como rascunho | comunicação interna, sem efeito externo |

`assertSupportedChannel` rejeita qualquer outro valor. Nenhum canal habilita envio nesta fase.

## Contratos e funções puras

Arquivo: `lovable-app/src/lib/core/atendimento.ts`.

| Função | Papel |
|---|---|
| `evaluateServiceWindow` | janela oficial de 24h a partir de `asOf` e `last_inbound_at` explícitos; sem dados vira `sem_dados` |
| `validateTemplateUse` | exige template aprovado, variáveis exatas e consentimento para `marketing` |
| `detectOptOut` | detecta `parar`, `sair`, `cancelar`, `descadastrar`, `remover`, `não quero mais`, `stop`, `unsubscribe`, `opt out` (insensível a acentos e caixa) |
| `evaluateSendGate` | `envio_mensagem` continua sensível: `allowed: false`, `requiresApproval: true`, mesmo com grant explícito |
| `prepareReply` | devolve `status: "preparado" | "bloqueado"`, `canSend: false`, rascunho para revisão humana e registro de auditoria redigido |
| `prepareReminder` | tarefa interna com prazo explícito; nunca inventa data e nunca envia |
| `prepareOptOut` | prepara registro de oposição (`requiresConfirmation: true`) sem gravar nada |
| `evaluateRetention` | sinaliza prazo de retenção vencido; exclusão continua ação sensível e humana |
| `redactForAudit` | mantém apenas ids, canal, direção, tamanho em faixa e status; corpo bruto nunca entra na auditoria |

## Regras aplicadas em `prepareReply`

1. Conversa válida por zod, com `organization_id` e `contact_id` obrigatórios.
2. `conv.opted_out` ou `contactOptedOut` bloqueia qualquer rascunho.
3. Conversa `encerrada` exige reabertura humana.
4. Finalidade obrigatória; `evidence_ref` obrigatório salvo quando a base legal for `contrato`.
5. Sem template aprovado, só é permitida resposta livre dentro da janela de 24h.
6. Kill switch ou grant ausente bloqueiam a preparação.
7. Mesmo no nível `autonomo_controlado`, o objeto final mantém `canSend: false` e `requiresApproval: true`.

Todas as razões são em pt-BR. Nenhum número, data ou conteúdo é inferido.

## Extensão do registro de agentes

O `followup_agent` (Fase 5) passou a ter seis ações: `rascunhar_resposta`, `preparar_lembrete`, `carregar_conversa`, `validar_template`, `avaliar_janela` e `preparar_optout`. As quatro novas ferramentas foram adicionadas ao `toolRegistry.ts` como leitura/preparação. Nenhuma contém token vetado por `hardGate.ts`.

## Limites desta fase

- Nenhuma server function, entrypoint, rota, componente, migração ou dependência nova.
- Nenhuma integração com WhatsApp, e-mail ou provedor de mensagens.
- Nenhuma automação não oficial, scraping ou sessão pessoal.
- Publicação social continua simulada e separada deste módulo.
- Dados de conversas reais ainda não são lidos: o schema da Fase 2 não foi aplicado.

## Validação

- `npm run typecheck`, `npm test`, `npm run build` e `git diff --check`.
- Testes em `src/test/atendimento.test.ts`: canais, opt-out, janela, templates, gate de envio, rascunhos, lembretes, oposição, retenção e redação de auditoria.
- A suíte continua sem dados fictícios apresentados como reais; a vitrine `/vendas` permanece `AMOSTRA`.
