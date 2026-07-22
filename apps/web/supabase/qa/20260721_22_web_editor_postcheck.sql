-- SOLO LECTURA. Ejecutar después de ambas migraciones.
select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
 has_function_privilege('service_role',p.oid,'execute') service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
 'is_club_owner','is_club_admin','has_club_capability','change_club_staff_role_atomic',
 'remove_club_staff_atomic','transfer_club_ownership_atomic','accept_club_staff_invite_atomic') order by p.proname;

select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check from pg_policies
where (schemaname='public' and tablename in ('club_players','club_team_audit'))
or (schemaname='storage' and tablename='objects' and policyname like 'club_%')
order by schemaname,tablename,policyname;

select tgname,pg_get_triggerdef(oid) definition from pg_trigger
where tgrelid='public.club_memberships'::regclass and not tgisinternal order by tgname;

select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('club-logos','club-rules');

select policyname,count(*) from pg_policies where
 (schemaname='public' and tablename in ('club_players','club_team_audit')) or
 (schemaname='storage' and tablename='objects' and policyname like 'club_%')
group by policyname having count(*) > 1;

select 'legacy club_players self write' finding,exists(select 1 from pg_policies where schemaname='public'
 and tablename='club_players' and policyname in ('club_players_insert_self','club_players_update_self')) present;
