do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'commission_status') then
    create type public.commission_status as enum ('pending', 'settled', 'refunded', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'settlement_status') then
    create type public.settlement_status as enum ('pending', 'approved', 'paid', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_source_type') then
    create type public.payment_source_type as enum ('tournament_registration', 'manual', 'adjustment', 'other');
  end if;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  tournament_id uuid references public.tournaments(id) on delete set null,
  team_id uuid references public.tournament_teams(id) on delete set null,
  registration_id uuid references public.tournament_registrations(id) on delete set null,
  source_type public.payment_source_type not null default 'tournament_registration',
  status public.payment_status not null default 'pending',
  amount numeric(12,2) not null check (amount > 0),
  refunded_amount numeric(12,2) not null default 0 check (refunded_amount >= 0),
  currency text not null default 'ARS',
  provider text,
  provider_payment_id text,
  provider_preference_id text,
  provider_status text,
  provider_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  failure_reason text,
  refund_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_refunded_amount_lte_amount_chk check (refunded_amount <= amount)
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  status public.settlement_status not null default 'pending',
  period_start date not null,
  period_end date not null,
  gross_amount numeric(12,2) not null default 0 check (gross_amount >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  net_amount numeric(12,2) not null default 0 check (net_amount >= 0),
  currency text not null default 'ARS',
  payments_count integer not null default 0 check (payments_count >= 0),
  generated_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  paid_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_period_chk check (period_end >= period_start)
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete restrict,
  tournament_id uuid references public.tournaments(id) on delete set null,
  settlement_id uuid references public.settlements(id) on delete set null,
  status public.commission_status not null default 'pending',
  base_amount numeric(12,2) not null check (base_amount >= 0),
  commission_rate_bps integer not null check (commission_rate_bps >= 0 and commission_rate_bps <= 10000),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  club_net_amount numeric(12,2) not null check (club_net_amount >= 0),
  currency text not null default 'ARS',
  rule_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete restrict,
  commission_id uuid not null references public.commissions(id) on delete restrict,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  net_amount numeric(12,2) not null check (net_amount >= 0),
  currency text not null default 'ARS',
  created_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_club_id_idx on public.payments (club_id);
create index if not exists payments_tournament_id_idx on public.payments (tournament_id);
create index if not exists payments_registration_id_idx on public.payments (registration_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_source_type_idx on public.payments (source_type);
create unique index if not exists payments_provider_payment_id_uidx
  on public.payments (provider_payment_id)
  where provider_payment_id is not null;
create unique index if not exists payments_active_registration_uidx
  on public.payments (registration_id)
  where registration_id is not null and status in ('pending', 'paid');

create index if not exists commissions_payment_id_idx on public.commissions (payment_id);
create index if not exists commissions_club_id_idx on public.commissions (club_id);
create index if not exists commissions_tournament_id_idx on public.commissions (tournament_id);
create index if not exists commissions_settlement_id_idx on public.commissions (settlement_id);
create index if not exists commissions_status_idx on public.commissions (status);
create unique index if not exists commissions_payment_id_uidx on public.commissions (payment_id);

create index if not exists settlements_club_id_idx on public.settlements (club_id);
create index if not exists settlements_status_idx on public.settlements (status);
create index if not exists settlements_period_idx on public.settlements (period_start, period_end);
create unique index if not exists settlements_club_period_active_uidx
  on public.settlements (club_id, period_start, period_end)
  where status <> 'cancelled';

create index if not exists settlement_items_settlement_id_idx on public.settlement_items (settlement_id);
create index if not exists settlement_items_payment_id_idx on public.settlement_items (payment_id);
create unique index if not exists settlement_items_settlement_payment_uidx
  on public.settlement_items (settlement_id, payment_id);
create unique index if not exists settlement_items_commission_uidx
  on public.settlement_items (commission_id);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

drop trigger if exists commissions_set_updated_at on public.commissions;
create trigger commissions_set_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

drop trigger if exists settlements_set_updated_at on public.settlements;
create trigger settlements_set_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
alter table public.commissions enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_items enable row level security;

drop policy if exists payments_select_platform_admins on public.payments;
create policy payments_select_platform_admins
  on public.payments
  for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

drop policy if exists commissions_select_platform_admins on public.commissions;
create policy commissions_select_platform_admins
  on public.commissions
  for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

drop policy if exists settlements_select_platform_admins on public.settlements;
create policy settlements_select_platform_admins
  on public.settlements
  for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

drop policy if exists settlement_items_select_platform_admins on public.settlement_items;
create policy settlement_items_select_platform_admins
  on public.settlement_items
  for select
  to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));
