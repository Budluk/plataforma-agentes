# REPOSITORY_EVALUATION.md — Avaliação de Repositórios de Referência

**Projeto:** CentralIA / plataforma-agentes  
**Escopo:** Avaliação dos 20 repositórios indicados no Prompt Mestre (FASE 0)  
**Data:** 22/11/2026  
**Regra:** Não instalar todos. Não copiar projetos inteiros sem análise. Classificar cada um como RECOMENDADO / REFERÊNCIA / EXPERIMENTAL / DESCARTAR. Não misturar várias plataformas que resolvem o mesmo problema.

---

## 1. METODOLOGIA DE AVALIAção

Para cada repositório, foram examinados (com base nas informações disponíveis publicamente e na documentação do próprio projeto):

- Código-fonte e arquitetura.
- Atividade e atualizações recentes.
- Releases e histórico de manutenção.
- Licença e restrições de uso comercial.
- Dependências e requisitos de infraestrutura.
- Compatibilidade com Windows e Claude Code.
- Compatibilidade com a arquitetura atual da CentralIA.
- Segurança e vulnerabilidades conhecidas.
- APIs, webhooks e possibilidade de integração.
- Maturidade dos recursos.
- Testes e documentação.
- Custo de manutenção.
- Possibilidade de uso em produto SaaS comercial.

**Obrigações de licença registradas:** nenhuma licença (MIT, AGPL, BSD, etc.) permite automaticamente qualquer modalidade de comercialização. Arquivos, diretórios e módulos com licenças separadas devem ser examinados antes de integração.

---

## 2. MATRIZ COMPARATIVA

