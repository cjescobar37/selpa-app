begin;

do $$
declare
  v_club_id uuid;
  v_tournament_id uuid;
  v_event_division_id uuid;
  v_series_id uuid;
  v_other_series_id uuid;
  v_team_id uuid;
  v_player1_id uuid;
  v_player2_id uuid;
  v_registration_id uuid;
  v_snapshot_id uuid;
  v_rejected boolean := false;
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.tournament_team_seed_snapshots'::regclass
      and c.conname = 'tournament_team_seed_snapshots_source_chk'
      and pg_get_constraintdef(c.oid) like '%COMPETITION_SERIES_RANKING%'
  ) then
    raise exception 'FAIL | canonical seed source constraint is missing';
  end if;

  select l.club_id, l.tournament_id, l.event_division_id, e.series_id,
         tt.id, tt.player1_user_id, tt.player2_user_id, tr.id
    into v_club_id, v_tournament_id, v_event_division_id, v_series_id,
         v_team_id, v_player1_id, v_player2_id, v_registration_id
  from public.competition_series_event_tournament_links l
  join public.competition_series_event_divisions ed
    on ed.id = l.event_division_id and ed.club_id = l.club_id
  join public.competition_series_events e
    on e.id = ed.event_id and e.club_id = ed.club_id
  join public.tournament_teams tt
    on tt.tournament_id = l.tournament_id and tt.club_id = l.club_id
  join public.tournament_registrations tr
    on tr.tournament_id = tt.tournament_id and tr.team_id = tt.id and tr.club_id = tt.club_id
  where l.status = 'ACTIVE'
    and not exists (
      select 1 from public.tournament_team_seed_snapshots ss
      where ss.tournament_id = l.tournament_id and ss.team_id = tt.id
    )
  order by l.created_at desc
  limit 1;

  if v_tournament_id is null then
    raise exception 'FAIL | QA fixture unavailable: active circuit date with an unseeded team is required';
  end if;

  select id into v_other_series_id
  from public.competition_series
  where club_id = v_club_id and id <> v_series_id
  order by created_at
  limit 1;

  if v_other_series_id is null then
    raise exception 'FAIL | QA fixture unavailable: a second circuit series in the same club is required';
  end if;

  insert into public.tournament_team_seed_snapshots(
    tournament_id, club_id, team_id, registration_id,
    player1_user_id, player2_user_id,
    player1_points, player2_points, team_score,
    best_individual_points, worst_individual_points,
    seed, seed_source, generated_by
  ) values (
    v_tournament_id, v_club_id, v_team_id, v_registration_id,
    v_player1_id, v_player2_id,
    0, 0, 0, 0, 0,
    999, 'NO_RANKING', null
  ) returning id into v_snapshot_id;

  update public.tournament_team_seed_snapshots
     set seed_source = 'COMPETITION_SERIES_RANKING',
         source_series_id = v_series_id,
         source_event_division_id = v_event_division_id
   where id = v_snapshot_id;

  if not exists (
    select 1 from public.tournament_team_seed_snapshots
    where id = v_snapshot_id
      and seed_source = 'COMPETITION_SERIES_RANKING'
      and source_series_id = v_series_id
      and source_event_division_id = v_event_division_id
  ) then
    raise exception 'FAIL | canonical circuit ranking scope was not persisted';
  end if;

  begin
    update public.tournament_team_seed_snapshots
       set source_series_id = v_other_series_id
     where id = v_snapshot_id;
  exception when others then
    v_rejected := position('SEED_SOURCE_SCOPE_INVALID' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'FAIL | mismatched circuit source was accepted';
  end if;

  v_rejected := false;
  begin
    update public.tournament_team_seed_snapshots
       set source_event_division_id = null
     where id = v_snapshot_id;
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL | incomplete circuit source was accepted';
  end if;

  raise notice 'PASS | canonical tournament seed source: NO_RANKING and COMPETITION_SERIES_RANKING scope validated';
end;
$$;

rollback;
