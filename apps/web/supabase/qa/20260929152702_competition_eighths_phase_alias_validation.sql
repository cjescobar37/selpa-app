-- PREPARED QA ONLY. Function assertions; no business data is persisted.
begin;

do $$
begin
  if public.competition_result_role_for_playoff_phase('EIGHTHS', false) <> 'EIGHTH_FINALIST'
     or public.competition_result_role_for_playoff_phase('ROUND_OF_16', false) <> 'EIGHTH_FINALIST'
     or public.competition_result_role_for_playoff_phase('EIGHTHS', true) is not null
     or public.competition_result_role_for_playoff_phase('QUARTER', false) <> 'QUARTERFINALIST'
     or public.competition_result_role_for_playoff_phase('SEMI', false) <> 'SEMIFINALIST'
     or public.competition_result_role_for_playoff_phase('FINAL', true) <> 'CHAMPION'
     or public.competition_result_role_for_playoff_phase('FINAL', false) <> 'RUNNER_UP'
     or public.competition_result_role_for_playoff_phase('ROUND_OF_32', false) <> 'SIXTEENTH_FINALIST'
  then
    raise exception 'Competition playoff phase alias mapping is invalid';
  end if;

  if has_function_privilege('anon', 'public.competition_result_role_for_playoff_phase(text,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.competition_result_role_for_playoff_phase(text,boolean)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.competition_result_role_for_playoff_phase(text,boolean)', 'EXECUTE')
  then
    raise exception 'Internal placement helper is exposed through the Data API';
  end if;
end;
$$;

rollback;
