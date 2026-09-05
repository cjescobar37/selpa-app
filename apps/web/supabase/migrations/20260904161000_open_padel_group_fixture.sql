begin;

create or replace function public.generate_tournament_groups_and_fixture_atomic(
  p_club_id uuid,
  p_tournament_id uuid,
  p_regenerate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_tournament public.tournaments%rowtype;
  v_rules jsonb;
  v_classification_rules jsonb;
  v_seed_count integer;
  v_groups_of_4 integer := 0;
  v_groups_of_3 integer := 0;
  v_group_count integer;
  v_group_sizes integer[] := array[]::integer[];
  v_group_counts integer[] := array[]::integer[];
  v_group_ids uuid[] := array[]::uuid[];
  v_team_ids uuid[];
  v_seed_hash text;
  v_projected_matches integer := 0;
  v_initial_matches integer := 0;
  v_existing_groups integer;
  v_existing_assignments integer;
  v_existing_matches integer;
  v_snapshot_hash text;
  v_groups_payload jsonb;
  v_action text := 'GENERATED';
  v_cursor integer := 1;
  v_forward boolean := true;
  v_i integer;
  v_match_order integer := 1;
  v_group_id uuid;
  v_seed_row record;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not (public.is_platform_admin() or public.has_club_capability(p_club_id, 'groups:generate')) then
    raise exception 'TOURNAMENT_GROUPS_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id and club_id = p_club_id
  for update;

  if not found then raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_tournament.status::text not in ('DRAFT', 'OPEN') then
    raise exception 'TOURNAMENT_GROUPS_LIFECYCLE_BLOCKED' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.tournament_matches m
    where m.tournament_id = p_tournament_id
      and (m.phase::text <> 'GROUP' or m.status::text <> 'PENDING' or m.winner_team_id is not null or coalesce(m.score, '{}'::jsonb) <> '{}'::jsonb)
  ) or exists (
    select 1 from public.tournament_group_teams gt where gt.tournament_id = p_tournament_id and gt.position is not null
  ) then
    raise exception 'TOURNAMENT_GROUP_HISTORY_EXISTS' using errcode = '23514';
  end if;

  select count(*), md5(string_agg(s.team_id::text || ':' || s.seed::text, ',' order by s.seed))
    into v_seed_count, v_seed_hash
  from public.tournament_team_seed_snapshots s
  where s.tournament_id = p_tournament_id and s.club_id = p_club_id;

  if v_seed_count = 0 then raise exception 'SEED_SNAPSHOT_REQUIRED' using errcode = '23514'; end if;
  if v_seed_count < 6 then raise exception 'INSUFFICIENT_ELIGIBLE_TEAMS_FOR_GROUPS' using errcode = '23514'; end if;
  if exists (
    select 1
    from public.tournament_team_seed_snapshots s
    left join public.tournament_teams tt on tt.id = s.team_id and tt.tournament_id = p_tournament_id and tt.club_id = p_club_id
    where s.tournament_id = p_tournament_id and (tt.id is null or s.seed < 1)
  ) then raise exception 'INVALID_SEED_CONFIGURATION' using errcode = '23514'; end if;
  if (select count(distinct seed) from public.tournament_team_seed_snapshots where tournament_id = p_tournament_id) <> v_seed_count
     or (select min(seed) from public.tournament_team_seed_snapshots where tournament_id = p_tournament_id) <> 1
     or (select max(seed) from public.tournament_team_seed_snapshots where tournament_id = p_tournament_id) <> v_seed_count then
    raise exception 'INVALID_SEED_CONFIGURATION' using errcode = '23514';
  end if;

  case v_seed_count % 3
    when 1 then v_groups_of_4 := 1;
    when 2 then
      if v_seed_count < 8 then raise exception 'INVALID_GROUP_CONFIGURATION' using errcode = '23514'; end if;
      v_groups_of_4 := 2;
    else v_groups_of_4 := 0;
  end case;
  v_groups_of_3 := (v_seed_count - (v_groups_of_4 * 4)) / 3;
  if v_groups_of_3 < 0 or v_groups_of_4 > 2 then raise exception 'INVALID_GROUP_CONFIGURATION' using errcode = '23514'; end if;

  for v_i in 1..v_groups_of_4 loop v_group_sizes := array_append(v_group_sizes, 4); end loop;
  for v_i in 1..v_groups_of_3 loop v_group_sizes := array_append(v_group_sizes, 3); end loop;
  v_group_count := coalesce(array_length(v_group_sizes, 1), 0);
  if v_group_count = 0 then raise exception 'INVALID_GROUP_CONFIGURATION' using errcode = '23514'; end if;
  for v_i in 1..v_group_count loop
    v_group_counts := array_append(v_group_counts, 0);
    if v_group_sizes[v_i] = 4 then
      v_projected_matches := v_projected_matches + 4;
      v_initial_matches := v_initial_matches + 2;
    else
      v_projected_matches := v_projected_matches + 3;
      v_initial_matches := v_initial_matches + 3;
    end if;
  end loop;

  v_rules := coalesce(v_tournament.rules_json, v_tournament.rules, '{}'::jsonb);
  v_snapshot_hash := v_rules #>> '{groups_fixture_generation,seed_hash}';
  select count(*) into v_existing_groups from public.tournament_groups where tournament_id = p_tournament_id;
  select count(*) into v_existing_assignments from public.tournament_group_teams where tournament_id = p_tournament_id;
  select count(*) into v_existing_matches from public.tournament_matches where tournament_id = p_tournament_id and phase::text = 'GROUP';

  if not p_regenerate and v_snapshot_hash = v_seed_hash and v_existing_groups = v_group_count
     and v_existing_assignments = v_seed_count and v_existing_matches between v_initial_matches and v_projected_matches then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', g.name, 'size', g.size, 'order', g."order",
      'teamSeeds', coalesce((select jsonb_agg(gt.seed order by gt.seed) from public.tournament_group_teams gt where gt.group_id = g.id), '[]'::jsonb)
    ) order by g."order"), '[]'::jsonb) into v_groups_payload
    from public.tournament_groups g where g.tournament_id = p_tournament_id;
    return jsonb_build_object(
      'status', 'ALREADY_GENERATED', 'tournament_id', p_tournament_id, 'group_count', v_group_count,
      'teams_assigned', v_seed_count, 'matches_created', v_projected_matches, 'persisted_initial_matches', v_initial_matches,
      'seed_hash', v_seed_hash, 'sizes', to_jsonb(v_group_sizes), 'groups', v_groups_payload
    );
  end if;

  if v_existing_groups > 0 or v_existing_assignments > 0 or v_existing_matches > 0 then
    v_action := 'REGENERATED';
    delete from public.tournament_matches where tournament_id = p_tournament_id and club_id = p_club_id and phase::text = 'GROUP';
    delete from public.tournament_group_teams where tournament_id = p_tournament_id;
    delete from public.tournament_groups where tournament_id = p_tournament_id;
  end if;

  for v_i in 1..v_group_count loop
    insert into public.tournament_groups(tournament_id, name, size, "order")
    values (p_tournament_id, case when v_i <= 26 then chr(64 + v_i) else 'Grupo ' || v_i::text end, v_group_sizes[v_i], v_i)
    returning id into v_group_id;
    v_group_ids := array_append(v_group_ids, v_group_id);
  end loop;

  while v_cursor <= v_seed_count loop
    if v_forward then
      for v_i in 1..v_group_count loop
        if v_cursor > v_seed_count then exit; end if;
        if v_group_counts[v_i] < v_group_sizes[v_i] then
          select team_id, seed into v_seed_row from public.tournament_team_seed_snapshots
          where tournament_id = p_tournament_id and club_id = p_club_id order by seed offset (v_cursor - 1) limit 1;
          insert into public.tournament_group_teams(tournament_id, group_id, team_id, seed, position)
          values (p_tournament_id, v_group_ids[v_i], v_seed_row.team_id, v_seed_row.seed, null);
          v_group_counts[v_i] := v_group_counts[v_i] + 1; v_cursor := v_cursor + 1;
        end if;
      end loop;
    else
      for v_i in reverse v_group_count..1 loop
        if v_cursor > v_seed_count then exit; end if;
        if v_group_counts[v_i] < v_group_sizes[v_i] then
          select team_id, seed into v_seed_row from public.tournament_team_seed_snapshots
          where tournament_id = p_tournament_id and club_id = p_club_id order by seed offset (v_cursor - 1) limit 1;
          insert into public.tournament_group_teams(tournament_id, group_id, team_id, seed, position)
          values (p_tournament_id, v_group_ids[v_i], v_seed_row.team_id, v_seed_row.seed, null);
          v_group_counts[v_i] := v_group_counts[v_i] + 1; v_cursor := v_cursor + 1;
        end if;
      end loop;
    end if;
    v_forward := not v_forward;
  end loop;

  for v_i in 1..v_group_count loop
    select array_agg(team_id order by seed) into v_team_ids from public.tournament_group_teams where group_id = v_group_ids[v_i];
    if coalesce(array_length(v_team_ids, 1), 0) <> v_group_sizes[v_i] then raise exception 'GROUP_ASSIGNMENT_INCOMPLETE' using errcode = '23514'; end if;
    if v_group_sizes[v_i] = 4 then
      insert into public.tournament_matches(tournament_id,club_id,group_id,team1_id,team2_id,round,phase,status,score,match_order)
      values
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[4],1,'GROUP','PENDING','{}',v_match_order),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[2],v_team_ids[3],1,'GROUP','PENDING','{}',v_match_order+1);
      v_match_order := v_match_order + 2;
    else
      insert into public.tournament_matches(tournament_id,club_id,group_id,team1_id,team2_id,round,phase,status,score,match_order)
      values
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[2],v_team_ids[3],1,'GROUP','PENDING','{}',v_match_order),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[3],2,'GROUP','PENDING','{}',v_match_order+1),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[2],3,'GROUP','PENDING','{}',v_match_order+2);
      v_match_order := v_match_order + 3;
    end if;
  end loop;

  if (select count(*) from public.tournament_groups where tournament_id = p_tournament_id) <> v_group_count
     or (select count(*) from public.tournament_group_teams where tournament_id = p_tournament_id) <> v_seed_count
     or (select count(*) from public.tournament_matches where tournament_id = p_tournament_id and phase::text = 'GROUP') <> v_initial_matches then
    raise exception 'GROUP_FIXTURE_COUNT_MISMATCH' using errcode = '23514';
  end if;

  v_classification_rules := coalesce(v_tournament.classification_rules, '{}'::jsonb);
  if not (v_classification_rules ? 'points_for_win') then v_classification_rules := v_classification_rules || jsonb_build_object('points_for_win', 2); end if;
  if not (v_classification_rules ? 'points_for_loss') then v_classification_rules := v_classification_rules || jsonb_build_object('points_for_loss', 1); end if;
  v_rules := jsonb_set(v_rules - 'match_schedule_assignments', '{group_scoring}', jsonb_build_object('win_points', 2, 'loss_points', 1), true);
  if not (v_rules ? 'group_tiebreakers') then
    v_rules := jsonb_set(v_rules, '{group_tiebreakers}', jsonb_build_object(
      'order', jsonb_build_array('POINTS', 'HEAD_TO_HEAD', 'SET_DIFF', 'GAME_DIFF'),
      'final', 'SEED'
    ), true);
  end if;
  v_rules := jsonb_set(v_rules, '{groups_fixture_generation}', jsonb_build_object(
    'format', 'OPEN_PADEL_STANDARD_V1', 'seed_hash', v_seed_hash, 'group_count', v_group_count,
    'teams_assigned', v_seed_count, 'projected_matches', v_projected_matches, 'persisted_initial_matches', v_initial_matches,
    'generated_at', now(), 'generated_by', v_actor
  ), true);
  update public.tournaments set rules_json = v_rules, rules = v_rules, classification_rules = v_classification_rules, updated_at = now()
  where id = p_tournament_id and club_id = p_club_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', g.name, 'size', g.size, 'order', g."order",
    'teamSeeds', coalesce((select jsonb_agg(gt.seed order by gt.seed) from public.tournament_group_teams gt where gt.group_id = g.id), '[]'::jsonb)
  ) order by g."order"), '[]'::jsonb) into v_groups_payload
  from public.tournament_groups g where g.tournament_id = p_tournament_id;
  return jsonb_build_object(
    'status', v_action, 'tournament_id', p_tournament_id, 'group_count', v_group_count,
    'teams_assigned', v_seed_count, 'matches_created', v_projected_matches, 'persisted_initial_matches', v_initial_matches,
    'seed_hash', v_seed_hash, 'sizes', to_jsonb(v_group_sizes), 'groups', v_groups_payload
  );
