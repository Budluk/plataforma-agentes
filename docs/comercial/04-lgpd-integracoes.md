# 04 — LGPD e integrações

## Princípios

- **Finalidade e base legal** declaradas antes da coleta: `lead_sources.legal_basis` e `consent_events.legal_basis`.
- **Minimização**: coletar só o necessário para a etapa atual do funil. CPF/CNPJ só quando houver finalidade e base legal; nunca "por padrão".
- **Documentos**: `document_token` é HMAC com chave em Cloud Secret; `document_last4` para conferência; valor integral só se necessário e protegido.
- **Oposição**: `contacts.opted_out` e `consent_events` com `revoked_at` impedem novas mensagens, mesmo se houver score alto.
- **Retenção**: `retention_policies` por tipo de entidade; job de limpeza usa `data_subject_requests` e registra o resultado.
- **Titular**: `data_subject_requests` cobre acesso, correção, exclusão, oposição e portabilidade; exportação é ação sensível com aprovação.
- **Auditoria**: eventos append-only, sem prompt/resposta bruta, com redação de segredos e limites de tamanho.

## Dados de prospecção

1. Usar apenas fontes públicas autorizadas, com termos de uso compatíveis.
2. Registrar URL/fonte, data da consulta e finalidade antes de salvar qualquer dado.
3. Verificar duplicidade por `document_token`, e-mail ou telefone normalizado; unificar só com confirmação humana.
4. Classificar necessidade provável como **hipótese**, nunca como fato confirmado.
5. Necessidades confirmadas só entram no CRM quando o próprio contato as informar e a origem for registrada.
6. Skills de scraping (Thirdwatch) são instruções, não código confiável: só trechos autorizados, sem evasão anti-bot para dados restritos.

## Integrações priorizadas

| Integração | Finalidade | Gate |
|---|---|---|
| Supabase/Lovable | schema, RLS, storage, funções | Aprovação do ADR-0010 e aplicação no editor |
| Gateway LLM existente | agentes e redação assistida | Já disponível; sem novo segredo |
| WhatsApp Business API oficial | atendimento e mensagens autorizadas | ADR novo, template aprovado, consentimento, testes |
| E-mail comercial | propostas e follow-ups | Domínio verificado, opt-out e aprovação |
| Playwright | E2E e QA | Dev-only, versões fixadas |
| Context7 / Skills | suporte ao desenvolvimento | Dev-only, dados não confiáveis |
| DeskcommCRM / wacrm | referência de RLS, inbox e automações | Portar ideias, preservar licença MIT |

## Restrições

- Nenhum segredo em repositório, browser, log ou resposta de ferramenta.
- Nenhuma automação não oficial de WhatsApp em produção.
- Nenhuma vitrine ilustrativa tratada como catálogo real.
- Nenhuma exportação de dados pessoais sem aprovação e registro.
- Nenhuma integração com FreeLLMAPI para dados de clientes; o próprio autor desaconselha produção.
