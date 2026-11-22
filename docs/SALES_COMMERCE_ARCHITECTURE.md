# SALES_COMMERCE_ARCHITECTURE.md — Arquitetura Definitiva

**Projeto:** CentralIA / plataforma-agentes  
**Escopo:** Centralia Sales + Centralia Digital Commerce  
**Regra:** Não criar projeto independente. Não substituir arquitetura atual sem necessidade técnica real comprovada.  
**Data:** 22/11/2026

---

## 1. PRINCÍPIOS ARQUITETURAIS

| Princípio | Descrição |
|-----------|-----------|
| **Preservar o existente** | A CentralIA continua sendo o sistema principal, orquestrador e centro de controle. Nada da arquitetura atual é removido. |
| **Camadas separadas** | UI → Server Functions → Orquestração Server → Core Puro → Banco (Supabase). Cada camada tem responsabilidade única. |
| **Core puro** | Toda lógica de negócio (cálculos, validações, scoring, regras de autonomia, segurança) vive em `src/lib/core/` sem I/O, sem clock direto, sem rede. |
| **Server apenas orquestra** | Server functions (`src/lib/api/*.functions.ts`) só coordenam chamadas ao banco e ao core puro; são guardadas por `requireOperator`. |
| **Banco gerenciado pelo Lovable** | Schema, migrations, RLS e tipos são administrados pelo Lovable. Não editar `supabase/migrations/` nem `drizzle/` à mão; nenhum desses diretórios existe hoje e as dependências Drizzle foram removidas em `2b18d5c`. |
| **Fail closed** | Kill switch, hard gate, RLS e grants falham fechado: ausência de permissão = bloqueio. |
| **Isolamento por tenant** | Toda dado comercial tem `organization_id`. Nenhuma server function comercia resolve `organization_id` enviado pelo cliente. |

---

