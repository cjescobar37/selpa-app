begin;

create or replace function pg_temp.run_competition_series_finalize_qa()
returns table(result text)
language plpgsql
as $$
declare
  v_owner uuid;
  v_player uuid;
  v_club uuid;
  v_other_club uuid;
  v_series uuid;
  v_revision integer;
  v_response jsonb;
  v_replay jsonb;
  v_preflight jsonb;
  v_pending uuid;
  v_season uuid;
  v_failed boolean;
  v_snapshot_count integer;
  v_events_before integer;
  v_settlements_before integer;
  v_ledger_before integer;
  v_branch uuid:=gen_random_uuid();
  v_category uuid:=gen_random_uuid();
  v_division uuid:=gen_random_uuid();
  v_series_division uuid:=gen_random_uuid();
  v_scheme uuid:=gen_random_uuid();
  v_rule uuid:=gen_random_uuid();
  v_tier uuid:=gen_random_uuid();
  v_event_points uuid:=gen_random_uuid();
  v_event_non_scoring uuid:=gen_random_uuid();
  v_event_division_points uuid:=gen_random_uuid();
  v_event_division_non_scoring uuid:=gen_random_uuid();
  v_tournament_points uuid:=gen_random_uuid();
  v_tournament_non_scoring uuid:=gen_random_uuid();
  v_club_player uuid:=gen_random_uuid();
  v_entry uuid:=gen_random_uuid();
  v_team_points uuid:=gen_random_uuid();
  v_team_non_scoring uuid:=gen_random_uuid();
  v_homologation_points uuid:=gen_random_uuid();
  v_homologation_non_scoring uuid:=gen_random_uuid();
  v_settlement uuid;
  v_category_small smallint;
