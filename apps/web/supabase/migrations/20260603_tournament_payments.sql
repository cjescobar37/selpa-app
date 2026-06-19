-- Payment model for tournament registration requests.
-- Mercado Pago/Card flows must store provider ids only; never store card data.

alter table public.tournament_registrations
  add column if not exists payment_status text not null default 'PENDING',
  add column if not exists payment_method text null;

alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_payment_status_chk,
  add constraint tournament_registrations_payment_status_chk
    check (payment_status in ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'));

alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_payment_method_chk,
  add constraint tournament_registrations_payment_method_chk
    check (
      payment_method is null or
      payment_method in ('MERCADO_PAGO', 'CARD_CREDIT', 'CARD_DEBIT', 'CASH_ON_SITE_REQUEST', 'BANK_TRANSFER')
    );

create table if not exists public.tournament_payments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  registration_id uuid null references public.tournament_registrations(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric(12,2) not null default 0,
  currency text not null default 'ARS',
  method text not null,
  status text not null default 'PENDING',
  provider text null,
  provider_payment_id text null,
  provider_preference_id text null,
  requested_at timestamptz not null default now(),
  paid_at timestamptz null,
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_payments_method_chk check (
    method in ('MERCADO_PAGO', 'CARD_CREDIT', 'CARD_DEBIT', 'CASH_ON_SITE_REQUEST', 'BANK_TRANSFER')
  ),
  constraint tournament_payments_status_chk check (
    status in ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED')
  ),
  constraint tournament_payments_currency_chk check (char_length(currency) = 3)
);

create index if not exists idx_tournament_payments_tournament on public.tournament_payments(tournament_id);
create index if not exists idx_tournament_payments_registration on public.tournament_payments(registration_id);
create index if not exists idx_tournament_payments_club_status on public.tournament_payments(club_id, status);
create index if not exists idx_tournament_payments_user on public.tournament_payments(user_id);

alter table public.tournament_payments enable row level security;

drop policy if exists tournament_payments_select_participant_or_admin on public.tournament_payments;
create policy tournament_payments_select_participant_or_admin
on public.tournament_payments
for select
using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
  or user_id = auth.uid()
  or exists (
    select 1
    from public.tournament_teams tt
    where tt.id = tournament_payments.team_id
      and (tt.player1_user_id = auth.uid() or tt.player2_user_id = auth.uid())
  )
);

drop policy if exists tournament_payments_insert_requester_or_admin on public.tournament_payments;
create policy tournament_payments_insert_requester_or_admin
on public.tournament_payments
for insert
with check (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
  or user_id = auth.uid()
);

drop policy if exists tournament_payments_update_admin on public.tournament_payments;
create policy tournament_payments_update_admin
on public.tournament_payments
for update
using (public.is_platform_admin() or public.is_club_admin(club_id))
with check (public.is_platform_admin() or public.is_club_admin(club_id));

