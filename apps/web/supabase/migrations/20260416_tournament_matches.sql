do $$
begin
  if not exists (select 1 from pg_type where typname = 'match_status') then
    create type public.match_status as enum ('PENDING', 'PLAYED', 'CANCELLED');
  end if;

  if not exists (select 1 from pg_type where typname = 'match_phase') then
    create type public.match_phase as enum ('GROUP', 'ROUND_OF_16', 'QUARTER', 'SEMI', 'FINAL', 'THIRD_PLACE', 'OTHER');
  end if;
end $$;

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team1_id uuid not null references public.tournament_teams(id) on delete restrict,
  team2_id uuid not null references public.tournament_teams(id) on delete restrict,
  round integer not null default 1 check (round > 0),
  phase public.match_phase not null default 'GROUP',
  status public.match_status not null default 'PENDING',
  score jsonb not null default '{}'::jsonb check (jsonb_typeof(score) = 'object'),
  winner_team_id uuid references public.tournament_teams(id) on delete set null,
  match_order integer not null default 0,
  scheduled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint tournament_matches_distinct_teams check (team1_id <> team2_id),
  constraint tournament_matches_winner_is_participant check (
    winner_team_id is null or winner_team_id in (team1_id, team2_id)
  )
);

create index if not exists tournament_matches_tournament_id_idx
  on public.tournament_matches(tournament_id);

create index if not exists tournament_matches_club_id_idx
  on public.tournament_matches(club_id);

create index if not exists tournament_matches_round_idx
  on public.tournament_matches(round);

create index if not exists tournament_matches_status_idx
  on public.tournament_matches(status);

create index if not exists tournament_matches_order_idx
  on public.tournament_matches(tournament_id, round, match_order, created_at);

create or replace function public.validate_tournament_match_scope()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_tournament_club uuid;
  v_team1 record;
  v_team2 record;
  v_winner record;
begin
  select club_id into v_tournament_club
  from public.tournaments
  where id = new.tournament_id;

  if v_tournament_club is null then
    raise exception 'Torneo no encontrado';
  end if;

  if v_tournament_club <> new.club_id then
    raise exception 'El club del partido no coincide con el torneo';
  end if;

  select id, tournament_id, club_id into v_team1
  from public.tournament_teams
  where id = new.team1_id;

  select id, tournament_id, club_id into v_team2
  from public.tournament_teams
  where id = new.team2_id;

  if v_team1.id is null or v_team2.id is null then
    raise exception 'Equipo no encontrado';
  end if;

  if v_team1.tournament_id <> new.tournament_id or v_team2.tournament_id <> new.tournament_id then
    raise exception 'Ambos equipos deben pertenecer al torneo del partido';
  end if;

  if v_team1.club_id <> new.club_id or v_team2.club_id <> new.club_id then
    raise exception 'Ambos equipos deben pertenecer al club del partido';
  end if;

  if new.winner_team_id is not null then
    select id, tournament_id, club_id into v_winner
    from public.tournament_teams
    where id = new.winner_team_id;

    if v_winner.id is null then
      raise exception 'Equipo ganador no encontrado';
    end if;

    if v_winner.id not in (new.team1_id, new.team2_id) then
      raise exception 'El ganador debe ser uno de los equipos del partido';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_matches_validate_scope on public.tournament_matches;
create trigger tournament_matches_validate_scope
  before insert or update on public.tournament_matches
  for each row execute function public.validate_tournament_match_scope();

drop trigger if exists tournament_matches_set_updated_at on public.tournament_matches;
create trigger tournament_matches_set_updated_at
  before update on public.tournament_matches
  for each row execute function public.set_updated_at();

alter table public.tournament_matches enable row level security;

drop policy if exists tournament_matches_select_club_admin on public.tournament_matches;
create policy tournament_matches_select_club_admin
  on public.tournament_matches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.club_memberships cm
      where cm.club_id = tournament_matches.club_id
        and cm.user_id = auth.uid()
        and cm.status = 'APPROVED'
        and cm.approved_at is not null
        and cm.role in ('OWNER', 'ADMIN', 'PLANILLERO')
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );
