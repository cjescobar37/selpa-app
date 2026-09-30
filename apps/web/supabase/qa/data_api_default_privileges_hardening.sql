-- QA for 20260928_data_api_default_privileges_hardening.sql.
-- Sections 1-7 are read-only. Rows with a pass column must report true.

-- 1. postgres global function default ACL: no built-in PUBLIC EXECUTE.
with global_function_default as (
  select coalesce(
    default_acl.defaclacl,
    pg_catalog.acldefault('f'::"char", to_regrole('postgres')::oid)
  ) as acl
  from (values (true)) seed(present)
  left join pg_catalog.pg_default_acl default_acl
    on default_acl.defaclrole = to_regrole('postgres')::oid
   and default_acl.defaclnamespace = 0
   and default_acl.defaclobjtype = 'f'
), public_execute as (
  select exists (
    select 1
    from global_function_default
    cross join lateral pg_catalog.aclexplode(global_function_default.acl) privilege
    where privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) as enabled
)
select
  'postgres global default ACL' as check_group,
  'functions:PUBLIC EXECUTE' as object_name,
  'false' as expected,
  public_execute.enabled::text as actual,
  not public_execute.enabled as pass
from public_execute;

-- 2. postgres/public schema defaults: no automatic Data API privileges.
with object_types(object_name, object_type) as (
  values
    ('tables', 'r'::"char"),
    ('functions', 'f'::"char"),
    ('sequences', 'S'::"char")
), target_roles(role_name, role_oid) as (
  values
    ('PUBLIC', 0::oid),
    ('anon', to_regrole('anon')::oid),
    ('authenticated', to_regrole('authenticated')::oid),
    ('service_role', to_regrole('service_role')::oid)
), defaults as (
  select
    object_types.object_name,
    coalesce(
      default_acl.defaclacl,
      pg_catalog.acldefault(object_types.object_type, to_regrole('postgres')::oid)
    ) as acl
  from object_types
  left join pg_catalog.pg_default_acl default_acl
    on default_acl.defaclrole = to_regrole('postgres')::oid
   and default_acl.defaclnamespace = 'public'::regnamespace
   and default_acl.defaclobjtype = object_types.object_type
)
select
  'postgres/public default ACL' as check_group,
  defaults.object_name || ':' || target_roles.role_name as object_name,
  'no privileges' as expected,
  coalesce(actual.privileges, array[]::text[])::text as actual,
  coalesce(actual.privileges, array[]::text[]) = array[]::text[] as pass
from defaults
cross join target_roles
left join lateral (
  select array_agg(privilege.privilege_type order by privilege.privilege_type) as privileges
  from pg_catalog.aclexplode(defaults.acl) privilege
  where privilege.grantee = target_roles.role_oid
) actual on true
order by defaults.object_name, target_roles.role_name;

-- 3. Existing-object ACL fingerprint. Capture this result immediately before
-- applying the migration and compare it with the result immediately after.
-- All digests must be identical because ALTER DEFAULT PRIVILEGES is not
-- retroactive.
with existing_acl_objects(object_type, object_name, acl) as (
  select
    case when relation.relkind = 'S' then 'sequence' else 'relation' end,
    relation.oid::regclass::text,
    coalesce(relation.relacl::text, '<default>')
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  union all
  select
    'function',
    routine.oid::regprocedure::text,
    coalesce(routine.proacl::text, '<default>')
  from pg_catalog.pg_proc routine
  join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
)
select
  'existing object ACL fingerprint' as check_group,
  object_type,
  count(*) as object_count,
  md5(string_agg(object_name || '=' || acl, '|' order by object_name)) as acl_digest
from existing_acl_objects
group by object_type
order by object_type;

