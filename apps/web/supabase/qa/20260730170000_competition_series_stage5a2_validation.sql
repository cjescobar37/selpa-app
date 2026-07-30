begin;

create or replace function pg_temp.run_competition_series_stage5a2_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid:=gen_random_uuid(); v_admin uuid:=gen_random_uuid(); v_operator uuid:=gen_random_uuid();
  v_plan uuid:=gen_random_uuid(); v_player uuid:=gen_random_uuid(); v_outsider uuid:=gen_random_uuid();
  v_club uuid:=gen_random_uuid(); v_other_club uuid:=gen_random_uuid(); v_season uuid; v_other_season uuid;
  v_branch uuid; v_other_branch uuid; v_category uuid; v_division uuid; v_other_division uuid;
  v_scheme uuid; v_global_scheme uuid; v_other_scheme uuid; v_age uuid;
  v_series public.competition_series%rowtype; v_series_two public.competition_series%rowtype;
  v_cancelled public.competition_series%rowtype; v_link public.competition_series_divisions%rowtype; v_link_id uuid;
  v_rule public.competition_series_rules%rowtype; v_rule1 uuid; v_rule2 uuid; v_rule3 uuid; v_rule4 uuid;
  v_eligibility public.competition_series_eligibility%rowtype; v_token text:=replace(gen_random_uuid()::text,'-','');
  v_count integer; v_revision integer; v_old_link uuid;
