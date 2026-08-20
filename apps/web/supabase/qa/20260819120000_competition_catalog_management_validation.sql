begin;
create or replace function pg_temp.run_competition_catalog_management_qa() returns table(result text) language plpgsql as $$
declare owner_id uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); player_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid(); v_club_id uuid:=gen_random_uuid(); other_club uuid:=gen_random_uuid(); season_id uuid; branch_id uuid; segment_id uuid; category_id uuid; unused_category_id uuid; token text:=replace(gen_random_uuid()::text,'-','');
begin
  if to_regprocedure('public.manage_competition_catalog_entry(uuid,text,text,uuid,text,text,text,integer,text)') is null then return query select 'FAIL | migration missing'; return; end if;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    (owner_id,'authenticated','authenticated','qa.catalog.owner.'||token||'@example.invalid',now(),'{}','{}',now(),now()),(admin_id,'authenticated','authenticated','qa.catalog.admin.'||token||'@example.invalid',now(),'{}','{}',now(),now()),(player_id,'authenticated','authenticated','qa.catalog.player.'||token||'@example.invalid',now(),'{}','{}',now(),now()),(outsider_id,'authenticated','authenticated','qa.catalog.outsider.'||token||'@example.invalid',now(),'{}','{}',now(),now());
  insert into public.profiles(user_id,id,email,display_name) select id,id,email,'QA catalog' from auth.users where id in(owner_id,admin_id,player_id,outsider_id) on conflict do nothing;
  insert into public.clubs(id,name,slug,is_active,status,owner_user_id,approved_at,approved_by) values (v_club_id,'QA Catalog '||token,'qa-catalog-'||token,true,'ACTIVE',owner_id,now(),owner_id),(other_club,'QA Catalog Other '||token,'qa-catalog-other-'||token,true,'ACTIVE',outsider_id,now(),outsider_id);
  insert into public.club_memberships(club_id,user_id,role,status,approved_by,approved_at) values (v_club_id,owner_id,'OWNER','APPROVED',owner_id,now()),(v_club_id,admin_id,'ADMIN','APPROVED',owner_id,now()),(v_club_id,player_id,'PLAYER','APPROVED',owner_id,now()),(other_club,outsider_id,'OWNER','APPROVED',outsider_id,now());
  insert into public.competition_seasons(club_id,name,starts_on,ends_on,status,created_by) values(v_club_id,'QA 2026',date '2026-01-01',date '2026-12-31','ACTIVE',owner_id) returning id into season_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true); perform set_config('request.jwt.claim.role','authenticated',true); perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true); set local role authenticated;
  if not public.has_club_capability(v_club_id,'ranking:manage') then raise exception 'owner fixture lacks ranking:manage'; end if;
  branch_id:=(public.manage_competition_catalog_entry(v_club_id,'branch','CREATE',null,'Mixto QA','mixto-'||token,null,1,'MIXED')->>'id')::uuid;
  segment_id:=(public.manage_competition_catalog_entry(v_club_id,'segment','CREATE',null,'Libres QA','libres-'||token,null,1,'DEFAULT')->>'id')::uuid;
  category_id:=(public.manage_competition_catalog_entry(v_club_id,'category','CREATE',null,'8ª QA','8a-'||token,'8ª',1,'DEFAULT')->>'id')::uuid;
  unused_category_id:=(public.manage_competition_catalog_entry(v_club_id,'category','CREATE',null,'7ª QA','7a-'||token,'7ª',2,'DEFAULT')->>'id')::uuid;
  perform public.manage_competition_catalog_entry(v_club_id,'category','DEACTIVATE',unused_category_id);
  perform public.manage_competition_catalog_entry(v_club_id,'category','ACTIVATE',unused_category_id);
  if not (public.manage_competition_catalog_entry(v_club_id,'category','ACTIVATE',unused_category_id)->>'is_active')::boolean then raise exception 'reactivation failed'; end if;
  begin perform public.manage_competition_catalog_entry(v_club_id,'category','CREATE',null,'8ª QA','8a-'||token,'8ª',1,'DEFAULT'); raise exception 'duplicate accepted'; exception when unique_violation then null; end;
  perform public.ensure_competition_division(v_club_id,season_id,'PAIRS',branch_id,segment_id,category_id);
  begin perform public.manage_competition_catalog_entry(v_club_id,'category','DEACTIVATE',category_id); raise exception 'used category deactivated'; exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',admin_id::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  if not public.has_club_capability(v_club_id,'ranking:manage') then raise exception 'admin fixture lacks ranking:manage'; end if;
  perform public.manage_competition_catalog_entry(v_club_id,'segment','CREATE',null,'Veteranos QA','veteranos-'||token,null,2,'DEFAULT');
  begin perform public.manage_competition_catalog_entry(other_club,'branch','ACTIVATE',branch_id); raise exception 'cross club accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',player_id::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',player_id,'role','authenticated')::text,true); begin perform public.manage_competition_catalog_entry(v_club_id,'branch','CREATE',null,'Blocked','blocked-'||token,null,2,'DEFAULT'); raise exception 'player accepted'; exception when insufficient_privilege then null; end;
  reset role; if not exists(select 1 from public.competition_divisions d where d.club_id=v_club_id and d.modality='PAIRS') then raise exception 'pairs division missing'; end if;
  return query select 'PASS | catalog management: owner/admin, duplicate, activate/deactivate, protected use, player, tenant and rollback';
exception when others then reset role; return query select 'FAIL | '||sqlerrm;
end $$;
select * from pg_temp.run_competition_catalog_management_qa();
rollback;
