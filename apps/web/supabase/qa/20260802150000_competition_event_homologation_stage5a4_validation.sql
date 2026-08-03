begin;

create or replace function pg_temp.run_competition_event_homologation_stage5a4_qa()
returns table(qa_status text,qa_detail text)
language plpgsql
as $$
declare
  v_users uuid[]; owner_id uuid; admin_id uuid; operator_id uuid; plan_id uuid; player_id uuid;
  club_a uuid:=gen_random_uuid(); club_b uuid:=gen_random_uuid(); season_id uuid:=gen_random_uuid(); branch_id uuid:=gen_random_uuid(); category_id uuid:=gen_random_uuid(); division_id uuid:=gen_random_uuid();
  series_id uuid:=gen_random_uuid(); series_division_id uuid:=gen_random_uuid(); scheme_id uuid:=gen_random_uuid(); rule_id uuid:=gen_random_uuid(); tier_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); v_event_division_id uuid:=gen_random_uuid(); tournament_id uuid:=gen_random_uuid();
  cp1 uuid:=gen_random_uuid();cp2 uuid:=gen_random_uuid();cp3 uuid:=gen_random_uuid();cp4 uuid:=gen_random_uuid();team1 uuid:=gen_random_uuid();team2 uuid:=gen_random_uuid();match_id uuid:=gen_random_uuid();
  tournament_category smallint; h public.competition_event_homologations%rowtype; h2 public.competition_event_homologations%rowtype; response jsonb; preflight jsonb; old_revision integer; count_rows integer;
