begin;

create or replace function pg_temp.run_competition_points_preview_safe_edit_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
<<qa>>
declare
  users uuid[];
  owner_id uuid;
  player_id uuid;
  club_a uuid := gen_random_uuid();
  club_b uuid := gen_random_uuid();
  season_id uuid := gen_random_uuid();
  branch_id uuid := gen_random_uuid();
  category_id uuid := gen_random_uuid();
  pairs_division_id uuid := gen_random_uuid();
  ranking_division_id uuid := gen_random_uuid();
  series_id uuid := gen_random_uuid();
  series_division_id uuid := gen_random_uuid();
  series_rule_id uuid := gen_random_uuid();
  scheme_id uuid := gen_random_uuid();
  tier_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  event_division_id uuid := gen_random_uuid();
  tournament_id uuid := gen_random_uuid();
  homologation_id uuid := gen_random_uuid();
  settlement_id uuid;
  correction_id uuid;
  clone_id uuid;
  category_small smallint;
  club_players uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  entries uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  teams uuid[] := array[gen_random_uuid(), gen_random_uuid()];
  response jsonb;
  replay jsonb;
  revision integer;
  original_snapshot jsonb;
  original_rules jsonb;
  clone_count integer;
  ledger_count integer;
  ledger_total bigint;
  reversal_count integer;
  pair_count integer;
  pair_total bigint;
  i integer;
  qa_step text := 'prerequisites';
