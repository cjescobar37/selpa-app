begin;

alter table public.tournament_team_seed_snapshots
  add column if not exists source_series_id uuid references public.competition_series(id) on delete restrict,
  add column if not exists source_event_division_id uuid references public.competition_series_event_divisions(id) on delete restrict;

alter table public.tournament_team_seed_snapshots
  drop constraint if exists tournament_team_seed_snapshots_source_chk;

alter table public.tournament_team_seed_snapshots
  add constraint tournament_team_seed_snapshots_source_chk
  check (
    (seed_source = 'NO_RANKING' and source_series_id is null and source_event_division_id is null)
    or
    (seed_source = 'COMPETITION_SERIES_RANKING' and source_series_id is not null and source_event_division_id is not null)
  );

create or replace function public.validate_tournament_seed_snapshot_ranking_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_series_id uuid;
  v_club_id uuid;
begin
  if new.seed_source = 'NO_RANKING' then
    if new.source_series_id is not null or new.source_event_division_id is not null then
      raise exception 'SEED_SOURCE_SCOPE_INVALID' using errcode = '23514';
    end if;
    return new;
  end if;

  select event.series_id, division.club_id
    into v_series_id, v_club_id
  from public.competition_series_event_divisions division
  join public.competition_series_events event
    on event.id = division.event_id and event.club_id = division.club_id
  where division.id = new.source_event_division_id;

  if v_series_id is distinct from new.source_series_id
     or v_club_id is distinct from new.club_id then
    raise exception 'SEED_SOURCE_SCOPE_INVALID' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tournament_seed_snapshot_ranking_scope
  on public.tournament_team_seed_snapshots;
create trigger trg_tournament_seed_snapshot_ranking_scope
before insert or update on public.tournament_team_seed_snapshots
for each row execute function public.validate_tournament_seed_snapshot_ranking_scope();

revoke all on function public.validate_tournament_seed_snapshot_ranking_scope() from public;
grant execute on function public.validate_tournament_seed_snapshot_ranking_scope() to service_role;

comment on column public.tournament_team_seed_snapshots.seed_source is
  'Immutable source used to calculate the stored team score: NO_RANKING or COMPETITION_SERIES_RANKING.';
comment on column public.tournament_team_seed_snapshots.source_series_id is
  'Circuit whose published ranking was used to seed this team, when applicable.';
comment on column public.tournament_team_seed_snapshots.source_event_division_id is
  'Linked circuit event division that establishes the historic ranking scope.';

commit;
