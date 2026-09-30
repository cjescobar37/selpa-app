-- PREPARED QA ONLY. Run after the migration; no business data is modified.
begin transaction read only;

do $$
declare
  configure_definition text;
  division_setter_definition text;
  tier_setter_definition text;
  integrity_definition text;
begin
  select pg_get_functiondef(
    'public.configure_competition_series_event_division(uuid,uuid,uuid,integer,text,uuid,uuid,numeric)'::regprocedure
  ) into configure_definition;
  if configure_definition not like '%tier_row.default_points_scheme_id%'
     or configure_definition not like '%rule_row.points_scheme_id%'
  then raise exception 'Tier default resolution is missing'; end if;

  select pg_get_functiondef(
    'public.set_competition_event_division_points_scheme(uuid,uuid,uuid,integer,integer,uuid)'::regprocedure
  ) into division_setter_definition;
  if division_setter_definition not like '%status not in (''DRAFT'', ''SCHEDULED'')%'
     or division_setter_definition not like '%scoring_mode <> ''POINTS''%'
     or division_setter_definition not like '%competition_event_homologations%'
     or division_setter_definition not like '%competition_event_settlements%'
     or division_setter_definition not like '%points_scheme_override_id = p_points_scheme_id%'
  then raise exception 'Event-division scheme setter contract is incomplete'; end if;

  select pg_get_functiondef(
    'public.set_competition_event_tier_default_points_scheme(uuid,uuid,uuid)'::regprocedure
  ) into tier_setter_definition;
  if tier_setter_definition not like '%default_points_scheme_id = p_points_scheme_id%'
     or tier_setter_definition not like '%p_points_scheme_id is not null and not exists%'
     or tier_setter_definition not like '%is not distinct from p_points_scheme_id%'
     or tier_setter_definition like '%competition_series_events%'
  then raise exception 'Tier-default scheme setter contract is incomplete'; end if;

  select pg_get_functiondef(
    'public.validate_competition_event_division_integrity()'::regprocedure
  ) into integrity_definition;
  if integrity_definition not like '%selpa.competition_event_points_scheme_write%'
     or integrity_definition not like '%new.status = old.status%'
  then raise exception 'Frozen-division guard does not contain the narrow scheme exception'; end if;

  if has_function_privilege('anon',
      'public.set_competition_event_division_points_scheme(uuid,uuid,uuid,integer,integer,uuid)', 'EXECUTE')
     or has_function_privilege('anon',
      'public.set_competition_event_tier_default_points_scheme(uuid,uuid,uuid)', 'EXECUTE')
  then raise exception 'anon must not execute points-scheme setters'; end if;
  if not has_function_privilege('authenticated',
      'public.set_competition_event_division_points_scheme(uuid,uuid,uuid,integer,integer,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated',
      'public.set_competition_event_tier_default_points_scheme(uuid,uuid,uuid)', 'EXECUTE')
  then raise exception 'authenticated grants are missing'; end if;
end;
$$;

rollback;
