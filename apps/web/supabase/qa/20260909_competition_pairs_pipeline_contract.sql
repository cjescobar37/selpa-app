-- Read-only post-migration contract checks. This file performs no DML.
do $$
declare definition text; view_columns text[];
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='competition_series_divisions' and column_name='ranking_division_id' and data_type='uuid'
  ) then raise exception 'ranking_division_id is missing'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.competition_series_divisions'::regclass and conname='competition_series_divisions_ranking_division_fkey'
  ) then raise exception 'ranking division same-club FK is missing'; end if;

  select pg_get_functiondef('public.guard_competition_event_division_pipeline()'::regprocedure) into definition;
  if position('RANKING_DIVISION_REQUIRED' in definition)=0 or position('TOURNAMENT_NOT_FINISHED' in definition)=0 then
    raise exception 'event division scheduling/finalization guards are incomplete';
  end if;

  select pg_get_functiondef('public.extract_competition_event_homologation_results_base_20260802(uuid,uuid,integer,text)'::regprocedure) into definition;
  if position('ranking_division_id' in definition)=0
     or position('eligibility_at' in definition)=0
     or position('when pe.id is null then ''ENTRY_MISSING''' in definition)=0
     or position('invited_policy=''NON_SCORING'') then ''NON_SCORING''' in definition)=0 then
    raise exception 'homologation does not use frozen temporal individual eligibility';
  end if;

  select pg_get_functiondef('public.transition_competition_event_settlement(uuid,uuid,integer,text,text,jsonb)'::regprocedure) into definition;
  if position('ranking_division_id' in definition)=0
     or position('tournament_team_id' in definition)=0
     or position('eligibility_at' in definition)=0 then
    raise exception 'settlement does not publish individual division plus pair identity';
  end if;

  select pg_get_functiondef('public.validate_competition_point_transaction()'::regprocedure) into definition;
  if position('historical_eligibility_at' in definition)=0
     or position('new.metadata->>''eligibility_at''' in definition)=0
     or position('historical_eligibility_at>=v_entry.valid_from' in definition)=0
     or position('new.effective_at>=v_entry.valid_from' in definition)>0 then
    raise exception 'ledger does not validate the frozen historical eligibility timestamp';
  end if;

  select array_agg(column_name::text order by ordinal_position) into view_columns
  from information_schema.columns
  where table_schema='public' and table_name='competition_pair_ranking_projection';
  if view_columns is distinct from array[
    'club_id','season_id','division_id','player1_user_id','player2_user_id',
    'pair_key','total_points','settled_results','pairs_division_id'
  ] then
    raise exception 'pair projection column order is incompatible: %',view_columns;
  end if;

  select lower(pg_get_viewdef('public.competition_pair_ranking_projection'::regclass,true)) into definition;
  if position('count(distinct award.player_id) = 2' in definition)=0 or position('reversed_transaction_id' in definition)=0 then
    raise exception 'pair projection distinct-pair/reversal contract is incomplete';
  end if;

  if not has_table_privilege('service_role','public.competition_pair_ranking_projection','SELECT') then
    raise exception 'service_role SELECT grant is missing';
  end if;
  if has_table_privilege('anon','public.competition_pair_ranking_projection','SELECT')
     or has_table_privilege('authenticated','public.competition_pair_ranking_projection','SELECT') then
    raise exception 'pair projection must not be directly readable by anon/authenticated';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='competition_pair_ranking_projection'
      and grantee in ('PUBLIC','anon','authenticated','service_role')
      and not (grantee='service_role' and privilege_type='SELECT')
  ) then
    raise exception 'pair projection grants exceed service_role SELECT';
  end if;
end $$;
