# 15 — Roteiro SQL manual no Supabase (alternativa, não executado)

Documento de **preparação**, criado porque a conta Lovable não tem créditos para rodar o prompt da Fase 2. **Nada aqui foi aplicado.** Use somente se você autorizar explicitamente a via manual.

## Avisos antes de usar

- O `AGENTS.md` do projeto diz para pedir ao Lovable mudanças de schema. Aplicar SQL direto no Supabase **sai desse fluxo** e pode gerar divergência entre o schema real e o que o Lovable administra.
- Este roteiro cobre o **núcleo de isolamento** e tabelas representativas. As demais tabelas de `02-modelo-dados.md` seguem o mesmo padrão, mas precisam ser revisadas uma a uma antes de aplicar.
- Não edite `supabase/migrations/` nem `drizzle/`. Não é uma migration; é um roteiro para o SQL Editor.
- Não coloque segredos, tokens ou dados reais. A chave HMAC do `document_token` vai em Cloud Secret.
- Depois de aplicar, os tipos gerados precisam ser conferidos no Lovable — sem edição manual.

## 1. Núcleo multi-tenant

```sql
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','seller','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.agent_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id text not null,
  actions text[] not null default '{}',
  autonomy text not null check (autonomy in ('assistido','semiautonomo','autonomo_controlado')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, agent_id)
);

create table if not exists public.integration_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration text not null,
  scopes text[] not null default '{}',
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, integration)
);
```

## 2. Funções de resolução de tenant

`security definer` com `search_path = ''` evita recursão de RLS. Nenhuma policy confia em `organization_id` enviado pelo cliente.

```sql
create or replace function public.current_organization_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  where m.user_id = auth.uid() and m.active
$$;

create or replace function public.has_tenant_role(p_org uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.active
      and m.role = any(p_roles)
  )
$$;
```

## 3. RLS do núcleo

```sql
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.agent_grants enable row level security;
alter table public.integration_grants enable row level security;

create policy org_read on public.organizations for select
  using (id in (select public.current_organization_ids()));

create policy membership_read on public.memberships for select
  using (organization_id in (select public.current_organization_ids()));

create policy membership_write on public.memberships for all
  using (public.has_tenant_role(organization_id, array['owner','admin']))
  with check (public.has_tenant_role(organization_id, array['owner','admin']));

create policy grant_read on public.agent_grants for select
  using (public.has_tenant_role(organization_id, array['admin','owner']));

create policy grant_write on public.agent_grants for all
  using (public.has_tenant_role(organization_id, array['admin','owner']))
  with check (public.has_tenant_role(organization_id, array['admin','owner']));

create policy integration_read on public.integration_grants for select
  using (public.has_tenant_role(organization_id, array['admin','owner']));

create policy integration_write on public.integration_grants for all
  using (public.has_tenant_role(organization_id, array['admin','owner']))
  with check (public.has_tenant_role(organization_id, array['admin','owner']));
```

## 4. Tabelas representativas

```sql
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  document_token text,
  document_last4 text,
  document_kind text not null default 'none' check (document_kind in ('cpf','cnpj','none')),
  consent_status text not null default 'sem_registro',
  owner_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.people(id),
  source_id uuid,
  status text not null default 'novo',
  fit_score numeric,
  interest_score numeric,
  ability_score numeric,
  urgency_score numeric,
  interaction_score numeric,
  score numeric,
  score_status text not null default 'sem_dados',
  score_reason text,
  owner_user_id uuid references auth.users(id),
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id),
  title text not null,
  stage_id uuid,
  amount_cents bigint,
  probability numeric,
  expected_close_date date,
  owner_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id),
  customer_id uuid,
  version integer not null default 1,
  status text not null default 'rascunho',
  valid_until date,
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  currency text not null default 'BRL',
  payment_terms text,
  approval_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  data_subject_ref text not null,
  purpose text not null,
  legal_basis text not null,
  channel text,
  granted_at timestamptz,
  revoked_at timestamptz,
  source text,
  evidence_ref text,
  created_at timestamptz not null default now()
);
```

## 5. RLS das tabelas representativas

```sql
alter table public.people enable row level security;
alter table public.leads enable row level security;
alter table public.opportunities enable row level security;
alter table public.proposals enable row level security;
alter table public.consent_events enable row level security;

create policy people_read on public.people for select
  using (organization_id in (select public.current_organization_ids()));
create policy people_write on public.people for all
  using (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']))
  with check (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']));

create policy leads_read on public.leads for select
  using (organization_id in (select public.current_organization_ids()));
create policy leads_write on public.leads for all
  using (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']))
  with check (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']));

create policy opportunities_read on public.opportunities for select
  using (organization_id in (select public.current_organization_ids()));
create policy opportunities_write on public.opportunities for all
  using (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']))
  with check (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']));

create policy proposals_read on public.proposals for select
  using (organization_id in (select public.current_organization_ids()));
create policy proposals_write on public.proposals for all
  using (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']))
  with check (public.has_tenant_role(organization_id, array['seller','manager','admin','owner']));

create policy consent_read on public.consent_events for select
  using (public.has_tenant_role(organization_id, array['admin','owner']));
create policy consent_insert on public.consent_events for insert
  with check (organization_id in (select public.current_organization_ids()));
```

## 6. Append-only e índices

```sql
create or replace function public.reject_append_only_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'tabela append-only: UPDATE/DELETE nao permitido';
end;
$$;

create trigger consent_events_no_update
  before update on public.consent_events
  for each row execute function public.reject_append_only_mutation();

create trigger consent_events_no_delete
  before delete on public.consent_events
  for each row execute function public.reject_append_only_mutation();

create index if not exists idx_people_org on public.people(organization_id);
create index if not exists idx_leads_org on public.leads(organization_id);
create index if not exists idx_leads_person on public.leads(person_id);
create index if not exists idx_opportunities_org on public.opportunities(organization_id);
create index if not exists idx_opportunities_lead on public.opportunities(lead_id);
create index if not exists idx_proposals_org on public.proposals(organization_id);
create index if not exists idx_proposals_opportunity on public.proposals(opportunity_id);
create index if not exists idx_consent_org_created on public.consent_events(organization_id, created_at);
```

## 7. Storage de anexos

```sql
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_tenant_read on storage.objects for select
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in (
      select public.current_organization_ids()::text
    )
  );

create policy attachments_tenant_write on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in (
      select public.current_organization_ids()::text
    )
  );
```

## 8. O que este roteiro NÃO cobre

- As demais tabelas de `02-modelo-dados.md` (CRM completo, funil, catálogo, atendimento, automações, LGPD e inteligência).
- `customer_360`, funções de aprovação/auditoria append-only já existentes, e a política de `max_discount_pct`.
- Geração/atualização dos tipos — tem que ser conferida no Lovable.
- Qualquer validação real: use `14-plano-testes-isolamento.md` antes de considerar A2 concluída.

## 9. Critério para usar

Só aplicar depois de: (a) autorização explícita sua para a via manual, (b) leitura de `03-rls-permissoes.md`, (c) aceite do risco de divergência com o Lovable, (d) execução integral do plano de testes. Até lá, este arquivo é somente documentação.