| # | Nome | Finalidade | Funcionalidades aproveitáveis | Linguagem/Stack | Licença | Maturidade | Compatibilidade | Riscos | Esforço de integração | Decisão recomendada |
|---|------|------------|------------------------------|-----------------|---------|------------|-----------------|--------|----------------------|---------------------|
| 1 | DeskcommCRM | CRM, WhatsApp, agentes IA, Supabase, memória, RAG, auditoria, testes de isolamento | CRM, WhatsApp, agentes de IA, estrutura multi-tenant, RAG | Node/TypeScript, Supabase | A verificar | Alta (documentação descritiva) | Alta (mesma stack TS/Supabase) | Licença não verificada; não é substituição automática | Médio | **REFERÊNCIA** |
| 2 | WACRM | CRM focado WhatsApp | WhatsApp, contatos, campanhas | Node/TypeScript | MIT | Média | Média (foco WhatsApp apenas) | Dependência de WhatsApp não oficial pode banir contas | Médio | **EXPERIMENTAL** |
| 3 | Frappe CRM | CRM completo (Frappe Framework) | Contatos, empresas, leads, pipeline | Python, MariaDB/Postgres | GNU AGPL v3 | Alta | Baixa (Python, não TS/Supabase) | AGPL impõe copyleft comercial; stack incompatível | Alto | **DESCARTAR** |
| 4 | Twenty CRM | CRM moderno | Contatos, empresas, leads, pipeline, automações | TypeScript, Node, Postgres | MPL-2.0 (entreprise) / AGPL (comunidade) | Alta | Média (TS/Postgres, mas Next.js) | Licença dual; comunidade restrita; Next.js diferente do TanStack Start | Alto | **REFERÊNCIA** |
| 5 | Chatwoot | Atendimento omnichannel | WhatsApp, e-mail, chat, caixa de entrada central, múltiplos canais | Ruby on Rails, Postgres, Redis | GNU LGPL v3 | Alta | Baixa (Ruby, infra pesada) | Infraestrutura pesada (Redis, Sidecar); stack incompatível | Alto | **REFERÊNCIA** (apenas conceitos de atendimento) |
| 6 | Scraping Skills | Pesquisa web, navegação automatizada | Extração de dados públicos, pesquisa de mercado | Node/TypeScript | MIT | Média | Média | Termos de uso de sites alvo; CAPTCHA/bloqueios | Médio | **EXPERIMENTAL** |
| 7 | Browserable | Navegação automatizada | Navegação headless, extração | Node/TypeScript | A verificar | Baixa/Média | Média | Manutenção incerta; detecção de bot | Médio | **EXPERIMENTAL** |
| 8 | Playwright | Testes E2E e automação de navegador | Testes ponta a ponta, preview, validação visual | Node/TypeScript, Python, Java, .NET | Apache 2.0 | Muito alta | Alta (Windows, Linux, macOS) | Nenhum significativo | Baixo | **RECOMENDADO** |
| 9 | Activepieces | Automação de fluxos (no-code/low-code) | Gatilhos, condições, ações, filas | TypeScript, Node | MIT | Alta | Média (infra própria) | Dependência de infra externa; custo de manutenção | Médio | **REFERÊNCIA** (conceitos de automação) |
| 10 | n8n | Automação de workflows | Gatilhos, condições, ações, integrações | TypeScript, Node | fair-code (não é open source puro) | Muito alta | Média (infra própria) | Licença restringe uso comercial em algumas versões | Médio | **DESCARTAR** (licença comercial restritiva + infra duplicada) |
| 11 | Context7 | Base de conhecimento para IA | Documentação, RAG, contexto para LLMs | TypeScript | A verificar | Baixa | Média | Maturidade baixa; dependência externa | Médio | **DESCARTAR** |
| 12 | Vercel Skills | Framework para habilidades de IA | Habilidades modulares, prompts, integrações | TypeScript | MIT | Baixa/Média | Alta (TS) | Vinculado ao ecossistema Vercel | Médio | **EXPERIMENTAL** |
| 13 | FreeLLMAPI | Agregação de LLMs gratuitos | Roteamento de modelos, múltiplos provedores | Python | MIT | Baixa | Baixa (Python) | Confiabilidade de provedores gratuitos; limites de uso | Médio | **DESCARTAR** |
| 14 | Cloudflare Security Audit Skill | Auditoria de segurança Cloudflare | Verificação de configurações, segurança | TypeScript | MIT | Média | Alta (Cloudflare) | Específico da Cloudflare; escopo limitado | Baixo | **EXPERIMENTAL** |
| 15 | Medusa | Comércio eletrônico | Catálogo, produtos, pedidos, pagamentos, carrinho | TypeScript, Node, Postgres | MIT | Alta | Média (infra própria; Next.js storefront) | Infraestrutura própria; custo de manutenção alto | Alto | **REFERÊNCIA** (conceitos de comércio eletrônico) |
| 16 | Saleor | Comércio eletrônico (headless) | Catálogo, produtos, pedidos, pagamentos, API GraphQL | Python, GraphQL, Postgres | BSD-3 | Alta | Baixa (Python, não TS/Supabase) | Stack incompatível; infra pesada | Alto | **DESCARTAR** |
| 17 | Payload CMS | CMS e páginas de conteúdo | Editor visual, páginas, conteúdos, tipos personalizados | TypeScript, Node, MongoDB/Postgres | MIT (comunidade) / Enterprise | Alta | Média (TS/Node) | Banco preferencial MongoDB; custo enterprise | Médio | **REFERÊNCIA** (páginas e conteúdo) |
| 18 | Mautic | Automação de marketing | E-mail, campanhas, segmentação, leads | PHP, MySQL | GNU GPL v2 | Alta | Baixa (PHP, MySQL) | Stack incompatível; licença GPL restritiva | Alto | **DESCARTAR** |
| 19 | Listmonk | Newsletter e e-mail marketing | Listas, campanhas, e-mails | Go, Postgres | AGPL v3 | Média | Baixa (Go) | AGPL restritivo; stack incompatível | Alto | **DESCARTAR** |
| 20 | PostHog | Analytics e rastreamento | Eventos, funis, retenção, feature flags | Python, TypeScript, Postgres, ClickHouse | MIT | Muito alta | Média (infra própria) | Infraestrutura pesada (ClickHouse); custo de manutenção | Alto | **REFERÊNCIA** (conceitos de analytics) |

---

## 3. DECISÕES POR FUNÇÃO (recomendação de arquitetura)

| Função | Candidato prioritário | Justificativa |
|--------|----------------------|---------------|
| CRM e operação comercial | **DeskcommCRM** (apenas como referência conceitual) | Documentação descreve CRM + WhatsApp + agentes IA + Supabase + memória + RAG + auditoria + testes de isolamento — alinhado com a CentralIA. Não é indicação automática de substituição. |
| Atendimento omnichannel | **Chatwoot** (apenas como referência conceitual) | Referência para caixa de entrada central, múltiplos canais, transferência para humano. Stack Ruby incompatível — não instalar. |
| Automação | **Activepieces** (apenas como referência conceitual) | Referência para gatilhos, condições, ações, filas. Não instalar; a CentralIA já tem `automacoes.ts` puro. |
| Comércio eletrônico | **Medusa** (apenas como referência conceitual) | Referência para catálogo, produtos, pedidos, pagamentos. Stack próprio e infra pesada — não instalar. |
| Páginas e conteúdo | **Payload CMS** (apenas como referência conceitual) | Referência para editor visual, páginas, tipos personalizados. Não instalar sem justificativa. |
| Analytics | **PostHog** (apenas como referência conceitual) | Referência para eventos, funis, retenção. Infra pesada — não instalar. |
| Navegação e testes | **Playwright** | Recomendado para instalação: testes E2E, preview, validação visual. Compatível com Windows. |

