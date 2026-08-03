begin;

create or replace function pg_temp.run_competition_series_events_stage5a3_qa()
returns table(qa_status text,qa_detail text)
language plpgsql
as $$
declare
  v_users uuid[]; v_owner uuid; v_admin uuid; v_operator uuid; v_plan uuid; v_player uuid;
  v_club_a uuid:=gen_random_uuid(); v_club_b uuid:=gen_random_uuid();
  v_season_a uuid:=gen_random_uuid(); v_season_ax uuid:=gen_random_uuid(); v_season_b uuid:=gen_random_uuid(); v_branch_a uuid:=gen_random_uuid(); v_branch_b uuid:=gen_random_uuid();
  v_category_a uuid:=gen_random_uuid(); v_category_b uuid:=gen_random_uuid(); v_comp_div_a1 uuid:=gen_random_uuid(); v_comp_div_a2 uuid:=gen_random_uuid(); v_comp_div_ax uuid:=gen_random_uuid(); v_comp_div_b uuid:=gen_random_uuid();
  v_series_a uuid:=gen_random_uuid(); v_series_ac uuid:=gen_random_uuid(); v_series_b uuid:=gen_random_uuid(); v_sd_a1 uuid:=gen_random_uuid(); v_sd_a2 uuid:=gen_random_uuid(); v_sd_ax uuid:=gen_random_uuid(); v_sd_ac uuid:=gen_random_uuid(); v_sd_b uuid:=gen_random_uuid();
  v_scheme_a uuid:=gen_random_uuid(); v_scheme_inactive uuid:=gen_random_uuid(); v_scheme_b uuid:=gen_random_uuid(); v_rule_a1 uuid:=gen_random_uuid(); v_rule_a1_v2 uuid:=gen_random_uuid(); v_rule_a2 uuid:=gen_random_uuid(); v_rule_ax uuid:=gen_random_uuid(); v_rule_b uuid:=gen_random_uuid();
  v_tier_a uuid:=gen_random_uuid(); v_tier_inactive uuid:=gen_random_uuid(); v_tier_b uuid:=gen_random_uuid(); v_event_a uuid; v_event_b uuid; v_event_c uuid; v_event_club_b uuid; v_ed_a1 uuid; v_ed_a2 uuid; v_ed_c1 uuid; v_ed_c2 uuid;
  v_revision integer; v_previous_revision integer; v_result jsonb; v_retry jsonb; v_count integer; v_before jsonb; v_link uuid; v_tournament_category smallint; v_tournament_a uuid:=gen_random_uuid(); v_tournament_a2 uuid:=gen_random_uuid(); v_tournament_b uuid:=gen_random_uuid(); v_column text; v_sql text; v_table text;
