# IMPLEMENTATION_ROADMAP.md — Roadmap de Implementação

**Projeto:** CentralIA / plataforma-agentes  
**Escopo:** Centralia Sales + Centralia Digital Commerce  
**Regra:** Fases pequenas, testáveis e reversíveis. Nenhuma alteração destrutiva antes da aprovação do relatório da FASE 0.  
**Data:** 22/11/2026  
**Status:** Planejamento (pendente de aprovação)

---

## 1. VISÃO GERAL DAS FASES

| Fase | Nome | Objetivo | Depende de |
|------|------|----------|------------|
| FASE 0 | Auditoria | Analisar projeto, repositórios, arquitetura. Produzir 6 documentos. | — |
| FASE 1 | Planejamento | Definir arquitetura, módulos, banco, permissões, integrações, prioridades. | FASE 0 aprovada |
| FASE 2 | Fundação | Navegação, permissões, serviços compartilhados, eventos, logs, componentes UI. | FASE 1 aprovada |
| FASE 3 | CRM | Contatos, empresas, clientes, leads, histórico, pipeline. | FASE 2 + A2/A3 |
| FASE 4 | Sales Intelligence | Prospecção autorizada, pontuação de leads, agentes comerciais. | FASE 3 |
| FASE 5 | Atendimento | Caixa de entrada, canais, WhatsApp oficial, transferência para humano. | FASE 3 + A6 |
| FASE 6 | Automações | Gatilhos, condições, ações, filas, retentativas, histórico. | FASE 2 + A2 |
| FASE 7 | Digital Commerce | Catálogo, laboratório de produtos, arquivos, versões, área do comprador. | FASE 2 + A2 |
| FASE 8 | Páginas e funis | Editor, publicação, captura, checkout, jornada de compra. | FASE 7 |
| FASE 9 | Pagamentos | Provedores, webhooks, pedidos, reembolsos, entrega segura. | FASE 8 |
| FASE 10 | Marketing | Campanhas, e-mail, segmentação, recuperação, pós-venda. | FASE 8 + A6 |
| FASE 11 | Analytics | Indicadores, relatórios, atribuição, desempenho dos agentes. | FASE 3–10 |
| FASE 12 | Segurança e lançamento | Auditoria final, testes de isolamento, carga, backup, documentação. | FASE 1–11 + A8 |

---

## 2. PRÉ-REQUISITOS EXTERNOS (bloqueadores)

Antes de qualquer fase que leia/grave banco comercial:

| Pré-requisito | O que é necessário | Quem resolve | Status |
|---------------|-------------------|--------------|--------|
| Créditos no Lovable | Plano ativo com saldo para executar prompts | Usuário | ❌ Bloqueado |
| Login OAuth do MCP | `/mcps` → lovable → completar login da conta `Budluk/plataforma-agentes` | Usuário | ❌ Bloqueado |
| Aplicar schema Fase 2 | Enviar `docs/comercial/13-prompt-lovable.md` ao Lovable | Assistente (após desbloqueio) | ❌ Bloqueado |
| Tipos do Supabase | Gerar tipos automaticamente após schema | Lovable | ❌ Bloqueado |
| CI verde | GitHub Actions executando typecheck + test + build | GitHub (workflow já existe) | ✅ Arquivo pronto |
| A8 / Gate C | Hostname interno, Cloudflare Access + WARP, token em Cloud Secret, ADR A→B aprovado | Usuário + Assistente | ❌ Bloqueado |

---

## 3. DETALHAMENTO POR FASE

### FASE 0 — Auditoria (concluída)

**Entregas:**
- `docs/SALES_COMMERCE_AUDIT.md` ✅
- `docs/SALES_COMMERCE_ARCHITECTURE.md` ✅
- `docs/REPOSITORY_EVALUATION.md` ✅
- `docs/IMPLEMENTATION_ROADMAP.md` ✅
- `docs/SECURITY_AND_LGPD.md` ✅
- `docs/TEST_STRATEGY.md` ✅

**Nenhuma alteração de código foi feita.** Aguardar aprovação para iniciar FASE 1.

---

### FASE 1 — Planejamento

**Status atual (24/11/2026): concluída como especificação documental.** Registro no fim deste arquivo; o texto original desta seção é mantido como histórico.

**Objetivo:** Definir arquitetura detalhada, módulos, schema comercial, permissões, integrações e prioridades.

**Atividades:**
1. Confirmar quais tabelas do schema Fase 2 (`docs/comercial/02-modelo-dados.md`) são realmente necessárias vs. já existentes.
2. Definir mapeamento de `organization_id` nas server functions existentes.
3. Definir quais dos 9 agentes comerciais existentes serão expostos via server functions e UI.
4. Definir provedores de pagamento a investigar (Stripe, Mercado Pago, PayPal, brasileiros) — apenas investigação, nenhuma integração ainda.
5. Definir provedores de IA a manter (Lovable AI Gateway, Groq) — não depender de um único fornecedor.
6. Atualizar `docs/comercial/01-arquitetura.md` com as novas camadas.
7. Produzir plano detalhado com critérios de aceite por módulo.