---

## 4. REGRAS DE SELEÇÃO APLICADAS

1. **Um CRM principal, não vários.** Não instalar DeskcommCRM, WACRM, Frappe, Twenty ou Chatwoot como plataformas concorrentes. A CentralIA já tem `crm.ts`, `comercial.ts`, `atendimento.ts` e `seguranca.ts` como contratos puros.
2. **Um mecanismo de automação principal.** Não instalar Activepieces nem n8n como motores duplicados. A CentralIA já tem `automacoes.ts` com planejamento de workflows (sem executor).
3. **Um sistema de atendimento principal.** Não instalar Chatwoot como plataforma. A CentralIA já tem `atendimento.ts` com contratos puros de canais.
4. **Uma arquitetura de comércio eletrônico.** Não instalar Medusa nem Saleor como plataformas concorrentes. A CentralIA construirá sua própria camada de comércio desacoplada.
5. **Uma solução de analytics.** Não instalar PostHog como infra própria. A CentralIA usará `analytics.ts`, `trends.ts` e `market.ts` existentes.

---

## 5. LICENÇAS E OBRIGAÇÕES COMERCIAIS

| Licença | Implicação comercial | Ação necessária |
|---------|---------------------|-----------------|
| MIT / BSD | Permissiva, mas não garante ausência de patentes nem licenças separadas em arquivos internos. | Revisar `LICENSE` e arquivos com cabeçalho de licença separada. |
| Apache 2.0 | Permissiva com concessão expressa de patentes. | Revisar `NOTICE` e arquivos com licença separada. |
| GNU AGPL v3 | Copyleft forte: uso em SaaS pode exigir abertura do código-fonte. | **Não integrar sem revisão jurídica.** |
| GNU GPL v2/v3 | Copyleft forte: distribuição derivada pode exigir abertura do código. | **Não integrar sem revisão jurídica.** |
| MPL-2.0 | Copyleft fraco sobre arquivos modificados. | Revisar escopo de modificação. |
| fair-code (n8n) | Não é open source puro; restrições comerciais em algumas versões. | **Não integrar sem revisão jurídica.** |

**Nenhuma licença permite automaticamente comercialização.** Revisar arquivos, diretórios e módulos com licenças separadas antes de qualquer integração.

---

## 6. RISCOS DE INTEGRAÇÃO

| Risco | Descrição | Mitigação |
|-------|-----------|-------------|
| Stack incompatível | Muitos repositórios são Python/Ruby/Go; a CentralIA é TS/Node + Supabase. | Não instalar; usar apenas como referência conceitual. |
| Infraestrutura duplicada | Repositórios como n8n, Medusa, Chatwoot exigem banco, Redis, worker próprios. | Não instalar; manter suporte do Supabase existente. |
| Licença restritiva | AGPL/GPL podem impor abertura de código em SaaS. | Revisão jurídica antes de qualquer uso. |
| Manutenção incerta | Repositórios com pouca atividade podem ser abandonados. | Preferir maduros (Playwright, PostHog, Medusa) como referência apenas. |
| Segurança | Web scraping (Scraping Skills, Browserable) pode violar termos de uso. | Não acessar áreas privadas, burlar CAPTCHA, ignorar limites técnicos. |

---

## 7. CONCLUSÃO E RECOMENDAÇÃO FINAL

**Não recomendo incorporar os 20 projetos.** Isso aumentaria a complexidade, o custo e os pontos de falha da CentralIA.

A seleção inicial para investigação é:

| Função | Candidato prioritário | Ação |
|--------|----------------------|------|
| CRM e operação comercial | DeskcommCRM | Referência conceitual apenas |
| Atendimento omnichannel | Chatwoot | Referência conceitual apenas |
| Automação | Activepieces | Referência conceitual apenas |
| Comércio eletrônico | Medusa | Referência conceitual apenas |
| Páginas e conteúdo | Payload CMS | Referência conceitual apenas |
| Analytics | PostHog | Referência conceitual apenas |
| Navegação e testes | Playwright | **Instalar** (testes E2E, preview, validação) |

O **DeskcommCRM** merece atenção especial porque sua documentação descreve uma combinação de CRM, WhatsApp, agentes de IA, Supabase, memória, RAG, auditoria e testes de isolamento. Isso o torna uma referência relevante para comparar com o que a CentralIA já possui — **não uma indicação automática para substituir seu sistema**.

Toda integração futura deve ser pequena, reversível, justificada tecnicamente e aprovada previamente.
