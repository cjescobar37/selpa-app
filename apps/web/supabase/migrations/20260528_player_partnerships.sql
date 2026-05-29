create table if not exists public.player_partner_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  sender_club_player_id uuid not null references public.club_players(id) on delete cascade,
  receiver_club_player_id uuid not null references public.club_players(id) on delete cascade,
  status text not null default 'PENDING',
  message text,
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_partner_invites_distinct_players_chk check (sender_club_player_id <> receiver_club_player_id),
  constraint player_partner_invites_status_chk check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'))
);

create table if not exists public.player_active_partnerships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  player1_club_player_id uuid not null references public.club_players(id) on delete cascade,
  player2_club_player_id uuid not null references public.club_players(id) on delete cascade,
  status text not null default 'ACTIVE',
  created_by uuid references auth.users(id) on delete set null,
  accepted_invite_id uuid references public.player_partner_invites(id) on delete set null,
  accepted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_active_partnerships_distinct_players_chk check (player1_club_player_id <> player2_club_player_id),
  constraint player_active_partnerships_canonical_order_chk check (player1_club_player_id < player2_club_player_id),
  constraint player_active_partnerships_status_chk check (status in ('ACTIVE', 'ENDED'))
);

create unique index if not exists player_partner_invites_pending_pair_uidx
  on public.player_partner_invites (
    club_id,
    least(sender_club_player_id, receiver_club_player_id),
    greatest(sender_club_player_id, receiver_club_player_id)
  )
  where status = 'PENDING';

create unique index if not exists player_active_partnerships_active_pair_uidx
  on public.player_active_partnerships (
    club_id,
    player1_club_player_id,
    player2_club_player_id
  )
  where status = 'ACTIVE';

create index if not exists player_partner_invites_sender_idx
  on public.player_partner_invites (club_id, sender_club_player_id, status);

create index if not exists player_partner_invites_receiver_idx
  on public.player_partner_invites (club_id, receiver_club_player_id, status);

create index if not exists player_active_partnerships_player1_idx
  on public.player_active_partnerships (club_id, player1_club_player_id, status);

create index if not exists player_active_partnerships_player2_idx
  on public.player_active_partnerships (club_id, player2_club_player_id, status);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_player_partner_invites_updated_at'
  ) then
    create trigger trg_player_partner_invites_updated_at
      before update on public.player_partner_invites
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_player_active_partnerships_updated_at'
  ) then
    create trigger trg_player_active_partnerships_updated_at
      before update on public.player_active_partnerships
      for each row
      execute function public.set_updated_at();
  end if;
end $$;

alter table public.player_partner_invites enable row level security;
alter table public.player_active_partnerships enable row level security;

drop policy if exists player_partner_invites_select_participant_or_admin on public.player_partner_invites;
create policy player_partner_invites_select_participant_or_admin
  on public.player_partner_invites
  for select
  using (
    public.is_club_admin(club_id)
    or exists (
      select 1
      from public.club_players cp
      where cp.club_id = player_partner_invites.club_id
        and cp.user_id = auth.uid()
        and cp.id in (sender_club_player_id, receiver_club_player_id)
    )
  );

drop policy if exists player_partner_invites_insert_sender_or_admin on public.player_partner_invites;
create policy player_partner_invites_insert_sender_or_admin
  on public.player_partner_invites
  for insert
  with check (
    public.is_club_admin(club_id)
    or exists (
      select 1
      from public.club_players cp
      where cp.club_id = player_partner_invites.club_id
        and cp.user_id = auth.uid()
        and cp.id = sender_club_player_id
    )
  );

drop policy if exists player_partner_invites_update_participant_or_admin on public.player_partner_invites;
create policy player_partner_invites_update_participant_or_admin
  on public.player_partner_invites
  for update
  using (
    public.is_club_admin(club_id)
    or exists (
      select 1
      from public.club_players cp
      where cp.club_id = player_partner_invites.club_id
        and cp.user_id = auth.uid()
        and cp.id in (sender_club_player_id, receiver_club_player_id)
    )
  )
  with check (
    public.is_club_admin(club_id)
    or exists (
      select 1
      from public.club_players cp
      where cp.club_id = player_partner_invites.club_id
        and cp.user_id = auth.uid()
        and cp.id in (sender_club_player_id, receiver_club_player_id)
    )
  );

drop policy if exists player_active_partnerships_select_participant_or_admin on public.player_active_partnerships;
create policy player_active_partnerships_select_participant_or_admin
  on public.player_active_partnerships
  for select
  using (
    public.is_club_admin(club_id)
    or exists (
      select 1
      from public.club_players cp
      where cp.club_id = player_active_partnerships.club_id
        and cp.user_id = auth.uid()
        and cp.id in (player1_club_player_id, player2_club_player_id)
    )
  );

drop policy if exists player_active_partnerships_insert_admin on public.player_active_partnerships;
create policy player_active_partnerships_insert_admin
  on public.player_active_partnerships
  for insert
  with check (public.is_club_admin(club_id));

drop policy if exists player_active_partnerships_update_participant_or_admin on public.player_active_partnerships;
create policy player_active_partnerships_update_participant_or_admin
  on public.player_active_partnerships
  for update
  using (
    public.is_club_admin(club_id)
    or exists (
      select 1
      from public.club_players cp
      where cp.club_id = player_active_partnerships.club_id
        and cp.user_id = auth.uid()
        and cp.id in (player1_club_player_id, player2_club_player_id)
    )
  )
  with check (
    public.is_club_admin(club_id)
    or exists (
      select 1
      from public.club_players cp
      where cp.club_id = player_active_partnerships.club_id
        and cp.user_id = auth.uid()
        and cp.id in (player1_club_player_id, player2_club_player_id)
    )
  );

grant all on table public.player_partner_invites to authenticated;
grant all on table public.player_partner_invites to service_role;
grant all on table public.player_active_partnerships to authenticated;
grant all on table public.player_active_partnerships to service_role;

-- TODO: if active partnerships need richer membership rules, normalize active
-- partnership members into a child table to enforce one ACTIVE partner per
-- club_player with a simple partial unique index.
