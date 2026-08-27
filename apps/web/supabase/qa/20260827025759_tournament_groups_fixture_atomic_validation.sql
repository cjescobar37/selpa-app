begin;

create or replace function pg_temp.fail_group_assignment_for_qa()
returns trigger
language plpgsql
as $$
begin
  raise exception 'QA_INDUCED_GROUP_ASSIGNMENT_FAILURE';
end;
$$;

create or replace function pg_temp.run_tournament_groups_fixture_atomic_qa()
returns table(result text, detail jsonb)
language plpgsql
as $$
declare
  v_club uuid;
  v_owner uuid;
  v_other_owner uuid;
  v_players uuid[];
  v_category integer;
  v_gender text;
  v_tournament uuid;
  v_team uuid;
  v_registration uuid;
  v_teams uuid[] := array[]::uuid[];
  v_registrations uuid[] := array[]::uuid[];
  v_first jsonb;
  v_replay jsonb;
  v_regenerated jsonb;
  v_ids_before uuid[];
  v_ids_after uuid[];
  v_failed boolean;
  v_i integer;
  v_lifecycle text;
begin
  if to_regprocedure('public.generate_tournament_groups_and_fixture_atomic(uuid,uuid,boolean)') is null
     or to_regprocedure('public.create_tournament_canonical(uuid,jsonb)') is null
     or to_regprocedure('public.register_team_for_tournament(uuid,uuid,uuid)') is null then
    return query select 'BLOCKED', jsonb_build_object('fixture', 'Faltan primitives canónicas requeridas.');
    return;
  end if;

  select cp.club_id, cp.category, upper(cp.gender)
    into v_club, v_category, v_gender
  from public.club_players cp
  join public.club_memberships cm on cm.club_id = cp.club_id and cm.user_id = cp.user_id
  where cp.user_id is not null
    and cp.category is not null
    and cp.operational_status::text = 'ACTIVE'
    and cm.status::text = 'APPROVED'
    and cm.role::text = 'PLAYER'
    and exists (
      select 1 from public.club_memberships admin
      where admin.club_id = cp.club_id
        and admin.status::text = 'APPROVED'
        and admin.role::text in ('OWNER', 'ADMIN')
    )
  group by cp.club_id, cp.category, upper(cp.gender)
  having count(distinct cp.user_id) >= 16
  order by count(distinct cp.user_id) desc
  limit 1;

  select user_id into v_owner
  from public.club_memberships
  where club_id = v_club and status::text = 'APPROVED' and role::text in ('OWNER', 'ADMIN')
  order by case when role::text = 'OWNER' then 0 else 1 end, created_at
  limit 1;

  select user_id into v_other_owner
  from public.club_memberships
  where club_id <> v_club and status::text = 'APPROVED' and role::text in ('OWNER', 'ADMIN')
  order by created_at
  limit 1;

  select array_agg(user_id order by user_id) into v_players
  from (
    select distinct cp.user_id
    from public.club_players cp
    join public.club_memberships cm on cm.club_id = cp.club_id and cm.user_id = cp.user_id
    where cp.club_id = v_club
      and cp.category = v_category
      and upper(cp.gender) = v_gender
      and cp.operational_status::text = 'ACTIVE'
      and cm.status::text = 'APPROVED'
      and cm.role::text = 'PLAYER'
    order by cp.user_id
    limit 16
  ) players;

  if v_owner is null or v_other_owner is null or coalesce(array_length(v_players, 1), 0) < 16 then
    return query select 'BLOCKED', jsonb_build_object(
      'fixture', 'Se requieren OWNER/ADMIN, OWNER/ADMIN cross-club y 16 jugadores compatibles.'
    );
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select id into v_tournament
  from public.create_tournament_canonical(v_club, jsonb_build_object(
    'name', 'QA Groups Fixture Atomic',
    'type', 'OPEN',
    'gender', case when v_gender in ('F', 'FEMALE') then 'FEMALE' else 'MALE' end,
    'segment', 'LIBRES',
    'category_id', v_category,
    'format', 'GROUPS_ELIMINATION',
    'start_date', (current_date + 7)::text,
    'end_date', (current_date + 8)::text,
    'registration_deadline', (now() + interval '2 days')::text,
    'min_pairs', 2,
    'max_pairs', 8,
    'price_per_player', 0
  ));
  -- DRAFT is an allowed lifecycle for the primitive: with no snapshot yet it
  -- must reach the seed guard rather than fail as a lifecycle transition.
  v_failed := false;
  begin
    perform public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, false);
  exception when check_violation then
    if sqlerrm = 'SEED_SNAPSHOT_REQUIRED' then v_failed := true; else raise; end if;
  end;
  if not v_failed then raise exception 'QA_DRAFT_NOT_ACCEPTED_BY_LIFECYCLE'; end if;
  perform public.publish_tournament_atomic(v_club, v_tournament);
  reset role;

  for v_i in 1..8 loop
    perform set_config('request.jwt.claim.sub', v_players[v_i * 2 - 1]::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    select r.team_id, r.registration_id into v_team, v_registration
    from public.register_team_for_tournament(v_tournament, v_club, v_players[v_i * 2]) r;
    reset role;
    v_teams := array_append(v_teams, v_team);
    v_registrations := array_append(v_registrations, v_registration);
  end loop;

  insert into public.tournament_team_seed_snapshots(
    tournament_id, club_id, team_id, registration_id,
    player1_user_id, player2_user_id,
    player1_points, player2_points, team_score,
    best_individual_points, worst_individual_points,
    seed, seed_source, generated_by
  )
  select
    v_tournament, v_club, v_teams[seed_row.seed_no], v_registrations[seed_row.seed_no],
    tt.player1_user_id, tt.player2_user_id,
    0, 0, 0, 0, 0, seed_row.seed_no, 'NO_RANKING', v_owner
  from generate_series(1, 8) as seed_row(seed_no)
  join public.tournament_teams tt on tt.id = v_teams[seed_row.seed_no];

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_first := public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, false);
  reset role;

  if v_first->>'status' <> 'GENERATED'
     or (v_first->>'group_count')::integer <> 2
     or (v_first->>'teams_assigned')::integer <> 8
     or (v_first->>'matches_created')::integer <> 12 then
    raise exception 'QA_GENERATION_RESULT_INVALID';
  end if;
  if (select count(*) from public.tournament_groups where tournament_id = v_tournament) <> 2
     or (select count(*) from public.tournament_group_teams where tournament_id = v_tournament) <> 8
     or (select count(*) from public.tournament_matches where tournament_id = v_tournament and phase::text = 'GROUP') <> 12 then
    raise exception 'QA_GENERATION_COUNTS_INVALID';
  end if;
  if exists (
    select 1
    from public.tournament_groups g
    left join public.tournament_group_teams gt on gt.group_id = g.id
    left join public.tournament_matches m on m.group_id = g.id and m.phase::text = 'GROUP'
    where g.tournament_id = v_tournament
    group by g.id
    having count(distinct gt.team_id) <> 4 or count(distinct m.id) <> 6
  ) then
    raise exception 'QA_ROUND_ROBIN_4_TEAMS_INVALID';
  end if;
  if exists (
    select 1 from public.tournament_group_teams
    where tournament_id = v_tournament
    group by team_id having count(*) <> 1
  ) then
    raise exception 'QA_TEAM_ASSIGNMENT_DUPLICATED';
  end if;
  if exists (
    select 1 from public.tournament_matches
    where tournament_id = v_tournament and phase::text = 'GROUP'
    group by group_id, least(team1_id, team2_id), greatest(team1_id, team2_id)
    having count(*) <> 1
  ) then
    raise exception 'QA_LOGICAL_MATCH_DUPLICATED';
  end if;

  select array_agg(id order by id) into v_ids_before
  from public.tournament_matches where tournament_id = v_tournament and phase::text = 'GROUP';
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_replay := public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, false);
  reset role;
  select array_agg(id order by id) into v_ids_after
  from public.tournament_matches where tournament_id = v_tournament and phase::text = 'GROUP';
  if v_replay->>'status' <> 'ALREADY_GENERATED' or v_ids_before <> v_ids_after then
    raise exception 'QA_REPLAY_NOT_IDEMPOTENT';
  end if;

  perform set_config('request.jwt.claim.sub', v_players[1]::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, false);
  exception when insufficient_privilege then
    if sqlerrm = 'TOURNAMENT_GROUPS_FORBIDDEN' then v_failed := true; else raise; end if;
  end;
  reset role;
  if not v_failed then raise exception 'QA_PLAYER_WAS_AUTHORIZED'; end if;

  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, false);
  exception when insufficient_privilege then
    if sqlerrm = 'TOURNAMENT_GROUPS_FORBIDDEN' then v_failed := true; else raise; end if;
  end;
  reset role;
  if not v_failed then raise exception 'QA_CROSS_CLUB_WAS_AUTHORIZED'; end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_regenerated := public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, true);
  reset role;
  if v_regenerated->>'status' <> 'REGENERATED'
     or (select count(*) from public.tournament_matches where tournament_id = v_tournament and phase::text = 'GROUP') <> 12 then
    raise exception 'QA_SAFE_REGENERATION_FAILED';
  end if;

  select array_agg(id order by id) into v_ids_before
  from public.tournament_matches where tournament_id = v_tournament and phase::text = 'GROUP';
  create trigger qa_force_group_assignment_failure
    before insert on public.tournament_group_teams
    for each row execute function pg_temp.fail_group_assignment_for_qa();
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, true);
  exception when others then
    if sqlerrm = 'QA_INDUCED_GROUP_ASSIGNMENT_FAILURE' then v_failed := true; else raise; end if;
  end;
  reset role;
  drop trigger qa_force_group_assignment_failure on public.tournament_group_teams;
  select array_agg(id order by id) into v_ids_after
  from public.tournament_matches where tournament_id = v_tournament and phase::text = 'GROUP';
  if not v_failed or v_ids_before <> v_ids_after then
    raise exception 'QA_ATOMIC_ROLLBACK_FAILED';
  end if;

  update public.tournament_matches
  set status = 'PLAYED', winner_team_id = team1_id,
      score = '{"sets":[{"team1":6,"team2":0}]}'::jsonb
  where id = v_ids_before[1];
  -- El trigger canónico pasa el torneo a RUNNING al cargar un resultado. Para
  -- aislar la protección histórica de la validación de lifecycle, el fixture
  -- vuelve transaccionalmente a OPEN antes de intentar regenerar.
  update public.tournaments set status = 'OPEN' where id = v_tournament;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, true);
  exception when check_violation then
    if sqlerrm = 'TOURNAMENT_GROUP_HISTORY_EXISTS' then v_failed := true; else raise; end if;
  end;
  reset role;
  if not v_failed or (select count(*) from public.tournament_matches where tournament_id = v_tournament) <> 12 then
    raise exception 'QA_SPORTING_HISTORY_NOT_PROTECTED';
  end if;

  foreach v_lifecycle in array array['RUNNING', 'FINISHED', 'CANCELLED', 'PAUSED'] loop
    update public.tournaments set status = v_lifecycle where id = v_tournament;
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    v_failed := false;
    begin
      perform public.generate_tournament_groups_and_fixture_atomic(v_club, v_tournament, false);
    exception when check_violation then
      if sqlerrm = 'TOURNAMENT_GROUPS_LIFECYCLE_BLOCKED' then v_failed := true; else raise; end if;
    end;
    reset role;
    if not v_failed then raise exception 'QA_INVALID_LIFECYCLE_ACCEPTED:%', v_lifecycle; end if;
  end loop;

  return query select 'PASS', jsonb_build_object(
    'groups', 2,
    'teams', 8,
    'matches', 12,
    'matches_per_group', 6,
    'replay', v_replay->>'status',
    'regeneration', v_regenerated->>'status',
    'rollback', true,
    'lifecycle_rejected', jsonb_build_array('RUNNING', 'FINISHED', 'CANCELLED', 'PAUSED'),
    'player_rejected', true,
    'cross_club_rejected', true,
    'history_protected', true
  );
exception when others then
  reset role;
  begin
    drop trigger if exists qa_force_group_assignment_failure on public.tournament_group_teams;
  exception when others then null;
  end;
  return query select 'FAIL', jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

select result, detail from pg_temp.run_tournament_groups_fixture_atomic_qa();

rollback;
