# TEST_STRATEGY.md — Estratégia de Testes e Qualidade

**Projeto:** CentralIA / plataforma-agentes  
**Escopo:** Centralia Sales + Centralia Digital Commerce  
**Data:** 22/11/2026  
**Status:** Planejamento (pendente de aprovação da FASE 0)

---

## 1. PRINCÍPIOS DE TESTES

| Princípio | Descrição |
|-----------|-----------|
| **Não declarar concluído apenas porque a tela abre** | Cada funcionalidade deve ter critérios de aceite e evidência de teste. |
| **Core puro testável** | Módulos sem I/O (`src/lib/core/`) são unit-testáveis e compartilhados client/servidor. |
| **Fail closed nos testes de segurança** | Ausência de permissão, grant ou tenant = bloqueio. |
| **Nenhum dado fictício apresentado como real** | Testes usam dados de demonstração rotulados `AMOSTRA`; indicadores de produção usam dados reais. |
| **Isolamento por tenant obrigatório** | Testes de isolamento entre organizações são critérios de bloqueio para A5. |
| **Pequenas e reversíveis** | Cada fase termina com testes verdes e problemas conhecidos documentados. |

---

## 2. PILARES DE TESTE

| Pilar | O que testa | Ferramenta |
|-------|-------------|------------|
| **Unitário** | Módulos puros de `core/` (cálculos, validações, scoring, regras de autonomia, segurança, LGPD) | Vitest |
| **Integração** | Server functions (`src/lib/api/*.functions.ts`) com Supabase mock | Vitest + Supabase mock |
| **Banco / RLS** | Políticas RLS, grants, isolamento por tenant, append-only, kill switch | Plano de isolamento A4 (14 casos) |
| **E2E** | Fluxos críticos (vendas, CRM, pagamentos, atendimento) | Playwright (recomendado na avaliação de repositórios) |
| **Segurança** | Hard gate, vetar ferramentas sensíveis, redação de auditoria, cadeia de hash | Vitest |
| **Carga** | Fluxos críticos sob concorrência | A definir na FASE 12 |

---

## 3. TESTES EXISTENTES (estado atual)

### Framework

- **Vitest** `^4.1.10`, ambiente `jsdom`, globals, setup `src/test/setup.ts`.
- Script: `npm test` (executa `vitest run`).

### Arquivos de teste (`lovable-app/src/test/`)

| Arquivo | O que testa | Status |
|---------|-------------|--------|
| `agent-rules.test.ts` | Regras de agentes | Escrito |
| `analytics.test.ts` | Analytics | Escrito |
| `app-routing.test.tsx` | Roteamento da aplicação | Escrito |
| `atendimento.test.ts` | Canais, opt-out, janela 24h, templates, gate de envio, redação de auditoria | Escrito |
| `automacoes.test.ts` | Workflows, condições, kill switch, retry, planejamento | Escrito |
| `comercial-contracts.test.ts` | Contratos comerciais (decideAutonomy, checkCommercialTool, scoreLead) | Escrito |
| `commercial-agents.test.ts` | 9 agentes, matriz de autonomia, hard gate veto, ToolMonitor, grant ausente, kill switch, proposta de IA | Escrito |
| `crm-dashboard.test.ts` | Dashboard de CRM | Escrito |
| `crm.test.ts` | Contrato de contato, importação CSV, detecção de duplicatas | Escrito |
| `dashboard.test.ts` | Dashboard | Escrito |
| `inteligencia.test.ts` | Consolidação de inteligência, cobertura, amostras, gates, divergências, camada editorial | Escrito |
| `llm-settings.test.ts` | Configurações de LLM | Escrito |
| `music-catalog.test.ts` | Catálogo de música | Escrito |
| `pipeline.test.ts` | Pipeline | Escrito |
| `print-report.test.ts` | Renderização de relatório PDF | Escrito |
| `propostas.test.ts` | Catálogo, preço, desconto, preparação, redação de auditoria, versionamento, PDF/IA | Escrito |
| `publication-rules.test.ts` | Regras de publicação | Escrito |
| `sales-narrative.test.ts` | Contrato de narrativa de vendas, fenced JSON, rejeição de chaves extras | Escrito |
| `seguranca.test.ts` | Papéis, capacidades, tenant, hard gate, kill switch, ações sensíveis, grants, LGPD, redação, cadeia de auditoria, preflight | Escrito |
| `settings-rules.test.ts` | Regras de settings | Escrito |
| `setup.ts` | Setup de testes (mock scrollTo, matchMedia) | Infra |
| `stage-audit.test.ts` | Auditoria de estágios | Escrito |
| `studio-rules.test.ts` | Regras de studio | Escrito |

### Quantidade

Conforme commit `8edbc37`: **258 testes / 21 arquivos** verificados (typecheck OK). A suíte atual tem 23 arquivos (incluindo `setup.ts`).

**Não executado nesta sessão:** `npm test`, `npm run typecheck`, `npm run build`. Não é possível confirmar se a suíte está verde no estado atual.

---

## 4. PLANO DE TESTES DE ISOLAMENTO (A4)

Arquivo: `docs/comercial/14-plano-testes-isolamento.md`

### 14 casos (T1–T14)

