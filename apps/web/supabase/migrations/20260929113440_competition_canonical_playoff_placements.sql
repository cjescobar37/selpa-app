begin;

-- Self-contained replacement for the unapplied historical extended-tier
-- migration. Nothing below assumes that migration has run.
alter table public.competition_event_homologation_results
  drop constraint if exists competition_homologation_results_role_chk;
alter table public.competition_event_homologation_results
  add constraint competition_homologation_results_role_chk check (
    result_role in (
      'CHAMPION',
      'RUNNER_UP',
      'SEMIFINALIST',
      'QUARTERFINALIST',
      'EIGHTH_FINALIST',
      'SIXTEENTH_FINALIST',
      'PARTICIPANT',
      'ADMINISTRATIVE'
    )
  );

create or replace function public.is_valid_competition_point_rules(p_rules jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  keys text[] := '{}';
  key text;
  points numeric;
begin
  if jsonb_typeof(p_rules) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_rules) not between 5 and 7 then return false; end if;

  for item in select value from jsonb_array_elements(p_rules) loop
    key := upper(item ->> 'rule_key');
    if key is null
       or key <> all(array[
         'CHAMPION',
         'RUNNER_UP',
         'SEMIFINALIST',
         'QUARTERFINALIST',
         'EIGHTH_FINALIST',
         'SIXTEENTH_FINALIST',
         'PARTICIPANT'
       ])
       or key = any(keys)
       or jsonb_typeof(item -> 'points') is distinct from 'number'
    then
      return false;
    end if;

    points := (item ->> 'points')::numeric;
    if points < 0 or points <> trunc(points) or points > 2147483647 then
      return false;
    end if;
    keys := array_append(keys, key);
  end loop;

  return keys @> array[
    'CHAMPION',
    'RUNNER_UP',
    'SEMIFINALIST',
    'QUARTERFINALIST',
    'PARTICIPANT'
  ];
end;
$$;