begin
  if to_regprocedure('public.finalize_competition_series_atomic(uuid,uuid,integer)') is null
     or to_regclass('public.competition_series_final_rankings') is null then
    return query select 'FAIL | falta aplicar 20260826134827_competition_series_finalize_champions.sql';
    return;
  end if;
  if position('scoring_mode=''POINTS''' in pg_get_functiondef('public.get_competition_series_finalization_preflight(uuid,uuid)'::regprocedure))=0
     or position('status=''PUBLISHED''' in pg_get_functiondef('public.get_competition_series_finalization_preflight(uuid,uuid)'::regprocedure))=0
     or position('status=''APPROVED''' in pg_get_functiondef('public.get_competition_series_finalization_preflight(uuid,uuid)'::regprocedure))=0 then
    raise exception 'FAIL | preflight no distingue NON_SCORING, settlement publicado y homologación aprobada';
  end if;

  select membership.user_id,membership.club_id into v_owner,v_club
  from public.club_memberships membership
  where membership.role in('OWNER','ADMIN') and membership.status='APPROVED' and membership.approved_at is not null
  order by case membership.role when 'OWNER' then 0 else 1 end,membership.created_at limit 1;
  if v_owner is null then return query select 'BLOCKED | falta OWNER/ADMIN aprobado'; return; end if;

  select membership.user_id into v_player from public.club_memberships membership
  where membership.club_id=v_club and membership.role='PLAYER' and membership.status='APPROVED'
  order by membership.created_at limit 1;
  if v_player is null then return query select 'BLOCKED | falta PLAYER aprobado para QA negativa'; return; end if;

  select club.id into v_other_club from public.clubs club where club.id<>v_club order by club.created_at limit 1;
  if v_other_club is null then return query select 'BLOCKED | falta segundo club para cross-club'; return; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;

  -- Fixture autosuficiente y transaccional. Reutiliza contratos canónicos de
  -- homologación/settlement para demostrar POINTS y NON_SCORING sin depender
  -- de circuitos productivos ni dejar residuos después del ROLLBACK.
  reset role;
  v_series:=gen_random_uuid();
  select season.id into v_season from public.competition_seasons season
  where season.club_id=v_club and season.status='ACTIVE'
  order by season.starts_on desc limit 1;
  if v_season is null then
    raise exception 'FAIL | fixture requiere temporada ACTIVE canónica del club';
  end if;
  insert into public.competition_branches(id,club_id,name,slug)
  values(v_branch,v_club,'QA Finalize','qa-finalize-'||replace(v_branch::text,'-',''));
  insert into public.competition_categories(id,club_id,name,short_label,slug)
  values(v_category,v_club,'QA Finalize','QA','qa-finalize-'||replace(v_category::text,'-',''));
  insert into public.competition_divisions(id,club_id,season_id,modality,branch_id,category_id)
  values(v_division,v_club,v_season,'INDIVIDUAL',v_branch,v_category);
  insert into public.points_schemes(id,club_id,name,is_global,is_active,created_by)
  values(v_scheme,v_club,'QA Finalize',false,true,v_owner);
  insert into public.points_scheme_rules(scheme_id,rule_key,points)
  values(v_scheme,'CHAMPION',100);
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series(id,club_id,season_id,name,status,planned_events_count,created_by,activated_by,activated_at)
  values(v_series,v_club,v_season,'QA Finalize Series','ACTIVE',2,v_owner,v_owner,now());
  insert into public.competition_series_divisions(id,club_id,series_id,division_id,division_snapshot,frozen_at,created_by)
  values(v_series_division,v_club,v_series,v_division,jsonb_build_object(
    'division_id',v_division,'division_name','QA Finalize','modality','INDIVIDUAL',
    'branch_id',v_branch,'branch_name','QA Finalize','category_id',v_category,
    'segment_id',null,'segment_name',null,'category_name','QA Finalize',
    'season_id',v_season,'season_name','QA Finalize Season'),now(),v_owner);
  insert into public.competition_series_rules(id,club_id,series_division_id,version,status,points_scheme_id,frozen_at,created_by)
  values(v_rule,v_club,v_series_division,1,'ACTIVE',v_scheme,now(),v_owner);
  insert into public.competition_series_eligibility(club_id,series_rule_id,requires_active_entry,allow_invited_players,invited_points_policy,require_same_division_pair,frozen_at,created_by)
  values(v_club,v_rule,true,false,'REQUIRE_ENTRY',true,now(),v_owner);
  insert into public.competition_event_tiers(id,club_id,name,code,default_points_scheme_id,points_multiplier,is_active,created_by)
  values(v_tier,v_club,'QA Finalize Tier','QA-FINALIZE',v_scheme,1,true,v_owner);

  perform set_config('selpa.competition_event_write','allowed',true);
  insert into public.competition_series_events(id,club_id,series_id,season_id,name,status,sequence,planned_starts_at,planned_ends_at,actual_starts_at,actual_ends_at,timezone,scheduled_by,scheduled_at,completed_by,completed_at,created_by)
  values
    (v_event_points,v_club,v_series,v_season,'QA Points','COMPLETED',1,'2027-06-01','2027-06-02','2027-06-01','2027-06-02','America/Argentina/Buenos_Aires',v_owner,now(),v_owner,now(),v_owner),
    (v_event_non_scoring,v_club,v_series,v_season,'QA Non Scoring','COMPLETED',2,'2027-07-01','2027-07-02','2027-07-01','2027-07-02','America/Argentina/Buenos_Aires',v_owner,now(),v_owner,now(),v_owner);
  insert into public.competition_series_event_divisions(id,club_id,event_id,series_division_id,series_rule_id,event_tier_id,scoring_mode,points_scheme_override_id,points_multiplier_override,status,configuration_snapshot,frozen_at,completed_by,completed_at,created_by)
  values
    (v_event_division_points,v_club,v_event_points,v_series_division,v_rule,v_tier,'POINTS',v_scheme,1,'COMPLETED',jsonb_build_object('rule_id',v_rule,'rule_version',1,'effective_points_scheme_id',v_scheme,'effective_multiplier',1,'scoring_mode','POINTS','division',jsonb_build_object('division_id',v_division,'season_id',v_season),'frozen_at',now()),now(),v_owner,now(),v_owner),
    (v_event_division_non_scoring,v_club,v_event_non_scoring,v_series_division,v_rule,null,'NON_SCORING',null,null,'COMPLETED',jsonb_build_object('rule_id',v_rule,'rule_version',1,'effective_multiplier',1,'scoring_mode','NON_SCORING','division',jsonb_build_object('division_id',v_division,'season_id',v_season),'frozen_at',now()),now(),v_owner,now(),v_owner);

  select candidate.id::smallint into v_category_small
  from generate_series(32000,32767) candidate(id)
  where not exists(select 1 from public.categories existing where existing.id=candidate.id)
  order by candidate.id limit 1;
  insert into public.categories(id,name) values(v_category_small,'QA Finalize '||v_category_small);
  insert into public.tournaments(id,club_id,name,type,start_date,end_date,status,category_id,category,category_rule,fixed_category_id,gender,tournament_type)
  values
    (v_tournament_points,v_club,'QA Finalize Points','OPEN','2027-06-01','2027-06-02','FINISHED',v_category_small,6,'FIXED_CATEGORY',6,'MIXED','OPEN'),
    (v_tournament_non_scoring,v_club,'QA Finalize Non Scoring','OPEN','2027-07-01','2027-07-02','FINISHED',v_category_small,6,'FIXED_CATEGORY',6,'MIXED','OPEN');
  insert into public.competition_series_event_tournament_links(club_id,event_division_id,tournament_id,status,linked_by)
  values(v_club,v_event_division_points,v_tournament_points,'ACTIVE',v_owner),
    (v_club,v_event_division_non_scoring,v_tournament_non_scoring,'ACTIVE',v_owner);
  select player.id into v_club_player from public.club_players player
  where player.club_id=v_club and player.user_id=v_player limit 1;
  if v_club_player is null then
    raise exception 'FAIL | PLAYER aprobado sin club_player canónico';
  end if;
  insert into public.competition_player_entries(id,club_id,division_id,club_player_id,status,assigned_by)
  values(v_entry,v_club,v_division,v_club_player,'ACTIVE',v_owner);
  insert into public.tournament_teams(id,tournament_id,club_id,player1_user_id,player2_user_id,created_by)
  values(v_team_points,v_tournament_points,v_club,v_player,v_owner,v_owner),
    (v_team_non_scoring,v_tournament_non_scoring,v_club,v_player,v_owner,v_owner);

  perform set_config('selpa.competition_homologation_write','allowed',true);
  insert into public.competition_event_homologations(id,club_id,event_id,event_division_id,tournament_id,version,revision,status,result_snapshot,eligibility_snapshot,tournament_snapshot,submitted_by,submitted_at,approved_by,approved_at,created_by)
  values
    (v_homologation_points,v_club,v_event_points,v_event_division_points,v_tournament_points,1,1,'APPROVED',jsonb_build_object('source','QA'),jsonb_build_object('frozen',true),jsonb_build_object('tournament_id',v_tournament_points),v_owner,now(),v_owner,now(),v_owner),
    (v_homologation_non_scoring,v_club,v_event_non_scoring,v_event_division_non_scoring,v_tournament_non_scoring,1,1,'APPROVED',jsonb_build_object('source','QA'),jsonb_build_object('frozen',true),jsonb_build_object('tournament_id',v_tournament_non_scoring),v_owner,now(),v_owner,now(),v_owner);
  insert into public.competition_event_homologation_results(club_id,homologation_id,tournament_team_id,final_position,result_role,result_snapshot)
  values(v_club,v_homologation_points,v_team_points,1,'CHAMPION',jsonb_build_object('position',1)),
    (v_club,v_homologation_non_scoring,v_team_non_scoring,1,'CHAMPION',jsonb_build_object('position',1));
  insert into public.competition_event_homologation_participants(club_id,homologation_id,player_id,club_player_id,competition_player_entry_id,tournament_team_id,participation_status,scoring_eligibility_status,final_position,result_role,participant_snapshot)
  values(v_club,v_homologation_points,v_player,v_club_player,v_entry,v_team_points,'FINISHED','ELIGIBLE',1,'CHAMPION',jsonb_build_object('player_id',v_player,'display_name','QA Final Champion')),
    (v_club,v_homologation_non_scoring,v_player,v_club_player,v_entry,v_team_non_scoring,'FINISHED','ELIGIBLE',1,'CHAMPION',jsonb_build_object('player_id',v_player,'display_name','QA Final Champion'));

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  v_response:=public.create_competition_event_settlement_draft(v_club,v_event_division_points,'qa-finalize-settlement-create');
  v_settlement:=(v_response->>'settlement_id')::uuid;
  v_revision:=(v_response->>'revision')::integer;
  v_response:=public.calculate_competition_event_settlement(v_club,v_settlement,v_revision,'qa-finalize-settlement-calculate');
  v_revision:=(v_response->>'revision')::integer;
  v_response:=public.submit_competition_event_settlement(v_club,v_settlement,v_revision,'qa-finalize-settlement-submit');
  v_revision:=(v_response->>'revision')::integer;
  v_response:=public.approve_competition_event_settlement(v_club,v_settlement,v_revision,'qa-finalize-settlement-approve');
  v_revision:=(v_response->>'revision')::integer;
  v_response:=public.publish_competition_event_settlement(v_club,v_settlement,v_revision,'qa-finalize-settlement-publish');
  if v_response->>'status'<>'PUBLISHED' then raise exception 'FAIL | fixture no publicó settlement POINTS'; end if;
  if exists(select 1 from public.competition_point_transactions tx where tx.metadata->>'settlement_id'=v_settlement::text and tx.points=0) then
    raise exception 'FAIL | fixture POINTS generó movimiento cero';
  end if;
  if exists(select 1 from public.competition_event_settlements settlement where settlement.event_division_id=v_event_division_non_scoring) then
    raise exception 'FAIL | fixture NON_SCORING creó settlement innecesario';
  end if;
  select revision into v_revision from public.competition_series where id=v_series;
  v_preflight:=public.get_competition_series_finalization_preflight(v_club,v_series);
  if not coalesce((v_preflight->>'can_finalize')::boolean,false) then
    raise exception 'FAIL | fixture finalizable quedó bloqueado: %',v_preflight->'blockers';
  end if;

  -- PLAYER no puede finalizar.
  perform set_config('request.jwt.claim.sub',v_player::text,true);
  v_failed:=false;
  begin perform public.finalize_competition_series_atomic(v_club,v_series,v_revision);
  exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception 'FAIL | PLAYER pudo finalizar'; end if;

  -- El mismo actor autorizado no puede cruzar el tenant.
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_failed:=false;
  begin perform public.finalize_competition_series_atomic(v_other_club,v_series,v_revision);
  exception when insufficient_privilege or no_data_found then v_failed:=true; end;
  if not v_failed then raise exception 'FAIL | cross-club aceptado'; end if;

  -- Un circuito ACTIVE con una fecha DRAFT queda bloqueado sin tocar datos reales.
  reset role;
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series(club_id,season_id,name,status,created_by,activated_by,activated_at)
  values(v_club,v_season,'QA Finalize Pending', 'ACTIVE',v_owner,v_owner,now()) returning id into v_pending;
  perform set_config('selpa.competition_event_write','allowed',true);
  insert into public.competition_series_events(club_id,series_id,season_id,name,sequence,status,created_by)
  values(v_club,v_pending,v_season,'Fecha pendiente',1,'DRAFT',v_owner);
  v_preflight:=public.get_competition_series_finalization_preflight(v_club,v_pending);
  if coalesce((v_preflight->>'can_finalize')::boolean,true)
     or not (v_preflight->'blockers' @> '[{"code":"EVENT_PENDING"}]'::jsonb) then
    raise exception 'FAIL | fecha pendiente no bloqueó el cierre';
  end if;

  -- CANCELLED nunca equivale a finalizado.
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set status='CANCELLED',cancelled_by=v_owner,cancelled_at=now(),cancellation_reason='QA'
  where id=v_pending;
  v_preflight:=public.get_competition_series_finalization_preflight(v_club,v_pending);
  if not (v_preflight->'blockers' @> '[{"code":"SERIES_CANCELLED"}]'::jsonb) then
    raise exception 'FAIL | CANCELLED no fue rechazado';
  end if;

  -- Cierre real, snapshot completo e idempotencia.
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  set local role authenticated;
  select count(*) into v_events_before from public.competition_series_events where series_id=v_series;
  select count(*) into v_settlements_before from public.competition_event_settlements settlement
    where settlement.event_id in(select event.id from public.competition_series_events event where event.series_id=v_series);
  select count(*) into v_ledger_before from public.competition_point_transactions tx
    where tx.source_concept='COMPETITION_EVENT_SETTLEMENT' and nullif(tx.metadata->>'settlement_id','')::uuid in(
      select settlement.id from public.competition_event_settlements settlement
      where settlement.event_id in(select event.id from public.competition_series_events event where event.series_id=v_series));
  v_response:=public.finalize_competition_series_atomic(v_club,v_series,v_revision);
  if v_response->>'status'<>'CLOSED' or coalesce((v_response->>'replayed')::boolean,true) then
    raise exception 'FAIL | la primera finalización no cerró la Series';
  end if;
  select count(*) into v_snapshot_count from public.competition_series_final_rankings
  where series_id=v_series;
  if v_snapshot_count=0 or not exists(
    select 1 from public.competition_series_final_rankings where series_id=v_series and ranking_position=1
  ) then raise exception 'FAIL | no se congeló ranking/campeón'; end if;
  if (select count(*) from public.competition_series_events where series_id=v_series)<>v_events_before
     or (select count(*) from public.competition_event_settlements settlement where settlement.event_id in(
       select event.id from public.competition_series_events event where event.series_id=v_series))<>v_settlements_before
     or (select count(*) from public.competition_point_transactions tx where tx.source_concept='COMPETITION_EVENT_SETTLEMENT' and nullif(tx.metadata->>'settlement_id','')::uuid in(
       select settlement.id from public.competition_event_settlements settlement where settlement.event_id in(
         select event.id from public.competition_series_events event where event.series_id=v_series)))<>v_ledger_before then
    raise exception 'FAIL | el cierre alteró Events, settlements o ledger';
  end if;

  select series.revision into v_revision from public.competition_series series where series.id=v_series;
  v_replay:=public.finalize_competition_series_atomic(v_club,v_series,v_revision);
  if not coalesce((v_replay->>'replayed')::boolean,false)
     or (select count(*) from public.competition_series_final_rankings where series_id=v_series)<>v_snapshot_count then
    raise exception 'FAIL | replay duplicó o alteró el snapshot';
  end if;

  -- Snapshot y resultados de una Series cerrada son inmutables.
  v_failed:=false;
  begin update public.competition_series_final_rankings set display_name='Mutación inválida' where series_id=v_series;
  exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception 'FAIL | snapshot final mutable'; end if;

  reset role;
  v_failed:=false;
  begin
    perform set_config('selpa.competition_settlement_write','allowed',true);
    update public.competition_event_settlements settlement set updated_at=clock_timestamp()
    where settlement.event_id in(select event.id from public.competition_series_events event where event.series_id=v_series);
  exception when check_violation then v_failed:=true; end;
  if not v_failed then raise exception 'FAIL | settlement de circuito cerrado mutable'; end if;

  return query select 'PASS | cierre, campeón, snapshot, replay, PLAYER, cross-club, pending, cancelled e inmutabilidad';
end;
$$;

select * from pg_temp.run_competition_series_finalize_qa();

rollback;
