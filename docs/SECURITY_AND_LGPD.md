# SECURITY_AND_LGPD.md — Segurança, LGPD e Conformidade

**Projeto:** CentralIA / plataforma-agentes  
**Escopo:** Centralia Sales + Centralia Digital Commerce  
**Data:** 22/11/2026  
**Status:** Planejamento (pendente de aprovação da FASE 0)

---

## 1. PRINCÍPIOS DE SEGURANÇA

| Princípio | Descrição |
|-----------|-----------|
| **Fail closed** | Kill switch, hard gate, RLS e grants falham fechado: ausência de permissão = bloqueio. |
| **Isolamento por tenant** | Todo dado comercial tem `organization_id`. Nenhuma server function comercia resolve `organization_id` enviado pelo cliente. |
| **Autorização no backend** | Todas as server functions são guardadas por `requireOperator` (autenticação Supabase + role). |
| **Nunca confiar no cliente** | Validações críticas ocorrem apenas no server. O frontend não impõe limites de segurança. |
| **Segredos fora do repositório** | Nenhuma chave privada, token ou segredo no código do navegador nem no repositório. Gerenciados pelo Lovable (Cloud Secrets). |
| **Auditoria encadeada** | Todas as operações sensíveis são registradas com canonical JSON + sha256, compatível com Python. |
| **Mínimo privilégio** | Agentes e integrações têm grants limitados a ações específicas e níveis de autonomia definidos. |

---

## 2. AUTENTICAÇÃO E AUTORIZAÇÃO

### Camadas

1. **Autenticação:** Supabase Auth (JWT via `requireSupabaseAuth`).
2. **Autenticação server:** `client.server.ts` usa service role key (apenas operações server-side confiáveis, bypassa RLS — usar com extremo cuidado).
3. **Autorização:** `requireOperator` exige role `admin` via RPC `has_role`.
4. **Autorização comercial:** `authorizeCommercialAction()` verifica escopo do agente, `agent_grants`, `integration_grants`, kill switch, desconto fora da tabela e nível de autonomia. `evaluateActorPermission()` canonicaliza aliases de ações sensíveis e usa a hierarquia de escopos `read < write < approve < admin`, rejeitando overrides mais fracos que a capacidade exigida.

### Papéis de tenant (`docs/comercial/03-rls-permissoes.md`)

| Papel | Permissões típicas |
|-------|-------------------|
| `owner` | Controle total da organização, incluindo gestão de membros e grants. |
| `admin` | Gestão da organização, exceto alterações críticas de segurança sem aprovação. |
| `manager` | Gestão de leads, oportunidades, propostas, automações. |
| `seller` | Leitura e escrita de leads, oportunidades, propostas próprias. |
| `viewer` | Leitura apenas. |

### Níveis de autonomia

| Nível | Comportamento | Aprovação humana |
|-------|---------------|------------------|
| `assistido` | IA recomenda, humano executa. | Obrigatória para execução. |
| `semiautonomo` | IA prepara, aprovação necessária. | Obrigatória. |
| `autonomo_controlado` | IA executa dentro de limites definidos. | Obrigatória para ações sensíveis. |

### Hard gate (`hardGate.ts`)

Ferramentas vetadas (nome contém tokens):
- `send_whatsapp`, `launch_campaign`, `checkout`, `payment`, `purchase`, `charge_card`, `set_budget`, `publish_page`, `submit_form`, `post_form`, `login`, `download`, `execute_code`, `run_code`, `run_script`, `eval_code`, `shell_command`, `pip_install`, `git_push`, `deploy`, `execution_order`, `place_order`, `submit_order`, `send_order`

Nenhuma dessas ferramentas está registrada no `toolRegistry.ts`.

---

## 3. RLS E ISOLAMENTO POR TENANT

### Requisitos

- Toda tabela comercial tem coluna `organization_id`.
- Políticas RLS usam `organization_id` resolvido da sessão autenticada (`auth.uid()` + `memberships`).
- **Nunca confiar em `organization_id` enviado pelo cliente** — o valor é ignorado ou rejeitado se tentar gravar em outro tenant.
- Índices em `organization_id` para desempenho e integridade.

### Tabelas com RLS planejadas

`organizations`, `memberships`, `agent_grants`, `integration_grants`, `people`, `leads`, `opportunities`, `proposals`, `consent_events`, `conversations`, `messages`, `orders`, `payments`, `audit_events`, `approvals`, `kill_switch`.