**Critérios de conclusão:**
- Documento de arquitetura atualizado aprovado.
- Matriz de permissões (humano / agente / integração) definida.
- Lista de provedores de pagamento e IA selecionados para investigação.
- Nenhum código alterado.

---

### FASE 2 — Fundação

**Objetivo:** Criar ou ajustar navegação, permissões, serviços compartilhados, eventos, logs e componentes de interface.

**Atividades:**
1. Criar navegação de módulos (Sales, CRM, Leads, Pipeline, Atendimento, Agentes, Automações, Propostas, Produtos digitais, Páginas, Funis, Checkout, Pedidos, Clientes, Campanhas, Analytics, Integrações, Aprovações, Configurações).
2. Criar componentes base de UI (Panel, Outcome, Button, Input, Label, Textarea — já existem em parte).
3. Ajustar `requireOperator` para resolução de `organization_id` por tenant (não usar role `admin` global como atalho cross-tenant).
4. Criar serviço de auditoria compartilhado (canonical JSON + sha256) — já existe em `canonical.ts`.
5. Criar estrutura de eventos e logs sem exposição de segredos (redact.ts já existe).
6. Adicionar Playwright para testes E2E (recomendado na avaliação de repositórios).

**Critérios de conclusão:**
- Navegação funcional sem quebrar rotas existentes.
- `requireOperator` resolve tenant corretamente (teste unitário).
- Nenhuma regressão nos 264 testes existentes.
- typecheck + build verdes.

---

### FASE 3 — CRM

**Objetivo:** Implementar contatos, empresas, clientes, leads, histórico e pipeline.

**Atividades:**
1. Ligar `crm.ts` (contrato puro) a server functions e UI.
2. Criar rotas de cadastro de pessoas e empresas.
3. Implementar importação CSV de contatos (reuso de `importContactsCsv`).
4. Implementar detecção de duplicatas e preview de merge.
5. Criar visão 360° do cliente (histórico de interações, compras, propostas, atendimento).
6. Implementar tags, categorias, campos personalizados, notas internas.
7. Implementar registro de consentimento e preferências de comunicação (LGPD).

**Critérios de conclusão:**
- CRUD de contatos e empresas funcional.
- Importação CSV testada.
- Detecção de duplicatas funcionando.
- Isolamento por `organization_id` validado (teste A4).
- Testes unitários e de integração verdes.

---

### FASE 4 — Sales Intelligence

**Objetivo:** Implementar prospecção autorizada, pontuação de leads e agentes comerciais.

**Atividades:**
1. Expor os 9 agentes comerciais existentes via server functions (protegidas por `requireOperator` + grants).
2. Implementar pontuação de leads com critérios configuráveis (`scoreLead` já existe em `comercial.ts`).
3. Implementar prospecção de fontes públicas autorizadas (sem burlar CAPTCHA, termos de uso, áreas privadas).
4. Criar dashboard comercial com leads, oportunidades, receita, ticket médio, taxa de conversão (dados reais apenas; estados vazios quando não houver dados).
5. Implementar filtros por período, produto, campanha, canal, vendedor, agente, etapa do funil.

**Critérios de conclusão:**
- Agentes comerciais executáveis via server function.
- Pontuação de leads funcionando.
- Dashboard com dados reais (sem fictícios).
- Testes de isolamento por tenant (A4) aprovados.

---

### FASE 5 — Atendimento

**Objetivo:** Implementar caixa de entrada, canais, WhatsApp oficial e transferência para humano.

**Atividades:**
1. Ligar `atendimento.ts` (contrato puro) a server functions e UI.
2. Criar caixa de entrada central (conversas, histórico, responsável, status, prioridade, tags).
3. Preparar integração com WhatsApp Business Platform oficial apenas (não usar automações não oficiais sem aprovação explícita).
4. Implementar respostas rápidas, sugestões de resposta, classificação de intenção.
5. Implementar transferência para humano, resumo por IA, registro de consentimento.
6. Implementar opt-out e janela 24h (já existentes em `atendimento.ts`).

**Critérios de conclusão:**
- Caixa de entrada funcional (mesmo que canais reais sejam simulados até A6).
- Opt-out e janela 24h funcionando.
- Nenhum envio real de WhatsApp sem aprovação explícita (A6).
- Testes de atendimento verdes.

---

### FASE 6 — Automações

**Objetivo:** Implementar gatilhos, condições, ações, filas, retentativas e histórico.

