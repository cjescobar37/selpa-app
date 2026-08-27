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
  v_seed_count integer;
  v_groups_of_4 integer := 0;
  v_groups_of_3 integer := 0;
  v_group_count integer;
  v_group_sizes integer[] := array[]::integer[];
  v_group_counts integer[] := array[]::integer[];
  v_group_ids uuid[] := array[]::uuid[];
  v_team_ids uuid[];
  v_seed_hash text;
  v_expected_matches integer := 0;
  v_existing_groups integer;
  v_existing_assignments integer;
  v_existing_matches integer;
  v_snapshot_hash text;
  v_groups_payload jsonb;
  v_action text := 'GENERATED';
  v_cursor integer := 1;
  v_forward boolean := true;
  v_i integer;
  v_j integer;
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

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_tournament.status::text not in ('DRAFT', 'OPEN') then
    raise exception 'TOURNAMENT_GROUPS_LIFECYCLE_BLOCKED' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.tournament_matches m
    where m.tournament_id = p_tournament_id
      and (
        m.phase::text <> 'GROUP'
        or m.status::text <> 'PENDING'
        or m.winner_team_id is not null
        or coalesce(m.score, '{}'::jsonb) <> '{}'::jsonb
      )
  ) or exists (
    select 1 from public.tournament_group_teams gt
    where gt.tournament_id = p_tournament_id and gt.position is not null
  ) then
    raise exception 'TOURNAMENT_GROUP_HISTORY_EXISTS' using errcode = '23514';
  end if;

  select count(*), md5(string_agg(s.team_id::text || ':' || s.seed::text, ',' order by s.seed))
    into v_seed_count, v_seed_hash
  from public.tournament_team_seed_snapshots s
  where s.tournament_id = p_tournament_id and s.club_id = p_club_id;

  if v_seed_count = 0 then
    raise exception 'SEED_SNAPSHOT_REQUIRED' using errcode = '23514';
  end if;
  if v_seed_count < 6 then
    raise exception 'INSUFFICIENT_ELIGIBLE_TEAMS_FOR_GROUPS' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.tournament_team_seed_snapshots s
    left join public.tournament_teams tt
      on tt.id = s.team_id and tt.tournament_id = p_tournament_id and tt.club_id = p_club_id
    where s.tournament_id = p_tournament_id and (tt.id is null or s.seed < 1)
  ) then
    raise exception 'INVALID_SEED_CONFIGURATION' using errcode = '23514';
  end if;
  if (select count(distinct seed) from public.tournament_team_seed_snapshots where tournament_id = p_tournament_id) <> v_seed_count
     or (select min(seed) from public.tournament_team_seed_snapshots where tournament_id = p_tournament_id) <> 1
     or (select max(seed) from public.tournament_team_seed_snapshots where tournament_id = p_tournament_id) <> v_seed_count then
    raise exception 'INVALID_SEED_CONFIGURATION' using errcode = '23514';
  end if;

  case v_seed_count % 3
    when 1 then v_groups_of_4 := 1;
    when 2 then
      if v_seed_count < 8 then
        raise exception 'INVALID_GROUP_CONFIGURATION' using errcode = '23514';
      end if;
      v_groups_of_4 := 2;
    else v_groups_of_4 := 0;
  end case;
  v_groups_of_3 := (v_seed_count - (v_groups_of_4 * 4)) / 3;
  if v_groups_of_3 < 0 or v_groups_of_4 > 2 then
    raise exception 'INVALID_GROUP_CONFIGURATION' using errcode = '23514';
  end if;

  for v_i in 1..v_groups_of_4 loop
    v_group_sizes := array_append(v_group_sizes, 4);
  end loop;
  for v_i in 1..v_groups_of_3 loop
    v_group_sizes := array_append(v_group_sizes, 3);
  end loop;
  v_group_count := coalesce(array_length(v_group_sizes, 1), 0);
  if v_group_count = 0 then
    raise exception 'INVALID_GROUP_CONFIGURATION' using errcode = '23514';
  end if;
  for v_i in 1..v_group_count loop
    v_group_counts := array_append(v_group_counts, 0);
    v_expected_matches := v_expected_matches + (v_group_sizes[v_i] * (v_group_sizes[v_i] - 1) / 2);
  end loop;

  v_rules := coalesce(v_tournament.rules_json, v_tournament.rules, '{}'::jsonb);
  v_snapshot_hash := v_rules #>> '{groups_fixture_generation,seed_hash}';
  select count(*) into v_existing_groups from public.tournament_groups where tournament_id = p_tournament_id;
  select count(*) into v_existing_assignments from public.tournament_group_teams where tournament_id = p_tournament_id;
  select count(*) into v_existing_matches from public.tournament_matches where tournament_id = p_tournament_id and phase::text = 'GROUP';

  if not p_regenerate
     and v_snapshot_hash = v_seed_hash
     and v_existing_groups = v_group_count
     and v_existing_assignments = v_seed_count
     and v_existing_matches = v_expected_matches then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', g.name,
      'size', g.size,
      'order', g."order",
      'teamSeeds', coalesce((
        select jsonb_agg(gt.seed order by gt.seed)
        from public.tournament_group_teams gt where gt.group_id = g.id
      ), '[]'::jsonb)
    ) order by g."order"), '[]'::jsonb)
      into v_groups_payload
    from public.tournament_groups g where g.tournament_id = p_tournament_id;
    return jsonb_build_object(
      'status', 'ALREADY_GENERATED', 'tournament_id', p_tournament_id,
      'group_count', v_group_count, 'teams_assigned', v_seed_count,
      'matches_created', v_expected_matches, 'seed_hash', v_seed_hash,
      'sizes', to_jsonb(v_group_sizes), 'groups', v_groups_payload
    );
  end if;

  if v_existing_groups > 0 or v_existing_assignments > 0 or v_existing_matches > 0 then
    v_action := 'REGENERATED';
    delete from public.tournament_matches
      where tournament_id = p_tournament_id and club_id = p_club_id and phase::text = 'GROUP';
    delete from public.tournament_group_teams where tournament_id = p_tournament_id;
    delete from public.tournament_groups where tournament_id = p_tournament_id;
  end if;

  for v_i in 1..v_group_count loop
    insert into public.tournament_groups(tournament_id, name, size, "order")
    values (
      p_tournament_id,
      case when v_i <= 26 then chr(64 + v_i) else 'Grupo ' || v_i::text end,
      v_group_sizes[v_i],
      v_i
    ) returning id into v_group_id;
    v_group_ids := array_append(v_group_ids, v_group_id);
  end loop;

  while v_cursor <= v_seed_count loop
    if v_forward then
      for v_i in 1..v_group_count loop
        if v_cursor > v_seed_count then exit; end if;
        if v_group_counts[v_i] < v_group_sizes[v_i] then
          select team_id, seed into v_seed_row
          from public.tournament_team_seed_snapshots
          where tournament_id = p_tournament_id and club_id = p_club_id
          order by seed offset (v_cursor - 1) limit 1;
          insert into public.tournament_group_teams(tournament_id, group_id, team_id, seed, position)
          values (p_tournament_id, v_group_ids[v_i], v_seed_row.team_id, v_seed_row.seed, null);
          v_group_counts[v_i] := v_group_counts[v_i] + 1;
          v_cursor := v_cursor + 1;
        end if;
      end loop;
    else
      for v_i in reverse v_group_count..1 loop
        if v_cursor > v_seed_count then exit; end if;
        if v_group_counts[v_i] < v_group_sizes[v_i] then
          select team_id, seed into v_seed_row
          from public.tournament_team_seed_snapshots
          where tournament_id = p_tournament_id and club_id = p_club_id
          order by seed offset (v_cursor - 1) limit 1;
          insert into public.tournament_group_teams(tournament_id, group_id, team_id, seed, position)
          values (p_tournament_id, v_group_ids[v_i], v_seed_row.team_id, v_seed_row.seed, null);
          v_group_counts[v_i] := v_group_counts[v_i] + 1;
          v_cursor := v_cursor + 1;
        end if;
      end loop;
    end if;
    v_forward := not v_forward;
  end loop;

  for v_i in 1..v_group_count loop
    select array_agg(team_id order by seed) into v_team_ids
    from public.tournament_group_teams where group_id = v_group_ids[v_i];

    if coalesce(array_length(v_team_ids, 1), 0) <> v_group_sizes[v_i] then
      raise exception 'GROUP_ASSIGNMENT_INCOMPLETE' using errcode = '23514';
    end if;

    if v_group_sizes[v_i] = 4 then
      insert into public.tournament_matches(tournament_id, club_id, group_id, team1_id, team2_id, round, phase, status, score, match_order)
      values
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[4],1,'GROUP','PENDING','{}',v_match_order),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[2],v_team_ids[3],1,'GROUP','PENDING','{}',v_match_order+1),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[3],2,'GROUP','PENDING','{}',v_match_order+2),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[4],v_team_ids[2],2,'GROUP','PENDING','{}',v_match_order+3),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[2],3,'GROUP','PENDING','{}',v_match_order+4),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[3],v_team_ids[4],3,'GROUP','PENDING','{}',v_match_order+5);
      v_match_order := v_match_order + 6;
    else
      insert into public.tournament_matches(tournament_id, club_id, group_id, team1_id, team2_id, round, phase, status, score, match_order)
      values
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[2],v_team_ids[3],1,'GROUP','PENDING','{}',v_match_order),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[3],2,'GROUP','PENDING','{}',v_match_order+1),
        (p_tournament_id,p_club_id,v_group_ids[v_i],v_team_ids[1],v_team_ids[2],3,'GROUP','PENDING','{}',v_match_order+2);
      v_match_order := v_match_order + 3;
    end if;
  end loop;

  if (select count(*) from public.tournament_groups where tournament_id = p_tournament_id) <> v_group_count
     or (select count(*) from public.tournament_group_teams where tournament_id = p_tournament_id) <> v_seed_count
     or (select count(*) from public.tournament_matches where tournament_id = p_tournament_id and phase::text = 'GROUP') <> v_expected_matches then
    raise exception 'GROUP_FIXTURE_COUNT_MISMATCH' using errcode = '23514';
  end if;

  -- Los IDs de partidos cambian al regenerar. Nunca conservar una planificación
  -- que apunte al fixture anterior; la planificación operativa se vuelve a aplicar
  -- mediante su flujo canónico después de esta operación estructural.
  v_rules := jsonb_set(
    v_rules - 'match_schedule_assignments',
    '{groups_fixture_generation}',
    jsonb_build_object(
      'seed_hash', v_seed_hash,
      'group_count', v_group_count,
      'teams_assigned', v_seed_count,
      'matches_created', v_expected_matches,
      'generated_at', now(),
      'generated_by', v_actor
    ),
    true
  );
  update public.tournaments
  set rules_json = v_rules, rules = v_rules, updated_at = now()
  where id = p_tournament_id and club_id = p_club_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', g.name,
    'size', g.size,
    'order', g."order",
    'teamSeeds', coalesce((
      select jsonb_agg(gt.seed order by gt.seed)
      from public.tournament_group_teams gt where gt.group_id = g.id
    ), '[]'::jsonb)
  ) order by g."order"), '[]'::jsonb)
    into v_groups_payload
  from public.tournament_groups g where g.tournament_id = p_tournament_id;

  return jsonb_build_object(
    'status', v_action, 'tournament_id', p_tournament_id,
    'group_count', v_group_count, 'teams_assigned', v_seed_count,
    'matches_created', v_expected_matches, 'seed_hash', v_seed_hash,
    'sizes', to_jsonb(v_group_sizes), 'groups', v_groups_payload
  );
end;
$$;

revoke all on function public.generate_tournament_groups_and_fixture_atomic(uuid, uuid, boolean) from public, anon;
grant execute on function public.generate_tournament_groups_and_fixture_atomic(uuid, uuid, boolean) to authenticated, service_role;

comment on function public.generate_tournament_groups_and_fixture_atomic(uuid, uuid, boolean) is
  'Atomically derives groups and a complete round-robin fixture from the immutable tournament seed snapshot. Serializes retries on the tournament row and preserves any started sporting history.';

commit;