### Funções de resolução de tenant (`security definer`, `search_path = ''`)

- `current_organization_ids()` — retorna IDs das organizações do usuário autenticado.
- `has_tenant_role(p_org, p_roles)` — verifica se o usuário tem papel na organização.

### Políticas RLS (modelo, a ser aplicado pelo Lovable na Fase 2)

- Leitura: `organization_id IN (SELECT current_organization_ids())`.
- Escrita: `has_tenant_role(organization_id, ['seller','manager','admin','owner'])` para dados comerciais; `['admin','owner']` para grants e integrações.
- `consent_events`: leitura restrita a `admin`/`owner`; inserção permitida para o próprio tenant.
- Tabelas append-only (`consent_events`, `audit_events`): triggers bloqueam UPDATE e DELETE.

### Problemas conhecidos a corrigir

- **P6:** `requireOperator` exige role `admin` global (atalho cross-tenant). Corrigir para resolução por `organization_id` na Fase 2.
- **P7:** `client.server.ts` usa service role key que bypassa RLS. Usar apenas em operações server-side confiáveis; nunca em funções comerciais que lidam com dados de tenant.

---

## 4. LGPD — PROTEÇÃO DE DADOS PESSOAIS

### Princípios obrigatórios

| Princípio | Implementação |
|-----------|---------------|
| **Finalidade** | Dados coletados apenas para propósito específico e legítimo, informado ao titular. |
| **Base legal** | Cada tratamento de dado tem base legal definida (consentimento, contrato, obrigação legal, interesse legítimo). |
| **Consentimento** | Registro de consentimento e preferências de comunicação (`consent_events`, opt-out, janela 24h). |
| **Minimização** | Coletar apenas dados necessários. Ex.: `document_last4` em vez de CPF completo; `document_kind` + `document_token`. |
| **Retenção** | Política de retenção definida por tipo de dado; exclusão ou anonimização após o período. |
| **Oposição** | Direito de opostar-se a tratamento; opt-out funcional e registrado. |
| **RLS** | Isolamento entre organizações e titulares. |
| **Auditoria** | Todas as operações de dados pessoais são auditadas. |
| **Isolamento por tenant** | Dados de uma organização não acessíveis por outra. |
| **Permissões humanas/agentes/integrações** | Grants específicos por ator e ação. |

### Direitos do titular

- **Acesso:** consulta aos dados pessoais da organização.
- **Retificação:** correção de dados incompletos, inexatos ou desatualizados.
- **Eliminação:** exclusão ou anonimização de dados (soft delete quando adequado; exclusão física para dados sensíveis conforme retenção).
- **Portabilidade:** exportação de dados em formato estruturado.
- **Oposição:** opt-out de comunicações e tratamento.
- **Revisão de decisões automatizadas:** solicitar revisão humana de decisões tomadas por IA.

### Implementação existente

- `consent_events`: registro de consentimento, revogação, base legal, canal, fonte, evidência.
- `atendimento.ts`: opt-out, janela 24h, `prepareOptOut`, `evaluateSendGate`.
- `seguranca.ts`: `evaluateDataSubjectRequest()`, `evaluateProcessing()`, `buildSecurityAuditEvent()`.
- `redact.ts`: mascara segredos em logs e auditoria.

---

## 5. AUDITORIA E LOGGING

### Cadeia de auditoria

- `canonical.ts`: JSON canônico compatível com Python, `sha256hex`, `auditCanon`, `auditHash`.
- Todas as escritas de auditoria passam por funções de banco append-only (`ctl_append_audit_exact`).
- **Nunca re-serializar** o texto `detail` armazenado (quebraria a cadeia de hash).
- `audit_events`: registro de operações com `actor`, `organization_id`, `as_of`, `status`, `reasons`.
- `approvals`: registro de quem autorizou cada ação sensível.

### Logs seguros

- `redact()` / `redactText()`: mascara tokens, senhas, chaves API, CPFs e corpos de mensagens brutas antes de gravar em log.
- Nenhum segredo em `detail` de auditoria.
- Logs sem exposição de credenciais.

### Kill switch

- Tabela `kill_switch` com linha `id=1`.
- `killState()` falha fechada se a linha for ilegível (considera engajado).
- Funções `ctl_kill_engage` para ativar/desativar.
- Todas as mutações comerciais verificam kill switch antes de executar.