**Atividades:**
1. Ligar `automacoes.ts` (contrato puro) a server functions e UI.
2. Criar construtor de fluxos (gatilho → condições → ações).
3. Implementar filas e retentativas com backoff.
4. Implementar tratamento de falhas e reexecução segura.
5. Implementar proteção contra duplicidade.
6. Implementar histórico de execuções e auditoria.
7. Implementar kill switch para automações (já existe em `automacoes.ts` e `kill_switch`).

**Critérios de conclusão:**
- Workflow planner funcional.
- Nenhuma automação executada sem grant válido.
- Kill switch testado.
- Testes de automações verdes.

---

### FASE 7 — Digital Commerce

**Objetivo:** Implementar catálogo, laboratório de produtos, arquivos, versões e área do comprador.

**Atividades:**
1. Criar catálogo de produtos digitais (e-books, guias, planilhas, templates, cursos, videoaulas, pacotes de arquivos, assinaturas).
2. Implementar versionamento de produtos e histórico de alterações.
3. Criar área do comprador (biblioteca de compras, downloads protegidos, links temporários).
4. Implementar controle de acesso e expiração de downloads.
5. Implementar revisão de conteúdo antes de publicação (não publicar automaticamente conteúdo com riscos legais, médicos, financeiros ou de direitos autorais).
6. Implementar arquivos e versões com armazenamento protegido (Supabase Storage, bucket privado).

**Critérios de conclusão:**
- Catálogo de produtos digitais funcional.
- Versionamento com canonical + sha256.
- Área do comprador com controle de acesso.
- Downloads protegidos (sem link direto público).
- Testes de produto verdes.

---

### FASE 8 — Páginas e Funis

**Objetivo:** Implementar editor, publicação, captura, checkout e jornada de compra.

**Atividades:**
1. Criar construtor de páginas de vendas (modelos prontos, seções reutilizáveis, editor de textos, imagens, depoimentos autorizados, benefícios, proposta de valor, FAQ, garantia, preço, botões de compra, captura de leads, SEO, responsividade).
2. Implementar pré-visualização antes de publicar.
3. Criar construtor de funis (página de captura, vendas, checkout, order bump, upsell, downsell, confirmação, entrega, recuperação de carrinho, sequência de relacionamento).
4. Implementar publicação e despublicação de páginas.
5. Não inventar depoimentos, resultados, certificações ou garantias.

**Critérios de conclusão:**
- Editor de páginas funcional.
- Funil de compra navegável.
- Páginas publicáveis e despublicáveis.
- Testes de publicação verdes.

---

### FASE 9 — Pagamentos

**Objetivo:** Integrar provedores, webhooks, pedidos, reembolsos e entrega segura.

**Atividades:**
1. Implementar camada de pagamento desacoplada de provedores específicos.
2. Integrar provedores investigados (Pix, cartão nacional/internacional, boleto, BRL/USD/EUR, assinaturas, pagamentos únicos, cupons, reembolsos).
3. Implementar webhooks com assinatura e idempotência.
4. Nunca liberar produto apenas porque o navegador retornou à página de sucesso; validar confirmação por webhook assinado ou consulta confiável ao provedor.
5. Criar pedidos, itens de pedido, pagamentos, reembolsos.
6. Criar interface de integração para adicionar/trocar provedores sem reescrever o módulo comercial.
7. Nunca armazenar dados completos de cartão; usar tokenização do provedor.

**Critérios de conclusão:**
- Checkout em ambiente de teste funcional.
- Pagamento aprovado → pedido criado → acesso liberado (após webhook validado).
- Pagamento recusado → fluxo de recuperação.
- Reembolso funcional.
- Testes de pagamento (ambiente de teste) verdes.

---

### FASE 10 — Marketing

**Objetivo:** Implementar campanhas, e-mail, segmentação, recuperação e pós-venda.

**Atividades:**
1. Criar planejamento de campanhas, textos publicitários, variações de anúncios, e-mails.
2. Implementar segmentação de público, gestão de leads, sequências de relacionamento.
3. Implementar recuperação de carrinhos e reativação de clientes.
4. Implementar acompanhamento de resultados e comparação de campanhas.
5. Preparar integrações oficiais com plataformas de anúncios e redes sociais (conforme disponibilidade de APIs).
6. Toda campanha paga deve exigir aprovação antes de publicação ou gasto.

**Critérios de conclusão:**
- Campanhas criáveis e rastreáveis.
- Aprovação obrigatória para campanhas pagas.
- Testes de campanha verdes.

---

### FASE 11 — Analytics

**Objetivo:** Implementar indicadores, relatórios, atribuição e desempenho dos agentes.