begin
  if to_regprocedure('public.create_competition_event_homologation_draft(uuid,uuid,text)') is null then return query select 'FAIL','QA no ejecutable: falta aplicar Stage 5A.4';return;end if;
  select array_agg(x.id order by x.id) into v_users from(select u.id from auth.users u where u.email is not null and not exists(select 1 from public.platform_admins p where p.user_id=u.id) order by u.id limit 5)x;
  if coalesce(array_length(v_users,1),0)<5 then return query select 'FAIL','QA no ejecutable: se requieren cinco usuarios auth reales; todos los fixtures de negocio se crean y revierten';return;end if;
  owner_id:=v_users[1];admin_id:=v_users[2];operator_id:=v_users[3];plan_id:=v_users[4];player_id:=v_users[5];

  insert into public.clubs(id,name,slug,is_active,status)values(club_a,'QA Homologation A','qa-homologation-'||replace(club_a::text,'-',''),true,'ACTIVE'),(club_b,'QA Homologation B','qa-homologation-'||replace(club_b::text,'-',''),true,'ACTIVE');
  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)values(club_a,owner_id,'OWNER','APPROVED',now(),owner_id),(club_a,admin_id,'ADMIN','APPROVED',now(),owner_id),(club_a,operator_id,'OPERADOR','APPROVED',now(),owner_id),(club_a,plan_id,'PLANILLERO','APPROVED',now(),owner_id),(club_a,player_id,'PLAYER','APPROVED',now(),owner_id),(club_b,player_id,'OWNER','APPROVED',now(),player_id);
  insert into public.competition_seasons(id,club_id,name,starts_on,ends_on,status,created_by)values(season_id,club_a,'QA Homologation Season','2027-01-01','2027-12-31','ACTIVE',owner_id);
  insert into public.competition_branches(id,club_id,name,slug)values(branch_id,club_a,'QA Homologation','qa-homologation');
  insert into public.competition_categories(id,club_id,name,short_label,slug)values(category_id,club_a,'QA Homologation','QA','qa-homologation');
  insert into public.competition_divisions(id,club_id,season_id,modality,branch_id,category_id)values(division_id,club_a,season_id,'INDIVIDUAL',branch_id,category_id);
  insert into public.points_schemes(id,club_id,name,is_global,is_active,created_by)values(scheme_id,club_a,'QA Homologation',false,true,owner_id);
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series(id,club_id,season_id,name,status,planned_events_count,created_by,activated_by,activated_at)values(series_id,club_a,season_id,'QA Homologation Series','ACTIVE',1,owner_id,owner_id,now());
  insert into public.competition_series_divisions(id,club_id,series_id,division_id,division_snapshot,frozen_at,created_by)values(series_division_id,club_a,series_id,division_id,jsonb_build_object('division_id',division_id,'division_name','QA Homologation','modality','INDIVIDUAL','branch_id',branch_id,'branch_name','QA Homologation','segment_id',null,'segment_name',null,'category_id',category_id,'category_name','QA Homologation','season_id',season_id,'season_name','QA Homologation Season'),now(),owner_id);
  insert into public.competition_series_rules(id,club_id,series_division_id,version,status,points_scheme_id,frozen_at,created_by)values(rule_id,club_a,series_division_id,1,'ACTIVE',scheme_id,now(),owner_id);
  insert into public.competition_series_eligibility(club_id,series_rule_id,requires_active_entry,allow_invited_players,invited_points_policy,require_same_division_pair,frozen_at,created_by)values(club_a,rule_id,true,false,'REQUIRE_ENTRY',true,now(),owner_id);
  insert into public.competition_event_tiers(id,club_id,name,code,default_points_scheme_id,points_multiplier,is_active,created_by)values(tier_id,club_a,'QA Homologation Tier','QA-HOMOLOGATION',scheme_id,1,true,owner_id);
  perform set_config('selpa.competition_event_write','allowed',true);
  insert into public.competition_series_events(id,club_id,series_id,season_id,name,status,sequence,planned_starts_at,planned_ends_at,actual_starts_at,actual_ends_at,timezone,scheduled_by,scheduled_at,completed_by,completed_at,created_by)values(event_id,club_a,series_id,season_id,'QA Homologation Event','COMPLETED',1,'2027-05-01','2027-05-02','2027-05-01','2027-05-02','America/Argentina/Buenos_Aires',owner_id,now(),owner_id,now(),owner_id);
  insert into public.competition_series_event_divisions(id,club_id,event_id,series_division_id,series_rule_id,event_tier_id,scoring_mode,points_scheme_override_id,status,configuration_snapshot,frozen_at,completed_by,completed_at,created_by)values(v_event_division_id,club_a,event_id,series_division_id,rule_id,tier_id,'POINTS',scheme_id,'COMPLETED',jsonb_build_object('rule_id',rule_id,'rule_version',1,'tier_id',tier_id,'tier_code','QA-HOMOLOGATION','tier_name','QA Homologation Tier','effective_points_scheme_id',scheme_id,'effective_multiplier',1,'scoring_mode','POINTS','division',jsonb_build_object('division_id',division_id,'division_name','QA Homologation','modality','INDIVIDUAL','branch_id',branch_id,'branch_name','QA Homologation','segment_id',null,'segment_name',null,'category_id',category_id,'category_name','QA Homologation','season_id',season_id,'season_name','QA Homologation Season'),'eligibility',jsonb_build_object('requires_active_entry',true),'frozen_at',now()),now(),owner_id,now(),owner_id);
  select c.id::smallint into tournament_category from generate_series(32000,32767)c(id)where not exists(select 1 from public.categories x where x.id=c.id)order by c.id limit 1;
  insert into public.categories(id,name)values(tournament_category,'QA Homologation '||tournament_category);
  insert into public.tournaments(id,club_id,name,type,start_date,end_date,status,category_id,category,category_rule,fixed_category_id,gender,tournament_type)values(tournament_id,club_a,'QA Homologation Tournament','OPEN','2027-05-01','2027-05-02','FINISHED',tournament_category,6,'FIXED_CATEGORY',tournament_category,'MIXED','OPEN');
  insert into public.competition_series_event_tournament_links(club_id,event_division_id,tournament_id,status,linked_by)values(club_a,v_event_division_id,tournament_id,'ACTIVE',owner_id);
  insert into public.club_players(id,club_id,user_id,display_name,category,gender,approved_at,approved_by)values(cp1,club_a,owner_id,'QA Uno',6,'M',now(),owner_id),(cp2,club_a,admin_id,'QA Dos',6,'F',now(),owner_id),(cp3,club_a,operator_id,'QA Tres',6,'M',now(),owner_id),(cp4,club_a,plan_id,'QA Cuatro',6,'F',now(),owner_id);
  insert into public.competition_player_entries(club_id,division_id,club_player_id,status,assigned_by)values(club_a,division_id,cp1,'ACTIVE',owner_id),(club_a,division_id,cp2,'ACTIVE',owner_id),(club_a,division_id,cp3,'ACTIVE',owner_id),(club_a,division_id,cp4,'ACTIVE',owner_id);
  insert into public.tournament_teams(id,tournament_id,club_id,player1_user_id,player2_user_id,created_by)values(team1,tournament_id,club_a,owner_id,admin_id,owner_id),(team2,tournament_id,club_a,operator_id,plan_id,owner_id);
  insert into public.tournament_registrations(tournament_id,club_id,team_id,status,created_by)values(tournament_id,club_a,team1,'CONFIRMED',owner_id),(tournament_id,club_a,team2,'CONFIRMED',owner_id);
  insert into public.tournament_matches(id,tournament_id,club_id,team1_id,team2_id,phase,status,winner_team_id,score,created_at)values(match_id,tournament_id,club_a,team1,team2,'FINAL','PLAYED',team1,'{"sets":[{"a":6,"b":3}]}'::jsonb,now());

  perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claim.role','authenticated',true);set local role authenticated;
  select * into h from public.create_competition_event_homologation_draft(club_a,v_event_division_id,'QA version 1');
  if h.version<>1 or h.revision<>1 or h.status<>'DRAFT' then raise exception 'DRAFT inicial inválido';end if;
  if (select id from public.create_competition_event_homologation_draft(club_a,v_event_division_id,null))<>h.id then raise exception 'DRAFT único no fue reutilizado';end if;
  reset role;delete from public.competition_player_entries where club_player_id=cp4;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);set local role authenticated;
  response:=public.extract_competition_event_homologation_results(club_a,h.id,h.revision,'qa-homologation-missing-01');old_revision:=(response->>'revision')::integer;
  preflight:=public.get_competition_event_homologation_preflight(club_a,h.id);if not(preflight->'blockers' @> '[{"code":"SCORING_INELIGIBLE"}]'::jsonb)then raise exception 'Entry faltante no generó blocker';end if;
  begin perform public.submit_competition_event_homologation(club_a,h.id,old_revision,'qa-submit-blocked-0001');raise exception 'Submit con blocker aceptado';exception when check_violation then null;end;
  reset role;insert into public.competition_player_entries(club_id,division_id,club_player_id,status,assigned_by)values(club_a,division_id,cp4,'ACTIVE',owner_id);update public.tournament_matches set status='PENDING',winner_team_id=null where id=match_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);set local role authenticated;
  response:=public.extract_competition_event_homologation_results(club_a,h.id,old_revision,'qa-homologation-incomplete1');old_revision:=(response->>'revision')::integer;preflight:=public.get_competition_event_homologation_preflight(club_a,h.id);
  if not(preflight->'blockers' @> '[{"code":"MATCHES_INCOMPLETE"}]'::jsonb)then raise exception 'Partido incompleto no generó blocker';end if;
  reset role;update public.tournament_matches set status='PLAYED',winner_team_id=team1 where id=match_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);set local role authenticated;
  response:=public.extract_competition_event_homologation_results(club_a,h.id,old_revision,'qa-homologation-extract-001');old_revision:=(response->>'revision')::integer;
  if (select count(*) from public.competition_event_homologation_participants where homologation_id=h.id)<>4 or (select count(*) from public.competition_event_homologation_results where homologation_id=h.id)<>2 then raise exception 'Extracción no normalizó cuatro participantes y dos resultados';end if;
  if (select count(*) from public.competition_event_homologation_participants where homologation_id=h.id and scoring_eligibility_status='ELIGIBLE')<>4 then raise exception 'Elegibilidad REQUIRE_ENTRY inválida';end if;
  preflight:=public.get_competition_event_homologation_preflight(club_a,h.id);if jsonb_array_length(preflight->'blockers')<>0 or (preflight#>>'{allowed_actions,submit}')::boolean is not true then raise exception 'Preflight canónico inválido';end if;
  response:=public.add_competition_event_homologation_evidence(club_a,h.id,old_revision,'NOTE',null,null,'Acta QA',null,'{}');old_revision:=(response->>'revision')::integer;
  if not exists(select 1 from public.competition_event_homologation_evidence where homologation_id=h.id and evidence_type='NOTE')then raise exception 'Evidencia NOTE no fue registrada';end if;
  response:=public.submit_competition_event_homologation(club_a,h.id,old_revision,'qa-homologation-submit-001');
  if response is distinct from public.submit_competition_event_homologation(club_a,h.id,old_revision,'qa-homologation-submit-001') then raise exception 'Replay submit inválido';end if;
  old_revision:=(response->>'revision')::integer;response:=public.approve_competition_event_homologation(club_a,h.id,old_revision,'qa-homologation-approve-01');
  begin perform public.extract_competition_event_homologation_results(club_a,h.id,(response->>'revision')::integer,'qa-terminal-extract-0001');raise exception 'APPROVED fue mutable';exception when check_violation then null;end;
  response:=public.create_competition_event_homologation_correction(club_a,h.id,(response->>'revision')::integer,'qa-homologation-correct-01','QA correction');select * into h2 from public.competition_event_homologations where id=(response->>'id')::uuid;
  if h2.version<>2 or h2.corrected_from_id<>h.id then raise exception 'Corrección/versionado inválido';end if;
  response:=public.extract_competition_event_homologation_results(club_a,h2.id,h2.revision,'qa-homologation-extract-002');response:=public.submit_competition_event_homologation(club_a,h2.id,(response->>'revision')::integer,'qa-homologation-submit-002');
  reset role;perform set_config('request.jwt.claim.sub',operator_id::text,true);set local role authenticated;
  begin perform public.approve_competition_event_homologation(club_a,h2.id,(response->>'revision')::integer,'qa-operator-approve-0001');raise exception 'OPERADOR aprobó';exception when insufficient_privilege then null;end;
  reset role;perform set_config('request.jwt.claim.sub',admin_id::text,true);set local role authenticated;
  response:=public.approve_competition_event_homologation(club_a,h2.id,(response->>'revision')::integer,'qa-admin-approve-00001');
  if (select status from public.competition_event_homologations where id=h.id)<>'SUPERSEDED' or (select status from public.competition_event_homologations where id=h2.id)<>'APPROVED' then raise exception 'Aprobación correctiva no supersedió versión previa';end if;
  response:=public.create_competition_event_homologation_correction(club_a,h2.id,(response->>'revision')::integer,'qa-homologation-correct-02','QA reject');select * into h from public.competition_event_homologations where id=(response->>'id')::uuid;
  response:=public.extract_competition_event_homologation_results(club_a,h.id,h.revision,'qa-homologation-extract-003');response:=public.submit_competition_event_homologation(club_a,h.id,(response->>'revision')::integer,'qa-homologation-submit-003');
  begin perform public.reject_competition_event_homologation(club_a,h.id,(response->>'revision')::integer,'qa-reject-no-reason-001','');raise exception 'Rechazo sin motivo aceptado';exception when check_violation then null;end;
  response:=public.reject_competition_event_homologation(club_a,h.id,(response->>'revision')::integer,'qa-homologation-reject-01','Datos operativos a corregir');
  begin perform public.reject_competition_event_homologation(club_a,h.id,(response->>'revision')::integer,'qa-homologation-reject-02','otra vez');raise exception 'REJECTED fue mutable';exception when check_violation then null;end;
  reset role;perform set_config('request.jwt.claim.sub',plan_id::text,true);set local role authenticated;
  perform public.get_competition_event_homologation_preflight(club_a,h.id);
  begin perform public.create_competition_event_homologation_draft(club_a,v_event_division_id,null);raise exception 'PLANILLERO modificó homologación';exception when insufficient_privilege then null;end;
  begin update public.competition_event_homologations set notes='directo' where id=h.id;raise exception 'Escritura directa authenticated aceptada';exception when insufficient_privilege then null;end;
  reset role;perform set_config('request.jwt.claim.sub',player_id::text,true);set local role authenticated;
  begin perform public.get_competition_event_homologation_preflight(club_a,h.id);raise exception 'PLAYER leyó homologación administrativa';exception when insufficient_privilege then null;end;
  begin perform public.create_competition_event_homologation_draft(club_b,v_event_division_id,null);raise exception 'Cross-club aceptado';exception when no_data_found or insufficient_privilege then null;end;
  reset role;insert into public.platform_admins(user_id)values(player_id);
  perform set_config('request.jwt.claim.sub',player_id::text,true);set local role authenticated;perform public.get_competition_event_homologation_preflight(club_a,h.id);
  reset role;delete from public.platform_admins where user_id=player_id;perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claim.role','anon',true);set local role anon;
  begin perform public.get_competition_event_homologation_preflight(club_a,h.id);raise exception 'Anon leyó homologación';exception when invalid_authorization_specification or insufficient_privilege then null;end;
  reset role;
  if exists(select 1 from public.competition_point_transactions x where x.club_id=club_a) then raise exception 'Homologación escribió ledger';end if;
  select count(*) into count_rows from public.competition_event_homologations x where x.event_division_id=v_event_division_id;if count_rows<>3 then raise exception 'Cantidad de versiones inesperada';end if;
  return query select 'PASS','Stage 5A.4 válido: extracción normalizada, elegibilidad, preflight, lifecycle, versiones, idempotencia, inmutabilidad, roles, RLS y aislamiento; no settlement ni puntos';
exception when others then reset role;return query select 'FAIL',sqlerrm;
end $$;

select qa_status||' | '||qa_detail result from pg_temp.run_competition_event_homologation_stage5a4_qa();
rollback;