end;
$$;

revoke all on function public.generate_tournament_groups_and_fixture_atomic(uuid, uuid, boolean) from public, anon;
grant execute on function public.generate_tournament_groups_and_fixture_atomic(uuid, uuid, boolean) to authenticated, service_role;

create or replace function public.materialize_open_group_dependent_matches(
  p_club_id uuid,
  p_tournament_id uuid,
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_group public.tournament_groups%rowtype;
  v_team_ids uuid[];
  v_first record;
  v_second record;
  v_first_loser uuid;
  v_second_loser uuid;
  v_next_order integer;
  v_existing_winners boolean;
  v_existing_losers boolean;
  v_matches jsonb;
begin
  select * into v_tournament from public.tournaments where id = p_tournament_id and club_id = p_club_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if coalesce(v_tournament.rules_json, v_tournament.rules, '{}'::jsonb) #>> '{groups_fixture_generation,format}' <> 'OPEN_PADEL_STANDARD_V1' then
    return jsonb_build_object('status', 'NOT_APPLICABLE', 'matches', '[]'::jsonb);
  end if;

  select * into v_group from public.tournament_groups where id = p_group_id and tournament_id = p_tournament_id;
  if not found or v_group.size <> 4 then return jsonb_build_object('status', 'NOT_APPLICABLE', 'matches', '[]'::jsonb); end if;
  select array_agg(team_id order by seed) into v_team_ids from public.tournament_group_teams where tournament_id = p_tournament_id and group_id = p_group_id;
  if coalesce(array_length(v_team_ids, 1), 0) <> 4 then raise exception 'GROUP_ASSIGNMENT_INCOMPLETE' using errcode = '23514'; end if;

  select * into v_first from public.tournament_matches m
  where m.tournament_id = p_tournament_id and m.group_id = p_group_id and m.phase::text = 'GROUP' and m.round = 1
    and ((m.team1_id = v_team_ids[1] and m.team2_id = v_team_ids[4]) or (m.team1_id = v_team_ids[4] and m.team2_id = v_team_ids[1]));
  select * into v_second from public.tournament_matches m
  where m.tournament_id = p_tournament_id and m.group_id = p_group_id and m.phase::text = 'GROUP' and m.round = 1
    and ((m.team1_id = v_team_ids[2] and m.team2_id = v_team_ids[3]) or (m.team1_id = v_team_ids[3] and m.team2_id = v_team_ids[2]));
  if not found or v_first.id is null or v_second.id is null or v_first.status::text <> 'PLAYED' or v_second.status::text <> 'PLAYED'
     or v_first.winner_team_id is null or v_second.winner_team_id is null then
    return jsonb_build_object('status', 'WAITING_FOR_INITIAL_RESULTS', 'matches', '[]'::jsonb);
  end if;

  v_first_loser := case when v_first.winner_team_id = v_first.team1_id then v_first.team2_id else v_first.team1_id end;
  v_second_loser := case when v_second.winner_team_id = v_second.team1_id then v_second.team2_id else v_second.team1_id end;
  select exists(select 1 from public.tournament_matches m where m.tournament_id = p_tournament_id and m.group_id = p_group_id and m.phase::text = 'GROUP' and m.round = 2
    and ((m.team1_id = v_first.winner_team_id and m.team2_id = v_second.winner_team_id) or (m.team1_id = v_second.winner_team_id and m.team2_id = v_first.winner_team_id))) into v_existing_winners;
  select exists(select 1 from public.tournament_matches m where m.tournament_id = p_tournament_id and m.group_id = p_group_id and m.phase::text = 'GROUP' and m.round = 2
    and ((m.team1_id = v_first_loser and m.team2_id = v_second_loser) or (m.team1_id = v_second_loser and m.team2_id = v_first_loser))) into v_existing_losers;

  if not v_existing_winners or not v_existing_losers then
    select coalesce(max(match_order), 0) + 1 into v_next_order from public.tournament_matches where tournament_id = p_tournament_id and club_id = p_club_id and phase::text = 'GROUP';
    if not v_existing_winners then
      insert into public.tournament_matches(tournament_id,club_id,group_id,team1_id,team2_id,round,phase,status,score,match_order)
      values (p_tournament_id,p_club_id,p_group_id,v_first.winner_team_id,v_second.winner_team_id,2,'GROUP','PENDING','{}',v_next_order);
      v_next_order := v_next_order + 1;
    end if;
    if not v_existing_losers then
      insert into public.tournament_matches(tournament_id,club_id,group_id,team1_id,team2_id,round,phase,status,score,match_order)
      values (p_tournament_id,p_club_id,p_group_id,v_first_loser,v_second_loser,2,'GROUP','PENDING','{}',v_next_order);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'tournament_id',m.tournament_id,'club_id',m.club_id,'group_id',m.group_id,'team1_id',m.team1_id,'team2_id',m.team2_id,
    'round',m.round,'phase',m.phase,'status',m.status,'winner_team_id',m.winner_team_id,'match_order',m.match_order
  ) order by m.match_order), '[]'::jsonb) into v_matches
  from public.tournament_matches m where m.tournament_id = p_tournament_id and m.group_id = p_group_id and m.phase::text = 'GROUP' and m.round = 2;
  return jsonb_build_object('status', case when v_existing_winners and v_existing_losers then 'ALREADY_GENERATED' else 'GENERATED' end, 'matches', v_matches);
end;
$$;

revoke all on function public.materialize_open_group_dependent_matches(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.materialize_open_group_dependent_matches(uuid, uuid, uuid) to service_role;

commit;
