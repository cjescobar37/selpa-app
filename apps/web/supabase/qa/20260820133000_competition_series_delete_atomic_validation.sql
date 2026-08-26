begin;

-- Run as the Supabase SQL Editor role. Every fixture is local to this
-- transaction and the final ROLLBACK leaves no users, clubs or circuits behind.
do $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_owner uuid := gen_random_uuid();
  v_player uuid := gen_random_uuid();
  v_other_owner uuid := gen_random_uuid();
  v_club uuid := gen_random_uuid();
  v_other_club uuid := gen_random_uuid();
  v_season uuid;
  v_empty public.competition_series%rowtype;
  v_protected public.competition_series%rowtype;
  v_closed public.competition_series%rowtype;
  v_event uuid;
  v_definition text;
begin
  if to_regprocedure('public.delete_competition_series_draft_atomic(uuid,uuid,integer,text)') is null then
    raise exception 'FAIL | delete RPC missing';
  end if;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (v_owner,'authenticated','authenticated','qa.series.delete.owner.'||v_token||'@example.invalid',now(),'{}','{}',now(),now()),
    (v_player,'authenticated','authenticated','qa.series.delete.player.'||v_token||'@example.invalid',now(),'{}','{}',now(),now()),
    (v_other_owner,'authenticated','authenticated','qa.series.delete.other.'||v_token||'@example.invalid',now(),'{}','{}',now(),now());
  insert into public.profiles(user_id,id,email,display_name)
  select id,id,email,'QA delete series' from auth.users where id in (v_owner,v_player,v_other_owner)
  on conflict(user_id) do nothing;
  insert into public.clubs(id,name,slug,is_active,status,owner_user_id,approved_at,approved_by) values
    (v_club,'QA delete series A','qa-delete-series-a-'||v_token,true,'ACTIVE',v_owner,now(),v_owner),
    (v_other_club,'QA delete series B','qa-delete-series-b-'||v_token,true,'ACTIVE',v_other_owner,now(),v_other_owner);
  insert into public.club_memberships(club_id,user_id,role,status,approved_by,approved_at) values
    (v_club,v_owner,'OWNER','APPROVED',v_owner,now()),
    (v_club,v_player,'PLAYER','APPROVED',v_owner,now()),
    (v_other_club,v_other_owner,'OWNER','APPROVED',v_other_owner,now());
  insert into public.competition_seasons(club_id,name,starts_on,ends_on,status,created_by)
  values(v_club,'QA delete season',current_date,current_date+365,'DRAFT',v_owner) returning id into v_season;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  set local role authenticated;
  select * into v_empty from public.create_competition_series(v_club,v_season,'QA empty '||v_token);
  begin
    perform public.delete_competition_series_draft_atomic(v_club,v_empty.id,v_empty.revision,'ACEPTA');
    raise exception 'FAIL | confirmation accepted incorrectly';
  exception when sqlstate '22023' then null;
  end;
  perform public.delete_competition_series_draft_atomic(v_club,v_empty.id,v_empty.revision,'ACEPTAR');
  if exists(select 1 from public.competition_series where id=v_empty.id) then
    raise exception 'FAIL | empty DRAFT was not deleted';
  end if;

  -- Event is the mandatory parent of Event Division, Tournament Link,
  -- Homologation and Settlement. The event guard blocks that complete branch.
  select * into v_protected from public.create_competition_series(v_club,v_season,'QA protected '||v_token);
  reset role;
  perform set_config('selpa.competition_event_write','allowed',true);
  insert into public.competition_series_events(club_id,series_id,season_id,name,sequence,created_by)
  values(v_club,v_protected.id,v_season,'QA protected event',10,v_owner) returning id into v_event;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  set local role authenticated;
  begin
    perform public.delete_competition_series_draft_atomic(v_club,v_protected.id,v_protected.revision,'ACEPTAR');
    raise exception 'FAIL | DRAFT with Event was deleted';
  exception when sqlstate 'P0001' then null;
  end;

  select * into v_closed from public.create_competition_series(v_club,v_season,'QA closed '||v_token);
  reset role;
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set status='CLOSED',closed_by=v_owner,closed_at=now() where id=v_closed.id;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  set local role authenticated;
  select * into v_closed from public.competition_series where id=v_closed.id;
  begin
    perform public.delete_competition_series_draft_atomic(v_club,v_closed.id,v_closed.revision,'ACEPTAR');
    raise exception 'FAIL | non-DRAFT was deleted';
  exception when sqlstate 'P0001' then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub',v_player::text,true);
  set local role authenticated;
  begin
    perform public.delete_competition_series_draft_atomic(v_club,v_protected.id,v_protected.revision,'ACEPTAR');
    raise exception 'FAIL | PLAYER deleted a circuit';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub',v_other_owner::text,true);
  set local role authenticated;
  begin
    perform public.delete_competition_series_draft_atomic(v_club,v_protected.id,v_protected.revision,'ACEPTAR');
    raise exception 'FAIL | cross-club owner deleted a circuit';
  exception when insufficient_privilege then null;
  end;

  reset role;
  select pg_get_functiondef('public.delete_competition_series_draft_atomic(uuid,uuid,integer,text)'::regprocedure) into v_definition;
  if v_definition not like '%competition_series_events%'
     or v_definition not like '%competition_series_event_tournament_links%'
     or v_definition not like '%competition_series_event_divisions%'
     or v_definition not like '%competition_event_homologations%'
     or v_definition not like '%competition_event_settlements%'
     or v_definition not like '%competition_point_transactions%'
     or v_definition not like '%for update%'
     or v_definition not like '%require_competition_series_access%' then
    raise exception 'FAIL | protected dependency or authorization guard missing';
  end if;
  if not exists(select 1 from public.competition_series_events where id=v_event and series_id=v_protected.id) then
    raise exception 'FAIL | protected event fixture changed unexpectedly';
  end if;
  raise notice 'PASS | empty DRAFT delete, exact confirmation, lifecycle, event/history guard, PLAYER and cross-club';
end;
$$;

rollback;