| ID | Cenário | Resultado esperado |
|----|---------|-------------------|
| T1 | Leitura entre tenants por humano | Zero linhas; tenant invisível |
| T2 | Leitura por humano do próprio tenant | Somente linhas do próprio tenant |
| T3 | Operador global sem membership | Zero linhas — papel global não é atalho cross-tenant |
| T4 | Agente com grant | Leitura permitida; auditoria registra actor |
| T5 | Agente sem grant | Negado; nenhum dado retornado |
| T6 | Integração expirada | Negado por `expires_at` |
| T7 | Spoofing de `organization_id` | Valor do cliente ignorado/rejeitado; nunca grava em outro tenant |
| T8 | Tabela append-only | UPDATE/DELETE falham |
| T9 | Desconto fora do limite | Recusa ou criação de `approvals`; não aprovado automaticamente |
| T10 | Exportação de dados | Exige aprovação e gera auditoria |
| T11 | Envio por agente sem template aprovado | Bloqueado; `canSend = false` |
| T12 | Kill switch | Mutação recusada; auditoria registra bloqueio |
| T13 | Redação da auditoria | Nenhum prompt, token, CPF ou corpo de mensagem bruto no log |
| T14 | Tipos gerados | Tipos do Supabase conferem com tabelas criadas pelo Lovable |

### Critério de bloqueio

**Falha em T1, T3, T5, T6, T7, T8, T10, T11 ou T12 bloqueia A5.** Não é aceitável seguir com leitura real enquanto houver vazamento entre tenants ou mutação sem aprovação.

### Registro de execução

Ao executar, preencher: data, autor, schema aplicado (hash/versão do Lovable), resultado por caso e evidência anexada. Nenhum resultado deve ser presumido ou preenchido como sucesso sem execução.

---

## 5. TESTES POR FASE DO ROADMAP

| Fase | Testes obrigatórios | Critério de conclusão |
|------|---------------------|----------------------|
| FASE 1 | Revisar testes existentes; mapear gaps | Nenhum teste existente removido |
| FASE 2 | Testes de navegação, `requireOperator` com tenant, não regressão | 264 testes existentes + novos testes de tenant verdes |
| FASE 3 | CRUD de contatos/empresas, importação CSV, detecção de duplicatas, isolamento por tenant | Testes de CRM verdes |
| FASE 4 | Pontuação de leads, agentes comerciais, dashboard com dados reais, isolamento A4 | Testes de sales intelligence verdes |
| FASE 5 | Caixa de entrada, opt-out, janela 24h, send gate, redação de auditoria | Testes de atendimento verdes |
| FASE 6 | Workflow planner, kill switch, retentativas, proteção contra duplicidade | Testes de automações verdes |
| FASE 7 | Catálogo de produtos, versionamento, área do comprador, downloads protegidos | Testes de produtos digitais verdes |
| FASE 8 | Editor de páginas, funis, publicação/despublicação, pré-visualização | Testes de páginas/funis verdes |
| FASE 9 | Checkout em ambiente de teste, pagamento aprovado, recusado, reembolso, webhook idempotente | Testes de pagamento verdes |
| FASE 10 | Campanhas, aprovação obrigatória, e-mail, segmentação, recuperação de carrinho | Testes de marketing verdes |
| FASE 11 | Dashboard de analytics, relatórios por período/canal/vendedor, atribuição | Testes de analytics verdes |
| FASE 12 | 14 casos de isolamento (A4), carga, segurança, backup/restore | Todos os casos aprovados; `evaluateProductionReadiness()` = `pronto` |

---

## 6. TESTES DE SEGURANÇA OBRIGATÓRIOS

| Teste | O que valida | Bloqueador se falhar |
|-------|-------------|---------------------|
| Hard gate | Ferramentas vetadas (`send_whatsapp`, `launch_campaign`, `checkout`, `payment`) são rejeitadas | Sim |
| Kill switch | Mutações comerciais recusadas quando engajado | Sim |
| Grants | Ausência de grant = bloqueio; grant válido = permitido dentro dos limites | Sim |
| RLS | Leitura/escrita cross-tenant rejeitada | Sim |
| Redação de auditoria | Nenhum segredo, token, CPF ou corpo de mensagem bruto em `detail` | Sim |
| Cadeia de hash | `canonical` + `sha256` reproduzíveis e compatíveis com Python | Sim |
| Aprovações | Ações sensíveis exigem registro de quem autorizou | Sim |
| Webhooks | Assinatura verificada; idempotência respeitada | Sim (FASE 9) |

---

## 7. ESTADOS VAZIOS E DADOS DEMONSTRATIVOS

- Quando não houver dados reais, a UI deve mostrar **estados vazios** (não dados fictícios).
- Vitrine/ambiente de demonstração deve estar sempre rotulado `AMOSTRA`.
- Testes não devem usar dados de cliente real sem anonimização.

---

## 8. CRITÉRIOS DE QUALIDADE POR FUNCIONALIDADE

Cada funcionalidade entregue deve ter:

1. **Critérios de aceite** definidos por escrito.
2. **Evidência de teste** (arquivo de teste, resultado de execução, ou plano de execução para A4).
3. **Problemas conhecidos** documentados.
4. **Próximos passos** definidos.

---

## 9. PRÓXIMA ETAPA

1. Executar `npm test`, `npm run typecheck` e `npm run build` no `lovable-app` para confirmar o estado atual (pendente de aprovação da FASE 0).
2. Após A2/A3, executar o plano de isolamento (14 casos) e preencher evidências.
3. Adicionar Playwright para testes E2E (FASE 2).
