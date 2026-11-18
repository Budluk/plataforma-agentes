-- EXEMPLO: revisar contra o schema existente antes de aplicar.
-- Requer Supabase Auth. Não substitui nem migra tabelas existentes.
create table if not exists public.cs_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.cs_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.cs_projects(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  task_type text not null,
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cs_projects enable row level security;
alter table public.cs_agent_tasks enable row level security;
create policy "owners manage own projects" on public.cs_projects for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners manage own tasks" on public.cs_agent_tasks for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
