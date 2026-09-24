-- Read-only QA for 20260923_data_api_tables_hardening.sql.
-- Every result row must report pass = true.

with expected(table_name) as (
  values
    ('club_requests'),
    ('user_roles'),
    ('categories'),
    ('club_categories'),
    ('argentina_locations'),
    ('club_player_private'),
    ('club_user_invites'),
    ('competition_event_settlement_commands'),
    ('competition_ranking_entry_totals'),
    ('competition_ranking_refresh_scopes'),
    ('competition_series_create_commands')
)
select
  'rls' as check_group,
  expected.table_name as object_name,
  'enabled' as expected,
  case when relation.relrowsecurity then 'enabled' else 'disabled' end as actual,
  relation.relrowsecurity as pass
from expected
left join pg_catalog.pg_class relation
  on relation.oid = to_regclass(format('public.%I', expected.table_name))
order by expected.table_name;

with expected(table_name, expected_client_policy_count) as (
  values
    ('club_requests', 0),
    ('user_roles', 0),
    ('categories', 1),
    ('club_categories', 0),
    ('argentina_locations', 0),
    ('club_player_private', 0),
    ('club_user_invites', 0),
    ('competition_event_settlement_commands', 0),
    ('competition_ranking_entry_totals', 0),
    ('competition_ranking_refresh_scopes', 0),
    ('competition_series_create_commands', 0)
), actual as (
  select
    policies.tablename as table_name,
    count(*) filter (
      where 'public' = any(policies.roles)
         or 'anon' = any(policies.roles)
         or 'authenticated' = any(policies.roles)
    )::integer as client_policy_count
  from pg_catalog.pg_policies policies
  where policies.schemaname = 'public'
  group by policies.tablename
)
select
  'client policies' as check_group,
  expected.table_name as object_name,
  expected.expected_client_policy_count::text as expected,
  coalesce(actual.client_policy_count, 0)::text as actual,
  coalesce(actual.client_policy_count, 0) = expected.expected_client_policy_count as pass
from expected
left join actual using (table_name)
order by expected.table_name;

select
  'categories policy' as check_group,
  'categories_authenticated_select' as object_name,
  'SELECT authenticated USING true' as expected,
  coalesce(policy.cmd || ' ' || array_to_string(policy.roles, ',') || ' USING ' || policy.qual, 'missing') as actual,
  policy.cmd = 'SELECT'
    and policy.roles = array['authenticated']::name[]
    and policy.qual in ('true', '(true)') as pass
from (values (true)) seed(present)
left join pg_catalog.pg_policies policy
  on policy.schemaname = 'public'
 and policy.tablename = 'categories'
 and policy.policyname = 'categories_authenticated_select';

with target_tables(table_name) as (
  values
    ('club_requests'),
    ('user_roles'),
    ('categories'),
    ('club_categories'),
    ('argentina_locations'),
    ('club_player_private'),
    ('club_user_invites'),
    ('competition_event_settlement_commands'),
    ('competition_ranking_entry_totals'),
    ('competition_ranking_refresh_scopes'),
    ('competition_series_create_commands')
), target_roles(grantee) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
), expected as (
  select
    target_tables.table_name,
    target_roles.grantee,
    case
      when target_roles.grantee = 'authenticated' and target_tables.table_name = 'categories'
        then array['SELECT']::text[]
      when target_roles.grantee = 'service_role' and target_tables.table_name = 'club_requests'
        then array['DELETE', 'INSERT', 'SELECT']::text[]
      when target_roles.grantee = 'service_role'
       and target_tables.table_name in ('user_roles', 'categories', 'club_categories', 'club_user_invites')
        then array['SELECT']::text[]
      else array[]::text[]
    end as expected_privileges
  from target_tables
  cross join target_roles
), actual as (
  select
    grants.table_name,
    grants.grantee,
    array_agg(grants.privilege_type order by grants.privilege_type)::text[] as actual_privileges
  from information_schema.table_privileges grants
  where grants.table_schema = 'public'
    and grants.table_name in (select table_name from target_tables)
    and grants.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  group by grants.table_name, grants.grantee
)
select
  'table grants' as check_group,
  expected.table_name || ':' || expected.grantee as object_name,
  expected.expected_privileges::text as expected,
  coalesce(actual.actual_privileges, array[]::text[])::text as actual,
  coalesce(actual.actual_privileges, array[]::text[]) = expected.expected_privileges as pass
from expected
left join actual using (table_name, grantee)
order by expected.table_name, expected.grantee;

with target_functions(function_signature) as (
  values
    ('public.create_club(text,text,text)'),
    ('public.ensure_club_player(uuid)'),
    ('public.handle_new_user()')
), target_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
)
select
  'function execute' as check_group,
  target_functions.function_signature || ':' || target_roles.role_name as object_name,
  'false' as expected,
  has_function_privilege(
    target_roles.role_name,
    target_functions.function_signature,
    'EXECUTE'
  )::text as actual,
  not has_function_privilege(
    target_roles.role_name,
    target_functions.function_signature,
    'EXECUTE'
  ) as pass
from target_functions
cross join target_roles
order by target_functions.function_signature, target_roles.role_name;
