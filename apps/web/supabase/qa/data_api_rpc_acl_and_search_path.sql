-- Read-only QA for 20260924_data_api_rpc_acl_and_search_path.sql.
-- Every row must report pass = true.

with audited(function_signature, classification) as (
  values
    ('public.add_competition_event_homologation_evidence(uuid,uuid,integer,text,text,text,text,text,jsonb)', 'AUTHENTICATED_ONLY'),
    ('public.approve_competition_event_homologation(uuid,uuid,integer,text)', 'AUTHENTICATED_ONLY'),
    ('public.approve_competition_event_settlement(uuid,uuid,integer,text)', 'AUTHENTICATED_ONLY'),
    ('public.create_competition_event_homologation_correction(uuid,uuid,integer,text,text)', 'AUTHENTICATED_ONLY'),
    ('public.create_competition_event_homologation_draft(uuid,uuid,text)', 'AUTHENTICATED_ONLY'),
    ('public.extract_competition_event_homologation_results(uuid,uuid,integer,text)', 'AUTHENTICATED_ONLY'),
    ('public.get_competition_event_homologation_preflight(uuid,uuid)', 'AUTHENTICATED_ONLY'),
    ('public.get_public_club_profile(uuid)', 'KEEP_ANON'),
    ('public.handle_new_auth_user()', 'TRIGGER_INTERNAL'),
    ('public.is_club_member_approved(uuid)', 'AUTHENTICATED_ONLY'),
    ('public.is_platform_admin()', 'AUTHENTICATED_ONLY'),
    ('public.publish_competition_event_settlement(uuid,uuid,integer,text)', 'AUTHENTICATED_ONLY'),
    ('public.publish_tournament_atomic(uuid,uuid)', 'AUTHENTICATED_ONLY'),
    ('public.record_club_ad_event(uuid,text,text,text)', 'SERVER_ONLY'),
    ('public.reject_competition_event_homologation(uuid,uuid,integer,text,text)', 'AUTHENTICATED_ONLY'),
    ('public.search_club_players(uuid,text,integer)', 'AUTHENTICATED_ONLY'),
    ('public.submit_competition_event_homologation(uuid,uuid,integer,text)', 'AUTHENTICATED_ONLY'),
    ('public.submit_competition_event_settlement(uuid,uuid,integer,text)', 'AUTHENTICATED_ONLY'),
    ('public.supersede_competition_event_homologation(uuid,uuid,integer,text,text)', 'AUTHENTICATED_ONLY'),
    ('public.sync_club_player_operational_approval()', 'TRIGGER_INTERNAL'),
    ('public.tg_club_venue_validate()', 'TRIGGER_INTERNAL'),
    ('public.tg_mark_tournament_running_from_result()', 'TRIGGER_INTERNAL'),
    ('public.tg_tournament_venue_assignment_integrity()', 'TRIGGER_INTERNAL'),
    ('public.validate_tournament_seed_snapshot_ranking_scope()', 'TRIGGER_INTERNAL')
), roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
), expected as (
  select
    audited.function_signature,
    audited.classification,
    roles.role_name,
    case
      when audited.classification = 'KEEP_ANON' then true
      when audited.classification = 'AUTHENTICATED_ONLY' and roles.role_name in ('authenticated', 'service_role') then true
      when audited.classification = 'SERVER_ONLY' and roles.role_name = 'service_role' then true
      else false
    end as expected_execute
  from audited
  cross join roles
)
select
  'rpc execute' as check_group,
  expected.function_signature || ':' || expected.role_name as object_name,
  expected.expected_execute::text as expected,
  coalesce(has_function_privilege(expected.role_name, to_regprocedure(expected.function_signature), 'EXECUTE'), false)::text as actual,
  to_regprocedure(expected.function_signature) is not null
    and coalesce(has_function_privilege(expected.role_name, to_regprocedure(expected.function_signature), 'EXECUTE'), false) = expected.expected_execute as pass
from expected
order by expected.function_signature, expected.role_name;

