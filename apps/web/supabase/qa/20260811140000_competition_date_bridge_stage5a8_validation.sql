begin;

create or replace function pg_temp.run_competition_date_bridge_stage5a8_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid; v_player uuid; v_club uuid; v_season uuid; v_scheme uuid;
  v_branch uuid; v_segment uuid; v_category uuid; v_division uuid; v_tier uuid;
  v_series_result jsonb; v_series uuid; v_series_revision integer; v_series_division uuid; v_rule uuid; v_rule_revision integer;
  v_context jsonb; v_result jsonb; v_replay jsonb; v_non_scoring jsonb; v_failed boolean; v_count integer; v_draft_series jsonb;
  v_other_club uuid := gen_random_uuid(); v_independent uuid; v_before jsonb;
  v_terminal jsonb; v_terminal_id uuid; v_terminal_revision integer; v_terminal_division uuid; v_terminal_rule uuid; v_terminal_rule_revision integer;
  v_missing jsonb; v_missing_id uuid; v_missing_revision integer; v_missing_division uuid; v_missing_rule uuid; v_missing_rule_revision integer;
  v_event_payload jsonb; v_tournament_payload jsonb;
begin
  if to_regprocedure('public.create_competition_date_tournament_atomic(uuid,uuid,integer,uuid,uuid,integer,text,jsonb,jsonb)') is null
     or to_regprocedure('public.get_competition_date_creation_context(uuid,uuid)') is null then
    return query select 'FAIL', 'QA no ejecutable: falta aplicar 20260811140000_competition_date_bridge_stage5a8.sql';
    return;
  end if;

  select membership.user_id, membership.club_id into v_owner, v_club
  from public.club_memberships membership
  where membership.role = 'OWNER' and membership.status = 'APPROVED' and membership.approved_at is not null
  order by membership.created_at
  limit 1;
  if v_owner is null then
    return query select 'FAIL', 'QA no ejecutable: falta OWNER aprobado';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  perform public.initialize_competition_catalogs_stage5a1(v_club);

  select season.id into v_season from public.competition_seasons season
  where season.club_id = v_club and season.status = 'ACTIVE' order by season.created_at limit 1;
  select scheme.id into v_scheme from public.points_schemes scheme
  where scheme.is_active and (scheme.is_global or scheme.club_id = v_club) order by scheme.created_at limit 1;
  select branch.id into v_branch from public.competition_branches branch
  where branch.club_id = v_club and branch.slug = 'caballeros' and branch.is_active;
  select segment.id into v_segment from public.competition_segments segment
  where segment.club_id = v_club and segment.slug = 'libres' and segment.is_active;
  select category.id into v_category from public.competition_categories category
  where category.club_id = v_club and category.legacy_category_id = 6 and category.is_active;
  select tier.id into v_tier from public.competition_event_tiers tier
  where tier.club_id = v_club and tier.is_active order by tier.sort_order, tier.id limit 1;
  if v_season is null or v_scheme is null or v_branch is null or v_segment is null or v_category is null or v_tier is null then
    return query select 'FAIL', 'QA no ejecutable: faltan temporada, esquema, Caballeros, Libres, 6ta o tier activo';
    return;
  end if;
  v_division := (public.ensure_competition_division(v_club, v_season, 'PAIRS', v_branch, v_segment, v_category)).id;

  v_series_result := public.create_competition_series_from_wizard(
    v_club, 'qa-date-bridge-series-0001',
    jsonb_build_object('name', 'QA Date Bridge Series', 'season_id', v_season, 'division_id', v_division,
      'points_scheme_id', v_scheme, 'starts_on', current_date, 'ends_on', current_date + 30, 'planned_events_count', 1)
  );
  v_series := (v_series_result ->> 'series_id')::uuid;
  select series.revision into v_series_revision from public.competition_series series where series.id = v_series;
  perform public.schedule_competition_series(v_club, v_series, v_series_revision);
  select series.revision into v_series_revision from public.competition_series series where series.id = v_series;
  select link.id into v_series_division from public.competition_series_divisions link where link.series_id = v_series and link.is_active;
  select rule.id, rule.revision into v_rule, v_rule_revision from public.competition_series_rules rule
  where rule.series_division_id = v_series_division and rule.status = 'ACTIVE';
  if v_series_division is null or v_rule is null then raise exception 'Fixture de circuito incompleto'; end if;

  v_context := public.get_competition_date_creation_context(v_club, v_series);
  if v_context ->> 'series_id' is distinct from v_series::text or jsonb_array_length(v_context -> 'divisions') <> 1 then
    raise exception 'El contexto de creación no refleja el circuito canónico';
  end if;
  v_event_payload := jsonb_build_object('name', 'QA Date Bridge Event', 'event_type', 'STANDARD', 'scoring_mode', 'POINTS', 'event_tier_id', v_tier,
    'planned_starts_at', (current_date + 1)::text, 'planned_ends_at', (current_date + 2)::text, 'timezone', 'America/Argentina/Buenos_Aires');
  v_tournament_payload := jsonb_build_object('name', 'QA Date Bridge Tournament', 'tournament_type', 'OPEN', 'format', 'GROUPS_ELIMINATION',
    'gender', 'MALE', 'segment', 'LIBRES', 'category_id', 6, 'start_date', (current_date + 1)::text,
    'end_date', (current_date + 2)::text, 'min_pairs', 2, 'max_pairs', 8, 'price_per_player', 0);
  select tournament.id, tournament.rules_json into v_independent, v_before
  from public.create_tournament_canonical(v_club,
    v_tournament_payload||jsonb_build_object('name','QA Independent Canonical','points_config',jsonb_build_object('enabled',false))) tournament;
  v_result := public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
    'qa-date-bridge-create-0001', v_event_payload, v_tournament_payload);
  v_replay := public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
    'qa-date-bridge-create-0001', v_event_payload, v_tournament_payload);
  if v_result ->> 'tournament_id' is null or v_replay is distinct from v_result then raise exception 'Replay no devolvió el resultado atómico'; end if;
  if (select count(*) from public.tournaments tournament where tournament.id = (v_result ->> 'tournament_id')::uuid and tournament.status = 'DRAFT') <> 1
     or (select count(*) from public.competition_series_events event where event.id = (v_result ->> 'event_id')::uuid and event.status = 'DRAFT') <> 1
     or (select count(*) from public.competition_series_event_divisions division where division.id = (v_result ->> 'event_division_id')::uuid and division.status = 'DRAFT' and division.scoring_mode = 'POINTS') <> 1
     or (select count(*) from public.competition_series_event_tournament_links link where link.id = (v_result ->> 'link_id')::uuid and link.status = 'ACTIVE') <> 1 then
    raise exception 'La alta no creó Tournament/Event/Division/Link en estados DRAFT/ACTIVE';
  end if;
  if not exists (
    select 1 from public.competition_series_event_divisions division
    where division.id = (v_result ->> 'event_division_id')::uuid
      and division.series_rule_id = v_rule and division.points_scheme_override_id = v_scheme
      and division.scoring_mode = 'POINTS'
  ) then raise exception 'La división no conservó regla/scoring canónicos'; end if;
  if exists(select 1 from public.tournaments tournament where tournament.id=(v_result->>'tournament_id')::uuid
    and (tournament.points_enabled or tournament.points_scheme_id is not null
      or (tournament.rules_json->'points_config'->>'enabled') is distinct from 'false')) then
    raise exception 'Bridge POINTS reactivó puntos legacy de Tournament';
  end if;
  if (select tournament.rules_json from public.tournaments tournament where tournament.id=(v_result->>'tournament_id')::uuid)
     is distinct from v_before then raise exception 'Bridge y alta independiente produjeron rules_json diferentes'; end if;
  if exists (select 1 from public.competition_event_homologations h where h.event_division_id = (v_result ->> 'event_division_id')::uuid)
     or exists (select 1 from public.competition_event_settlements settlement where settlement.event_division_id = (v_result ->> 'event_division_id')::uuid)
     or exists (select 1 from public.competition_point_transactions ledger_row where ledger_row.created_at >= transaction_timestamp()) then
    raise exception 'La creación inicial produjo homologación, settlement o ledger';
  end if;

  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-create-0001', v_event_payload, v_tournament_payload || jsonb_build_object('name', 'Payload distinto'));
  exception when unique_violation then v_failed := true; end;
  if not v_failed then raise exception 'Misma key con payload diferente no produjo conflicto'; end if;

  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-gender-0001', v_event_payload, v_tournament_payload || jsonb_build_object('gender', 'FEMALE'));
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Género incompatible aceptado'; end if;

  foreach v_before in array array[
    jsonb_build_object('key','qa-date-bridge-segment-conflict','patch',jsonb_build_object('segment','VETERANOS')),
    jsonb_build_object('key','qa-date-bridge-category-conflict','patch',jsonb_build_object('category_id',5)),
    jsonb_build_object('key','qa-date-bridge-age-conflict','patch',jsonb_build_object('age_category_id',gen_random_uuid()))
  ] loop
    v_failed := false;
    begin
      perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
        v_before ->> 'key', v_event_payload, v_tournament_payload || (v_before -> 'patch'));
    exception when check_violation then v_failed := true; end;
    if not v_failed then raise exception 'Inconsistencia deportiva aceptada: %', v_before ->> 'key'; end if;
  end loop;
  select count(*) into v_count from public.tournaments tournament where tournament.club_id = v_club and tournament.name = 'QA Date Bridge Tournament';
  if v_count <> 1 then raise exception 'Un fallo dejó Tournament parcial'; end if;

  -- NON_SCORING is a canonical Event Division mode and must not carry tier or scheme.
  v_non_scoring := public.create_competition_date_tournament_atomic(
    v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
    'qa-date-bridge-nonscoring-0001',
    (v_event_payload - 'event_tier_id') || jsonb_build_object('name', 'QA Date Bridge Non Scoring', 'scoring_mode', 'NON_SCORING'),
    (v_tournament_payload || jsonb_build_object('name', 'QA Date Bridge Non Scoring Tournament','points_config',jsonb_build_object('enabled',false)))
  );
  if not exists (select 1 from public.competition_series_event_divisions division
    where division.id = (v_non_scoring ->> 'event_division_id')::uuid and division.scoring_mode = 'NON_SCORING'
      and division.event_tier_id is null and division.points_scheme_override_id is null) then
    raise exception 'NON_SCORING no conservó su configuración canónica';
  end if;
  if exists(select 1 from public.tournaments tournament where tournament.id=(v_non_scoring->>'tournament_id')::uuid
    and (tournament.points_enabled or tournament.points_scheme_id is not null
      or (tournament.rules_json->'points_config'->>'enabled') is distinct from 'false')) then
    raise exception 'Bridge NON_SCORING reactivó puntos legacy de Tournament';
  end if;

  foreach v_before in array array[
    jsonb_build_object('key','qa-date-bridge-points-enabled','patch',jsonb_build_object('points_enabled',true)),
    jsonb_build_object('key','qa-date-bridge-points-config','patch',jsonb_build_object('points_config',jsonb_build_object('enabled',true)))
  ] loop
    v_failed:=false;
    begin
      perform public.create_competition_date_tournament_atomic(v_club,v_series,v_series_revision,v_series_division,v_rule,v_rule_revision,
        v_before->>'key',v_event_payload,v_tournament_payload||(v_before->'patch'));
    exception when check_violation then v_failed:=true; end;
    if not v_failed then raise exception 'Contradicción de puntos legacy aceptada: %',v_before->>'key'; end if;
  end loop;

  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-scheme-conflict-0001', v_event_payload,
      v_tournament_payload || jsonb_build_object('name', 'QA Scheme Conflict', 'points_scheme_id', gen_random_uuid()));
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Payload con tabla de puntos contradictoria aceptado'; end if;

  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-rule-conflict-0001', v_event_payload,
      v_tournament_payload || jsonb_build_object('name', 'QA Rule Conflict', 'rule_id', gen_random_uuid()));
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Payload con regla contradictoria aceptado'; end if;

  -- Failure after Tournament insert: Event name violates the canonical Event constraint.
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-rollback-tournament', v_event_payload || jsonb_build_object('name', '   '),
      v_tournament_payload || jsonb_build_object('name', 'QA Rollback After Tournament'));
  exception when others then v_failed := true; end;
  -- Command rows deliberately have no authenticated table SELECT grant. These
  -- transaction-local residue checks run as the SQL Editor executor, not by
  -- broadening production access; authenticated is restored before every RPC.
  reset role;
  if not v_failed
     or exists (select 1 from public.tournaments tournament where tournament.name = 'QA Rollback After Tournament')
     or exists (select 1 from public.competition_date_creation_commands command where command.idempotency_key = 'qa-date-bridge-rollback-tournament') then
    raise exception 'Rollback posterior a Tournament dejó residuos';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;

  -- Failure after Event insert: Event update rejects an inverted interval.
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-rollback-event', v_event_payload || jsonb_build_object('name', 'QA Rollback Event',
        'planned_starts_at', (current_date + 4)::text, 'planned_ends_at', (current_date + 3)::text),
      v_tournament_payload || jsonb_build_object('name', 'QA Rollback After Event'));
  exception when others then v_failed := true; end;
  reset role;
  if not v_failed
     or exists (select 1 from public.tournaments tournament where tournament.name = 'QA Rollback After Event')
     or exists (select 1 from public.competition_series_events event where event.name = 'QA Rollback Event')
     or exists (select 1 from public.competition_date_creation_commands command where command.idempotency_key = 'qa-date-bridge-rollback-event') then
    raise exception 'Rollback posterior a Event dejó residuos';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;

  -- Failure after Event Division insert: Stage 5A.3 rejects POINTS for FRIENDLY.
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-rollback-division', v_event_payload || jsonb_build_object('name', 'QA Rollback Division', 'event_type', 'FRIENDLY'),
      v_tournament_payload || jsonb_build_object('name', 'QA Rollback After Division'));
  exception when check_violation then v_failed := true; end;
  reset role;
  if not v_failed
     or exists (select 1 from public.tournaments tournament where tournament.name = 'QA Rollback After Division')
     or exists (select 1 from public.competition_series_events event where event.name = 'QA Rollback Division')
     or exists (select 1 from public.competition_date_creation_commands command where command.idempotency_key = 'qa-date-bridge-rollback-division') then
    raise exception 'Rollback posterior a Event Division dejó residuos';
  end if;

  -- A fixture created by the same canonical operation remains independent.
  if exists (select 1 from public.competition_series_event_tournament_links link
      where link.tournament_id = v_independent and link.status = 'ACTIVE') then
    raise exception 'Tournament independiente fue alterado por el bridge';
  end if;

  -- A valid actor in another tenant cannot use a Series from this club.
  insert into public.clubs(id, name, slug, is_active, status)
  values (v_other_club, 'QA Date Bridge Other Club', 'qa-date-bridge-' || replace(v_other_club::text, '-', ''), true, 'ACTIVE');
  insert into public.club_memberships(club_id, user_id, role, status, approved_at, approved_by)
  values (v_other_club, v_owner, 'OWNER', 'APPROVED', now(), v_owner);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_other_club, v_series, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-cross-club-0001', v_event_payload, v_tournament_payload);
  exception when no_data_found then v_failed := true; end;
  if not v_failed then raise exception 'Cross-club aceptado'; end if;

  v_draft_series := public.create_competition_series_from_wizard(v_club, 'qa-date-bridge-draft-0001',
    jsonb_build_object('name', 'QA Date Bridge Draft', 'season_id', v_season, 'division_id', v_division, 'points_scheme_id', v_scheme,
      'starts_on', current_date, 'ends_on', current_date + 30));
  select series.revision into v_series_revision from public.competition_series series where series.id = (v_draft_series ->> 'series_id')::uuid;
  select link.id into v_series_division from public.competition_series_divisions link where link.series_id = (v_draft_series ->> 'series_id')::uuid and link.is_active;
  select rule.id, rule.revision into v_rule, v_rule_revision from public.competition_series_rules rule where rule.series_division_id = v_series_division and rule.status = 'ACTIVE';
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, (v_draft_series ->> 'series_id')::uuid, v_series_revision, v_series_division, v_rule, v_rule_revision,
      'qa-date-bridge-draft-reject-0001', v_event_payload, v_tournament_payload);
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Serie DRAFT permitió crear fecha'; end if;

  -- Explicit transaction-only fixture: operational Series with its Eligibility removed.
  v_missing:=public.create_competition_series_from_wizard(v_club,'qa-date-bridge-missing-eligibility',
    jsonb_build_object('name','QA Missing Eligibility','season_id',v_season,'division_id',v_division,
      'points_scheme_id',v_scheme,'starts_on',current_date,'ends_on',current_date+30));
  v_missing_id:=(v_missing->>'series_id')::uuid;
  select series.revision into v_missing_revision from public.competition_series series where series.id=v_missing_id;
  perform public.schedule_competition_series(v_club,v_missing_id,v_missing_revision);
  select series.revision into v_missing_revision from public.competition_series series where series.id=v_missing_id;
  select link.id into v_missing_division from public.competition_series_divisions link where link.series_id=v_missing_id and link.is_active;
  select rule.id,rule.revision into v_missing_rule,v_missing_rule_revision from public.competition_series_rules rule where rule.series_division_id=v_missing_division and rule.status='ACTIVE';
  reset role;
  perform set_config('selpa.competition_series_write','allowed',true);
  delete from public.competition_series_eligibility eligibility where eligibility.series_rule_id=v_missing_rule;
  perform set_config('selpa.competition_series_write','',true);
  perform set_config('request.jwt.claim.sub',v_owner::text,true); set local role authenticated;
  v_failed:=false;
  begin perform public.get_competition_date_creation_context(v_club,v_missing_id); exception when check_violation then v_failed:=true; end;
  if not v_failed then raise exception 'Eligibility ausente no bloqueó el contexto'; end if;
  v_failed:=false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club,v_missing_id,v_missing_revision,v_missing_division,v_missing_rule,v_missing_rule_revision,
      'qa-date-bridge-missing-eligibility-create',v_event_payload,v_tournament_payload||jsonb_build_object('name','QA Missing Eligibility Tournament'));
  exception when check_violation then v_failed:=true; end;
  reset role;
  if not v_failed
     or exists(select 1 from public.tournaments tournament where tournament.name='QA Missing Eligibility Tournament')
     or exists(select 1 from public.competition_series_events event where event.series_id=v_missing_id)
     or exists(select 1 from public.competition_series_event_divisions division join public.competition_series_events event on event.id=division.event_id where event.series_id=v_missing_id)
     or exists(select 1 from public.competition_series_event_tournament_links link join public.competition_series_event_divisions division on division.id=link.event_division_id join public.competition_series_events event on event.id=division.event_id where event.series_id=v_missing_id)
     or exists(select 1 from public.competition_date_creation_commands command where command.idempotency_key='qa-date-bridge-missing-eligibility-create') then
    raise exception 'Eligibility ausente dejó residuos o no fue rechazada';
  end if;
  -- Keep the fixture transaction-local and remove it from the operational set
  -- through the canonical lifecycle RPC after the negative case was exercised.
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  set local role authenticated;
  perform public.cancel_competition_series(v_club,v_missing_id,v_missing_revision,'QA eligibility ausente validada');

  -- Terminal lifecycle states are produced exclusively through Stage 5A.2 RPCs.
  v_terminal := public.create_competition_series_from_wizard(v_club, 'qa-date-bridge-closed-0001',
    jsonb_build_object('name', 'QA Date Bridge Closed', 'season_id', v_season, 'division_id', v_division,
      'points_scheme_id', v_scheme, 'starts_on', current_date, 'ends_on', current_date + 30));
  v_terminal_id := (v_terminal ->> 'series_id')::uuid;
  select series.revision into v_terminal_revision from public.competition_series series where series.id = v_terminal_id;
  perform public.schedule_competition_series(v_club, v_terminal_id, v_terminal_revision);
  select series.revision into v_terminal_revision from public.competition_series series where series.id = v_terminal_id;
  perform public.activate_competition_series(v_club, v_terminal_id, v_terminal_revision, true);
  select series.revision into v_terminal_revision from public.competition_series series where series.id = v_terminal_id;
  perform public.close_competition_series(v_club, v_terminal_id, v_terminal_revision);
  select series.revision into v_terminal_revision from public.competition_series series where series.id = v_terminal_id;
  select link.id into v_terminal_division from public.competition_series_divisions link where link.series_id = v_terminal_id and link.is_active;
  select rule.id, rule.revision into v_terminal_rule, v_terminal_rule_revision from public.competition_series_rules rule
    where rule.series_division_id = v_terminal_division and rule.status = 'ACTIVE';
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, v_terminal_id, v_terminal_revision, v_terminal_division,
      v_terminal_rule, v_terminal_rule_revision, 'qa-date-bridge-closed-reject', v_event_payload, v_tournament_payload);
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Serie CLOSED permitió crear fecha'; end if;

  select series.revision into v_series_revision from public.competition_series series where series.id = (v_draft_series ->> 'series_id')::uuid;
  perform public.cancel_competition_series(v_club, (v_draft_series ->> 'series_id')::uuid, v_series_revision, 'QA lifecycle');
  select series.revision into v_series_revision from public.competition_series series where series.id = (v_draft_series ->> 'series_id')::uuid;
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, (v_draft_series ->> 'series_id')::uuid, v_series_revision,
      v_series_division, v_rule, v_rule_revision, 'qa-date-bridge-cancelled-reject', v_event_payload, v_tournament_payload);
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Serie CANCELLED permitió crear fecha'; end if;
  perform public.archive_competition_series(v_club, (v_draft_series ->> 'series_id')::uuid, v_series_revision);
  select series.revision into v_series_revision from public.competition_series series where series.id = (v_draft_series ->> 'series_id')::uuid;
  v_failed := false;
  begin
    perform public.create_competition_date_tournament_atomic(v_club, (v_draft_series ->> 'series_id')::uuid, v_series_revision,
      v_series_division, v_rule, v_rule_revision, 'qa-date-bridge-archived-reject', v_event_payload, v_tournament_payload);
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Serie archivada permitió crear fecha'; end if;

  -- auth.users is intentionally not readable by authenticated. Fixture discovery
  -- remains under the SQL Editor executor; the PLAYER permission check below
  -- switches back to authenticated before invoking the public RPC.
  reset role;
  select user_row.id into v_player
  from auth.users user_row
  where user_row.id <> v_owner
    and user_row.email is not null
    and not exists (select 1 from public.platform_admins platform where platform.user_id = user_row.id)
    and not exists (select 1 from public.club_memberships membership where membership.club_id = v_club and membership.user_id = user_row.id)
  order by user_row.id
  limit 1;
  if v_player is null then
    return query select 'FAIL', 'QA no ejecutable: falta un segundo usuario auth para validar PLAYER';
    return;
  end if;
  reset role;
  insert into public.club_memberships(club_id, user_id, role, status, approved_at, approved_by)
  values (v_club, v_player, 'PLAYER', 'APPROVED', now(), v_owner);
  perform set_config('request.jwt.claim.sub', v_player::text, true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.get_competition_date_creation_context(v_club, v_series);
  exception when insufficient_privilege then v_failed := true; end;
  if not v_failed then raise exception 'PLAYER obtuvo acceso al bridge'; end if;

  reset role;
  return query select 'PASS', 'Stage 5A.8 válido: contexto, Tournament/Event/Division/Link atómicos, idempotencia, rollback y permisos';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_competition_date_bridge_stage5a8_qa();

rollback;
