begin;

create or replace function pg_temp.run_competition_backfill_stage25_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_club uuid;
  v_other_club uuid;
  v_owner uuid;
  v_admin uuid;
  v_player_a uuid;
  v_player_b uuid;
  v_year integer := 2196;
  v_init record;
  v_init_again record;
  v_season uuid;
  v_branch uuid;
  v_category uuid;
  v_division uuid;
  v_other_division uuid;
  v_other_season uuid;
  v_other_branch uuid;
  v_other_category uuid;
  v_pairs uuid;
  v_batch uuid;
  v_item uuid;
  v_pending uuid;
  v_entry uuid;
  v_before_gender text;
  v_before_category integer;
  v_before_points numeric;
  v_count bigint;
  v_failed boolean;
begin
  if to_regclass('public.competition_backfill_batches') is null
     or to_regprocedure('public.initialize_club_competition_season(uuid,integer,text,boolean)') is null
     or to_regprocedure('public.ensure_competition_division(uuid,uuid,text,uuid,uuid,uuid,text)') is null
     or to_regprocedure('public.execute_competition_backfill_batch(uuid)') is null then
    return query select 'FAIL','QA no ejecutable: primero aplicá 20260802_competition_backfill_stage25.sql'; return;
  end if;

  select membership.club_id,membership.user_id into v_club,v_owner
  from public.club_memberships membership
  where membership.role='OWNER' and membership.status='APPROVED' and membership.approved_at is not null
    and (select count(*) from public.club_players player where player.club_id=membership.club_id
         and upper(btrim(player.gender))='M' and player.category between 1 and 7)>=2
  order by membership.created_at limit 1;
  select club.id into v_other_club from public.clubs club where club.id<>v_club order by club.created_at limit 1;
  select player.id into v_player_a from public.club_players player
  where player.club_id=v_club and upper(btrim(player.gender))='M' and player.category between 1 and 7
  order by player.created_at limit 1;
  select player.id into v_player_b from public.club_players player
  where player.club_id=v_club and player.id<>v_player_a and upper(btrim(player.gender))='M' and player.category between 1 and 7
  order by player.created_at limit 1;
  select auth_user.id into v_admin from auth.users auth_user
  where auth_user.id<>v_owner
    and not exists(select 1 from public.club_memberships membership where membership.club_id=v_club and membership.user_id=auth_user.id)
    and not exists(select 1 from public.platform_admins platform_admin where platform_admin.user_id=auth_user.id)
  order by auth_user.created_at limit 1;
  if v_club is null or v_other_club is null or v_owner is null or v_admin is null or v_player_a is null or v_player_b is null then
    return query select 'FAIL','QA no ejecutable: se requieren OWNER, dos clubes, dos jugadores y un usuario adicional'; return;
  end if;

  select player.gender,player.category,
    case when (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$' then (to_jsonb(player)->>'ranking_points')::numeric end
  into v_before_gender,v_before_category,v_before_points from public.club_players player where player.id=v_player_a;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  select * into v_init from public.initialize_club_competition_season(v_club,v_year,'PADEL_TRADITIONAL',false);
  select * into v_init_again from public.initialize_club_competition_season(v_club,v_year,'PADEL_TRADITIONAL',false);
  if v_init.season_id<>v_init_again.season_id then raise exception 'inicialización no idempotente'; end if;
  if v_init.divisions_created<>0 or exists(select 1 from public.competition_divisions division where division.season_id=v_init.season_id) then raise exception 'se crearon divisiones sin solicitarlas'; end if;
  if v_init.branch_count<3 or v_init.segment_count<3 or v_init.category_count<7 then raise exception 'catálogos mínimos incompletos'; end if;
  v_season:=v_init.season_id;
  reset role;
  update public.competition_seasons season set status='CLOSED' where season.club_id=v_club and season.status='ACTIVE';
  update public.competition_seasons season set status='ACTIVE' where season.id=v_season;
  if (select count(*) from public.competition_seasons season where season.club_id=v_club and season.status='ACTIVE')<>1 then raise exception 'se creó una segunda ACTIVE'; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true); set local role authenticated;
  select * into v_init from public.initialize_club_competition_season(v_club,v_year,'PADEL_TRADITIONAL',true);
  if v_init.divisions_created<>7 then raise exception 'no creó exactamente siete divisiones legacy'; end if;
  if exists(select 1 from public.competition_divisions division where division.season_id=v_season and (division.modality<>'INDIVIDUAL' or division.segment_id is not null)) then raise exception 'creó producto cartesiano o modalidad indebida'; end if;
  select branch.id into v_branch from public.competition_branches branch where branch.club_id=v_club and branch.slug='caballeros';
  select category.id into v_category from public.competition_categories category where category.club_id=v_club and category.legacy_category_id=v_before_category;
  select division.id into v_division from public.competition_divisions division where division.season_id=v_season and division.branch_id=v_branch and division.category_id=v_category and division.segment_id is null;
  if (public.ensure_competition_division(v_club,v_season,'INDIVIDUAL',v_branch,null,v_category)).id<>v_division then raise exception 'ensure_competition_division no fue idempotente'; end if;

  select diagnostic.diagnostic_status into strict qa_status from public.get_competition_backfill_diagnostic(v_club,v_season) diagnostic where diagnostic.club_player_id=v_player_a;
  if qa_status<>'READY' then raise exception 'diagnóstico READY incorrecto: %',qa_status; end if;
  update public.competition_categories category set is_active=false where category.id=v_category;
  select diagnostic.diagnostic_status into strict qa_status from public.get_competition_backfill_diagnostic(v_club,v_season) diagnostic where diagnostic.club_player_id=v_player_a;
  if qa_status<>'MISSING_CATEGORY' then raise exception 'MISSING_CATEGORY incorrecto'; end if;
  update public.competition_categories category set is_active=true where category.id=v_category;
  update public.competition_branches branch set is_active=false where branch.id=v_branch;
  select diagnostic.diagnostic_status into strict qa_status from public.get_competition_backfill_diagnostic(v_club,v_season) diagnostic where diagnostic.club_player_id=v_player_a;
  if qa_status<>'MISSING_BRANCH' then raise exception 'MISSING_BRANCH incorrecto'; end if;
  update public.competition_branches branch set is_active=true where branch.id=v_branch;
  update public.competition_divisions division set is_active=false where division.id=v_division;
  select diagnostic.diagnostic_status into strict qa_status from public.get_competition_backfill_diagnostic(v_club,v_season) diagnostic where diagnostic.club_player_id=v_player_a;
  if qa_status<>'MISSING_DIVISION' then raise exception 'MISSING_DIVISION incorrecto'; end if;
  update public.competition_divisions division set is_active=true where division.id=v_division;

  v_batch:=(public.create_competition_backfill_batch(v_club,v_season)->>'batch_id')::uuid;
  if v_batch is null then raise exception 'no creó lote DRAFT'; end if;
  if (public.create_competition_backfill_batch(v_club,v_season)->>'batch_id')::uuid<>v_batch then raise exception 'duplicó lote abierto'; end if;
  if not exists(select 1 from public.competition_backfill_batch_items item where item.batch_id=v_batch and item.club_player_id=v_player_a and item.decision='APPROVED') then raise exception 'READY no quedó APPROVED'; end if;
  if (select count(distinct item.club_player_id) from public.competition_backfill_batch_items item where item.batch_id=v_batch)<>(select count(*) from public.competition_backfill_batch_items item where item.batch_id=v_batch) then raise exception 'identidad no usa club_player_id'; end if;

  v_failed:=false;
  begin
    update public.competition_backfill_batch_items item
    set decision='PENDING',proposed_division_id=null
    where item.batch_id=v_batch and item.club_player_id=v_player_b;
  exception when insufficient_privilege then
    v_failed:=true;
  end;
  if not v_failed then raise exception 'authenticated obtuvo escritura directa sobre items'; end if;

  reset role;
  update public.competition_backfill_batch_items item
  set decision='PENDING',proposed_division_id=null
  where item.batch_id=v_batch and item.club_player_id=v_player_b
  returning item.id into v_pending;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  set local role authenticated;
  v_failed:=false; begin perform public.approve_competition_backfill_batch(v_batch); exception when others then v_failed:=true; end;
  if not v_failed then raise exception 'aprobó lote con PENDING'; end if;
  perform public.review_competition_backfill_item(v_pending,'APPROVED',v_division,'QA manual');

  reset role;
  insert into public.competition_seasons(club_id,name,starts_on,ends_on,status,created_by)
  values(v_other_club,'QA 2196',make_date(v_year,1,1),make_date(v_year,12,31),'DRAFT',v_owner)
  on conflict(club_id,name) do update set name=excluded.name returning id into v_other_season;
  insert into public.competition_branches(club_id,name,slug) values(v_other_club,'QA rama','qa-stage25-rama')
  on conflict(club_id,slug) do update set name=excluded.name returning id into v_other_branch;
  insert into public.competition_categories(club_id,name,short_label,slug,legacy_category_id)
  values(v_other_club,'QA 5ª','5ª','qa-stage25-5a',5)
  on conflict(club_id,slug) do update set name=excluded.name returning id into v_other_category;
  insert into public.competition_divisions(club_id,season_id,modality,branch_id,category_id)
  values(v_other_club,v_other_season,'INDIVIDUAL',v_other_branch,v_other_category)
  on conflict(season_id,modality,branch_id,segment_id,category_id) do update set is_active=true returning id into v_other_division;
  insert into public.competition_divisions(club_id,season_id,modality,branch_id,category_id)
  values(v_club,v_season,'PAIRS',v_branch,v_category) returning id into v_pairs;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); set local role authenticated;
  v_failed:=false; begin perform public.review_competition_backfill_item(v_pending,'APPROVED',v_other_division); exception when others then v_failed:=true; end;
  if not v_failed then raise exception 'permitió división de otro club'; end if;
  v_failed:=false; begin perform public.review_competition_backfill_item(v_pending,'APPROVED',v_pairs); exception when others then v_failed:=true; end;
  if not v_failed then raise exception 'permitió división PAIRS'; end if;
  for v_item in select item.id from public.competition_backfill_batch_items item
    where item.batch_id=v_batch and item.decision='PENDING'
  loop
    perform public.review_competition_backfill_item(v_item,'SKIPPED',null,'QA resolución automática');
  end loop;
  perform public.approve_competition_backfill_batch(v_batch,'QA aprobado');
  perform public.execute_competition_backfill_batch(v_batch);
  if not exists(select 1 from public.competition_backfill_batch_items item join public.competition_player_entries entry on entry.id=item.executed_entry_id where item.batch_id=v_batch and item.decision='EXECUTED' and entry.assignment_type='LEGACY_BACKFILL') then raise exception 'no ejecutó mediante asignación canónica'; end if;
  if (public.execute_competition_backfill_batch(v_batch)).status<>'EXECUTED' then raise exception 'doble ejecución no idempotente'; end if;
  select diagnostic.diagnostic_status into strict qa_status from public.get_competition_backfill_diagnostic(v_club,v_season) diagnostic where diagnostic.club_player_id=v_player_a;
  if qa_status<>'ALREADY_ASSIGNED' then raise exception 'ALREADY_ASSIGNED incorrecto'; end if;

  select item.executed_entry_id into v_entry from public.competition_backfill_batch_items item
  where item.batch_id=v_batch and item.club_player_id=v_player_a and item.decision='EXECUTED';
  perform public.set_competition_player_entry_status(v_entry,'WITHDRAWN','QA rollback',now());
  reset role;

  v_failed:=false; begin delete from public.competition_backfill_batches batch where batch.id=v_batch; exception when check_violation then v_failed:=true; end;
  if not v_failed then raise exception 'permitió borrar lote EXECUTED'; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true); set local role authenticated;
  v_batch:=(public.create_competition_backfill_batch(v_club,v_season)->>'batch_id')::uuid;
  for v_item in select item.id from public.competition_backfill_batch_items item where item.batch_id=v_batch and item.decision='PENDING' loop
    perform public.review_competition_backfill_item(v_item,'SKIPPED',null,'QA resolución');
  end loop;
  perform public.approve_competition_backfill_batch(v_batch,'QA rollback');
  select item.id,item.proposed_division_id into v_item,v_division from public.competition_backfill_batch_items item
  where item.batch_id=v_batch and item.decision='APPROVED' limit 1;
  if v_item is null then raise exception 'QA no ejecutable: falta item APPROVED para validar rollback'; end if;
  reset role;
  update public.competition_divisions division set is_active=false where division.id=v_division;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); set local role authenticated;
  v_failed:=false; begin perform public.execute_competition_backfill_batch(v_batch); exception when others then v_failed:=true; end;
  if not v_failed then raise exception 'la ejecución con error no falló'; end if;
  reset role;
  if (select batch.status from public.competition_backfill_batches batch where batch.id=v_batch)<>'APPROVED'
     or exists(select 1 from public.competition_backfill_batch_items item where item.batch_id=v_batch and item.decision='EXECUTED') then
    raise exception 'el error no produjo rollback total';
  end if;

  if (select player.gender from public.club_players player where player.id=v_player_a) is distinct from v_before_gender
     or (select player.category from public.club_players player where player.id=v_player_a) is distinct from v_before_category then raise exception 'la ejecución alteró campos legacy'; end if;
  if (select case when (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$' then (to_jsonb(player)->>'ranking_points')::numeric end from public.club_players player where player.id=v_player_a) is distinct from v_before_points then raise exception 'ranking_points cambió'; end if;

  perform set_config('request.jwt.claim.sub',v_admin::text,true); set local role authenticated;
  select count(*) into v_count from public.competition_backfill_batches batch where batch.club_id=v_club;
  if v_count<>0 then raise exception 'RLS expuso lotes a usuario sin permisos'; end if;
  v_failed:=false; begin perform public.create_competition_backfill_batch(v_club,v_season); exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception 'usuario sin permisos pudo operar'; end if;
  reset role;

  insert into public.club_memberships(club_id,user_id,role,status,approved_by,approved_at) values(v_club,v_admin,'ADMIN','APPROVED',v_owner,now());
  perform set_config('request.jwt.claim.sub',v_admin::text,true); set local role authenticated;
  perform public.get_competition_backfill_diagnostic(v_club,v_season); reset role;

  set local role anon;
  v_failed:=false;
  begin select count(*) into v_count from public.competition_backfill_batches batch where batch.club_id=v_club;
  exception when insufficient_privilege then v_failed:=true;
  end;
  if not v_failed and v_count<>0 then raise exception 'anon accedió a lotes'; end if;
  reset role;

  return query select 'PASS','Etapa 2.5 válida: inicialización, diagnóstico y backfill controlado';
exception when others then
  reset role;
  return query select 'FAIL',sqlerrm;
end;
$$;

select qa.qa_status||' | '||qa.qa_detail as result
from pg_temp.run_competition_backfill_stage25_qa() qa;

rollback;