---

## 6. PROTEÇÃO CONTRA AMEAÇAS ESPECÍFICAS

| Ameaça | Mitigação |
|--------|-----------|
| **Prompt injection** | Validação de entrada com Zod; prompts fixos no system; saída do LLM validada por schema (`SalesNarrativeSchema`, `NarrativeFactsSchema`). |
| **Vazamento de contexto entre clientes** | RLS por `organization_id`; resolução de tenant via `security definer`; nunca confiar em `organization_id` do cliente. |
| **Ferramentas excessivamente permissivas** | Hard gate vetando ferramentas sensíveis; `toolRegistry` como fonte única; grants limitados por agente. |
| **Execução de código por agentes** | Nenhuma ferramenta de execução (`execute_code`, `run_script`, `shell_command`, etc.) registrada. |
| **Webhooks não assinados** | Webhooks de pagamento exigem assinatura e idempotência. |
| **Injeção SQL / NoSQL** | Uso do cliente Supabase com queries parametrizadas; nunca concatenação de strings em queries. |
| **CSRF / XSS** | Validação de entrada; escape de HTML em relatórios impressos (`renderPrintHtml` escapa conteúdo); cabeçalhos de segurança do Supabase. |
| **Rate limiting / abuso de API** | `toolMonitor.ts` com 5 cabeças (veto, registry, params, sequence, rate). |

---

## 7. WEBHOOKS E INTEGRAÇÕES

### Requisitos para webhooks de pagamento

- Assinatura criptográfica (verificar assinatura do provedor).
- Idempotência (mesmo `event_id` processado uma vez).
- Confirmação por webhook assinado ou consulta confiável ao provedor (nunca confiar apenas em retorno de navegador).
- Log de eventos recebidos com auditoria.

### Integrações externas

- WhatsApp Business Platform oficial apenas (não automações não oficiais sem aprovação explícita).
- Provedores de pagamento: Stripe, Mercado Pago, PayPal, plataformas brasileiras — investigar disponibilidade, taxas, países, regras comerciais.
- Plataformas de anúncios e redes sociais: apenas APIs oficiais, conforme disponibilidade e permissões.

---

## 8. RETENÇÃO, BACKUP E RECUPERAÇÃO

### Retenção

- Política de retenção definida por tipo de dado (ex.: logs de auditoria retidos por X anos; mensagens por Y anos; dados de pagamento conforme exigência fiscal).
- Exclusão ou anonimização após o período de retenção.

### Backup e recuperação

- Responsabilidade do Supabase/Lovable (banco gerenciado).
- Validar procedimento de restauração antes de produção.
- Testes de carga em fluxos críticos (FASE 12).

---

## 9. TESTES DE SEGURANÇA (referência)

Detalhado em `docs/TEST_STRATEGY.md`. Inclui:

- Isolamento entre organizações (14 casos em `docs/comercial/14-plano-testes-isolamento.md`).
- Teste de hard gate (ferramentas vetadas são rejeitadas).
- Teste de kill switch (mutações bloqueadas quando engajado).
- Teste de grants (ausência de grant = bloqueio).
- Teste de redação de auditoria (nenhum segredo em `detail`).
- Teste de RLS (leitura/escrita cross-tenant rejeitada).

---

## 10. CONFORMIDADE

A conformidade com LGPD e outras legislações aplicáveis deve ser **validada, não apenas declarada na interface**. Revisão jurídica recomendada antes de produção.

### Checklist pré-produção

- [ ] RLS aplicado e testado em todas as tabelas comerciais.
- [ ] Hard gate ativo e testado.
- [ ] Kill switch funcional e testado.
- [ ] Grants de agente e integração funcionando.
- [ ] Logs de auditoria sem segredos.
- [ ] Consentimento e opt-out funcionando.
- [ ] Webhooks de pagamento assinados e idempotentes.
- [ ] `evaluateProductionReadiness()` = `pronto`.
- [ ] A8 autorizado separadamente (hostname interno, Cloudflare Access + WARP, token em Cloud Secret, ADR A→B aprovado, CI verde).

---

## 11. PRÓXIMA ETAPA

Após aprovação da FASE 0 e desbloqueio de A2, implementar os controles de segurança acima na sequência das fases do roadmap, começando pela resolução de tenant e RLS na FASE 2.
