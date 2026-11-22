// Tipos preparados para o schema comercial Fase 2 (A2).
// Este arquivo NÃO cria tabelas, migrations nem altera o banco.
// É apenas um contrato TypeScript que será preenchido quando o Lovable
// aplicar o schema via `13-prompt-lovable.md`.
// Nenhum valor aqui deve ser usado em produção antes de A2 estar concluída.
//
// Cobertura atual: tenants, memberships, grants, leads, oportunidades,
// propostas e consentimentos — as entidades já consumidas pelos contratos
// puros em `src/lib/core/`. As demais entidades de `02-modelo-dados.md`
// (people, companies, contacts, price_tables, conversations, workflows,
// forecasts etc.) serão geradas pelo Lovable em A3, não duplicadas aqui.

import { z } from "zod";

/** Identificador de organização (tenant). */
export const OrgId = z.string().trim().min(1).max(64);
export type OrgId = z.infer<typeof OrgId>;

/** Identificador de usuário do Supabase Auth. */
export const UserId = z.string().trim().min(1).max(128);
export type UserId = z.infer<typeof UserId>;

/** Papéis de tenant definidos em 03-rls-permissoes.md. */
export const TenantRole = z.enum([
  "owner",
  "admin",
  "manager",
  "seller",
  "viewer",
]);
export type TenantRole = z.infer<typeof TenantRole>;

/** Níveis de autonomia definidos em 03-rls-permissoes.md. */
export const AutonomyLevel = z.enum([
  "assistido",
  "semiautonomo",
  "autonomo_controlado",
]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

/** Status de proposta definido em 09-propostas.md. */
export const ProposalStatus = z.enum(["rascunho", "em_revisao"]);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

/** Origem da proposta: real ou amostra. */
export const ProposalOrigin = z.enum(["real", "amostra"]);
export type ProposalOrigin = z.infer<typeof ProposalOrigin>;

/** Moeda padrão da plataforma. */
export const CurrencyBRL = z.literal("BRL");
export type CurrencyBRL = z.infer<typeof CurrencyBRL>;

/** Valor monetário em centavos inteiros (sem ponto flutuante). */
export const Cents = z.number().int().nonnegative();
export type Cents = z.infer<typeof Cents>;

/** Timestamp ISO 8601 com fuso, usado em `asOf` e `valid_until`. */
export const IsoStamp = z.string().trim().min(1).max(60);
export type IsoStamp = z.infer<typeof IsoStamp>;

/** Contracto mínimo de organização (será preenchido pelo schema do Lovable). */
export interface OrganizationPending {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: "BRL";
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

/** Contracto mínimo de membership (será preenchido pelo schema do Lovable). */
export interface MembershipPending {
  id: string;
  organization_id: string;
  user_id: string;
  role: TenantRole;
  active: boolean;
  created_at: string;
}

/** Contracto mínimo de agent_grant (será preenchido pelo schema do Lovable). */
export interface AgentGrantPending {
  id: string;
  organization_id: string;
  agent_id: string;
  actions: string[];
  autonomy: AutonomyLevel;
  max_discount_pct: number;
  active: boolean;
  created_at: string;
}

/** Contracto mínimo de integration_grant (será preenchido pelo schema do Lovable). */
export interface IntegrationGrantPending {
  id: string;
  organization_id: string;
  integration: string;
  scopes: string[];
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

/** Contracto mínimo de lead (será preenchido pelo schema do Lovable). */
export interface LeadPending {
  id: string;
  organization_id: string;
  person_id?: string | null;
  source_id?: string | null;
  status: string;
  score?: number | null;
  score_status: string;
  owner_user_id?: string | null;
  next_action?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

/** Contracto mínimo de oportunidade (será preenchido pelo schema do Lovable). */
export interface OpportunityPending {
  id: string;
  organization_id: string;
  lead_id?: string | null;
  title: string;
  stage_id?: string | null;
  amount_cents?: number | null;
  probability?: number | null;
  expected_close_date?: string | null;
  owner_user_id?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

/** Contracto mínimo de proposta (será preenchido pelo schema do Lovable). */
export interface ProposalPending {
  id: string;
  organization_id: string;
  opportunity_id?: string | null;
  customer_id?: string | null;
  version: number;
  /** Proveniência obrigatória: "real" ou "amostra" (ver propostas.ts). */
  origin: ProposalOrigin;
  status: ProposalStatus;
  valid_until?: string | null;
  subtotal_cents: Cents;
  discount_cents: Cents;
  tax_cents: Cents;
  total_cents: Cents;
  currency: "BRL";
  payment_terms?: string | null;
  approval_id?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

/** Contracto mínimo de consent_event (append-only, LGPD). */
export interface ConsentEventPending {
  id: string;
  organization_id: string;
  data_subject_ref: string;
  purpose: string;
  legal_basis: string;
  channel?: string | null;
  granted_at?: string | null;
  revoked_at?: string | null;
  source?: string | null;
  evidence_ref?: string | null;
  created_at: string;
}

/** Resultado de uma operação de tenant: falha fechada por padrão. */
export interface TenantOperationResult<T> {
  ok: boolean;
  data: T | null;
  organization_id: string | null;
  reasons: string[];
}

/** Marca explicitamente um dado como amostra (não é dado real). */
export const SAMPLE_MARKER = "AMOSTRA — dado ilustrativo, não é dado real de tenant";
