-- SOLO LECTURA. Ejecutar primero en Supabase Web SQL Editor.
select 'table' as kind, item, to_regclass(item) is not null as present from (values
 ('public.club_memberships'),('public.club_players'),('public.club_user_invites'),
 ('public.club_team_audit'),('storage.objects'),('storage.buckets')) v(item)
union all
select 'function', item, to_regprocedure(item) is not null from (values
 ('public.approve_player_membership_atomic(uuid)'),('public.is_club_admin(uuid)'),
 ('public.is_club_owner(uuid)'),('public.has_club_capability(uuid,text)')) v(item);

select enumlabel as club_role from pg_enum e join pg_type t on t.oid=e.enumtypid
where t.typnamespace='public'::regnamespace and t.typname='club_role' order by e.enumsortorder;

select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
from pg_policies where (schemaname='public' and tablename in ('club_memberships','club_players','clubs'))
or (schemaname='storage' and tablename='objects') order by schemaname,tablename,policyname;

select n.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) arguments,
 p.prosecdef as security_definer,p.proconfig as settings,pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('is_club_admin','is_club_owner','has_club_capability');

select routine_name,grantee,privilege_type from information_schema.routine_privileges
where routine_schema='public' and routine_name in ('is_club_admin','is_club_owner','has_club_capability')
order by routine_name,grantee;

select tgname,pg_get_triggerdef(oid) definition from pg_trigger
where tgrelid='public.club_memberships'::regclass and not tgisinternal order by tgname;

select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('club-logos','club-rules');