begin
  if to_regclass('public.competition_series') is null
     or to_regclass('public.competition_series_divisions') is null
     or to_regclass('public.competition_series_rules') is null
     or to_regclass('public.competition_series_eligibility') is null
     or to_regprocedure('public.create_competition_series(uuid,uuid,text)') is null
     or to_regprocedure('public.activate_competition_series(uuid,uuid,integer,boolean)') is null then
    return query select 'FAIL','QA no ejecutable: primero aplicá 20260730170000_competition_series_stage5a2.sql'; return;
  end if;
  if to_regprocedure('public.create_competition_series_rule_version(uuid,uuid,integer,uuid,uuid,uuid)') is null
     or to_regprocedure('public.set_competition_series_eligibility(uuid,uuid,integer,uuid,integer,jsonb)') is null then
    return query select 'FAIL','QA no ejecutable: primero aplicá 20260730190000_competition_series_revision_contract_fix.sql'; return;
  end if;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    select actor.id,'authenticated','authenticated','qa.stage5a2.'||v_token||'.'||actor.label||'@example.invalid',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('display_name','QA '||actor.label),now(),now()
    from (values(v_owner,'owner'),(v_admin,'admin'),(v_operator,'operator'),(v_plan,'plan'),(v_player,'player'),(v_outsider,'outsider')) actor(id,label);

  insert into public.profiles(user_id,id,email,display_name)
  select u.id,u.id,u.email,coalesce(u.raw_user_meta_data->>'display_name','QA Stage 5A.2') from auth.users u
  where u.id=any(array[v_owner,v_admin,v_operator,v_plan,v_player,v_outsider]) on conflict(user_id) do nothing;

  insert into public.clubs(id,name,slug,is_active,status,owner_user_id,approved_at,approved_by) values
    (v_club,'QA Series A '||v_token,'qa-series-a-'||v_token,true,'ACTIVE',v_owner,now(),v_owner),
    (v_other_club,'QA Series B '||v_token,'qa-series-b-'||v_token,true,'ACTIVE',v_outsider,now(),v_outsider);
  insert into public.club_memberships(club_id,user_id,role,status,approved_by,approved_at) values
    (v_club,v_owner,'OWNER','APPROVED',v_owner,now()),(v_club,v_admin,'ADMIN','APPROVED',v_owner,now()),
    (v_club,v_operator,'OPERADOR','APPROVED',v_owner,now()),(v_club,v_plan,'PLANILLERO','APPROVED',v_owner,now()),
    (v_club,v_player,'PLAYER','APPROVED',v_owner,now()),(v_other_club,v_outsider,'OWNER','APPROVED',v_outsider,now());

  insert into public.competition_seasons(club_id,name,starts_on,ends_on,status,created_by)
    values(v_club,'QA Season '||v_token,current_date,current_date+365,'DRAFT',v_owner) returning id into v_season;
  insert into public.competition_seasons(club_id,name,starts_on,ends_on,status,created_by)
    values(v_other_club,'QA Other Season '||v_token,current_date,current_date+365,'DRAFT',v_outsider) returning id into v_other_season;
  insert into public.competition_branches(club_id,name,slug) values(v_club,'Caballeros','qa-cab-'||v_token) returning id into v_branch;
  insert into public.competition_branches(club_id,name,slug) values(v_other_club,'Damas','qa-dam-'||v_token) returning id into v_other_branch;
  insert into public.competition_categories(club_id,name,short_label,slug) values(v_club,'6ª','6ª','qa-6-'||v_token) returning id into v_category;
  insert into public.competition_divisions(club_id,season_id,modality,branch_id,category_id) values(v_club,v_season,'INDIVIDUAL',v_branch,v_category) returning id into v_division;
  insert into public.competition_divisions(club_id,season_id,modality,branch_id) values(v_other_club,v_other_season,'INDIVIDUAL',v_other_branch) returning id into v_other_division;
  insert into public.points_schemes(club_id,name,is_global,is_active,created_by) values(v_club,'QA Own '||v_token,false,true,v_owner) returning id into v_scheme;
  insert into public.points_schemes(club_id,name,is_global,is_active,created_by) values(null,'QA Global '||v_token,true,true,v_owner) returning id into v_global_scheme;
  insert into public.points_schemes(club_id,name,is_global,is_active,created_by) values(v_other_club,'QA Other '||v_token,false,true,v_outsider) returning id into v_other_scheme;
  insert into public.competition_age_categories(club_id,name,code,min_age,age_reference_rule,created_by)
    values(v_club,'+35','QA35'||v_token,35,'CALENDAR_YEAR_END',v_owner) returning id into v_age;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);perform set_config('request.jwt.claim.role','authenticated',true);set local role authenticated;

  begin
    insert into public.competition_series(club_id,season_id,name,created_by) values(v_club,v_season,'QA direct write',v_owner);
    raise exception 'authenticated obtuvo INSERT directo';
  exception when insufficient_privilege then null; end;
  select * into v_series from public.create_competition_series(v_club,v_season,'QA Progressive Draft');
  if v_series.status<>'DRAFT' or v_series.code is not null or v_series.starts_on is not null or v_series.ends_on is not null then raise exception 'DRAFT mínimo no es progresivo'; end if;
  begin perform public.schedule_competition_series(v_club,v_series.id,v_series.revision);raise exception 'SCHEDULED aceptó configuración incompleta';exception when check_violation then null;end;

  select * into v_series from public.update_competition_series_draft(v_club,v_series.id,v_series.revision,'QA Progressive Draft',' qa_series ',null,current_date,current_date+60,4,2,false);
  if v_series.code<>'QA_SERIES' then raise exception 'el código no fue normalizado';end if;
  begin perform public.update_competition_series_draft(v_club,v_series.id,v_series.revision,'QA fuera','QA_SERIES',null,current_date-1,current_date+60,4,2,false);raise exception 'aceptó fechas fuera de temporada';exception when check_violation then null;end;
  select * into v_series_two from public.create_competition_series(v_club,v_season,'QA Collision');
  begin perform public.update_competition_series_draft(v_club,v_series_two.id,v_series_two.revision,'QA Collision','qa_series',null,current_date,current_date+10,null,null,false);raise exception 'aceptó código duplicado';exception when unique_violation then null;end;
  begin perform public.add_competition_series_division(v_club,v_series.id,v_other_division,0,v_series.revision);raise exception 'aceptó división cross-club';exception when check_violation then null;end;

  select * into v_link from public.add_competition_series_division(v_club,v_series.id,v_division,10,v_series.revision);v_link_id:=v_link.id;
  select revision into v_revision from public.competition_series where id=v_series.id;
  select * into v_link from public.remove_competition_series_division(v_club,v_link.id,v_revision);v_old_link:=v_link.id;
  select revision into v_revision from public.competition_series where id=v_series.id;
  select * into v_link from public.add_competition_series_division(v_club,v_series.id,v_division,10,v_revision);
  if v_link.id<>v_old_link or not v_link.is_active then raise exception 'la reactivación insertó otra fila';end if;
  select * into v_series from public.competition_series where id=v_series.id;

  begin perform public.create_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_link.id,v_other_scheme,null);raise exception 'aceptó esquema ajeno';exception when check_violation then null;end;
  select * into v_rule from public.create_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_link.id,v_global_scheme,null);v_rule1:=v_rule.id;
  select * into v_series from public.competition_series where id=v_series.id;
  select * into v_eligibility from public.set_competition_series_eligibility(v_club,v_series.id,v_series.revision,v_rule.id,null,jsonb_build_object('requires_active_entry',true,'allow_invited_players',false,'invited_points_policy','REQUIRE_ENTRY','require_same_division_pair',true,'age_category_id',v_age,'additional_rules','{}'::jsonb));
  select * into v_series from public.competition_series where id=v_series.id;
  select * into v_rule from public.update_competition_series_rule_draft(v_club,v_series.id,v_series.revision,v_rule.id,v_rule.revision,jsonb_build_object('tie_breakers',jsonb_build_array(jsonb_build_object('criterion','TOURNAMENT_WINS','params','{}'::jsonb),jsonb_build_object('criterion','ADMIN_DECISION','params','{}'::jsonb))));
  select * into v_series from public.competition_series where id=v_series.id;
  begin perform public.update_competition_series_rule_draft(v_club,v_series.id,v_series.revision,v_rule.id,v_rule.revision,jsonb_build_object('tie_breakers',jsonb_build_array(jsonb_build_object('criterion','ADMIN_DECISION','params','{}'::jsonb),jsonb_build_object('criterion','FINALS','params','{}'::jsonb))));raise exception 'aceptó ADMIN_DECISION fuera del final';exception when check_violation then null;end;
  select * into v_rule from public.activate_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_rule.id,v_rule.revision);
  select * into v_series from public.competition_series where id=v_series.id;
  begin perform public.update_competition_series_rule_draft(v_club,v_series.id,v_series.revision,v_rule.id,v_rule.revision,'{}'::jsonb);raise exception 'editó regla ACTIVE';exception when check_violation then null;end;

  select * into v_rule from public.create_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_link.id,v_scheme,v_rule1);v_rule2:=v_rule.id;
  select * into v_series from public.competition_series where id=v_series.id;
  if not exists(select 1 from public.competition_series_eligibility e where e.series_rule_id=v_rule2 and e.age_category_id=v_age) then raise exception 'no clonó elegibilidad';end if;
  select * into v_rule from public.activate_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_rule2,v_rule.revision);
  select * into v_series from public.competition_series where id=v_series.id;
  select * into v_rule from public.create_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_link.id,v_scheme,v_rule2);v_rule3:=v_rule.id;
  select * into v_series from public.competition_series where id=v_series.id;
  select * into v_rule from public.activate_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_rule3,v_rule.revision);
  select * into v_series from public.competition_series where id=v_series.id;
  if (select count(*) from public.competition_series_rules r where r.series_division_id=v_link.id and r.status='ACTIVE')<>1
     or (select array_agg(version order by version) from public.competition_series_rules where series_division_id=v_link.id)<>array[1,2,3] then raise exception 'versionado 1/2/3 inválido';end if;

  select * into v_series from public.competition_series where id=v_series.id;
  select * into v_series from public.schedule_competition_series(v_club,v_series.id,v_series.revision);

  select * into v_rule from public.create_competition_series_rule_version(v_club,v_series.id,v_series.revision,v_link.id,v_scheme,v_rule3);v_rule4:=v_rule.id;
  select * into v_series from public.competition_series where id=v_series.id;
  begin perform public.activate_competition_series(v_club,v_series.id,v_series.revision,true);raise exception 'ACTIVE aceptó una versión DRAFT pendiente';exception when check_violation then null;end;
  if exists(select 1 from public.competition_series_divisions d where d.series_id=v_series.id and (d.frozen_at is not null or d.division_snapshot is not null))
     or exists(select 1 from public.competition_series_rules r where r.series_division_id=v_link.id and r.frozen_at is not null)
     or (select s.status from public.competition_series s where s.id=v_series.id)<>'SCHEDULED' then raise exception 'ACTIVE fallida dejó cambios parciales';end if;
  perform public.delete_competition_series_rule_draft(v_club,v_series.id,v_series.revision,v_rule4,v_rule.revision);
  select * into v_series from public.competition_series where id=v_series.id;
  if (public.schedule_competition_series(v_club,v_series.id,v_series.revision)).id<>v_series.id then raise exception 'SCHEDULE no idempotente';end if;
  select * into v_series from public.return_competition_series_to_draft(v_club,v_series.id,v_series.revision);
  select * into v_series from public.schedule_competition_series(v_club,v_series.id,v_series.revision);

  reset role;perform set_config('request.jwt.claim.sub',v_operator::text,true);set local role authenticated;
  begin perform public.activate_competition_series(v_club,v_series.id,v_series.revision,true);raise exception 'OPERADOR activó circuito';exception when insufficient_privilege then null;end;
  reset role;perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  select * into v_series from public.activate_competition_series(v_club,v_series.id,v_series.revision,true);
  select * into v_eligibility from public.competition_series_eligibility where series_rule_id=v_rule3;
  if not exists(select 1 from public.competition_series_divisions d where d.id=v_link_id and d.frozen_at is not null and d.division_snapshot ?& array['season_id','division_id','modality','branch_id','segment_id','category_id'] and d.division_snapshot->'segment_id'='null'::jsonb)
     or not exists(select 1 from public.competition_series_rules r where r.id=v_rule3 and r.frozen_at is not null)
     or not exists(select 1 from public.competition_series_eligibility e where e.series_rule_id=v_rule3 and e.frozen_at is not null) then raise exception 'congelamiento incompleto';end if;
  begin perform public.update_competition_series_rule_draft(v_club,v_series.id,v_series.revision,v_rule3,v_rule.revision,'{}'::jsonb);raise exception 'regla frozen modificable';exception when check_violation then null;end;
  begin perform public.set_competition_series_eligibility(v_club,v_series.id,v_series.revision,v_rule3,v_eligibility.revision,'{}'::jsonb);raise exception 'elegibilidad frozen modificable';exception when check_violation then null;end;
  begin perform public.remove_competition_series_division(v_club,v_link_id,v_series.revision);raise exception 'modificó estructura ACTIVE';exception when check_violation then null;end;
  begin perform public.close_competition_series(v_club,v_series.id,v_series.revision-1);raise exception 'aceptó revisión obsoleta';exception when serialization_failure then null;end;
  select * into v_series from public.close_competition_series(v_club,v_series.id,v_series.revision);

  select * into v_cancelled from public.create_competition_series(v_club,v_season,'QA Cancelled');
  select * into v_cancelled from public.cancel_competition_series(v_club,v_cancelled.id,v_cancelled.revision,'QA cancellation');
  select * into v_cancelled from public.archive_competition_series(v_club,v_cancelled.id,v_cancelled.revision);
  if v_cancelled.status<>'CANCELLED' or v_cancelled.archived_at is null then raise exception 'archivado no fue ortogonal';end if;

  if not public.has_club_capability(v_club,'competition:view') or not public.has_club_capability(v_club,'competition:manage') then raise exception 'OWNER sin capabilities';end if;
  reset role;perform set_config('request.jwt.claim.sub',v_admin::text,true);set local role authenticated;
  if not public.has_club_capability(v_club,'competition:manage') then raise exception 'ADMIN sin manage';end if;
  reset role;perform set_config('request.jwt.claim.sub',v_operator::text,true);set local role authenticated;
  if not public.has_club_capability(v_club,'competition:manage') then raise exception 'OPERADOR sin manage';end if;
  reset role;perform set_config('request.jwt.claim.sub',v_plan::text,true);set local role authenticated;
  if not public.has_club_capability(v_club,'competition:view') or public.has_club_capability(v_club,'competition:manage') then raise exception 'matriz PLANILLERO inválida';end if;
  perform count(*) from public.competition_series s where s.club_id=v_club;
  reset role;perform set_config('request.jwt.claim.sub',v_player::text,true);set local role authenticated;
  if public.has_club_capability(v_club,'competition:view') then raise exception 'PLAYER obtuvo lectura';end if;
  select count(*) into v_count from public.competition_series s where s.club_id=v_club;if v_count<>0 then raise exception 'RLS expuso series a PLAYER';end if;
  reset role;perform set_config('request.jwt.claim.sub',v_outsider::text,true);set local role authenticated;
  select count(*) into v_count from public.competition_series s where s.club_id=v_club;if v_count<>0 then raise exception 'RLS cross-club vulnerado';end if;

  reset role;
  return query select 'PASS','Stage 5A.2 válido: DRAFT progresivo, tenant scope, versionado, elegibilidad, lifecycle, snapshots, RLS, roles e idempotencia';
exception when others then
  reset role;
  return query select 'FAIL',sqlerrm;
end;
$$;

select qa_status||' | '||qa_detail as result from pg_temp.run_competition_series_stage5a2_qa();
rollback;