-- 4. Block 1 remains in force for its hardened tables.
with hardened_tables(table_name) as (
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
  'Block 1 RLS' as check_group,
  hardened_tables.table_name as object_name,
  'enabled' as expected,
  case when relation.relrowsecurity then 'enabled' else 'disabled' end as actual,
  relation.relrowsecurity as pass
from hardened_tables
left join pg_catalog.pg_class relation
  on relation.oid = to_regclass(format('public.%I', hardened_tables.table_name))
order by hardened_tables.table_name;

-- 5. Block 2 remains in force: exactly one anonymous SECURITY DEFINER RPC.
with anonymous_definers as (
  select p.oid::regprocedure::text as function_signature
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
)
select
  'Block 2 anonymous SECURITY DEFINER' as check_group,
  'anonymous executable set' as object_name,
  '{get_public_club_profile(uuid)}' as expected,
  coalesce(array_agg(function_signature order by function_signature), array[]::text[])::text as actual,
  coalesce(array_agg(function_signature order by function_signature), array[]::text[])
    = array['get_public_club_profile(uuid)']::text[] as pass
from anonymous_definers;

-- 6. Block 2 search_path hardening remains in force.
with mutable_functions as (
  select p.oid::regprocedure::text as function_signature
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) setting
      where setting like 'search_path=%'
    )
)
select
  'Block 2 function search_path' as check_group,
  'mutable public functions' as object_name,
  '0' as expected,
  count(*)::text as actual,
  count(*) = 0 as pass
from mutable_functions;

-- 7. Existing intentional ACL contracts remain available.
select
  'existing ACL contract' as check_group,
  'get_public_club_profile(uuid):anon EXECUTE' as object_name,
  'true' as expected,
  has_function_privilege(
    'anon',
    'public.get_public_club_profile(uuid)',
    'EXECUTE'
  )::text as actual,
  has_function_privilege(
    'anon',
    'public.get_public_club_profile(uuid)',
    'EXECUTE'
  ) as pass
union all
select
  'existing ACL contract',
  'categories:authenticated SELECT',
  'true',
  has_table_privilege('authenticated', 'public.categories', 'SELECT')::text,
  has_table_privilege('authenticated', 'public.categories', 'SELECT');

-- 8. Rollback-safe new-object proof. This section performs transactional DDL
-- only; it never leaves QA objects or changes existing object ACLs.
begin;

create table public.__selpa_default_acl_qa_table (
  id bigint primary key
);

create sequence public.__selpa_default_acl_qa_sequence;

create function public.__selpa_default_acl_qa_function()
returns integer
language sql
as 'select 1';

with target_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
), privileges(privilege_name) as (
  values
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
select
  'new table default deny' as check_group,
  target_roles.role_name || ':' || privileges.privilege_name as object_name,
  'false' as expected,
  has_table_privilege(
    target_roles.role_name,
    'public.__selpa_default_acl_qa_table',
    privileges.privilege_name
  )::text as actual,
  not has_table_privilege(
    target_roles.role_name,
    'public.__selpa_default_acl_qa_table',
    privileges.privilege_name
  ) as pass
from target_roles
cross join privileges
order by target_roles.role_name, privileges.privilege_name;

with target_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
), privileges(privilege_name) as (
  values ('USAGE'), ('SELECT'), ('UPDATE')
)
select
  'new sequence default deny' as check_group,
  target_roles.role_name || ':' || privileges.privilege_name as object_name,
  'false' as expected,
  has_sequence_privilege(
    target_roles.role_name,
    'public.__selpa_default_acl_qa_sequence',
    privileges.privilege_name
  )::text as actual,
  not has_sequence_privilege(
    target_roles.role_name,
    'public.__selpa_default_acl_qa_sequence',
    privileges.privilege_name
  ) as pass
from target_roles
cross join privileges
order by target_roles.role_name, privileges.privilege_name;

with target_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
)
select
  'new function default deny' as check_group,
  target_roles.role_name || ':EXECUTE' as object_name,
  'false' as expected,
  has_function_privilege(
    target_roles.role_name,
    'public.__selpa_default_acl_qa_function()',
    'EXECUTE'
  )::text as actual,
  not has_function_privilege(
    target_roles.role_name,
    'public.__selpa_default_acl_qa_function()',
    'EXECUTE'
  ) as pass
from target_roles
order by target_roles.role_name;

rollback;