## 2. CAMADAS DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────┐
│ CAMADA UI                                                   │
│ src/routes/_authenticated/_app/                             │
│   - vendas.tsx (vitrine + balcão de cálculo + PDF)          │
│   - (novas rotas: crm, leads, pipeline, atendimento, etc.)   │
│   Componentes UI (shadcn/radix)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CAMADA API / SERVER FUNCTIONS                               │
│ src/lib/api/*.functions.ts                                  │
│   - requireOperator (middleware de autenticação + admin)     │
│   - runSales, runFunnel, writeSalesNarrative (existentes)    │
│   - (novas: crm, pipeline, atendimento, pagamentos, etc.)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CAMADA DE ORQUESTRAÇÃO SERVER                               │
│ src/lib/server/*.server.ts                                  │
│   - Runtime (supabase admin, auditStage, etc.)              │
│   - Pipelines (sales, funnel, research)                     │
│   - LLM via llm.server.ts (Groq / Lovable AI)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CAMADA CORE PURO                                            │
│ src/lib/core/*.ts                                           │
│   - comercial, commercial-agents, hardGate, toolRegistry     │
│   - sales, sales-report, sales-narrative, atendimento        │
│   - automacoes, inteligencia, seguranca, crm, pipeline        │
│   - (novos: commerce, payments, funis, produtos-digitais)     │
│   ← Sem I/O, sem clock direto, sem rede                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CAMADA DE DADOS                                             │
│ Supabase / Postgres (gerenciado pelo Lovable)               │
│   - 19 tabelas existentes (genéricas)                       │
│   - Schema comercial Fase 2 (organizations, leads, etc.)    │
│   - RLS por organization_id                                 │
│   - Funções append-only (audit, approvals, kill switch)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. MOTOR 1 — CENTRALIA SALES

### Escopo
CRM, prospecção, atendimento, agentes vendedores, WhatsApp (oficial apenas), gestão de leads, automações, propostas, clientes, inteligência comercial.

### Módulos e responsabilidades

| Módulo | Arquivo (existente) | Responsabilidade | Status |
|--------|---------------------|------------------|--------|
| Contratos comerciais | `comercial.ts` | `decideAutonomy`, `checkCommercialTool`, `scoreLead`, `formatBRLFromCents` | Implementado e testado |
| 9 agentes comerciais | `commercial-agents.ts` | Prospecção, qualificação, CRM, funil, vendas, propostas, follow-up, insights, pós-venda | Implementado (contrato puro) |
| Hard gate | `hardGate.ts` | Veta ferramentas sensíveis (checkout, payment, send_whatsapp, launch_campaign) | Implementado |
| Registro de ferramentas | `toolRegistry.ts` | Fonte única de nomes de ferramentas | Implementado |
| CRM | `crm.ts` | Contatos, empresas, detecção de duplicatas, importação CSV | Implementado (puro) |
| Pipeline | `pipeline.ts` | Kanban, etapas configuráveis | Implementado (parcial) |
| Atendimento | `atendimento.ts` | Canais, opt-out, janela 24h, templates, send gate | Implementado (puro) |
| Automações | `automacoes.ts` | Workflows, gatilhos, condições, retry | Implementado (sem executor) |
| Propostas | `propostas.ts` | Catálogo, preço, desconto, versionamento, PDF | Implementado (puro) |
| Inteligência | `inteligencia.ts` | Consolidação de leituras, camada editorial | Implementado (puro) |
| Segurança / LGPD | `seguranca.ts` | Permissões, consentimento, cadeia de auditoria, preflight | Implementado (puro) |

### Novos módulos necessários (não existem ainda)

- **Resolução de tenant**: função para obter `organization_id` a partir da sessão do usuário (não existe; depende de A2).
- **Aprovações comerciais**: integração com tabela `approvals` existente para ações sensíveis.
- **Webhooks de atendimento**: estrutura para receber eventos de canais oficiais (não implementado).

---

## 4. MOTOR 2 — CENTRALIA DIGITAL COMMERCE

### Escopo
Pesquisa de mercado, produtos digitais, páginas de vendas, funis, checkout, pagamentos, campanhas, métricas, pós-venda, internacionalização.

### Módulos e responsabilidades

| Módulo | Arquivo (existente) | Responsabilidade | Status |
|--------|---------------------|------------------|--------|
| Pesquisa de mercado | `research.ts`, `market.ts`, `trends.ts` | Pesquisa web, cotações, tendências Google Trends | Implementado (parcial) |
| Conteúdo / páginas | `content.ts`, `publications.ts` | Personas, rascunhos, publicação simulada | Implementado (parcial) |
| Pagamentos | (não existe) | Camada desacoplada de provedores (Pix, cartão, boleto, assinaturas) | Não implementado |
| Checkout | (não existe) | Interface de checkout, webhooks assinados, idempotência | Não implementado |
| Funis | `pipeline.ts` (parcial) | Construtor de funis de venda (captura, checkout, upsell) | Não implementado |
| Produtos digitais | (não existe) | Catálogo, versões, área do comprador, downloads protegidos | Não implementado |
| Campanhas | (não existe) | Planejamento, e-mails, sequências, recuperação de carrinho | Não implementado |
| Internacionalização | (não existe) | Idiomas, moedas BRL/USD/EUR, fusos, regras fiscais | Não implementado |

### Arquitetura de pagamentos (recomendada)

- **Camada desacoplada**: interface de pagamento separada da implementação do provedor.
- **Provedores investigados (não instalar todos):** Stripe, Mercado Pago, PayPal, plataformas brasileiras de produtos digitais.
- **Requisitos:** Pix, cartão nacional/internacional, boleto (quando aplicável), BRL/USD/EUR, assinaturas, pagamentos únicos, cupons, reembolsos, webhooks com assinatura e idempotência.
- **Segurança:** nunca armazenar dados completos de cartão; usar páginas/componentes hospedados e tokenização do provedor.

---

## 5. CAMADA DE INTELIGÊNCIA ARTIFICIAL E ORQUESTRAÇÃO

### Orquestração de agentes

- Seleção de agente por contexto (cliente, produto, ação).
- Seleção de modelo por custo, latência, capacidade, qualidade (roteamento configurável).
- Ferramentas autorizadas por agente (registro único em `toolRegistry.ts`).
- Memória e contexto controlados (cliente, produto, sessão).
- Limite de tokens e limite financeiro por execução.
- Retentativas, tratamento de erros, auditoria de eventos.
- Avaliação de respostas e comparação de modelos.

### Provedores de IA

- Aproveitar provedores existentes (Lovable AI Gateway, Groq via `GROQ_API_KEY`).
- Não tornar a plataforma dependente de um único fornecedor.
- Chaves privadas em Cloud Secrets (gerenciadas pelo Lovable), nunca no frontend ou repositório.

---

## 6. NÍVEIS DE AUTONOMIA

| Nível | Nome | Comportamento | Aprovação humana |
|-------|------|---------------|------------------|
| 1 | Assistido | IA pesquisa, analisa, recomenda, prepara. Humano executa. | Obrigatória para execução |
| 2 | Semiautônomo | IA executa ações pré-autorizadas com limites. | Obrigatória para ações críticas |
| 3 | Autonomia controlada | IA executa fluxos permitidos dentro de orçamento, regras, horários. | Obrigatória para ações sensíveis |

### Ações que SEMPRE exigem aprovação humana

- Publicar campanhas pagas.
- Gastar dinheiro.
- Emitir reembolsos.
- Alterar preços críticos.
- Excluir dados em massa.
- Modificar permissões.
- Enviar campanhas de grande volume.
- Publicar produtos sem revisão.
- Alterar configurações de segurança.
- Executar ações irreversíveis.

Registro de quem autorizou cada ação (tabela `approvals` existente).

---

## 7. BANCO DE DADOS E MULTI-TENANCY

### Entidades planejadas (schema Fase 2 — `docs/comercial/02-modelo-dados.md`)

- `organizations`, `memberships`, `agent_grants`, `integration_grants`
- `people`, `leads`, `opportunities`, `proposals`
- `conversations`, `messages`, `message_templates`
- `workflows`, `workflow_runs`, `automation_audit`
- `products`, `product_versions`, `product_files`
- `pages`, `funnels`, `funnel_steps`
- `orders`, `order_items`, `payments`, `refunds`, `subscriptions`, `coupons`
- `campaigns`, `campaign_leads`, `campaign_events`
- `consent_events`, `audit_events`, `approvals`, `kill_switch`

### Requisitos obrigatórios

- IDs consistentes (UUID).
- Relacionamentos e integridade referencial.
- Índices adequados em `organization_id` e chaves estrangeiras.
- **RLS por `organization_id`** (não confiar em `organization_id` enviado pelo cliente).
- Isolamento entre organizações.
- Controle de acesso por função (`owner`, `admin`, `manager`, `seller`, `viewer`).
- Auditoria encadeada (canonical JSON + sha256).
- Soft delete quando adequado.
- Idempotência em webhooks e pagamentos.
- Backup e recuperação (responsabilidade do Supabase/Lovable).

### Nunca

- Colocar chaves privadas no frontend ou repositório.
- Desativar políticas RLS para fazer uma funcionalidade funcionar.
- Aplicar migrations à mão (regra do AGENTS.md #3).

---

## 8. INTERFACE E NAVEGAÇÃO

### Módulos de navegação (ordem recomendada)

1. Visão geral
2. Sales
3. CRM
4. Leads
5. Prospecção
6. Pipeline
7. Atendimento
8. Agentes comerciais
9. Automações
10. Propostas
11. Produtos digitais
12. Laboratório de produtos
13. Páginas de vendas
14. Funis
15. Checkout
16. Pedidos
17. Clientes
18. Campanhas
19. Analytics
20. Integrações
21. Aprovações
22. Configurações

### Requisitos de UI

- Idioma padrão: português brasileiro (estrutura para inglês e espanhol).
- Indicadores reais, nenhum dado fictício apresentado como real.
- Estados vazios quando não houver dados.
- Confirmação para ações críticas.
- Acessibilidade, layout responsivo (computador e celular).
- Nenhum botão decorativo: toda ação visível funciona ou está identificada como indisponível/em desenvolvimento.

---

## 9. SEGURANÇA E CONFORMIDADE (resumo)

Detalhado em `docs/SECURITY_AND_LGPD.md`.

- Autenticação segura, autorização no backend.
- RLS por organização, RBAC.
- Gestão de sessões, proteção de credenciais.
- Validação de entradas, proteção contra CSRF/XSS/injeções.
- Rate limiting, proteção contra abuso de APIs.
- Webhooks com assinatura e idempotência.
- Logs sem exposição de segredos.
- Auditoria de operações, política de retenção.
- Consentimento e preferências (LGPD).
- Exportação e exclusão de dados.

---

## 10. TESTES E QUALIDADE (resumo)

Detalhado em `docs/TEST_STRATEGY.md`.

- Testes unitários (core puro), integração (server functions), banco (RLS), ponta a ponta (fluxos críticos).
- Não declarar funcionalidade concluída apenas porque a tela abre.
- Cada funcionalidade deve ter critérios de aceite e evidência de teste.

---

## 11. DECISÕES ARQUITETURAIS REGISTRADAS

| Decisão | Justificativa |
|---------|---------------|
| Manter TanStack Router + TanStack Start | Já adotados no projeto; não há necessidade técnica de substituir. |
| Manter Supabase como banco principal | Já integrado; ADR-0010 aprovado preserva o banco existente. |
| Core puro sem I/O | Permite testes unitários rápidos e compartilhamento client/servidor. |
| Não instalar 20 repositórios de referência | Aumentaria complexidade, custo e pontos de falha. Usar apenas como referência conceitual. |
| Banco gerenciado pelo Lovable | Regra do AGENTS.md; evita divergência de schema. |
| Não editar migrations à mão | Regra do AGENTS.md #3. |

---

## 12. PRÓXIMA ETAPA

A arquitetura está definida. A implementação só pode avançar após **A2** (aplicar schema Fase 2 no Lovable). Quando desbloqueado, seguir `docs/IMPLEMENTATION_ROADMAP.md`.