**Atividades:**
1. Criar dashboard de analytics com receita, recorrência, ticket médio, conversão, CAC (quando houver dados).
2. Implementar relatórios por período, produto, campanha, canal, vendedor, agente.
3. Implementar atribuição de vendas a agentes e campanhas.
4. Implementar desempenho dos agentes (ações executadas, aprovações, taxa de sucesso).
5. Implementar relatórios por país e moeda (internacionalização).

**Critérios de conclusão:**
- Dashboard com dados reais (sem fictícios).
- Relatórios exportáveis.
- Testes de analytics verdes.

---

### FASE 12 — Segurança e lançamento

**Objetivo:** Auditoria final, testes de isolamento, carga, backup, documentação e preparação para produção.

**Atividades:**
1. Executar plano de testes de isolamento (14 casos em `docs/comercial/14-plano-testes-isolamento.md`).
2. Testes de carga em fluxos críticos.
3. Auditoria de segurança (RLS, hard gate, grants, LGPD, consentimento, retenção).
4. Validar `evaluateProductionReadiness()` com status `pronto`.
5. Verificar backups e restauração (responsabilidade do Supabase/Lovable).
6. Documentação final atualizada.
7. Preparação para produção (apenas após A8 autorizado).

**Critérios de conclusão:**
- Todos os 14 casos de isolamento aprovados.
- Nenhuma falha de segurança crítica.
- `evaluateProductionReadiness()` = `pronto`.
- A8 autorizado separadamente para exposição/deploy.

---

## 4. CRITÉRIOS DE ACEITE GERAIS (todas as fases)

1. Código implementado.
2. Testes executados (unitários, integração, banco, E2E quando aplicável).
3. Resultado documentado.
4. Problemas conhecidos listados.
5. Critérios de aceite da fase atendidos.
6. Próximos passos definidos.
7. Nenhum dado fictício apresentado como real.
8. Vitrine/ambiente de demonstração sempre rotulado `AMOSTRA`.
9. Nenhuma alteração destrutiva sem aprovação explícita.

---

## 5. PRÓXIMA AÇÃO IMEDIATA

Aguardar aprovação do relatório FASE 0. Após aprovação:

1. Desbloquear A2 (créditos Lovable + login OAuth MCP).
2. Aplicar schema Fase 2 via `docs/comercial/13-prompt-lovable.md`.
3. Iniciar FASE 1 (Planejamento).

---

## 6. REGISTRO DE CONCLUSÃO DA FASE 1 (2026-11-24)

A FASE 1 foi concluída **como planejamento documental**. As seções anteriores, inclusive a "PRÓXIMA AÇÃO IMEDIATA", permanecem como registro histórico; nada do que já estava publicado foi removido ou reescrito.

**Entregas:**

- `docs/FASE1_PLANNING.md` (novo) — sete decisões do escopo: baseline de 19 tabelas vs. 37 tabelas novas e 1 view; resolução de `organization_id` sem atalho cross-tenant; prioridade e aceite dos nove agentes; investigação de pagamentos; manutenção de Lovable AI Gateway e Groq; critérios por módulo; matriz humano / agente / integração.
- `docs/comercial/01-arquitetura.md` (atualizado) — camadas físicas preservadas, com responsabilidades explícitas de tenant, grants e auditoria; classificação dos entrypoints; frentes de IA e pagamentos sem integração.
- `docs/IMPLEMENTATION_ROADMAP.md` (este arquivo) — registro de conclusão, sem alteração do histórico das fases.

**Estado de validação herdado:** `docs/comercial/17-auditoria-modulos.md` registra 26 arquivos / 350 testes OK e CI verde no commit `1537afe`. Cinco achados daquela auditoria foram corrigidos no lote de 2026-11-24 (parse de aprovação, `devWrite`, Kanban, fuso e redaction); os três restantes continuam sem mudança de semântica e foram destinados a decisões futuras no plano.

**Restrições preservadas:**

- A2 permanece bloqueada (Lovable sem créditos e MCP sem login OAuth); todo schema descrito é especificação, não aplicação.
- A8 permanece bloqueada; nenhum deploy, expose, túnel, domínio, `.env`, segredo ou token foi alterado.
- Nenhum código, migration, `drizzle/`, `supabase/` ou arquivo gerado foi editado por esta FASE 1; alterações de código eventualmente presentes na working tree são externas a este registro e não foram tocadas. Nenhum commit, push, PR ou merge foi feito por este trabalho.
- Nenhum dado fictício foi apresentado como real; a vitrine `/vendas` continua `AMOSTRA`.

**Critérios de conclusão avaliados:** arquitetura atualizada e pronta para aprovação ✅ · matriz de permissões definida ✅ · lista de provedores de pagamento para investigação e de IA para manutenção ✅ · nenhum código alterado ✅.

**Próxima ação real:** aguardar aprovação deste plano e desbloquear A2 no editor do Lovable; depois executar A3, A4 (14 casos de isolamento) e somente então A5.
