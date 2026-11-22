# 06 — Agentes comerciais (Fase 5)

Este documento registra a proposta de nove agentes comerciais sobre o projeto existente. É uma **especificação implementada apenas como contrato puro**: não cria tabelas, não registra ferramentas de execução, não liga rotas nem UI e não autoriza envio.

## Lista nominal

| # | `agent_id` | Nome | Papel | Ações | Ferramentas | Autonomia padrão |
|---|---|---|---|---|---|---|
| 1 | `prospector_agent` | Prospecção | Avalia fontes autorizadas e prepara leads sem contatar ninguém | `avaliar_fonte`, `preparar_lead` | `avaliar_fonte`, `preparar_lead` | `assistido` |
| 2 | `qualifier_agent` | Qualificação | Calcula score com evidências explícitas e recomenda classificação | `calcular_score`, `qualificar_lead` | `calcular_score`, `qualificar_lead` | `semiautonomo` |
| 3 | `crm_steward_agent` | CRM e higiene | Detecta duplicatas, mostra preview de união e aplica segmentos | `detectar_duplicatas`, `previsualizar_merge`, `segmentar_contatos` | homônimas | `semiautonomo` |
| 4 | `pipeline_agent` | Funil e Kanban | Monta quadros e propõe avanços de etapa | `montar_kanban`, `mover_oportunidade` | homônimas | `autonomo_controlado` |
| 5 | `funnel_agent` | Análise de funil | Lê funil de anúncios e vendas com ferramenta já existente | `ler_funil` | `analyze_funnel` (reuso) | `autonomo_controlado` |
| 6 | `sales_agent` | Vendas e margem | Margem, preço sugerido e ponto de equilíbrio já registrados | `calcular_margem`, `sugerir_preco`, `calcular_break_even` | `compute_margin`, `suggest_price`, `break_even` (reuso) | `autonomo_controlado` |
| 7 | `proposal_agent` | Propostas | Prepara rascunho e valida desconto contra a tabela autorizada | `preparar_proposta`, `validar_desconto` | homônimas | `semiautonomo` |
| 8 | `followup_agent` | Relacionamento | Rascunha respostas e lembretes; envio real fica com uma pessoa | `rascunhar_resposta`, `preparar_lembrete`, `carregar_conversa`, `validar_template`, `avaliar_janela`, `preparar_optout` (extensão da Fase 6) | homônimas | `assistido` |
| 9 | `insights_agent` | Inteligência comercial | Consolida leituras reais, séries e tendências salvas | `ler_dashboard`, `gerar_leitura` | homônimas | `autonomo_controlado` |

`funnel_agent` e `sales_agent` já existiam no registro e são reaproveitados; as outras sete funções são novas. Nenhuma das nove substitui os agentes atuais nem duplica `sales.ts`.

## Regras comuns

- **Ferramentas:** todas vêm de `src/lib/core/toolRegistry.ts`. As novas entradas são de leitura ou preparação. Nenhuma contém token vetado por `hardGate.ts`.
- **Ações sensíveis:** `envio_mensagem`, `campanha_em_massa`, `checkout`, `pagamento`, `desconto_extraordinario`, `alteracao_preco`, `exclusao`, `exportacao_dados`, `contrato`, `compromisso_financeiro` e `alteracao_permissoes` nunca aparecem como ação de agente.
- **Autonomia:** `decideAutonomy` continua sendo a única fonte da decisão. O nível padrão da spec não concede permissão: a server function deve fornecer `agent_grants.actions` do tenant. Sem grant, a ação é bloqueada.
- **Kill switch:** verificado antes de qualquer autorização; com kill ativo, nenhuma ação é proposta nem executada.
- **Saída da IA:** contrato rígido `CommercialAgentProposal` (`action`, `tool`, `summary`, `needs_approval`, `reasons`). O modelo não fornece números; números vêm das primitivas puras das Fases 2–4 e, para propostas, de `propostas.ts` (Fase 8). O contrato de saída de `proposal_agent` é o `ProposalPreparation` de `propostas.ts`: `status`, `canSend: false`, `canCheckout: false`, `requiresApproval`, `reasons`, `draft` e `audit`, com desconto acima da tabela virando `desconto_extraordinario` sujeito a aprovação.
- **Prompt:** derivado da spec em `commercialAgentSystem`, com regras de não invenção, `sem_dados`, vitrine rotulada `AMOSTRA`, dado-vs-instrução e proibição de envio/campanha/cobrança.
- **Auditoria:** quando a Fase 5 for ligada ao servidor, cada autorização/preparação deve registrar `run_id`, `organization_id`, `agent_id`, `tool`, resumo redigido e `ts_exact`, sem prompt ou resposta bruta.
- **Saída de `insights_agent`:** `IntelligenceReading` de `inteligencia.ts` (Fase 9) — consolida leituras já calculadas, nunca as refaz; `canSend: false` e `canExecute: false` em todos os níveis de autonomia. A camada editorial de IA não pode conter dígitos e só referencia achados existentes.
- **Gate unificado (Fase 10):** `evaluateActorPermission` de `seguranca.ts` aplica tenant, kill switch, hard gate e ação sensível antes de consultar `agent_grants`; a auditoria usa `buildSecurityAuditEvent`/`verifyAuditChain` com o mesmo canonical e hash chain da plataforma. Ver `11-seguranca.md`.

## Limites desta fase

- Nenhuma server function, entrypoint, rota, componente ou migração foi criado.
- Nenhum agente envia mensagem, lança campanha, altera preço, aplica desconto extraordinário, exclui, exporta, assina contrato, realiza checkout/pagamento ou altera permissões.
- WhatsApp e publicação social permanecem fora de escopo até ADR específico; publicação social continua simulada.
- O schema da Fase 2 continua sem aplicação: os agentes não leem tabelas comerciais reais.

## Validação

- `validateCommercialRegistry()` verifica ids/actions únicos, ferramentas registradas e pertencentes a agentes comerciais, presença de responsável por ação e ausência de ações sensíveis na matriz.
- Testes em `src/test/commercial-agents.test.ts` cobrem a lista de nove, reuso de ferramentas, veto do hard gate, ToolMonitor, grant ausente, kill switch, escopo por agente, desconto fora da tabela e coerência da proposta da IA.
- `npm run typecheck`, `npm test`, `npm run build` e `git diff --check` devem passar antes do relatório de fase.
