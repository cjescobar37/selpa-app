create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description)
values
  ('default_commission_bps', '1000'::jsonb, 'Comisión default de plataforma en basis points. 1000 = 10%.'),
  ('default_currency', '"ARS"'::jsonb, 'Moneda operativa default.'),
  ('platform_public_name', '"PAMPrax"'::jsonb, 'Nombre público visible de la plataforma.'),
  ('contact_email', '""'::jsonb, 'Email público de contacto institucional.')
on conflict (key) do nothing;

create index if not exists platform_settings_updated_at_idx
  on public.platform_settings (updated_at desc);

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_select_platform_admins on public.platform_settings;
create policy platform_settings_select_platform_admins
  on public.platform_settings
  for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

drop policy if exists platform_settings_update_platform_admins on public.platform_settings;
create policy platform_settings_update_platform_admins
  on public.platform_settings
  for update
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
