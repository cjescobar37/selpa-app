create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_logs_created_at_idx
  on public.platform_audit_logs (created_at desc);

create index if not exists platform_audit_logs_actor_user_id_idx
  on public.platform_audit_logs (actor_user_id);

create index if not exists platform_audit_logs_entity_idx
  on public.platform_audit_logs (entity_type, entity_id);

create index if not exists platform_audit_logs_action_idx
  on public.platform_audit_logs (action);

alter table public.platform_audit_logs enable row level security;

drop policy if exists platform_audit_logs_select_platform_admins
  on public.platform_audit_logs;

create policy platform_audit_logs_select_platform_admins
  on public.platform_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = auth.uid()
    )
  );
