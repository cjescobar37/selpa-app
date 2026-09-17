-- PREPARED ONLY. Not executed locally or remotely.
-- Catalog/pure-function QA; sporting extraction + settlement integration requires
-- an isolated PostgreSQL fixture run, never Open Octubre or Noviembre.
begin;
do $$
declare rules jsonb; definition text;
begin
  rules:='[{"rule_key":"CHAMPION","points":750},{"rule_key":"RUNNER_UP","points":500},{"rule_key":"SEMIFINALIST","points":400},{"rule_key":"QUARTERFINALIST","points":250},{"rule_key":"PARTICIPANT","points":50}]';
  if not public.is_valid_competition_point_rules(rules) then raise exception 'BASE_FIVE_INVALID'; end if;
  rules:=rules || '[{"rule_key":"EIGHTH_FINALIST","points":150},{"rule_key":"SIXTEENTH_FINALIST","points":100}]';
  if not public.is_valid_competition_point_rules(rules) then raise exception 'MASTER_SEVEN_INVALID'; end if;
  if public.is_valid_competition_point_rules(rules || '[{"rule_key":"PARTICIPANT","points":50}]') then raise exception 'DUPLICATE_ACCEPTED'; end if;
  if public.is_valid_competition_point_rules('null'::jsonb) then raise exception 'NULL_ACCEPTED'; end if;
  select pg_get_functiondef('public.extract_competition_event_homologation_results(uuid,uuid,integer,text)'::regprocedure) into definition;
  if position('EIGHTH_FINALIST' in definition)=0 or position('SIXTEENTH_FINALIST' in definition)=0 then raise exception 'EXTRACTOR_TIERS_MISSING'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.competition_event_homologation_results'::regclass and conname='competition_homologation_results_role_chk' and position('EIGHTH_FINALIST' in pg_get_constraintdef(oid))>0) then raise exception 'ROLE_CONSTRAINT_MISSING'; end if;
  if not has_function_privilege('authenticated','public.create_competition_series_event_with_timezone(uuid,uuid,text,text)','EXECUTE') then raise exception 'TIMEZONE_RPC_GRANT_MISSING'; end if;
  if has_function_privilege('anon','public.create_competition_series_event_with_timezone(uuid,uuid,text,text)','EXECUTE') then raise exception 'ANON_ACCESS'; end if;
end $$;
rollback;
