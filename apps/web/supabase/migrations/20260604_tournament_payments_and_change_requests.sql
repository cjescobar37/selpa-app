-- Backend base for tournament payment requests and registration change requests.
-- Card details are never stored in Pamprax; provider ids are stored only for external processors.

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
      payment_method in ('MERCADO_PAGO', 'BANK_TRANSFER', 'CASH_ON_SITE_REQUEST')
    );

create table if not exists public.tournament_payments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid null references public.tournament_teams(id) on delete set null,
  registration_id uuid null references public.tournament_registrations(id) on delete set null,
  user_id uuid not null,
  amount numeric not null default 0,
  currency text not null default 'ARS',
  method text not null,
  status text not null default 'PENDING',
  provider text null,
  provider_payment_id text null,
  provider_preference_id text null,
  notes text null,
  requested_at timestamptz not null default now(),
  paid_at timestamptz null,
  approved_at timestamptz null,
  approved_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournament_payments
  alter column team_id drop not null,
  alter column registration_id drop not null;

alter table public.tournament_payments
  drop constraint if exists tournament_payments_team_id_fkey,
  add constraint tournament_payments_team_id_fkey
    foreign key (team_id) references public.tournament_teams(id) on delete set null;

alter table public.tournament_payments
  drop constraint if exists tournament_payments_registration_id_fkey,
  add constraint tournament_payments_registration_id_fkey
    foreign key (registration_id) references public.tournament_registrations(id) on delete set null;

alter table public.tournament_payments
  drop constraint if exists tournament_payments_method_chk,
  add constraint tournament_payments_method_chk
    check (method in ('MERCADO_PAGO', 'BANK_TRANSFER', 'CASH_ON_SITE_REQUEST'));

alter table public.tournament_payments
  drop constraint if exists tournament_payments_status_chk,
  add constraint tournament_payments_status_chk
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'));

alter table public.tournament_payments
  drop constraint if exists tournament_payments_currency_chk,
  add constraint tournament_payments_currency_chk check (char_length(currency) = 3);

alter table public.tournament_payments
  drop constraint if exists tournament_payments_user_id_fkey,
  add constraint tournament_payments_user_id_fkey
    foreign key (user_id) references public.profiles(user_id) on delete cascade;

alter table public.tournament_payments
  drop constraint if exists tournament_payments_approved_by_fkey,
  add constraint tournament_payments_approved_by_fkey
    foreign key (approved_by) references public.profiles(user_id) on delete set null;

create index if not exists idx_tournament_payments_tournament on public.tournament_payments(tournament_id);
create index if not exists idx_tournament_payments_club on public.tournament_payments(club_id);
create index if not exists idx_tournament_payments_team on public.tournament_payments(team_id);
create index if not exists idx_tournament_payments_registration on public.tournament_payments(registration_id);
create index if not exists idx_tournament_payments_user on public.tournament_payments(user_id);
create index if not exists idx_tournament_payments_status on public.tournament_payments(status);

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

drop policy if exists tournament_payments_insert_requester on public.tournament_payments;
create policy tournament_payments_insert_requester
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

create table if not exists public.tournament_registration_change_requests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid null references public.tournament_teams(id) on delete set null,
  registration_id uuid null references public.tournament_registrations(id) on delete set null,
  requested_by uuid not null references public.profiles(user_id) on delete cascade,
  type text not null,
  status text not null default 'PENDING',
  reason text null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references public.profiles(user_id) on delete set null
);

alter table public.tournament_registration_change_requests
  drop constraint if exists tournament_registration_change_requests_type_chk,
  add constraint tournament_registration_change_requests_type_chk
    check (type in ('CANCEL_REGISTRATION'));

alter table public.tournament_registration_change_requests
  drop constraint if exists tournament_registration_change_requests_status_chk,
  add constraint tournament_registration_change_requests_status_chk
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

create index if not exists idx_tournament_change_requests_tournament on public.tournament_registration_change_requests(tournament_id);
create index if not exists idx_tournament_change_requests_club on public.tournament_registration_change_requests(club_id);
create index if not exists idx_tournament_change_requests_team on public.tournament_registration_change_requests(team_id);
create index if not exists idx_tournament_change_requests_registration on public.tournament_registration_change_requests(registration_id);
create index if not exists idx_tournament_change_requests_requested_by on public.tournament_registration_change_requests(requested_by);
create index if not exists idx_tournament_change_requests_status on public.tournament_registration_change_requests(status);

alter table public.tournament_registration_change_requests enable row level security;

drop policy if exists tournament_change_requests_select_participant_or_admin on public.tournament_registration_change_requests;
create policy tournament_change_requests_select_participant_or_admin
on public.tournament_registration_change_requests
for select
using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
  or requested_by = auth.uid()
  or exists (
    select 1
    from public.tournament_teams tt
    where tt.id = tournament_registration_change_requests.team_id
      and (tt.player1_user_id = auth.uid() or tt.player2_user_id = auth.uid())
  )
);

drop policy if exists tournament_change_requests_insert_requester on public.tournament_registration_change_requests;
create policy tournament_change_requests_insert_requester
on public.tournament_registration_change_requests
for insert
with check (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
  or requested_by = auth.uid()
);

drop policy if exists tournament_change_requests_update_admin on public.tournament_registration_change_requests;
create policy tournament_change_requests_update_admin
on public.tournament_registration_change_requests
for update
using (public.is_platform_admin() or public.is_club_admin(club_id))
with check (public.is_platform_admin() or public.is_club_admin(club_id));
