select
  to_regclass('public.competition_seasons') is not null as has_seasons,
  to_regclass('public.competition_branches') is not null as has_branches,
  to_regclass('public.competition_segments') is not null as has_segments,
  to_regclass('public.competition_categories') is not null as has_categories,
  to_regclass('public.competition_divisions') is not null as has_divisions,
  to_regclass('public.competition_player_entries') is not null as has_player_entries,
  to_regprocedure('public.create_default_competition_structure(uuid,text)') is not null as has_default_structure_rpc,
  to_regprocedure('public.assign_player_to_competition_division(uuid,uuid,uuid,text,text,timestamp with time zone)') is not null as has_assignment_rpc,
  exists (
    select 1 from pg_constraint constraint_info
    where constraint_info.conrelid = to_regclass('public.club_players')
      and constraint_info.contype in ('p', 'u')
      and pg_get_constraintdef(constraint_info.oid) ilike '%(club_id, id)%'
  ) as has_club_player_composite_key,
  exists (
    select 1 from pg_policies policy_info
    where policy_info.schemaname = 'public'
      and policy_info.tablename = 'competition_player_entries'
  ) as player_entries_has_rls_policy;

select enum_value.value as season_status
from (
  values ('DRAFT'), ('ACTIVE'), ('CLOSED'), ('ARCHIVED')
) enum_value(value)
where exists (
  select 1
  from pg_constraint constraint_info
  where constraint_info.conrelid = to_regclass('public.competition_seasons')
    and pg_get_constraintdef(constraint_info.oid) like '%' || quote_literal(enum_value.value) || '%'
)
order by enum_value.value;

select 'branch' as catalog, branch.name, branch.slug, null::smallint as legacy_category_id
from public.competition_branches branch
where branch.club_id = '7c70723b-8244-4117-9a2e-b9a129f661a9'::uuid
union all
select 'segment', segment.name, segment.slug, null::smallint
from public.competition_segments segment
where segment.club_id = '7c70723b-8244-4117-9a2e-b9a129f661a9'::uuid
union all
select 'category', category.name, category.slug, category.legacy_category_id
from public.competition_categories category
where category.club_id = '7c70723b-8244-4117-9a2e-b9a129f661a9'::uuid
order by catalog, slug;

select
  pg_get_functiondef(function_info.oid) as create_default_competition_structure_definition
from pg_proc function_info
where function_info.oid = to_regprocedure('public.create_default_competition_structure(uuid,text)');
