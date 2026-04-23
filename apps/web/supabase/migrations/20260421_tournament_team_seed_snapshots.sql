create table if not exists public.tournament_team_seed_snapshots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  registration_id uuid not null references public.tournament_registrations(id) on delete cascade,
  player1_user_id uuid not null references auth.users(id) on delete restrict,
  player2_user_id uuid not null references auth.users(id) on delete restrict,
  player1_points integer not null default 0 check (player1_points >= 0),
  player2_points integer not null default 0 check (player2_points >= 0),
  team_score integer not null default 0 check (team_score >= 0),
  best_individual_points integer not null default 0 check (best_individual_points >= 0),
  worst_individual_points integer not null default 0 check (worst_individual_points >= 0),
  seed integer not null check (seed > 0),
  seed_source text not null default 'NO_RANKING',
  snapshot_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tournament_team_seed_snapshots_source_chk check (seed_source in ('NO_RANKING')),
  constraint tournament_team_seed_snapshots_team_score_chk check (team_score = player1_points + player2_points),
  constraint tournament_team_seed_snapshots_best_points_chk check (
    best_individual_points = greatest(player1_points, player2_points)
  ),
  constraint tournament_team_seed_snapshots_worst_points_chk check (
    worst_individual_points = least(player1_points, player2_points)
  ),
  constraint tournament_team_seed_snapshots_tournament_team_key unique (tournament_id, team_id),
  constraint tournament_team_seed_snapshots_tournament_registration_key unique (tournament_id, registration_id),
  constraint tournament_team_seed_snapshots_tournament_seed_key unique (tournament_id, seed)
);

create index if not exists tournament_team_seed_snapshots_tournament_id_idx
  on public.tournament_team_seed_snapshots(tournament_id);

create index if not exists tournament_team_seed_snapshots_club_id_idx
  on public.tournament_team_seed_snapshots(club_id);

create index if not exists tournament_team_seed_snapshots_team_id_idx
  on public.tournament_team_seed_snapshots(team_id);

alter table public.tournament_team_seed_snapshots enable row level security;

drop policy if exists tournament_team_seed_snapshots_select_member_or_platform
  on public.tournament_team_seed_snapshots;
create policy tournament_team_seed_snapshots_select_member_or_platform
  on public.tournament_team_seed_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = tournament_team_seed_snapshots.club_id
        and cm.user_id = auth.uid()
        and cm.status = 'APPROVED'
        and cm.approved_at is not null
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );
