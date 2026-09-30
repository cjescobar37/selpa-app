-- PREPARED QA ONLY. Catalog assertions; no business data is persisted.
begin;

do $$
declare
  seven_rules jsonb := '[
    {"rule_key":"CHAMPION","points":750},
    {"rule_key":"RUNNER_UP","points":500},
    {"rule_key":"SEMIFINALIST","points":400},
    {"rule_key":"QUARTERFINALIST","points":250},
    {"rule_key":"EIGHTH_FINALIST","points":150},
    {"rule_key":"SIXTEENTH_FINALIST","points":100},
    {"rule_key":"PARTICIPANT","points":50}
  ]'::jsonb;
  historical_five_rules jsonb := '[
    {"rule_key":"CHAMPION","points":750},
    {"rule_key":"RUNNER_UP","points":500},
    {"rule_key":"SEMIFINALIST","points":400},
    {"rule_key":"QUARTERFINALIST","points":250},
    {"rule_key":"PARTICIPANT","points":50}
  ]'::jsonb;
  six_rules jsonb := '[
    {"rule_key":"CHAMPION","points":750},
    {"rule_key":"RUNNER_UP","points":500},
    {"rule_key":"SEMIFINALIST","points":400},
    {"rule_key":"QUARTERFINALIST","points":250},
    {"rule_key":"EIGHTH_FINALIST","points":150},
    {"rule_key":"PARTICIPANT","points":50}
  ]'::jsonb;
  extractor_definition text;
  adjustment_definition text;
  calculation_definition text;
begin
  if not public.is_valid_competition_point_rules(seven_rules) then
    raise exception 'Seven-tier scheme must be valid';
  end if;
  if not public.is_valid_competition_point_rules(historical_five_rules) then
    raise exception 'Historical five-tier scheme must remain valid';
  end if;
  if not public.is_valid_competition_point_rules(six_rules) then
    raise exception 'Six-tier scheme must remain valid';
  end if;

  select pg_get_functiondef(
    'public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb)'::regprocedure
  ) into adjustment_definition;
  if adjustment_definition not like '%requested_rule_keys%'
     or adjustment_definition not like '%deactivate_points_scheme_rule%'
     or adjustment_definition not like '%upper(rule.rule_key) <> all(requested_rule_keys)%'
     or adjustment_definition not like '%where scheme_id = cloned_scheme.id and is_active%'
  then
    raise exception 'Settlement adjustment does not mirror exactly the requested active rules';
  end if;

  select pg_get_functiondef(
    'public.calculate_competition_event_settlement(uuid,uuid,integer,text)'::regprocedure
  ) into calculation_definition;
  if calculation_definition not like '%RESULT_RULE_MISSING%'
     or calculation_definition not like '%upper(r.value->>''rule_key'')=upper(p.result_role)%'
  then
    raise exception 'Settlement calculation lost exact result-rule matching';
  end if;

  if public.competition_result_role_for_playoff_phase('FINAL', true) <> 'CHAMPION'
     or public.competition_result_role_for_playoff_phase('FINAL', false) <> 'RUNNER_UP'
     or public.competition_result_role_for_playoff_phase('SEMI', false) <> 'SEMIFINALIST'
     or public.competition_result_role_for_playoff_phase('QUARTER', false) <> 'QUARTERFINALIST'
     or public.competition_result_role_for_playoff_phase('ROUND_OF_16', false) <> 'EIGHTH_FINALIST'
     or public.competition_result_role_for_playoff_phase('ROUND_OF_32', false) <> 'SIXTEENTH_FINALIST'
     or public.competition_result_role_for_playoff_phase('SEMI', true) is not null
     or public.competition_result_role_for_playoff_phase('UNKNOWN', false) is not null
  then
    raise exception 'Canonical playoff placement mapping is invalid';
  end if;

  select pg_get_functiondef('public.extract_competition_event_homologation_results(uuid,uuid,integer,text)'::regprocedure)
  into extractor_definition;
  if extractor_definition not like '%competition_result_role_for_playoff_phase%'
     or extractor_definition not like '%status = ''PLAYED''%'
     or extractor_definition not like '%team1_id is not null%'
     or extractor_definition not like '%team2_id is not null%'
     or extractor_definition not like '%winner_team_id in%'
  then
    raise exception 'Extractor lost canonical placement or sporting guards';
  end if;

  if has_function_privilege('anon', 'public.competition_result_role_for_playoff_phase(text,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.competition_result_role_for_playoff_phase(text,boolean)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.competition_result_role_for_playoff_phase(text,boolean)', 'EXECUTE')
  then
    raise exception 'Internal placement helper is exposed through the Data API';
  end if;

  if has_function_privilege('anon', 'public.extract_competition_event_homologation_results(uuid,uuid,integer,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.extract_competition_event_homologation_results(uuid,uuid,integer,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.extract_competition_event_homologation_results(uuid,uuid,integer,text)', 'EXECUTE')
  then
    raise exception 'Extractor grants do not match the Competition workflow';
  end if;
end;
$$;

rollback;