-- INTERNAL: used by privileged competition routines, never a Data API RPC.
revoke all on function public.is_valid_competition_point_rules(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.is_valid_competition_point_rules(jsonb)
  to service_role;

create or replace function public.add_points_scheme_rule(
  p_club_id uuid,
  p_scheme_id uuid,
  p_scheme_revision integer,
  p_rule_key text,
  p_points integer,
  p_sort_order integer default 0
)
returns public.points_scheme_rules
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid;
  scheme public.points_schemes%rowtype;
  result public.points_scheme_rules%rowtype;
  key text := upper(btrim(coalesce(p_rule_key, '')));
begin
  actor := public.require_points_scheme_access(p_club_id, false);
  scheme := public.assert_points_scheme_editable(p_club_id, p_scheme_id);
  if scheme.revision is distinct from p_scheme_revision then
    raise exception 'STALE_REVISION' using errcode = '40001';
  end if;
  if key not in (
    'CHAMPION',
    'RUNNER_UP',
    'SEMIFINALIST',
    'QUARTERFINALIST',
    'EIGHTH_FINALIST',
    'SIXTEENTH_FINALIST',
    'PARTICIPANT'
  ) then
    raise exception 'RULE_KEY_INVALID' using errcode = '22023';
  end if;
  if p_points is null or p_sort_order is null or p_points < 0 or p_sort_order < 0 then
    raise exception 'RULE_VALUE_INVALID' using errcode = '22023';
  end if;

  insert into public.points_scheme_rules(
    scheme_id,
    rule_key,
    points,
    sort_order,
    is_active,
    created_by
  ) values (
    p_scheme_id,
    key,
    p_points,
    p_sort_order,
    true,
    actor
  ) returning * into result;

  update public.points_schemes
  set revision = revision + 1
  where id = p_scheme_id;

  return result;
end;
$$;

-- RPC REQUIRED: authenticated Competition admins and trusted server flows.
revoke all on function public.add_points_scheme_rule(uuid, uuid, integer, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.add_points_scheme_rule(uuid, uuid, integer, text, integer, integer)
  to authenticated, service_role;

create or replace function public.adjust_competition_event_settlement_points(
  p_club_id uuid,
  p_settlement_id uuid,
  p_revision integer,
  p_idempotency_key text,
  p_name text,
  p_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  settlement public.competition_event_settlements%rowtype;
  source_scheme public.points_schemes%rowtype;
  cloned_scheme public.points_schemes%rowtype;
  current_rule public.points_scheme_rules%rowtype;
  replay jsonb;
  calculated jsonb;
  rules_snapshot jsonb;
  requested_rule record;
  requested_rule_keys text[];
  scheme_revision integer;
  next_revision integer;
  clean_name text := btrim(coalesce(p_name, ''));
  candidate_name text;
  suffix integer := 1;
  original_scheme_id uuid;
begin
  perform public.require_competition_settlement_access(p_club_id, false);
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'competition:manage') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into settlement
  from public.competition_event_settlements
  where club_id = p_club_id and id = p_settlement_id
  for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  replay := public.begin_competition_settlement_command(
    p_club_id,
    settlement.event_division_id,
    settlement.id,
    'ADJUST_POINTS',
    p_idempotency_key,
    jsonb_build_object('settlement', settlement.id, 'revision', p_revision, 'name', clean_name, 'rules', p_rules)
  );
  if replay is not null then return replay; end if;
  if settlement.revision <> p_revision then raise exception 'PRECONDITION_FAILED' using errcode = '40001'; end if;
  if settlement.status not in ('DRAFT', 'CALCULATED') then raise exception 'SETTLEMENT_NOT_EDITABLE' using errcode = '23514'; end if;
  if settlement.scoring_mode <> 'POINTS' or settlement.points_scheme_id is null then raise exception 'POINTS_CONFIGURATION_INVALID' using errcode = '23514'; end if;
  if clean_name = '' then raise exception 'NAME_REQUIRED' using errcode = '22023'; end if;
  if not public.is_valid_competition_point_rules(p_rules) then
    raise exception 'POINT_RULES_INVALID' using errcode = '22023';
  end if;

  select * into source_scheme
  from public.points_schemes
  where id = settlement.points_scheme_id
    and (club_id = p_club_id or (is_global and is_active))
    and archived_at is null;
  if not found then raise exception 'SCHEME_NOT_FOUND' using errcode = 'P0002'; end if;
  original_scheme_id := coalesce(
    nullif(settlement.calculation_snapshot->'points_adjustment'->>'source_points_scheme_id', '')::uuid,
    source_scheme.id
  );

  candidate_name := clean_name;
  while exists (
    select 1 from public.points_schemes
    where club_id = p_club_id and archived_at is null and lower(btrim(name)) = lower(candidate_name)
  ) loop
    suffix := suffix + 1;
    candidate_name := clean_name || ' · ' || suffix;
  end loop;
  cloned_scheme := public.clone_points_scheme(p_club_id, source_scheme.id, candidate_name);

  select array_agg(upper(value->>'rule_key'))
    into requested_rule_keys
  from jsonb_array_elements(p_rules);

  for requested_rule in
    select upper(value->>'rule_key') as rule_key, (value->>'points')::integer as points
    from jsonb_array_elements(p_rules)
  loop
    select * into current_rule
    from public.points_scheme_rules
    where scheme_id = cloned_scheme.id and rule_key = requested_rule.rule_key;
    select revision into scheme_revision from public.points_schemes where id = cloned_scheme.id;
    if current_rule.id is not null then
      perform public.update_points_scheme_rule(
        p_club_id,
        cloned_scheme.id,
        current_rule.id,
        scheme_revision,
        current_rule.revision,
        requested_rule.points,
        current_rule.sort_order,
        true
      );
    else
      perform public.add_points_scheme_rule(
        p_club_id,
        cloned_scheme.id,
        scheme_revision,
        requested_rule.rule_key,
        requested_rule.points,
        0
      );
    end if;
  end loop;

  -- The clone must represent exactly p_rules. Preserve omitted rules as
  -- inactive history through the existing domain lifecycle instead of
  -- silently inheriting active placements from the source scheme.
  for current_rule in
    select rule.*
    from public.points_scheme_rules rule
    where rule.scheme_id = cloned_scheme.id
      and rule.is_active
      and upper(rule.rule_key) <> all(requested_rule_keys)
    order by rule.sort_order, rule.rule_key
  loop
    select revision into scheme_revision
    from public.points_schemes
    where id = cloned_scheme.id;
    perform public.deactivate_points_scheme_rule(
      p_club_id,
      cloned_scheme.id,
      current_rule.id,
      scheme_revision,
      current_rule.revision
    );
  end loop;

  select coalesce(
    jsonb_agg(jsonb_build_object('rule_key', rule_key, 'points', points) order by sort_order, rule_key),
    '[]'::jsonb
  ) into rules_snapshot
  from public.points_scheme_rules
  where scheme_id = cloned_scheme.id and is_active;

  perform set_config('selpa.competition_settlement_write', 'allowed', true);
  delete from public.competition_event_settlement_issues where settlement_id = settlement.id;
  delete from public.competition_event_settlement_awards where settlement_id = settlement.id;
  update public.competition_event_settlements
  set status = 'DRAFT',
      revision = revision + 1,
      points_scheme_id = cloned_scheme.id,
      calculation_snapshot = jsonb_set(
        jsonb_set(
          coalesce(calculation_snapshot, '{}'::jsonb) || jsonb_build_object(
            'points_adjustment',
            jsonb_build_object(
              'source_points_scheme_id', original_scheme_id,
              'adjusted_points_scheme_id', cloned_scheme.id,
              'adjusted_at', now()
            )
          ),
          '{points_rules}',
          rules_snapshot,
          true
        ),
        '{event_configuration,effective_points_scheme_id}',
        to_jsonb(cloned_scheme.id::text),
        true
      ),
      calculated_by = null,
      calculated_at = null,
      submitted_by = null,
      submitted_at = null,
      approved_by = null,
      approved_at = null,
      updated_at = now()
  where id = settlement.id
  returning revision into next_revision;

  calculated := public.calculate_competition_event_settlement(
    p_club_id,
    settlement.id,
    next_revision,
    left(p_idempotency_key, 180) || ':recalculate'
  );
  calculated := calculated || jsonb_build_object(
    'points_scheme_id', cloned_scheme.id,
    'points_scheme_name', candidate_name
  );
  perform public.finish_competition_settlement_command(
    p_club_id,
    settlement.event_division_id,
    'ADJUST_POINTS',
    p_idempotency_key,
    calculated
  );
  return calculated;
end;
$$;

-- RPC REQUIRED: authenticated Competition admins and trusted server flows.
revoke all on function public.adjust_competition_event_settlement_points(uuid, uuid, integer, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.adjust_competition_event_settlement_points(uuid, uuid, integer, text, text, jsonb)
  to authenticated, service_role;

-- Canonical Tournament Engine phase -> final Competition placement mapping.
-- Winners of intermediate rounds have no placement until they later lose or
-- win the final, so only FINAL returns a winner role.
create or replace function public.competition_result_role_for_playoff_phase(
  p_phase text,
  p_is_winner boolean
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when upper(btrim(coalesce(p_phase, ''))) = 'FINAL' and p_is_winner then 'CHAMPION'
    when upper(btrim(coalesce(p_phase, ''))) = 'FINAL' then 'RUNNER_UP'
    when p_is_winner then null
    when upper(btrim(coalesce(p_phase, ''))) = 'SEMI' then 'SEMIFINALIST'
    when upper(btrim(coalesce(p_phase, ''))) = 'QUARTER' then 'QUARTERFINALIST'
    when upper(btrim(coalesce(p_phase, ''))) = 'ROUND_OF_16' then 'EIGHTH_FINALIST'
    when upper(btrim(coalesce(p_phase, ''))) = 'ROUND_OF_32' then 'SIXTEENTH_FINALIST'
    else null
  end
$$;

-- INTERNAL: the extractor owner invokes it; no Data API role may execute it.
revoke all on function public.competition_result_role_for_playoff_phase(text, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.extract_competition_event_homologation_results(
  p_club_id uuid,
  p_homologation_id uuid,
  p_revision integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  response jsonb;
  homologation public.competition_event_homologations%rowtype;
  playable_final_count integer;
begin
  response := public.extract_competition_event_homologation_results_base_20260802(
    p_club_id,
    p_homologation_id,
    p_revision,
    p_idempotency_key
  );

  select * into homologation
  from public.competition_event_homologations
  where id = p_homologation_id
    and club_id = p_club_id;

  if not found or homologation.status <> 'DRAFT' then return response; end if;

  select count(*) into playable_final_count
  from public.tournament_matches match
  where match.tournament_id = homologation.tournament_id
    and match.phase = 'FINAL'
    and match.status = 'PLAYED'
    and match.team1_id is not null
    and match.team2_id is not null
    and match.team1_id <> match.team2_id
    and match.winner_team_id in (match.team1_id, match.team2_id);

  if playable_final_count > 1 then
    raise exception 'FINAL_AMBIGUOUS: tournament % has % played finals',
      homologation.tournament_id,
      playable_final_count;
  end if;

  perform set_config('selpa.competition_homologation_write', 'allowed', true);

  update public.competition_event_homologation_results result
  set final_position = null,
      result_role = 'PARTICIPANT',
      result_snapshot = (result.result_snapshot - 'derived_from_match_id' - 'derived_from_phase')
        || jsonb_build_object('derived_from_phase', 'PARTICIPANT')
  where result.homologation_id = homologation.id;

  -- A placement is produced only by a real PLAYED match with two teams and a
  -- canonical winner. This admits decided WALKOVERs and excludes BYEs or
  -- undecided walkovers. A team receives one final placement, never tier sums.
  update public.competition_event_homologation_results result
  set result_role = public.competition_result_role_for_playoff_phase(match.phase::text, false),
      result_snapshot = result.result_snapshot || jsonb_build_object(
        'derived_from_match_id', match.id,
        'derived_from_phase', match.phase::text
      )
  from public.tournament_matches match
  where result.homologation_id = homologation.id
    and match.tournament_id = homologation.tournament_id
    and match.status = 'PLAYED'
    and match.team1_id is not null
    and match.team2_id is not null
    and match.team1_id <> match.team2_id
    and match.winner_team_id in (match.team1_id, match.team2_id)
    and public.competition_result_role_for_playoff_phase(match.phase::text, false) is not null
    and result.tournament_team_id = case
      when match.winner_team_id = match.team1_id then match.team2_id
      else match.team1_id
    end;

  update public.competition_event_homologation_results result
  set final_position = case when result.tournament_team_id = match.winner_team_id then 3 else 4 end,
      result_snapshot = result.result_snapshot || jsonb_build_object(
        'derived_from_match_id', match.id,
        'derived_from_phase', 'THIRD_PLACE'
      )
  from public.tournament_matches match
  where result.homologation_id = homologation.id
    and match.tournament_id = homologation.tournament_id
    and match.phase = 'THIRD_PLACE'
    and match.status = 'PLAYED'
    and match.team1_id is not null
    and match.team2_id is not null
    and match.team1_id <> match.team2_id
    and match.winner_team_id in (match.team1_id, match.team2_id)
    and result.result_role = 'SEMIFINALIST'
    and result.tournament_team_id in (match.team1_id, match.team2_id);

  update public.competition_event_homologation_results result
  set final_position = case when result.tournament_team_id = match.winner_team_id then 1 else 2 end,
      result_role = public.competition_result_role_for_playoff_phase(
        match.phase::text,
        result.tournament_team_id = match.winner_team_id
      ),
      result_snapshot = result.result_snapshot || jsonb_build_object(
        'derived_from_match_id', match.id,
        'derived_from_phase', 'FINAL'
      )
  from public.tournament_matches match
  where result.homologation_id = homologation.id
    and match.tournament_id = homologation.tournament_id
    and match.phase = 'FINAL'
    and match.status = 'PLAYED'
    and match.team1_id is not null
    and match.team2_id is not null
    and match.team1_id <> match.team2_id
    and match.winner_team_id in (match.team1_id, match.team2_id)
    and result.tournament_team_id in (match.team1_id, match.team2_id);

  update public.competition_event_homologation_participants participant
  set final_position = result.final_position,
      result_role = result.result_role,
      participant_snapshot = participant.participant_snapshot || jsonb_build_object(
        'result_role', result.result_role,
        'final_position', result.final_position
      )
  from public.competition_event_homologation_results result
  where participant.homologation_id = homologation.id
    and result.homologation_id = homologation.id
    and result.tournament_team_id = participant.tournament_team_id;

  return response;
end;
$$;

-- RPC REQUIRED: preserve the authenticated Competition workflow explicitly.
revoke all on function public.extract_competition_event_homologation_results(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.extract_competition_event_homologation_results(uuid, uuid, integer, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
