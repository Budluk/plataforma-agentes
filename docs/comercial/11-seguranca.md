# 11 — Segurança, testes e produção (Fase 10)

Camada final de contratos puros que amarra as Fases 2–9 a um modelo de permissões, LGPD, auditoria encadeada e preflight de produção. Nada aqui executa ação externa, grava banco, expõe a aplicação, cria tunnel/domínio, rotaciona segredo, faz commit/push ou deploy.

Arquivo: `lovable-app/src/lib/core/seguranca.ts`. Testes: `lovable-app/src/test/seguranca.test.ts`.

## Atores e permissões

`evaluateActorPermission` recebe um ator discriminado por `kind` e devolve `{ allowed, requiresApproval, ator, origem, capability, reasons }`. A ordem dos gates é fixa e falha fechada:

1. ator inválido → `ator`;
2. `organization_id` diferente do tenant informado → `tenant`;
3. ação vazia → `ação`;
4. kill switch ativo → `kill_switch` (usa `evaluateAutomationKillSwitch` de `automacoes.ts`);
5. `tool` informado e vetado pelo `hardGate.ts` via `checkCommercialTool` → `hard_gate`;
6. ação sensível → sempre `allowed: false` e `requiresApproval: true`, para **qualquer** ator;
7. apenas então a regra específica do ator.

| Ator | Origem da decisão | Regra |
|---|---|---|
| `humano` | `membership`/`role` | `viewer` lê; `seller` escreve os próprios registros; `manager` aprova; `admin`/`owner` administram. `active: false` bloqueia. |
| `agente` | `agent_grants` + catálogo comercial + `authorizeCommercialAction` | ação precisa estar no grant e no escopo do agente; autonomia `assistido`/`semiautonomo` gera `requiresApproval`; agente desconhecido ou inativo bloqueia. |
| `integracao` | `integration_grants` | escopo padrão por capacidade (`read`/`write`/`approve`/`admin`), `active` e `expires_at` verificados contra o `now` explícito; escopo ausente ou expirado bloqueia. |

Nenhuma aprovação transforma `allowed` em `true` para ação sensível. Nenhum papel global substitui a membership do tenant.

## LGPD

`evaluateProcessing` valida uma declaração `DataProcessing` antes de qualquer tratamento: `organization_id`, `purpose`, `legal_basis` (`consentimento`, `contrato`, `obrigacao_legal`, `interesse_legitimo`, `tutela_direitos`), `collected_at`, `retention_days`, `fields`, consentimento e revogação.

- Base `consentimento` exige `consent_id` e `consented_at`; `revoked_at` ou oposição explícita (`opposed: true`) bloqueiam.
- Campos sensíveis (`cpf`, `cnpj`, `rg`, `documento`, `document_token`, `endereco`, `telefone`, `data_nascimento`) exigem `sensitive_justification` declarada.
- Retenção expirada, coleta no futuro, instante inválido ou tenant divergente bloqueiam.
- Declaração inválida retorna `sem_dados` com razões de validação — nunca um aval.

`evaluateDataSubjectRequest` cobre `acesso`, `correcao`, `exclusao`, `oposicao` e `portabilidade`. `exclusao` e `portabilidade` exigem `approved_by`; solicitação `concluida` sem aprovação registrada volta como `bloqueado`/`requiresApproval: true`. A função apenas classifica: nenhuma exportação ou exclusão é executada nesta camada.

## Auditoria encadeada

`buildSecurityAuditEvent` reaproveita `redact`, `canonical`, `auditCanon`, `auditHash` e `GENESIS_HASH` — o mesmo formato do `ctl_append_audit_exact` da plataforma. Antes da canonicalização, a sanitização:

- chaves com `key`, `token`, `secret`, `password`, `authorization`, `credential`, `cookie` etc. viram `***`;
- padrões de API key/JWT/private key são mascarados;
- conteúdo bruto (`prompt`, `resposta`, `response`, `raw`, `bruto`, `body`, `message`, `mensagem`, `conteudo`, `content`) é substituído por `[omitido]`;
- tamanho, profundidade e número de itens são limitados pelo `redact`.

O `detail` é armazenado como texto canônico: a cadeia **nunca reserializa** o `detail` lido do banco. `verifyAuditChain` recomputa do genesis e aponta `badIndex` quando o elo anterior ou o hash diverge. Cadeia vazia é `ok: true` com `count: 0`. `asOfSeconds`, `organizationId`, `runId`, `actor`, `event`, `action` e `status` inválidos lançam erro e nenhum evento é construído.

## Preflight de produção

`evaluateProductionReadiness` é documental e falha fechada. Verifica tenant, schema aplicado, tipos gerados, ADR 0010 aprovado, RLS aplicada, legibilidade/estado do kill switch, cadeia de auditoria, checagens de atores, de tratamentos LGPD e de integrações oficiais.

- `bloqueado` se qualquer checagem crítica falha; `pendente` se houver aprovação/kill ativo/sem declaração; `pronto` apenas se tudo estiver `ok`.
- Mesmo `pronto` mantém `canExpose: false`, `canDeploy: false`, `canCommit: false`. Autorização explícita separada continua necessária para qualquer mudança de ambiente ou publicação.

## Limites desta fase

- Nenhuma migração, tabela, policy RLS, tipo gerado, segredo, server function, entrypoint, rota, UI, ferramenta de execução ou registro de tool.
- Nenhuma chamada de modelo, envio, campanha, checkout, pagamento, expose, tunnel, domínio, deploy, commit, push, PR ou merge.
- O schema da Fase 2 segue sem aplicação no Lovable; o ADR 0010 continua minuta.
- Não há leitura de banco nesta camada — os estados são informados pelo chamador e validados aqui.
- A vitrine `/vendas` permanece ilustrativa e rotulada `AMOSTRA`; publicação social segue simulada.

## Validação

`npm run typecheck`, `npm test`, `npm run build` e `git diff --check`. A suíte `seguranca.test.ts` cobre papéis e capacidades, tenant, hard gate, kill switch, ações sensíveis, grants de agente, escopos/expiração de integração, LGPD (consentimento, oposição, retenção, campos sensíveis, titular de dados), redação e encadeamento da auditoria e os três estados do preflight.