begin
  if to_regprocedure('public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb)') is null
     or to_regprocedure('public.create_competition_event_settlement_correction(uuid,uuid,integer,text)') is null then
    return query select 'BLOCKED', 'Primero debe aplicarse 20260911163822_competition_points_preview_safe_edit.sql';
    return;
  end if;
  if to_regclass('public.competition_pair_ranking_projection') is null then
    return query select 'BLOCKED', 'Falta competition_pair_ranking_projection';
    return;
  end if;

  select array_agg(candidate.id order by candidate.id)
  into users
  from (
    select auth_user.id
    from auth.users auth_user
    where auth_user.email is not null
      and not exists (select 1 from public.platform_admins platform_admin where platform_admin.user_id = auth_user.id)
    order by auth_user.id
    limit 6
  ) candidate;
  if coalesce(array_length(users, 1), 0) < 6 then
    return query select 'BLOCKED', 'Se requieren seis usuarios auth existentes; todos los fixtures de negocio se crean dentro de BEGIN/ROLLBACK';
    return;
  end if;
  owner_id := users[1];
  player_id := users[2];

  qa_step := 'fixtures';
  insert into public.clubs(id, name, slug, is_active, status) values
    (club_a, 'QA Points Safe Edit A', 'qa-points-safe-' || replace(club_a::text, '-', ''), true, 'ACTIVE'),
    (club_b, 'QA Points Safe Edit B', 'qa-points-safe-' || replace(club_b::text, '-', ''), true, 'ACTIVE');
  insert into public.club_memberships(club_id, user_id, role, status, approved_at, approved_by) values
    (club_a, owner_id, 'OWNER', 'APPROVED', now(), owner_id),
    (club_a, player_id, 'PLAYER', 'APPROVED', now(), owner_id),
    (club_b, player_id, 'OWNER', 'APPROVED', now(), player_id);

  insert into public.competition_seasons(id, club_id, name, starts_on, ends_on, status, created_by)
  values(season_id, club_a, 'QA 2027', '2027-01-01', '2027-12-31', 'ACTIVE', owner_id);
  insert into public.competition_branches(id, club_id, name, slug)
  values(branch_id, club_a, 'QA Libre', 'qa-libre');
  insert into public.competition_categories(id, club_id, name, short_label, slug)
  values(category_id, club_a, 'QA Open', 'QA', 'qa-open');
  insert into public.competition_divisions(id, club_id, season_id, modality, branch_id, category_id) values
    (pairs_division_id, club_a, season_id, 'PAIRS', branch_id, category_id),
    (ranking_division_id, club_a, season_id, 'INDIVIDUAL', branch_id, category_id);

  insert into public.points_schemes(id, club_id, name, display_name, is_global, is_active, created_by)
  values(scheme_id, club_a, 'OPEN', 'OPEN', false, true, owner_id);
  insert into public.points_scheme_rules(scheme_id, rule_key, points, sort_order, created_by) values
    (scheme_id, 'CHAMPION', 100, 1, owner_id),
    (scheme_id, 'RUNNER_UP', 60, 2, owner_id),
    (scheme_id, 'SEMIFINALIST', 40, 3, owner_id),
    (scheme_id, 'QUARTERFINALIST', 20, 4, owner_id),
    (scheme_id, 'PARTICIPANT', 10, 5, owner_id);

  perform set_config('selpa.competition_series_write', 'allowed', true);
  insert into public.competition_series(id, club_id, season_id, name, status, planned_events_count, created_by, activated_by, activated_at)
  values(series_id, club_a, season_id, 'QA Circuit', 'ACTIVE', 1, owner_id, owner_id, now());
  insert into public.competition_series_divisions(
    id, club_id, series_id, division_id, ranking_division_id, division_snapshot, frozen_at, created_by
  ) values (
    series_division_id, club_a, series_id, pairs_division_id, ranking_division_id,
    jsonb_build_object(
      'division_id', pairs_division_id,
      'division_name', 'QA Open Parejas',
      'modality', 'PAIRS',
      'branch_id', branch_id,
      'branch_name', 'QA Libre',
      'segment_id', null,
      'segment_name', null,
      'category_id', category_id,
      'category_name', 'QA Open',
      'season_id', season_id,
      'season_name', 'QA 2027'
    ),
    now(), owner_id
  );
  insert into public.competition_series_rules(
    id, club_id, series_division_id, version, status, points_scheme_id, bonus_rules, penalty_rules, frozen_at, created_by
  ) values(series_rule_id, club_a, series_division_id, 1, 'ACTIVE', scheme_id, '{}'::jsonb, '{}'::jsonb, now(), owner_id);
  insert into public.competition_series_eligibility(
    club_id, series_rule_id, requires_active_entry, allow_invited_players, invited_points_policy,
    require_same_division_pair, frozen_at, created_by
  ) values(club_a, series_rule_id, true, false, 'REQUIRE_ENTRY', true, now(), owner_id);
  insert into public.competition_event_tiers(
    id, club_id, name, code, default_points_scheme_id, points_multiplier, is_active, created_by
  ) values(tier_id, club_a, 'QA Open', 'QA-OPEN', scheme_id, 1, true, owner_id);

  perform set_config('selpa.competition_event_write', 'allowed', true);
  insert into public.competition_series_events(
    id, club_id, series_id, season_id, name, status, sequence,
    planned_starts_at, planned_ends_at, actual_starts_at, actual_ends_at, timezone,
    scheduled_by, scheduled_at, completed_by, completed_at, created_by
  ) values(
    event_id, club_a, series_id, season_id, 'Open QA', 'COMPLETED', 1,
    '2027-06-01 09:00:00+00', '2027-06-02 22:00:00+00',
    '2027-06-01 09:00:00+00', '2027-06-02 22:00:00+00', 'America/Argentina/Buenos_Aires',
    owner_id, now(), owner_id, now(), owner_id
  );
  original_snapshot := jsonb_build_object(
    'rule_id', series_rule_id,
    'rule_version', 1,
    'tier_id', tier_id,
    'effective_points_scheme_id', scheme_id,
    'effective_multiplier', 1,
    'scoring_mode', 'POINTS',
    'ranking_division_id', ranking_division_id,
    'division', jsonb_build_object('division_id', pairs_division_id, 'season_id', season_id),
    'eligibility', jsonb_build_object('requires_active_entry', true),
    'frozen_at', now()
  );
  insert into public.competition_series_event_divisions(
    id, club_id, event_id, series_division_id, series_rule_id, event_tier_id,
    scoring_mode, points_scheme_override_id, points_multiplier_override, status,
    configuration_snapshot, frozen_at, completed_by, completed_at, created_by
  ) values(
    event_division_id, club_a, event_id, series_division_id, series_rule_id, tier_id,
    'POINTS', scheme_id, 1, 'COMPLETED', original_snapshot, now(), owner_id, now(), owner_id
  );

  select candidate.id::smallint
  into category_small
  from generate_series(32000, 32767) candidate(id)
  where not exists(select 1 from public.categories category where category.id = candidate.id)
  order by candidate.id
  limit 1;
  insert into public.categories(id, name) values(category_small, 'QA Points ' || category_small);
  insert into public.tournaments(
    id, club_id, name, type, start_date, end_date, status,
    category_id, category, category_rule, fixed_category_id, gender, tournament_type
  ) values(
    tournament_id, club_a, 'Open QA', 'OPEN', '2027-06-01', '2027-06-02', 'FINISHED',
    category_small, 6, 'FIXED_CATEGORY', category_small, 'MIXED', 'OPEN'
  );
  insert into public.competition_series_event_tournament_links(
    club_id, event_division_id, tournament_id, status, linked_by
  ) values(club_a, event_division_id, tournament_id, 'ACTIVE', owner_id);

  for i in 1..4 loop
    insert into public.club_players(id, club_id, user_id, display_name, category, gender, approved_at, approved_by)
    values(club_players[i], club_a, users[i + 2], 'QA Player ' || i, 6, case when i % 2 = 0 then 'F' else 'M' end, now(), owner_id);
    insert into public.competition_player_entries(
      id, club_id, division_id, club_player_id, status, valid_from, assigned_by
    ) values(entries[i], club_a, ranking_division_id, club_players[i], 'ACTIVE', '2027-05-01 00:00:00+00', owner_id);
  end loop;
  insert into public.tournament_teams(id, tournament_id, club_id, player1_user_id, player2_user_id, created_by) values
    (teams[1], tournament_id, club_a, users[3], users[4], owner_id),
    (teams[2], tournament_id, club_a, users[5], users[6], owner_id);

  perform set_config('selpa.competition_homologation_write', 'allowed', true);
  insert into public.competition_event_homologations(
    id, club_id, event_id, event_division_id, tournament_id, version, revision, status,
    source_results_revision, result_snapshot, eligibility_snapshot, tournament_snapshot,
    submitted_by, submitted_at, approved_by, approved_at, created_by
  ) values(
    homologation_id, club_a, event_id, event_division_id, tournament_id, 1, 1, 'APPROVED',
    'qa-result-revision', '{}'::jsonb,
    jsonb_build_object('ranking_division_id', ranking_division_id, 'eligibility_at', '2027-06-01 09:00:00+00'),
    jsonb_build_object('tournament_id', tournament_id),
    owner_id, now(), owner_id, now(), owner_id
  );
  insert into public.competition_event_homologation_results(
    club_id, homologation_id, tournament_team_id, final_position, result_role, result_snapshot
  ) values
    (club_a, homologation_id, teams[1], 1, 'CHAMPION', jsonb_build_object('team_id', teams[1])),
    (club_a, homologation_id, teams[2], 2, 'RUNNER_UP', jsonb_build_object('team_id', teams[2]));
  for i in 1..4 loop
    insert into public.competition_event_homologation_participants(
      club_id, homologation_id, player_id, club_player_id, competition_player_entry_id,
      tournament_team_id, participation_status, scoring_eligibility_status,
      final_position, result_role, participant_snapshot
    ) values(
      club_a, homologation_id, users[i + 2], club_players[i], entries[i],
      case when i <= 2 then teams[1] else teams[2] end,
      'FINISHED', 'ELIGIBLE', case when i <= 2 then 1 else 2 end,
      case when i <= 2 then 'CHAMPION' else 'RUNNER_UP' end,
      jsonb_build_object(
        'player_id', users[i + 2],
        'club_player_id', club_players[i],
        'entry_id', entries[i],
        'tournament_team_id', case when i <= 2 then teams[1] else teams[2] end,
        'ranking_division_id', ranking_division_id,
        'eligibility_at', '2027-06-01 09:00:00+00'
      )
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('rule_key', rule_key, 'points', points) order by rule_key), '[]'::jsonb)
  into original_rules
  from public.points_scheme_rules rule
  where rule.scheme_id = qa.scheme_id;

  qa_step := 'CALCULATED revision 2';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  response := public.create_competition_event_settlement_draft(club_a, event_division_id, 'qa-safe-create-0001');
  settlement_id := (response->>'settlement_id')::uuid;
  revision := (response->>'revision')::integer;
  response := public.calculate_competition_event_settlement(club_a, settlement_id, revision, 'qa-safe-calculate-01');
  revision := (response->>'revision')::integer;
  if revision <> 2 or response->>'status' <> 'CALCULATED' then
    raise exception 'El fixture no reproduce CALCULATED revision 2';
  end if;

  qa_step := 'invalid adjustment rollback';
  select count(*) into clone_count from public.points_schemes where club_id = club_a;
  begin
    perform public.adjust_competition_event_settlement_points(
      club_a, settlement_id, revision, 'qa-safe-invalid-0001', 'OPEN · Open QA',
      '[{"rule_key":"CHAMPION","points":500}]'::jsonb
    );
    raise exception 'Reglas incompletas aceptadas';
  exception when invalid_parameter_value then null;
  end;
  if (select count(*) from public.points_schemes where club_id = club_a) <> clone_count
     or (select settlement.revision from public.competition_event_settlements settlement where settlement.id = settlement_id) <> revision then
    raise exception 'La operación fallida dejó cambios parciales';
  end if;

  qa_step := 'safe clone and recalculation';
  response := public.adjust_competition_event_settlement_points(
    club_a, settlement_id, revision, 'qa-safe-adjust-000001', 'OPEN · Open QA',
    '[
      {"rule_key":"CHAMPION","points":500},
      {"rule_key":"RUNNER_UP","points":400},
      {"rule_key":"SEMIFINALIST","points":200},
      {"rule_key":"QUARTERFINALIST","points":100},
      {"rule_key":"PARTICIPANT","points":50}
    ]'::jsonb
  );
  replay := public.adjust_competition_event_settlement_points(
    club_a, settlement_id, revision, 'qa-safe-adjust-000001', 'OPEN · Open QA',
    '[
      {"rule_key":"CHAMPION","points":500},
      {"rule_key":"RUNNER_UP","points":400},
      {"rule_key":"SEMIFINALIST","points":200},
      {"rule_key":"QUARTERFINALIST","points":100},
      {"rule_key":"PARTICIPANT","points":50}
    ]'::jsonb
  );
  if replay is distinct from response then raise exception 'Replay de ajuste no fue idempotente'; end if;
  revision := (response->>'revision')::integer;
  clone_id := (response->>'points_scheme_id')::uuid;
  if response->>'status' <> 'CALCULATED' or revision <> 4 then raise exception 'Ajuste no volvió a CALCULATED con revisión nueva'; end if;
  if clone_id = scheme_id
     or not exists(select 1 from public.points_schemes scheme where scheme.id = clone_id and scheme.club_id = club_a and not scheme.is_global and not scheme.is_active) then
    raise exception 'No se creó un clone privado';
  end if;
  if (select settlement.points_scheme_id from public.competition_event_settlements settlement where settlement.id = settlement_id) <> clone_id then
    raise exception 'Settlement no apunta al clone';
  end if;
  if (select rule.points from public.points_scheme_rules rule where rule.scheme_id = qa.scheme_id and rule.rule_key = 'CHAMPION') <> 100
     or (select rule.points from public.points_scheme_rules rule where rule.scheme_id = qa.clone_id and rule.rule_key = 'CHAMPION') <> 500 then
    raise exception 'El clone o el esquema original quedaron incorrectos';
  end if;
  if (select series_rule.points_scheme_id from public.competition_series_rules series_rule where series_rule.id = series_rule_id) <> scheme_id
     or (select event_division.configuration_snapshot from public.competition_series_event_divisions event_division where event_division.id = event_division_id) is distinct from original_snapshot then
    raise exception 'El ajuste alteró la regla o snapshot de la fecha';
  end if;
  if (select coalesce(jsonb_agg(jsonb_build_object('rule_key', rule.rule_key, 'points', rule.points) order by rule.rule_key), '[]'::jsonb) from public.points_scheme_rules rule where rule.scheme_id = qa.scheme_id) is distinct from original_rules then
    raise exception 'El esquema OPEN original fue modificado';
  end if;
  if (select sum(award.total_points) from public.competition_event_settlement_awards award where award.settlement_id = qa.settlement_id) <> 1800 then
    raise exception 'La vista previa no fue recalculada con los puntos nuevos';
  end if;
  if (select count(*) from public.points_schemes scheme where scheme.club_id = club_a) <> clone_count + 1 then
    raise exception 'Replay creó clones adicionales';
  end if;
  begin
    perform public.adjust_competition_event_settlement_points(
      club_a, settlement_id, 2, 'qa-safe-stale-000001', 'OPEN · stale',
      '[{"rule_key":"CHAMPION","points":1},{"rule_key":"RUNNER_UP","points":1},{"rule_key":"SEMIFINALIST","points":1},{"rule_key":"QUARTERFINALIST","points":1},{"rule_key":"PARTICIPANT","points":1}]'::jsonb
    );
    raise exception 'Stale revision aceptada';
  exception when serialization_failure then null;
  end;

  qa_step := 'PLAYER and cross-club';
  reset role;
  perform set_config('request.jwt.claim.sub', player_id::text, true);
  set local role authenticated;
  begin
    perform public.adjust_competition_event_settlement_points(
      club_a, settlement_id, revision, 'qa-player-adjust-0001', 'No permitido',
      '[{"rule_key":"CHAMPION","points":1},{"rule_key":"RUNNER_UP","points":1},{"rule_key":"SEMIFINALIST","points":1},{"rule_key":"QUARTERFINALIST","points":1},{"rule_key":"PARTICIPANT","points":1}]'::jsonb
    );
    raise exception 'PLAYER pudo ajustar puntos';
  exception when no_data_found or insufficient_privilege then null;
  end;
  begin
    perform public.adjust_competition_event_settlement_points(
      club_b, settlement_id, revision, 'qa-cross-adjust-00001', 'No permitido',
      '[{"rule_key":"CHAMPION","points":1},{"rule_key":"RUNNER_UP","points":1},{"rule_key":"SEMIFINALIST","points":1},{"rule_key":"QUARTERFINALIST","points":1},{"rule_key":"PARTICIPANT","points":1}]'::jsonb
    );
    raise exception 'Owner cross-club pudo ajustar';
  exception when no_data_found or insufficient_privilege then null;
  end;

  qa_step := 'revision chain and publish';
  reset role;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  response := public.submit_competition_event_settlement(club_a, settlement_id, revision, 'qa-safe-submit-00001');
  if (response->>'revision')::integer <> revision + 1 then raise exception 'SUBMIT no incrementó revisión'; end if;
  revision := (response->>'revision')::integer;
  begin
    perform public.approve_competition_event_settlement(club_a, settlement_id, revision - 1, 'qa-safe-stale-approve');
    raise exception 'APPROVE aceptó revisión stale';
  exception when serialization_failure then null;
  end;
  response := public.approve_competition_event_settlement(club_a, settlement_id, revision, 'qa-safe-approve-0001');
  if (response->>'revision')::integer <> revision + 1 then raise exception 'APPROVE no usó la revisión devuelta'; end if;
  revision := (response->>'revision')::integer;
  response := public.publish_competition_event_settlement(club_a, settlement_id, revision, 'qa-safe-publish-0001');
  replay := public.publish_competition_event_settlement(club_a, settlement_id, revision, 'qa-safe-publish-0001');
  if replay is distinct from response or response->>'status' <> 'PUBLISHED' then raise exception 'PUBLISH/replay inválido'; end if;
  revision := (response->>'revision')::integer;
  reset role;
  select count(*), coalesce(sum(point_tx.points), 0)
  into ledger_count, ledger_total
  from public.competition_point_transactions point_tx
  where point_tx.metadata->>'settlement_id' = settlement_id::text
    and point_tx.transaction_type = 'TOURNAMENT_RESULT';
  if ledger_count <> 4 or ledger_total <> 1800 then raise exception 'Ledger publicado no coincide con awards'; end if;
  select count(*), coalesce(sum(projection.total_points), 0)
  into pair_count, pair_total
  from public.competition_pair_ranking_projection projection
  where projection.club_id = club_a and projection.pairs_division_id = qa.pairs_division_id;
  if pair_count <> 2 or pair_total <> 900 then raise exception 'Pair projection inicial suma incorrectamente'; end if;

  qa_step := 'published correction and reversals';
  set local role authenticated;
  response := public.create_competition_event_settlement_correction(club_a, settlement_id, revision, 'qa-safe-correction-01');
  replay := public.create_competition_event_settlement_correction(club_a, settlement_id, revision, 'qa-safe-correction-01');
  if replay is distinct from response then raise exception 'Replay de corrección no fue idempotente'; end if;
  correction_id := (response->>'settlement_id')::uuid;
  if (response->>'version')::integer <> 2
     or (select settlement.corrected_from_id from public.competition_event_settlements settlement where settlement.id = correction_id) <> settlement_id
     or (select settlement.status from public.competition_event_settlements settlement where settlement.id = settlement_id) <> 'SUPERSEDED' then
    raise exception 'Versionado de corrección inválido';
  end if;
  reset role;
  select count(*), count(distinct point_tx.reversed_transaction_id), coalesce(sum(point_tx.points), 0)
  into reversal_count, ledger_count, ledger_total
  from public.competition_point_transactions point_tx
  where point_tx.transaction_type = 'REVERSAL'
    and point_tx.reversed_transaction_id in (
      select original.id from public.competition_point_transactions original
      where original.metadata->>'settlement_id' = settlement_id::text
        and original.transaction_type = 'TOURNAMENT_RESULT'
    );
  if reversal_count <> 4 or ledger_count <> 4 or ledger_total <> -1800 then
    raise exception 'Reversals no compensan exactamente una vez cada original';
  end if;
  if exists(select 1 from public.competition_pair_ranking_projection projection where projection.club_id = club_a and projection.pairs_division_id = qa.pairs_division_id) then
    raise exception 'Pair projection conservó puntos de la versión SUPERSEDED';
  end if;

  qa_step := 'corrected republish';
  revision := (response->>'revision')::integer;
  set local role authenticated;
  response := public.calculate_competition_event_settlement(club_a, correction_id, revision, 'qa-safe-correct-calc1');
  revision := (response->>'revision')::integer;
  response := public.submit_competition_event_settlement(club_a, correction_id, revision, 'qa-safe-correct-submit');
  revision := (response->>'revision')::integer;
  response := public.approve_competition_event_settlement(club_a, correction_id, revision, 'qa-safe-correct-approve');
  revision := (response->>'revision')::integer;
  response := public.publish_competition_event_settlement(club_a, correction_id, revision, 'qa-safe-correct-publish');
  if response->>'status' <> 'PUBLISHED' then raise exception 'La corrección no pudo publicarse'; end if;
  reset role;
  select coalesce(sum(point_tx.points), 0)
  into ledger_total
  from public.competition_point_transactions point_tx
  where point_tx.club_id = club_a
    and point_tx.source_concept in ('COMPETITION_EVENT_SETTLEMENT', 'REVERSAL');
  if ledger_total <> 1800 then raise exception 'El ranking neto no equivale a la nueva publicación'; end if;
  select count(*), coalesce(sum(projection.total_points), 0)
  into pair_count, pair_total
  from public.competition_pair_ranking_projection projection
  where projection.club_id = club_a and projection.pairs_division_id = qa.pairs_division_id;
  if pair_count <> 2 or pair_total <> 900 then raise exception 'Pair projection corregida suma incorrectamente'; end if;

  qa_step := 'grants and definitions';
  if has_function_privilege('anon', 'public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb)', 'EXECUTE') then
    raise exception 'Grants de adjust points inválidos';
  end if;
  if has_function_privilege('anon', 'public.create_competition_event_settlement_correction(uuid,uuid,integer,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_competition_event_settlement_correction(uuid,uuid,integer,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.create_competition_event_settlement_correction(uuid,uuid,integer,text)', 'EXECUTE') then
    raise exception 'Grants de correction inválidos';
  end if;

  return query select 'PASS', 'clone aislado, recalculation, stale revision, publish, correction, reversals, replay, tenants, roles, pair projection y rollback contractual';
exception when others then
  reset role;
  return query select 'FAIL', qa_step || ' | ' || sqlstate || ' | ' || sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_competition_points_preview_safe_edit_qa();

rollback;