begin
  if to_regprocedure('public.transition_competition_series_event(uuid,uuid,integer,text,text,jsonb)') is null then
    return query select 'FAIL','QA no ejecutable: falta aplicar 20260731120000_competition_series_events_stage5a3.sql'; return;
  end if;
  select array_agg(candidate.user_id order by candidate.user_id) into v_users from (
    select u.id user_id from auth.users u where u.email is not null and not exists(select 1 from public.platform_admins pa where pa.user_id=u.id) order by u.id limit 5
  ) candidate;
  if coalesce(array_length(v_users,1),0)<5 then return query select 'FAIL','QA no ejecutable: se requieren cinco usuarios auth reales; todos los demás fixtures se autogeneran y se revierten'; return; end if;
  v_owner:=v_users[1];v_admin:=v_users[2];v_operator:=v_users[3];v_plan:=v_users[4];v_player:=v_users[5];

  insert into public.clubs(id,name,slug,is_active,status) values
    (v_club_a,'QA Stage 5A3 A','qa-stage5a3-'||replace(v_club_a::text,'-',''),true,'ACTIVE'),
    (v_club_b,'QA Stage 5A3 B','qa-stage5a3-'||replace(v_club_b::text,'-',''),true,'ACTIVE');
  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by) values
    (v_club_a,v_owner,'OWNER','APPROVED',now(),v_owner),(v_club_a,v_admin,'ADMIN','APPROVED',now(),v_owner),
    (v_club_a,v_operator,'OPERADOR','APPROVED',now(),v_owner),(v_club_a,v_plan,'PLANILLERO','APPROVED',now(),v_owner),
    (v_club_a,v_player,'PLAYER','APPROVED',now(),v_owner),(v_club_b,v_player,'OWNER','APPROVED',now(),v_player);
  insert into public.competition_seasons(id,club_id,name,starts_on,ends_on,status,created_by) values
    (v_season_a,v_club_a,'QA 2027 A','2027-01-01','2027-12-31','ACTIVE',v_owner),(v_season_ax,v_club_a,'QA 2028 A','2028-01-01','2028-12-31','DRAFT',v_owner),(v_season_b,v_club_b,'QA 2027 B','2027-01-01','2027-12-31','ACTIVE',v_player);
  insert into public.competition_branches(id,club_id,name,slug) values(v_branch_a,v_club_a,'QA A','qa-a'),(v_branch_b,v_club_b,'QA B','qa-b');
  insert into public.competition_categories(id,club_id,name,short_label,slug) values(v_category_a,v_club_a,'QA A','QA','qa-a'),(v_category_b,v_club_b,'QA B','QB','qa-b');
  insert into public.competition_divisions(id,club_id,season_id,modality,branch_id,category_id) values
    (v_comp_div_a1,v_club_a,v_season_a,'INDIVIDUAL',v_branch_a,v_category_a),(v_comp_div_a2,v_club_a,v_season_a,'PAIRS',v_branch_a,v_category_a),(v_comp_div_ax,v_club_a,v_season_ax,'INDIVIDUAL',v_branch_a,v_category_a),(v_comp_div_b,v_club_b,v_season_b,'INDIVIDUAL',v_branch_b,v_category_b);
  insert into public.points_schemes(id,club_id,name,is_global,is_active,created_by) values(v_scheme_a,v_club_a,'QA Scheme A',false,true,v_owner),(v_scheme_inactive,v_club_a,'QA Scheme Inactive',false,false,v_owner),(v_scheme_b,v_club_b,'QA Scheme B',false,true,v_player);
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series(id,club_id,season_id,name,status,planned_events_count,created_by,activated_by,activated_at) values
    (v_series_a,v_club_a,v_season_a,'QA Series A','ACTIVE',2,v_owner,v_owner,now()),(v_series_ac,v_club_a,v_season_a,'QA Series A Other','ACTIVE',1,v_owner,v_owner,now()),(v_series_b,v_club_b,v_season_b,'QA Series B','ACTIVE',1,v_player,v_player,now());
  insert into public.competition_series_divisions(id,club_id,series_id,division_id,division_snapshot,frozen_at,created_by) values
    (v_sd_a1,v_club_a,v_series_a,v_comp_div_a1,jsonb_build_object('division_id',v_comp_div_a1,'division_name','QA A','modality','INDIVIDUAL','branch_id',v_branch_a,'branch_name','QA A','segment_id',null,'segment_name',null,'category_id',v_category_a,'category_name','QA A','season_id',v_season_a,'season_name','QA 2027 A'),now(),v_owner),
    (v_sd_a2,v_club_a,v_series_a,v_comp_div_a2,jsonb_build_object('division_id',v_comp_div_a2,'division_name','QA A','modality','PAIRS','branch_id',v_branch_a,'branch_name','QA A','segment_id',null,'segment_name',null,'category_id',v_category_a,'category_name','QA A','season_id',v_season_a,'season_name','QA 2027 A'),now(),v_owner),
    (v_sd_ax,v_club_a,v_series_a,v_comp_div_ax,jsonb_build_object('division_id',v_comp_div_ax,'division_name','QA A','modality','INDIVIDUAL','branch_id',v_branch_a,'branch_name','QA A','segment_id',null,'segment_name',null,'category_id',v_category_a,'category_name','QA A','season_id',v_season_ax,'season_name','QA 2028 A'),now(),v_owner),
    (v_sd_ac,v_club_a,v_series_ac,v_comp_div_a1,jsonb_build_object('division_id',v_comp_div_a1,'division_name','QA A','modality','INDIVIDUAL','branch_id',v_branch_a,'branch_name','QA A','segment_id',null,'segment_name',null,'category_id',v_category_a,'category_name','QA A','season_id',v_season_a,'season_name','QA 2027 A'),now(),v_owner),
    (v_sd_b,v_club_b,v_series_b,v_comp_div_b,jsonb_build_object('division_id',v_comp_div_b,'division_name','QA B','modality','INDIVIDUAL','branch_id',v_branch_b,'branch_name','QA B','segment_id',null,'segment_name',null,'category_id',v_category_b,'category_name','QA B','season_id',v_season_b,'season_name','QA 2027 B'),now(),v_player);
  insert into public.competition_series_rules(id,club_id,series_division_id,version,status,points_scheme_id,frozen_at,created_by) values
    (v_rule_a1,v_club_a,v_sd_a1,1,'ACTIVE',v_scheme_a,now(),v_owner),(v_rule_a2,v_club_a,v_sd_a2,1,'ACTIVE',v_scheme_a,now(),v_owner),(v_rule_ax,v_club_a,v_sd_ax,1,'ACTIVE',v_scheme_a,now(),v_owner),(v_rule_b,v_club_b,v_sd_b,1,'ACTIVE',v_scheme_b,now(),v_player);
  insert into public.competition_series_eligibility(club_id,series_rule_id,frozen_at,created_by) values(v_club_a,v_rule_a1,now(),v_owner),(v_club_a,v_rule_a2,now(),v_owner),(v_club_a,v_rule_ax,now(),v_owner),(v_club_b,v_rule_b,now(),v_player);
  insert into public.competition_event_tiers(id,club_id,name,code,points_multiplier,is_active,created_by) values(v_tier_a,v_club_a,'QA Tier A','QA-A',1,true,v_owner),(v_tier_inactive,v_club_a,'QA Tier Inactive','QA-I',1,false,v_owner),(v_tier_b,v_club_b,'QA Tier B','QA-B',1,true,v_player);
  select candidate.id::smallint into v_tournament_category
  from generate_series(32000,32767) candidate(id)
  where not exists(select 1 from public.categories category where category.id=candidate.id)
  order by candidate.id limit 1;
  if v_tournament_category is null then raise exception 'QA no ejecutable: no existe ID reservado disponible para categoría temporal';end if;
  insert into public.categories(id,name) values(v_tournament_category,'QA Stage 5A3 '||v_tournament_category::text);
  insert into public.tournaments(id,club_id,name,type,start_date,status,category_id,category,category_rule,fixed_category_id,category_sum_target,gender,tournament_type) values
    (v_tournament_a,v_club_a,'QA Tournament A','OPEN',current_date,'DRAFT',v_tournament_category,6,'FIXED_CATEGORY',v_tournament_category,null,'MALE','OPEN'),
    (v_tournament_a2,v_club_a,'QA Tournament A2','OPEN',current_date,'DRAFT',v_tournament_category,6,'FIXED_CATEGORY',v_tournament_category,null,'MALE','OPEN'),
    (v_tournament_b,v_club_b,'QA Tournament B','OPEN',current_date,'DRAFT',v_tournament_category,6,'FIXED_CATEGORY',v_tournament_category,null,'MALE','OPEN');

  perform set_config('request.jwt.claim.sub',v_player::text,true);perform set_config('request.jwt.claim.role','authenticated',true);set local role authenticated;
  select e.id into v_event_club_b from public.create_competition_series_event(v_club_b,v_series_b,'QA Event Club B') e;
  reset role;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);perform set_config('request.jwt.claim.role','authenticated',true);set local role authenticated;
  begin
    reset role;perform set_config('selpa.competition_series_write','allowed',true);update public.competition_series set status='DRAFT' where id=v_series_a;
    perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
    perform public.create_competition_series_event(v_club_a,v_series_a,'QA rejected DRAFT series');
    raise exception 'Serie DRAFT permitió crear evento';
  exception when check_violation then null;end;
  reset role;perform set_config('selpa.competition_series_write','allowed',true);update public.competition_series set status='SCHEDULED' where id=v_series_a;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  perform public.create_competition_series_event(v_club_a,v_series_a,'QA Event Prepared');
  reset role;perform set_config('selpa.competition_series_write','allowed',true);update public.competition_series set status='ACTIVE' where id=v_series_a;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  select e.id,e.revision into v_event_a,v_revision from public.create_competition_series_event(v_club_a,v_series_a,'QA Event A') e;
  v_previous_revision:=v_revision;
  perform public.update_competition_series_event_draft(v_club_a,v_event_a,v_revision,jsonb_build_object('planned_starts_at',(now()+interval '7 day')::text,'planned_ends_at',(now()+interval '8 day')::text,'timezone','America/Argentina/Buenos_Aires'));
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_a;
  if v_revision<>v_previous_revision+1 then raise exception 'Update event no incrementó +1';end if;
  perform public.update_competition_series_event_draft(v_club_a,v_event_a,v_revision,jsonb_build_object('planned_starts_at',(now()+interval '7 day')::text,'planned_ends_at',(now()+interval '8 day')::text,'timezone','America/Argentina/Buenos_Aires'));
  if (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Update no-op incrementó revisión';end if;
  begin perform public.update_competition_series_event_draft(v_club_a,v_event_a,v_previous_revision,jsonb_build_object('name','stale'));raise exception 'Update stale aceptado';exception when serialization_failure then null;end;
  begin perform public.add_competition_series_event_division(v_club_a,v_event_a,v_sd_ax,5,v_revision);raise exception 'Competition division cross-season aceptada';exception when check_violation then null;end;
  begin perform public.add_competition_series_event_division(v_club_a,v_event_a,v_sd_ac,5,v_revision);raise exception 'Series division cross-series aceptada';exception when no_data_found then null;end;
  select d.id into v_ed_a1 from public.add_competition_series_event_division(v_club_a,v_event_a,v_sd_a1,10,v_revision) d;
  begin reset role;perform set_config('selpa.competition_event_write','allowed',true);update public.competition_series_event_divisions set series_rule_id=v_rule_a2 where id=v_ed_a1;raise exception 'Regla cross-division aceptada';exception when check_violation then null;end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_a;
  if v_revision<>v_previous_revision+2 then raise exception 'Add division no incrementó +1';end if;
  begin perform public.add_competition_series_event_division(v_club_a,v_event_a,v_sd_a2,20,v_previous_revision);raise exception 'Add division stale aceptado';exception when serialization_failure then null;end;
  perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'NON_SCORING',null,null,null);
  v_previous_revision:=v_revision;
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_a;
  if v_revision<>v_previous_revision+1 then raise exception 'Configure no incrementó +1';end if;
  perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'NON_SCORING',null,null,null);
  if (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Configure no-op incrementó revisión';end if;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_previous_revision,'NON_SCORING',null,null,null);raise exception 'Configure stale aceptado';exception when serialization_failure then null;end;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'NON_SCORING',v_tier_a,null,null);raise exception 'NON_SCORING con tier aceptado';exception when check_violation then null;end;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'NON_SCORING',null,v_scheme_a,null);raise exception 'NON_SCORING con scheme aceptado';exception when check_violation then null;end;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'NON_SCORING',null,null,2);raise exception 'NON_SCORING con multiplier aceptado';exception when check_violation then null;end;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'POINTS',null,v_scheme_a,null);raise exception 'POINTS sin tier aceptado';exception when check_violation then null;end;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'POINTS',v_tier_inactive,v_scheme_a,null);raise exception 'Tier inactivo aceptado';exception when check_violation then null;end;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'POINTS',v_tier_a,v_scheme_inactive,null);raise exception 'Scheme inactivo aceptado';exception when check_violation then null;end;
  begin perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a1,v_revision,'POINTS',v_tier_a,v_scheme_a,0);raise exception 'Multiplier cero aceptado';exception when check_violation then null;end;
  select d.id into v_ed_a2 from public.add_competition_series_event_division(v_club_a,v_event_a,v_sd_a2,20,v_revision) d;
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_a;
  -- Una división todavía sin scoring bloquea scheduling y no deja snapshots parciales.
  begin
    perform public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'SCHEDULE','qa-invalid-schedule-0001','{}');
    raise exception 'Scheduling incompleto aceptado';
  exception when check_violation then null; end;
  if exists(select 1 from public.competition_series_event_divisions d where d.event_id=v_event_a and (d.status<>'DRAFT' or d.frozen_at is not null or d.configuration_snapshot is not null)) then raise exception 'Rollback de scheduling dejó snapshots parciales'; end if;
  if exists(select 1 from public.competition_series_event_commands c where c.event_id=v_event_a and c.idempotency_key='qa-invalid-schedule-0001') then raise exception 'Operación fallida dejó command exitoso';end if;
  perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a2,v_revision,'POINTS',v_tier_a,v_scheme_a,null);
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_a;
  begin perform public.update_competition_series_event_draft(v_club_a,v_event_a,v_revision,jsonb_build_object('event_type','EXHIBITION'));raise exception 'EXHIBITION con POINTS aceptado';exception when check_violation then null;end;
  begin perform public.update_competition_series_event_draft(v_club_a,v_event_a,v_revision,jsonb_build_object('event_type','FRIENDLY'));raise exception 'FRIENDLY con POINTS aceptado';exception when check_violation then null;end;
  begin
    perform public.set_competition_series_event_division_active(v_club_a,v_event_a,v_ed_a2,v_revision,false,'QA semantic check');
    select revision into v_previous_revision from public.competition_series_events where id=v_event_a;
    perform public.update_competition_series_event_draft(v_club_a,v_event_a,v_previous_revision,jsonb_build_object('event_type','EXHIBITION'));
    raise exception 'División retirada POINTS permitió EXHIBITION';
  exception when check_violation then null;end;

  begin
    perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a2,v_revision,'POINTS',v_tier_b,v_scheme_a,null);
    raise exception 'Tier cross-club aceptado';
  exception when check_violation then null; end;
  begin
    perform public.configure_competition_series_event_division(v_club_a,v_event_a,v_ed_a2,v_revision,'POINTS',v_tier_a,v_scheme_b,null);
    raise exception 'Scheme cross-club aceptado';
  exception when check_violation then null; end;

  -- Refresh explícito: una nueva regla ACTIVE vuelve obsoleta la referencia provisional.
  reset role;perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series_rules set status='SUPERSEDED',frozen_at=null,superseded_at=now() where id=v_rule_a1;
  insert into public.competition_series_rules(id,club_id,series_division_id,version,status,points_scheme_id,frozen_at,created_by)
  values(v_rule_a1_v2,v_club_a,v_sd_a1,2,'ACTIVE',v_scheme_a,now(),v_owner);
  insert into public.competition_series_eligibility(club_id,series_rule_id,frozen_at,created_by) values(v_club_a,v_rule_a1_v2,now(),v_owner);
  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'SCHEDULE','qa-rule-changed-000001','{}');raise exception 'Scheduling no detectó EVENT_RULE_CHANGED';exception when unique_violation then if sqlerrm not like '%EVENT_RULE_CHANGED%' then raise;end if;end;
  v_previous_revision:=v_revision;
  perform public.refresh_competition_series_event_division_rule(v_club_a,v_event_a,v_ed_a1,v_revision);
  select revision into v_revision from public.competition_series_events where id=v_event_a;
  if v_revision<>v_previous_revision+1 or (select series_rule_id from public.competition_series_event_divisions where id=v_ed_a1)<>v_rule_a1_v2 then raise exception 'Refresh no resolvió nueva regla/revisión';end if;
  perform public.refresh_competition_series_event_division_rule(v_club_a,v_event_a,v_ed_a1,v_revision);
  if (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Refresh no-op incrementó revisión';end if;
  begin perform public.refresh_competition_series_event_division_rule(v_club_a,v_event_a,v_ed_a1,v_previous_revision);raise exception 'Refresh stale aceptado';exception when serialization_failure then null;end;
  begin
    perform public.link_competition_series_event_tournament(v_club_a,v_event_a,v_ed_a1,v_tournament_b,v_revision,'qa-cross-club-link-0001',false,null);
    raise exception 'Tournament cross-club aceptado';
  exception when no_data_found then null; end;

  -- El guard genérico no puede fabricar snapshots ni programar divisiones.
  reset role;perform set_config('selpa.competition_event_write','allowed',true);
  begin
    update public.competition_series_event_divisions set status='SCHEDULED',frozen_at=now(),configuration_snapshot='{}' where id=v_ed_a2;
    raise exception 'Guard genérico fabricó snapshot';
  exception when check_violation or insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  v_result:=public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'SCHEDULE','qa-schedule-event-a-0001','{}');
  v_retry:=public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'SCHEDULE','qa-schedule-event-a-0001','{}');
  if v_retry is distinct from v_result then raise exception 'Replay del mismo evento cambió la respuesta'; end if;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'SCHEDULE','qa-schedule-stale-a01','{}');raise exception 'Schedule stale aceptado';exception when serialization_failure then null;end;
  if (select count(*) from public.competition_series_event_divisions d where d.event_id=v_event_a and d.status='SCHEDULED' and d.frozen_at is not null and d.configuration_snapshot is not null)<>2 then raise exception 'Scheduling no congeló ambas divisiones'; end if;
  v_before:=(select jsonb_agg(d.configuration_snapshot order by d.id) from public.competition_series_event_divisions d where d.event_id=v_event_a);
  reset role;update public.competition_event_tiers set name='QA Tier Renamed' where id=v_tier_a;update public.competition_categories set name='QA Category Renamed' where id=v_category_a;
  if (select jsonb_agg(d.configuration_snapshot order by d.id) from public.competition_series_event_divisions d where d.event_id=v_event_a) is distinct from v_before then raise exception 'Renombrar catálogo alteró snapshot';end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;

  -- Allowed actions y lifecycle mixto: COMPLETED + CANCELLED exige COMPLETE del evento.
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_a);
  if (v_result#>>'{allowed_actions,reschedule}')::boolean is not true or (v_result#>>'{allowed_actions,complete}')::boolean or (v_result#>>'{allowed_actions,archive}')::boolean then raise exception 'Allowed actions SCHEDULED inicial inválidas';end if;
  select revision into v_revision from public.competition_series_events where id=v_event_a;
  v_previous_revision:=v_revision;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'RESCHEDULE','qa-reschedule-a-000001','{"reason":"QA snapshot","planned_starts_at":"2027-09-01T12:00:00Z","planned_ends_at":"2027-09-01T13:00:00Z","timezone":"America/Argentina/Buenos_Aires"}');
  select revision into v_revision from public.competition_series_events where id=v_event_a;
  if v_revision<>v_previous_revision+1 or (select jsonb_agg(d.configuration_snapshot order by d.id) from public.competition_series_event_divisions d where d.event_id=v_event_a) is distinct from v_before then raise exception 'Reschedule alteró snapshot/revisión';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'RESCHEDULE','qa-reschedule-a-000001','{"reason":"QA snapshot","planned_starts_at":"2027-09-01T12:00:00Z","planned_ends_at":"2027-09-01T13:00:00Z","timezone":"America/Argentina/Buenos_Aires"}');
  if (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Replay reschedule incrementó revisión';end if;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'RESCHEDULE','qa-reschedule-stale-a1','{"reason":"stale"}');raise exception 'Reschedule stale aceptado';exception when serialization_failure then null;end;
  v_previous_revision:=v_revision;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'COMPLETE_DIVISION','qa-complete-div-a-001',jsonb_build_object('division_id',v_ed_a1));
  select revision into v_revision from public.competition_series_events where id=v_event_a;
  if v_revision<>v_previous_revision+1 or (select status from public.competition_series_events where id=v_event_a)<>'SCHEDULED' or (select jsonb_agg(d.configuration_snapshot order by d.id) from public.competition_series_event_divisions d where d.event_id=v_event_a) is distinct from v_before then raise exception 'Complete division alteró agregado/snapshot';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'COMPLETE_DIVISION','qa-complete-div-a-001',jsonb_build_object('division_id',v_ed_a1));
  if (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Replay complete division incrementó revisión';end if;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'COMPLETE_DIVISION','qa-complete-div-stale1',jsonb_build_object('division_id',v_ed_a1));raise exception 'Complete division stale aceptado';exception when serialization_failure then null;end;
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_a);
  if (v_result#>>'{allowed_actions,complete}')::boolean or (v_result#>>'{allowed_actions,cancel}')::boolean then raise exception 'Allowed actions con división pendiente inválidas';end if;
  v_previous_revision:=v_revision;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'CANCEL_DIVISION','qa-cancel-div-a-0001',jsonb_build_object('division_id',v_ed_a2,'reason','QA mixed'));
  select revision into v_revision from public.competition_series_events where id=v_event_a;
  if v_revision<>v_previous_revision+1 or (select status from public.competition_series_events where id=v_event_a)<>'SCHEDULED' or (select jsonb_agg(d.configuration_snapshot order by d.id) from public.competition_series_event_divisions d where d.event_id=v_event_a) is distinct from v_before then raise exception 'Mixed lifecycle alteró evento/snapshot';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'CANCEL_DIVISION','qa-cancel-div-a-0001',jsonb_build_object('division_id',v_ed_a2,'reason','QA mixed'));
  if (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Replay cancel division incrementó revisión';end if;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'CANCEL_DIVISION','qa-cancel-div-stale1',jsonb_build_object('division_id',v_ed_a2,'reason','stale'));raise exception 'Cancel division stale aceptado';exception when serialization_failure then null;end;
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_a);
  if (v_result#>>'{allowed_actions,complete}')::boolean is not true or (v_result#>>'{allowed_actions,cancel}')::boolean then raise exception 'Allowed actions mixed inválidas';end if;
  v_previous_revision:=v_revision;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'COMPLETE','qa-complete-event-a01','{}');
  select revision into v_revision from public.competition_series_events where id=v_event_a;
  if v_revision<>v_previous_revision+1 or (select status from public.competition_series_events where id=v_event_a)<>'COMPLETED' then raise exception 'Complete event inválido';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'COMPLETE','qa-complete-event-a01','{}');
  if (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Replay complete event incrementó revisión';end if;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'COMPLETE','qa-complete-event-stale','{}');raise exception 'Complete event stale aceptado';exception when serialization_failure then null;end;
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_a);
  if (v_result#>>'{allowed_actions,archive}')::boolean is not true or (v_result#>>'{allowed_actions,edit}')::boolean or (v_result#>>'{allowed_actions,link_tournament}')::boolean then raise exception 'Allowed actions COMPLETED inválidas';end if;
  v_previous_revision:=v_revision;
  v_result:=public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'ARCHIVE','qa-archive-event-a-01','{}');
  select revision into v_revision from public.competition_series_events where id=v_event_a;
  if v_revision<>v_previous_revision+1 or (select archived_at from public.competition_series_events where id=v_event_a) is null then raise exception 'Archive no incrementó/cerró';end if;
  v_retry:=public.transition_competition_series_event(v_club_a,v_event_a,v_revision,'ARCHIVE','qa-archive-event-a-02','{}');
  if (v_retry->>'revision')::integer<>v_revision or (select revision from public.competition_series_events where id=v_event_a)<>v_revision then raise exception 'Archive repetido no fue no-op';end if;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,v_previous_revision,'ARCHIVE','qa-archive-event-stale','{}');raise exception 'Archive stale aceptado';exception when serialization_failure then null;end;
  begin perform public.link_competition_series_event_tournament(v_club_a,v_event_a,v_ed_a1,v_tournament_a,v_revision,'qa-link-terminal-0001',false,null);raise exception 'Evento terminal permitió link';exception when check_violation then null;end;
  begin perform public.update_competition_series_event_draft(v_club_a,v_event_a,v_revision,jsonb_build_object('name','reopen'));raise exception 'Evento archivado reabierto/editado';exception when check_violation then null;end;

  -- Dos cancelaciones parciales: la primera conserva SCHEDULED; la última cancela el evento.
  select e.id,e.revision into v_event_c,v_revision from public.create_competition_series_event(v_club_a,v_series_a,'QA Event All Cancelled') e;
  perform public.update_competition_series_event_draft(v_club_a,v_event_c,v_revision,jsonb_build_object('planned_starts_at',(now()+interval '11 day')::text,'planned_ends_at',(now()+interval '12 day')::text,'timezone','America/Argentina/Buenos_Aires'));
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  select id into v_ed_c1 from public.add_competition_series_event_division(v_club_a,v_event_c,v_sd_a1,10,v_revision);
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  perform public.configure_competition_series_event_division(v_club_a,v_event_c,v_ed_c1,v_revision,'NON_SCORING',null,null,null);
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  select id into v_ed_c2 from public.add_competition_series_event_division(v_club_a,v_event_c,v_sd_a2,20,v_revision);
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  perform public.configure_competition_series_event_division(v_club_a,v_event_c,v_ed_c2,v_revision,'NON_SCORING',null,null,null);
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_c);
  if (v_result#>>'{allowed_actions,edit}')::boolean is not true or (v_result#>>'{allowed_actions,schedule}')::boolean is not true or (v_result#>>'{allowed_actions,link_tournament}')::boolean is not true or (v_result#>>'{allowed_actions,complete}')::boolean or (v_result#>>'{allowed_actions,archive}')::boolean then raise exception 'Allowed actions DRAFT completo inválidas';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_c,v_revision,'SCHEDULE','qa-schedule-event-c-001','{}');
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  v_before:=(select jsonb_agg(d.configuration_snapshot order by d.id) from public.competition_series_event_divisions d where d.event_id=v_event_c);
  v_previous_revision:=v_revision;
  perform public.transition_competition_series_event(v_club_a,v_event_c,v_revision,'CANCEL_DIVISION','qa-cancel-div-c1-0001',jsonb_build_object('division_id',v_ed_c1,'reason','QA partial'));
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  if v_revision<>v_previous_revision+1 or (select status from public.competition_series_events where id=v_event_c)<>'SCHEDULED' then raise exception 'Cancelación parcial no conservó SCHEDULED';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_c,v_previous_revision,'CANCEL_DIVISION','qa-cancel-div-c1-0001',jsonb_build_object('division_id',v_ed_c1,'reason','QA partial'));
  if (select revision from public.competition_series_events where id=v_event_c)<>v_revision then raise exception 'Replay cancel parcial incrementó revisión';end if;
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_c);
  if (v_result#>>'{allowed_actions,cancel}')::boolean is not true or (v_result#>>'{allowed_actions,complete}')::boolean then raise exception 'Allowed actions tras cancelación parcial inválidas';end if;
  v_previous_revision:=v_revision;
  perform public.transition_competition_series_event(v_club_a,v_event_c,v_revision,'CANCEL_DIVISION','qa-cancel-div-c2-0001',jsonb_build_object('division_id',v_ed_c2,'reason','QA last'));
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  if v_revision<>v_previous_revision+1 or (select status from public.competition_series_events where id=v_event_c)<>'CANCELLED' or (select jsonb_agg(d.configuration_snapshot order by d.id) from public.competition_series_event_divisions d where d.event_id=v_event_c) is distinct from v_before then raise exception 'Última cancelación no cerró evento/snapshot';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_c,v_previous_revision,'CANCEL_DIVISION','qa-cancel-div-c2-0001',jsonb_build_object('division_id',v_ed_c2,'reason','QA last'));
  if (select revision from public.competition_series_events where id=v_event_c)<>v_revision then raise exception 'Replay última cancelación incrementó revisión';end if;
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_c);
  if (v_result#>>'{allowed_actions,archive}')::boolean is not true or (v_result#>>'{allowed_actions,edit}')::boolean or (v_result#>>'{allowed_actions,cancel}')::boolean then raise exception 'Allowed actions CANCELLED inválidas';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_c,v_revision,'ARCHIVE','qa-archive-event-c-01','{}');
  select revision into v_revision from public.competition_series_events where id=v_event_c;
  begin perform public.transition_competition_series_event(v_club_a,v_event_c,v_revision,'SCHEDULE','qa-reopen-event-c-001','{}');raise exception 'Evento terminal archivado reabierto';exception when check_violation then null;end;

  -- La misma key y payload sobre otro evento no colisionan.
  select e.id,e.revision into v_event_b,v_revision from public.create_competition_series_event(v_club_a,v_series_a,'QA Event B') e;
  perform public.update_competition_series_event_draft(v_club_a,v_event_b,v_revision,jsonb_build_object('planned_starts_at',(now()+interval '9 day')::text,'planned_ends_at',(now()+interval '10 day')::text,'timezone','America/Argentina/Buenos_Aires'));
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_b;
  select d.id into v_link from public.add_competition_series_event_division(v_club_a,v_event_b,v_sd_a1,10,v_revision) d;
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_b;
  perform public.configure_competition_series_event_division(v_club_a,v_event_b,v_link,v_revision,'NON_SCORING',null,null,null);
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_b;
  v_previous_revision:=v_revision;
  v_before:=public.transition_competition_series_event(v_club_a,v_event_b,v_revision,'SCHEDULE','qa-schedule-event-a-0001','{}');
  if v_before->>'event_id'<>v_event_b::text then raise exception 'Idempotencia reprodujo otro evento'; end if;
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_b;
  begin perform public.transition_competition_series_event(v_club_a,v_event_b,v_previous_revision,'SCHEDULE','qa-schedule-event-a-0001','{"changed":true}');raise exception 'Payload distinto aceptado';exception when unique_violation then null;end;

  -- En SCHEDULED OPERADOR no vincula; ADMIN sí puede vincular y desvincular.
  reset role;perform set_config('request.jwt.claim.sub',v_operator::text,true);set local role authenticated;
  begin perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a2,v_revision,'qa-operator-scheduled-1',false,null);raise exception 'OPERADOR vinculó en SCHEDULED';exception when insufficient_privilege then null;end;
  reset role;perform set_config('request.jwt.claim.sub',v_admin::text,true);set local role authenticated;
  v_previous_revision:=v_revision;
  perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a2,v_revision,'qa-admin-scheduled-001',false,null);
  select revision into v_revision from public.competition_series_events where id=v_event_b;
  if v_revision<>v_previous_revision+1 then raise exception 'ADMIN link SCHEDULED no incrementó +1';end if;
  begin perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a,v_previous_revision,'qa-link-stale-000001',true,'stale');raise exception 'Link stale aceptado';exception when serialization_failure then null;end;
  v_previous_revision:=v_revision;
  perform public.unlink_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_revision,'qa-admin-unlink-00001','QA admin');
  select revision into v_revision from public.competition_series_events where id=v_event_b;
  if v_revision<>v_previous_revision+1 then raise exception 'ADMIN unlink SCHEDULED no incrementó +1';end if;
  begin perform public.unlink_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_previous_revision,'qa-unlink-stale-0001','stale');raise exception 'Unlink stale aceptado';exception when serialization_failure then null;end;

  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_b;
  v_before:=(select d.configuration_snapshot from public.competition_series_event_divisions d where d.id=v_link);
  begin reset role;perform set_config('selpa.competition_event_write','allowed',true);update public.competition_series_event_divisions set configuration_snapshot='{"tampered":true}' where id=v_link;raise exception 'Snapshot congelado fue alterado';exception when check_violation or insufficient_privilege then null;end;
  if (select d.configuration_snapshot from public.competition_series_event_divisions d where d.id=v_link) is distinct from v_before then raise exception 'Snapshot cambió tras intento rechazado';end if;
  v_before:=(select to_jsonb(d) from public.competition_series_event_divisions d where d.id=v_link);
  foreach v_column in array array['configuration_snapshot','frozen_at','series_rule_id','event_tier_id','scoring_mode','points_scheme_override_id','points_multiplier_override','series_division_id','event_id','club_id'] loop
    v_sql:=case v_column
      when 'configuration_snapshot' then format('update public.competition_series_event_divisions set configuration_snapshot=%L::jsonb where id=%L::uuid','{"tampered":true}',v_link)
      when 'frozen_at' then format('update public.competition_series_event_divisions set frozen_at=now()+interval ''1 minute'' where id=%L::uuid',v_link)
      when 'series_rule_id' then format('update public.competition_series_event_divisions set series_rule_id=%L::uuid where id=%L::uuid',v_rule_a2,v_link)
      when 'event_tier_id' then format('update public.competition_series_event_divisions set event_tier_id=%L::uuid where id=%L::uuid',v_tier_a,v_link)
      when 'scoring_mode' then format('update public.competition_series_event_divisions set scoring_mode=''POINTS'' where id=%L::uuid',v_link)
      when 'points_scheme_override_id' then format('update public.competition_series_event_divisions set points_scheme_override_id=%L::uuid where id=%L::uuid',v_scheme_a,v_link)
      when 'points_multiplier_override' then format('update public.competition_series_event_divisions set points_multiplier_override=2 where id=%L::uuid',v_link)
      when 'series_division_id' then format('update public.competition_series_event_divisions set series_division_id=%L::uuid where id=%L::uuid',v_sd_a2,v_link)
      when 'event_id' then format('update public.competition_series_event_divisions set event_id=%L::uuid where id=%L::uuid',v_event_a,v_link)
      else format('update public.competition_series_event_divisions set club_id=%L::uuid where id=%L::uuid',v_club_b,v_link) end;
    begin execute v_sql; raise exception 'Campo congelado aceptado: %',v_column; exception when check_violation or insufficient_privilege or foreign_key_violation or unique_violation then null; end;
  end loop;
  if (select to_jsonb(d) from public.competition_series_event_divisions d where d.id=v_link) is distinct from v_before then raise exception 'Un campo congelado cambió';end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  begin perform public.transition_competition_series_event(v_club_a,v_event_b,v_revision,'RESCHEDULE','qa-reschedule-invalid-tz','{"reason":"QA","planned_starts_at":"2027-08-01T12:00:00Z","planned_ends_at":"2027-08-01T13:00:00Z","timezone":"Invalid/QA"}');raise exception 'Timezone inválida aceptada';exception when invalid_parameter_value then null;end;
  v_result:=public.transition_competition_series_event(v_club_a,v_event_b,v_revision,'RESCHEDULE','qa-reschedule-valid-0001','{"reason":"QA cambio","planned_starts_at":"2027-08-01T12:00:00Z","planned_ends_at":"2027-08-01T13:00:00Z","timezone":"America/Argentina/Buenos_Aires"}');
  if (select count(*) from public.competition_series_event_schedule_history h where h.event_id=v_event_b)<>1 then raise exception 'Historial de reprogramación inválido';end if;
  reset role;perform set_config('selpa.competition_event_write','allowed',true);
  begin update public.competition_series_event_schedule_history set reason='alterado' where event_id=v_event_b;raise exception 'History UPDATE aceptado';exception when insufficient_privilege then null;end;
  begin delete from public.competition_series_event_schedule_history where event_id=v_event_b;raise exception 'History DELETE aceptado';exception when insufficient_privilege then null;end;

  -- Cancelar DRAFT cancela hijos activos y cierra links sin reactivar retirados.
  select e.id,e.revision into v_event_b,v_revision from public.create_competition_series_event(v_club_a,v_series_a,'QA Event Cancel Draft') e;
  v_result:=public.get_competition_series_event_completeness(v_club_a,v_event_b);
  if (v_result#>>'{allowed_actions,link_tournament}')::boolean or (v_result#>>'{allowed_actions,schedule}')::boolean then raise exception 'Evento sin divisiones anunció link/schedule';end if;
  select d.id into v_link from public.add_competition_series_event_division(v_club_a,v_event_b,v_sd_a1,10,v_revision) d;
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_b;
  begin perform public.set_competition_series_event_division_active(v_club_a,v_event_b,v_link,v_revision,false,'');raise exception 'Retiro sin motivo aceptado';exception when invalid_parameter_value then null;end;
  v_previous_revision:=v_revision;
  reset role;perform set_config('request.jwt.claim.sub',v_operator::text,true);set local role authenticated;
  perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a,v_revision,'qa-link-draft-000001',false,null);
  select e.revision into v_revision from public.competition_series_events e where e.id=v_event_b;
  if v_revision<>v_previous_revision+1 then raise exception 'Link no incrementó +1';end if;
  perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a,v_previous_revision,'qa-link-draft-000001',false,null);
  if (select revision from public.competition_series_events where id=v_event_b)<>v_revision then raise exception 'Replay de link incrementó revisión';end if;
  reset role;perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  v_previous_revision:=v_revision;perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a2,v_revision,'qa-replace-draft-0001',true,'QA replace');select revision into v_revision from public.competition_series_events where id=v_event_b;
  if v_revision<>v_previous_revision+1 or not exists(select 1 from public.competition_series_event_tournament_links where event_division_id=v_link and tournament_id=v_tournament_a and status='REPLACED') then raise exception 'Replace inválido';end if;
  perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a2,v_previous_revision,'qa-replace-draft-0001',true,'QA replace');
  if (select revision from public.competition_series_events where id=v_event_b)<>v_revision then raise exception 'Replay replace incrementó revisión';end if;
  v_previous_revision:=v_revision;perform public.unlink_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_revision,'qa-unlink-draft-00001','QA unlink');select revision into v_revision from public.competition_series_events where id=v_event_b;
  if v_revision<>v_previous_revision+1 or exists(select 1 from public.competition_series_event_tournament_links where event_division_id=v_link and status='ACTIVE') then raise exception 'Unlink inválido';end if;
  perform public.unlink_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_previous_revision,'qa-unlink-draft-00001','QA unlink');
  if (select revision from public.competition_series_events where id=v_event_b)<>v_revision then raise exception 'Replay unlink incrementó revisión';end if;
  perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a,v_revision,'qa-relink-draft-00001',false,null);select revision into v_revision from public.competition_series_events where id=v_event_b;
  v_previous_revision:=v_revision;perform public.set_competition_series_event_division_active(v_club_a,v_event_b,v_link,v_revision,false,'QA remove');select revision into v_revision from public.competition_series_events where id=v_event_b;
  if v_revision<>v_previous_revision+1 or not exists(select 1 from public.competition_series_event_divisions where id=v_link and not is_active and removed_at is not null and removed_by=v_owner and removal_reason='QA remove') or exists(select 1 from public.competition_series_event_tournament_links where event_division_id=v_link and status='ACTIVE') then raise exception 'Remove inválido';end if;
  perform public.set_competition_series_event_division_active(v_club_a,v_event_b,v_link,v_revision,false,'QA remove');if (select revision from public.competition_series_events where id=v_event_b)<>v_revision then raise exception 'Remove no-op incrementó revisión';end if;
  begin perform public.set_competition_series_event_division_active(v_club_a,v_event_b,v_link,v_previous_revision,false,'stale');raise exception 'Remove stale aceptado';exception when serialization_failure then null;end;
  v_previous_revision:=v_revision;perform public.set_competition_series_event_division_active(v_club_a,v_event_b,v_link,v_revision,true,null);select revision into v_revision from public.competition_series_events where id=v_event_b;
  if v_revision<>v_previous_revision+1 or not exists(select 1 from public.competition_series_event_divisions where id=v_link and is_active and removed_at is null and removed_by is null and removal_reason is null) or exists(select 1 from public.competition_series_event_tournament_links where event_division_id=v_link and status='ACTIVE') then raise exception 'Restore inválido';end if;
  perform public.set_competition_series_event_division_active(v_club_a,v_event_b,v_link,v_revision,true,null);if (select revision from public.competition_series_events where id=v_event_b)<>v_revision then raise exception 'Restore no-op incrementó revisión';end if;
  begin perform public.set_competition_series_event_division_active(v_club_a,v_event_b,v_link,v_previous_revision,true,null);raise exception 'Restore stale aceptado';exception when serialization_failure then null;end;
  perform public.link_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_tournament_a,v_revision,'qa-link-cancel-000001',false,null);select revision into v_revision from public.competition_series_events where id=v_event_b;
  begin
    reset role;perform set_config('selpa.competition_series_write','allowed',true);update public.competition_series set status='CLOSED' where id=v_series_a;
    perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
    perform public.add_competition_series_event_division(v_club_a,v_event_b,v_sd_a2,20,v_revision);
    raise exception 'Serie CLOSED permitió agregar división';
  exception when check_violation then null;end;
  begin
    reset role;perform set_config('selpa.competition_series_write','allowed',true);update public.competition_series set status='CANCELLED',cancellation_reason='QA',cancelled_by=v_owner,cancelled_at=now() where id=v_series_a;
    perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
    perform public.unlink_competition_series_event_tournament(v_club_a,v_event_b,v_link,v_revision,'qa-cancelled-series-01','QA');
    raise exception 'Serie CANCELLED permitió vínculo';
  exception when check_violation then null;end;
  begin
    reset role;perform set_config('selpa.competition_series_write','allowed',true);update public.competition_series set archived_at=now(),archived_by=v_owner where id=v_series_a;
    perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
    perform public.refresh_competition_series_event_division_rule(v_club_a,v_event_b,v_link,v_revision);
    raise exception 'Serie archivada permitió refresh';
  exception when check_violation then null;end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;
  v_previous_revision:=v_revision;
  perform public.transition_competition_series_event(v_club_a,v_event_b,v_revision,'CANCEL','qa-cancel-draft-00001','{"reason":"QA cancel"}');
  select revision into v_revision from public.competition_series_events where id=v_event_b;
  if v_revision<>v_previous_revision+1 then raise exception 'Cancel event no incrementó +1';end if;
  perform public.transition_competition_series_event(v_club_a,v_event_b,v_previous_revision,'CANCEL','qa-cancel-draft-00001','{"reason":"QA cancel"}');
  if (select revision from public.competition_series_events where id=v_event_b)<>v_revision then raise exception 'Replay cancel event incrementó revisión';end if;
  begin perform public.transition_competition_series_event(v_club_a,v_event_b,v_previous_revision,'CANCEL','qa-cancel-event-stale1','{"reason":"stale"}');raise exception 'Cancel event stale aceptado';exception when serialization_failure then null;end;
  if exists(select 1 from public.competition_series_event_divisions d where d.event_id=v_event_b and d.is_active and d.status<>'CANCELLED') then raise exception 'Cancel DRAFT dejó divisiones activas DRAFT';end if;
  if exists(select 1 from public.competition_series_event_tournament_links l where l.event_division_id=v_link and l.status='ACTIVE') then raise exception 'Cancel DRAFT dejó link ACTIVE';end if;

  reset role;
  -- RLS: PLAYER no lee; PLANILLERO sí lee; OPERADOR no ejecuta lifecycle.
  perform set_config('request.jwt.claim.sub',v_admin::text,true);set local role authenticated;
  perform public.create_competition_series_event(v_club_a,v_series_a,'QA Admin Event');reset role;
  insert into public.platform_admins(user_id) values(v_admin) on conflict(user_id) do nothing;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);set local role authenticated;
  select count(*) into v_count from public.competition_series_events e where e.id in (v_event_a,v_event_club_b);if v_count<>2 then raise exception 'Platform admin no pudo leer ambos clubes';end if;reset role;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);set local role authenticated;select count(*) into v_count from public.competition_series_events e where e.id=v_event_club_b;if v_count<>0 then raise exception 'Usuario normal de Club A leyó Club B';end if;reset role;
  perform set_config('request.jwt.claim.sub',v_player::text,true);set local role authenticated;
  foreach v_table in array array['competition_series_events','competition_series_event_divisions','competition_series_event_tournament_links','competition_series_event_schedule_history','competition_series_event_commands'] loop execute format('select count(*) from public.%I where club_id=$1',v_table) into v_count using v_club_a;if v_count<>0 then raise exception 'PLAYER leyó tabla %',v_table;end if;end loop;reset role;
  perform set_config('request.jwt.claim.sub',v_plan::text,true);set local role authenticated;
  foreach v_table in array array['competition_series_events','competition_series_event_divisions','competition_series_event_tournament_links','competition_series_event_schedule_history'] loop execute format('select count(*) from public.%I where club_id=$1',v_table) into v_count using v_club_a;if v_count=0 then raise exception 'PLANILLERO no pudo leer %',v_table;end if;end loop;reset role;
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claim.role','anon',true);set local role anon;
  foreach v_table in array array['competition_series_events','competition_series_event_divisions','competition_series_event_tournament_links','competition_series_event_schedule_history','competition_series_event_commands'] loop
    begin execute format('select count(*) from public.%I',v_table) into v_count;if v_count<>0 then raise exception 'ANON leyó tabla %',v_table;end if;exception when insufficient_privilege then null;end;
  end loop;reset role;
  perform set_config('request.jwt.claim.sub',v_operator::text,true);set local role authenticated;
  begin perform public.transition_competition_series_event(v_club_a,v_event_a,(select e.revision from public.competition_series_events e where e.id=v_event_a),'ARCHIVE','qa-operator-lifecycle-01','{}');raise exception 'OPERADOR ejecutó lifecycle';exception when insufficient_privilege then null;end;
  reset role;
  return query select 'PASS','Stage 5A.3 QA transaccional: scope, refresh de regla, scoring, scheduling/rollback, revisiones, idempotencia secuencial, links, lifecycle, allowed actions, remove/restore, snapshots, RLS y roles';
exception when others then
  reset role;
  return query select 'FAIL',sqlerrm;
end $$;

select qa.qa_status||' | '||qa.qa_detail as result from pg_temp.run_competition_series_events_stage5a3_qa() qa;
rollback;