with expected(trigger_name, table_schema, table_name, function_name) as (
  values
    ('on_auth_user_created', 'auth', 'users', 'handle_new_auth_user'),
    ('club_memberships_sync_player_operational_approval', 'public', 'club_memberships', 'sync_club_player_operational_approval'),
    ('trg_club_venues_validate', 'public', 'club_venues', 'tg_club_venue_validate'),
    ('tournament_matches_mark_running', 'public', 'tournament_matches', 'tg_mark_tournament_running_from_result'),
    ('trg_tournament_court_assignment_integrity', 'public', 'tournament_court_assignments', 'tg_tournament_venue_assignment_integrity'),
    ('trg_tournament_seed_snapshot_ranking_scope', 'public', 'tournament_team_seed_snapshots', 'validate_tournament_seed_snapshot_ranking_scope'),
    ('club_requests_set_updated_at', 'public', 'club_requests', 'tg_set_updated_at'),
    ('trg_club_players_updated_at', 'public', 'club_players', 'set_updated_at'),
    ('trg_platform_ads_updated_at', 'public', 'platform_ad_campaigns', 'set_updated_at_platform_content'),
    ('trg_profiles_sync_id', 'public', 'profiles', 'profiles_sync_ids'),
    ('trg_sync_tournament_deadlines', 'public', 'tournaments', 'tg_sync_tournament_deadlines'),
    ('trg_tournaments_sync_legacy', 'public', 'tournaments', 'tg_tournaments_sync_legacy')
), actual as (
  select
    trigger.tgname as trigger_name,
    table_namespace.nspname as table_schema,
    relation.relname as table_name,
    procedure.proname as function_name
  from pg_catalog.pg_trigger trigger
  join pg_catalog.pg_class relation on relation.oid = trigger.tgrelid
  join pg_catalog.pg_namespace table_namespace on table_namespace.oid = relation.relnamespace
  join pg_catalog.pg_proc procedure on procedure.oid = trigger.tgfoid
  where not trigger.tgisinternal
)
select
  'trigger binding' as check_group,
  expected.trigger_name as object_name,
  expected.table_schema || '.' || expected.table_name || ' -> public.' || expected.function_name as expected,
  coalesce(actual.table_schema || '.' || actual.table_name || ' -> public.' || actual.function_name, 'missing') as actual,
  actual.trigger_name is not null
    and actual.table_schema = expected.table_schema
    and actual.table_name = expected.table_name
    and actual.function_name = expected.function_name as pass
from expected
left join actual using (trigger_name)
order by expected.trigger_name;

with expected(function_signature) as (
  values
    ('public.tg_set_updated_at()'),
    ('public.handle_new_user()'),
    ('public.set_updated_at_platform_content()'),
    ('public.touch_updated_at()'),
    ('public.set_updated_at()'),
    ('public.profiles_sync_id()'),
    ('public.tg_sync_tournament_deadlines()'),
    ('public.profiles_sync_ids()'),
    ('public.tg_tournaments_sync_legacy()')
)
select
  'search_path' as check_group,
  expected.function_signature as object_name,
  'search_path=pg_catalog' as expected,
  coalesce(array_to_string(procedure.proconfig, ','), 'missing') as actual,
  procedure.oid is not null
    and coalesce(array_to_string(procedure.proconfig, ','), '') = 'search_path=pg_catalog' as pass
from expected
left join pg_catalog.pg_proc procedure
  on procedure.oid = to_regprocedure(expected.function_signature)
order by expected.function_signature;

with helpers(function_signature) as (
  values
    ('public.tg_set_updated_at()'),
    ('public.handle_new_user()'),
    ('public.set_updated_at_platform_content()'),
    ('public.touch_updated_at()'),
    ('public.set_updated_at()'),
    ('public.profiles_sync_id()'),
    ('public.tg_sync_tournament_deadlines()'),
    ('public.profiles_sync_ids()'),
    ('public.tg_tournaments_sync_legacy()')
), roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
)
select
  'helper execute' as check_group,
  helpers.function_signature || ':' || roles.role_name as object_name,
  'false' as expected,
  coalesce(has_function_privilege(roles.role_name, to_regprocedure(helpers.function_signature), 'EXECUTE'), false)::text as actual,
  to_regprocedure(helpers.function_signature) is not null
    and not coalesce(has_function_privilege(roles.role_name, to_regprocedure(helpers.function_signature), 'EXECUTE'), false) as pass
from helpers
cross join roles
order by helpers.function_signature, roles.role_name;

with definition as (
  select pg_get_functiondef(to_regprocedure('public.search_club_players(uuid,text,integer)')) as body
)
select
  'search_club_players static' as check_group,
  check_name as object_name,
  'true' as expected,
  passed::text as actual,
  passed as pass
from definition
cross join lateral (values
  ('requires auth.uid()', body ~* 'auth\.uid\(\)'),
  ('reuses canonical is_club_player', body ~* 'public\.is_club_player'),
  ('scopes requested club', body ~* 'player\.club_id = p_club_id'),
  ('requires PLAYER role', body ~* 'membership\.role = ''PLAYER'''),
  ('requires approved membership', body ~* 'membership\.status = ''APPROVED'''),
  ('requires approved player', body ~* 'player\.approved_at is not null'),
  ('requires active player', body ~* 'player\.operational_status = ''ACTIVE'''),
  ('requires active profile', body ~* 'profile\.status = ''ACTIVE'''),
  ('caps limit at 20', body ~* 'least\(coalesce\(p_limit, 20\), 20\)'),
  ('requires query length 2', body ~* 'char_length\(input\.query\) >= 2'),
  ('email compatibility value is null', body ~* 'null::text as email'),
  ('does not select profile email', body !~* 'profile\.email')
) checks(check_name, passed)
order by check_name;
