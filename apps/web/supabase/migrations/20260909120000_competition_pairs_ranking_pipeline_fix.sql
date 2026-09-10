begin;

alter table public.competition_series_divisions
  add column if not exists ranking_division_id uuid;

alter table public.competition_series_divisions
  drop constraint if exists competition_series_divisions_ranking_division_fkey;
alter table public.competition_series_divisions
  add constraint competition_series_divisions_ranking_division_fkey
  foreign key (club_id, ranking_division_id)
  references public.competition_divisions(club_id, id) on delete restrict;

create or replace function public.validate_competition_series_ranking_division()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  source_division public.competition_divisions%rowtype;
  ranking_division public.competition_divisions%rowtype;
begin
  select * into source_division
  from public.competition_divisions
  where id = new.division_id and club_id = new.club_id;

  if not found then
    raise exception 'La división base no pertenece al club.' using errcode = '23503';
  end if;

  if source_division.modality = 'INDIVIDUAL' then
    if new.ranking_division_id is not null and new.ranking_division_id <> new.division_id then
      raise exception 'Una serie INDIVIDUAL solo puede acreditar en su propia división.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.ranking_division_id is null then
    return new;
  end if;

  select * into ranking_division
  from public.competition_divisions
  where id = new.ranking_division_id and club_id = new.club_id;

  if not found then
    raise exception 'La división de ranking no pertenece al club.' using errcode = '23503';
  end if;
  if source_division.modality <> 'PAIRS' or ranking_division.modality <> 'INDIVIDUAL' then
    raise exception 'Una serie PAIRS debe acreditar en una división INDIVIDUAL.' using errcode = '23514';
  end if;
  if ranking_division.season_id <> source_division.season_id
     or ranking_division.branch_id <> source_division.branch_id
     or ranking_division.category_id is distinct from source_division.category_id
     or ranking_division.segment_id is not null then
    raise exception 'La división de ranking debe compartir temporada, rama y categoría, sin segmento.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_competition_series_divisions_ranking_scope on public.competition_series_divisions;
create trigger trg_competition_series_divisions_ranking_scope
  before insert or update of club_id, division_id, ranking_division_id
  on public.competition_series_divisions
  for each row execute function public.validate_competition_series_ranking_division();

create or replace function public.set_competition_series_ranking_division(
  p_club_id uuid,
  p_series_division_id uuid,
  p_revision integer,
  p_ranking_division_id uuid
)
returns public.competition_series_divisions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid;
  current_row public.competition_series_divisions%rowtype;
  result public.competition_series_divisions%rowtype;
begin
  actor := public.require_competition_series_access(p_club_id, 'competition:manage', false);
  select * into current_row
  from public.competition_series_divisions
  where id = p_series_division_id and club_id = p_club_id
  for update;
  if not found then raise exception 'Recurso inexistente.' using errcode = 'P0002'; end if;
  if current_row.revision <> p_revision then raise exception 'PRECONDITION_FAILED' using errcode = '40001'; end if;
  if exists (
    select 1 from public.competition_series_event_divisions event_division
    where event_division.series_division_id = current_row.id
      and event_division.is_active
      and (event_division.status <> 'DRAFT' or event_division.configuration_snapshot is not null)
  ) then
    raise exception 'RANKING_DIVISION_ALREADY_FROZEN' using errcode = '23514';
  end if;
  perform set_config('selpa.competition_series_write', 'allowed', true);
  update public.competition_series_divisions
  set ranking_division_id = p_ranking_division_id
  where id = current_row.id
  returning * into result;
  return result;
end;
$$;

create or replace function public.guard_competition_event_division_pipeline()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  series_division public.competition_series_divisions%rowtype;
  base_division public.competition_divisions%rowtype;
  ranking_id uuid;
  linked_tournament_status text;
begin
  if old.status = 'DRAFT' and new.status = 'SCHEDULED' then
    select * into series_division from public.competition_series_divisions where id = new.series_division_id;
    select * into base_division from public.competition_divisions where id = series_division.division_id;
    ranking_id := case when base_division.modality = 'INDIVIDUAL' then base_division.id else series_division.ranking_division_id end;
    if new.scoring_mode = 'POINTS' and ranking_id is null then
      raise exception 'RANKING_DIVISION_REQUIRED: PAIRS + POINTS requiere una división INDIVIDUAL de ranking.' using errcode = '23514';
    end if;
    if ranking_id is not null then
      new.configuration_snapshot := coalesce(new.configuration_snapshot, '{}'::jsonb)
        || jsonb_build_object('ranking_division_id', ranking_id);
    end if;
  end if;

  if old.status = 'SCHEDULED' and new.status = 'COMPLETED' then
    select tournament.status::text into linked_tournament_status
    from public.competition_series_event_tournament_links link
    join public.tournaments tournament on tournament.id = link.tournament_id and tournament.club_id = link.club_id
    where link.club_id = new.club_id and link.event_division_id = new.id and link.status = 'ACTIVE';
    if linked_tournament_status is distinct from 'FINISHED' then
      raise exception 'TOURNAMENT_NOT_FINISHED: el torneo vinculado debe finalizarse antes de completar Competition.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_competition_event_division_pipeline on public.competition_series_event_divisions;
create trigger trg_zz_competition_event_division_pipeline
  before update on public.competition_series_event_divisions
  for each row execute function public.guard_competition_event_division_pipeline();

-- The current full-placement extractor wraps this audited base function.
create or replace function public.extract_competition_event_homologation_results_base_20260802(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; h public.competition_event_homologations%rowtype; d public.competition_series_event_divisions%rowtype; replay jsonb; response jsonb; incomplete integer; duplicate_players integer; final_match_id uuid; final_team1 uuid; final_team2 uuid; final_winner uuid; requires_entry boolean:=true; allow_invited boolean:=false; invited_policy text:='REQUIRE_ENTRY'; tournament_status text; age_id uuid; age_min integer; age_max integer; age_reference date; eligibility_at timestamptz; ranking_id uuid;
begin
  a:=public.require_competition_homologation_access(p_club_id,false);
  select * into h from public.competition_event_homologations where id=p_homologation_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if h.status<>'DRAFT' then raise exception 'HOMOLOGATION_IMMUTABLE' using errcode='23514'; end if;
  replay:=public.begin_competition_homologation_command(p_club_id,h.event_division_id,h.id,'EXTRACT',p_idempotency_key,jsonb_build_object('homologation_id',h.id,'revision',p_revision)); if replay is not null then return replay; end if;
  if h.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  select * into d from public.competition_series_event_divisions where id=h.event_division_id;
  select coalesce(e.actual_starts_at,e.planned_starts_at,e.completed_at,e.created_at),t.status::text
    into eligibility_at,tournament_status
  from public.competition_series_events e
  join public.tournaments t on t.id=h.tournament_id and t.club_id=p_club_id
  where e.id=d.event_id;
  ranking_id := nullif(d.configuration_snapshot->>'ranking_division_id','')::uuid;
  select coalesce(x.requires_active_entry,true),coalesce(x.allow_invited_players,false),coalesce(x.invited_points_policy,'REQUIRE_ENTRY'),x.age_category_id
    into requires_entry,allow_invited,invited_policy,age_id from public.competition_series_eligibility x where x.series_rule_id=d.series_rule_id;
  if age_id is not null then
    select c.min_age,c.max_age,case c.age_reference_rule when 'EVENT_START_DATE' then coalesce(e.actual_starts_at,e.planned_starts_at)::date when 'SERIES_START_DATE' then s.starts_on when 'SEASON_START_DATE' then season.starts_on when 'SEASON_END_DATE' then season.ends_on when 'CALENDAR_YEAR_END' then make_date(extract(year from coalesce(e.actual_starts_at,e.planned_starts_at))::integer,12,31) else (c.age_reference_config->>'date')::date end
    into age_min,age_max,age_reference from public.competition_age_categories c join public.competition_series_events e on e.id=d.event_id join public.competition_series s on s.id=e.series_id join public.competition_seasons season on season.id=e.season_id where c.id=age_id and c.club_id=p_club_id;
  end if;
  perform set_config('selpa.competition_homologation_write','allowed',true);
  delete from public.competition_event_homologation_issues where homologation_id=h.id;
  delete from public.competition_event_homologation_participants where homologation_id=h.id;
  delete from public.competition_event_homologation_results where homologation_id=h.id;
  insert into public.competition_event_homologation_results(club_id,homologation_id,tournament_team_id,matches_played,wins,losses,walkovers,result_snapshot)
  select p_club_id,h.id,t.id,count(m.id),count(m.id) filter(where m.winner_team_id=t.id),count(m.id) filter(where m.status='PLAYED' and m.winner_team_id is distinct from t.id),0,
    jsonb_build_object('team_id',t.id,'player1_user_id',t.player1_user_id,'player2_user_id',t.player2_user_id)
  from public.tournament_teams t left join public.tournament_matches m on m.tournament_id=t.tournament_id and t.id in(m.team1_id,m.team2_id)
  where t.tournament_id=h.tournament_id and t.club_id=p_club_id group by t.id;
  select m.id,m.team1_id,m.team2_id,m.winner_team_id into final_match_id,final_team1,final_team2,final_winner from public.tournament_matches m where m.tournament_id=h.tournament_id and m.phase='FINAL' and m.status='PLAYED' order by m.match_order desc,m.created_at desc limit 1;
  if final_match_id is not null and final_winner is not null then
    update public.competition_event_homologation_results set final_position=case when tournament_team_id=final_winner then 1 else 2 end,result_role=case when tournament_team_id=final_winner then 'CHAMPION' else 'RUNNER_UP' end where homologation_id=h.id and tournament_team_id in(final_team1,final_team2);
  end if;
  insert into public.competition_event_homologation_participants(club_id,homologation_id,player_id,club_player_id,competition_player_entry_id,tournament_team_id,participation_status,scoring_eligibility_status,exclusion_code,exclusion_reason,final_position,result_role,participant_snapshot)
  select p_club_id,h.id,u.user_id,cp.id,pe.id,u.team_id,'PARTICIPATED',
    case when d.scoring_mode='NON_SCORING' or (pe.id is null and allow_invited and invited_policy='NON_SCORING') then 'NON_SCORING' when cp.id is null then 'PLAYER_INACTIVE' when pe.id is null then 'ENTRY_MISSING' else 'ELIGIBLE' end,
    case when d.scoring_mode='NON_SCORING' then 'NON_SCORING_EVENT' when pe.id is null and allow_invited and invited_policy='NON_SCORING' then 'INVITED_NON_SCORING' when cp.id is null then 'CLUB_PLAYER_MISSING' when pe.id is null then 'ACTIVE_ENTRY_REQUIRED' end,
    case when d.scoring_mode='NON_SCORING' then 'El evento no adjudica puntos.' when pe.id is null and allow_invited and invited_policy='NON_SCORING' then 'Invitado habilitado para participar sin puntuar.' when cp.id is null then 'No existe jugador activo del club.' when pe.id is null then 'Falta entrada competitiva vigente a la fecha del evento.' end,
    r.final_position,r.result_role,jsonb_build_object('player_id',u.user_id,'display_name',coalesce(pr.display_name,cp.display_name),'team_id',u.team_id,'club_player_id',cp.id,'entry_id',pe.id,'division_id',ranking_id,'ranking_division_id',ranking_id,'eligibility_at',eligibility_at)
  from (select distinct on(raw.user_id) raw.team_id,raw.user_id from (select t.id team_id,t.player1_user_id user_id from public.tournament_teams t where t.tournament_id=h.tournament_id union all select t.id,t.player2_user_id from public.tournament_teams t where t.tournament_id=h.tournament_id and t.player2_user_id is not null) raw order by raw.user_id,raw.team_id) u
  join public.competition_event_homologation_results r on r.homologation_id=h.id and r.tournament_team_id=u.team_id
  left join public.club_players cp on cp.club_id=p_club_id and cp.user_id=u.user_id and cp.approved_at is not null
  left join public.profiles pr on pr.user_id=u.user_id
  left join lateral (
    select entry.* from public.competition_player_entries entry
    where entry.club_id=p_club_id and entry.club_player_id=cp.id and entry.division_id=ranking_id
      and entry.valid_from<=eligibility_at and (entry.valid_until is null or eligibility_at<entry.valid_until)
      and entry.status<>'SUSPENDED'
    order by entry.valid_from desc,entry.created_at desc limit 1
  ) pe on true;
  if age_id is not null then
    update public.competition_event_homologation_participants hp set scoring_eligibility_status='AGE_INELIGIBLE',exclusion_code='AGE_CATEGORY_INVALID',exclusion_reason='La edad no cumple la categoría etaria congelada.'
    from public.profiles profile where hp.homologation_id=h.id and hp.player_id=profile.user_id and (profile.birth_date is null or age_reference is null or (age_min is not null and extract(year from age(age_reference,profile.birth_date))<age_min) or (age_max is not null and extract(year from age(age_reference,profile.birth_date))>age_max));
  end if;
  select count(*) into incomplete from public.tournament_matches m where m.tournament_id=h.tournament_id and (m.status<>'PLAYED' or m.winner_team_id is null);
  select count(*) into duplicate_players from (select raw.user_id from (select t.player1_user_id user_id from public.tournament_teams t where t.tournament_id=h.tournament_id union all select t.player2_user_id from public.tournament_teams t where t.tournament_id=h.tournament_id) raw group by raw.user_id having count(*)>1) duplicated;
  if duplicate_players>0 then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message,details) values(p_club_id,h.id,'PARTICIPANT_DUPLICATED','BLOCKER','Un participante aparece en más de un equipo.',jsonb_build_object('count',duplicate_players)); end if;
  if tournament_status is distinct from 'FINISHED' then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message,details) values(p_club_id,h.id,'TOURNAMENT_NOT_FINISHED','BLOCKER','El torneo operativo no está finalizado.',jsonb_build_object('status',tournament_status)); end if;
  if d.scoring_mode='POINTS' and ranking_id is null then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message) values(p_club_id,h.id,'RANKING_DIVISION_MISSING','BLOCKER','Falta la división individual de ranking congelada.'); end if;
  if incomplete>0 then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message,details) values(p_club_id,h.id,'MATCHES_INCOMPLETE','BLOCKER','Hay partidos incompletos.',jsonb_build_object('count',incomplete)); end if;
  if final_match_id is null then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message) values(p_club_id,h.id,'FINAL_RESULT_MISSING','BLOCKER','Falta un resultado final válido.'); end if;
  insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,entity_type,entity_id,message)
  select p_club_id,h.id,'SCORING_INELIGIBLE',case when p.scoring_eligibility_status in('ENTRY_MISSING','PLAYER_INACTIVE') and d.scoring_mode='POINTS' and invited_policy='REQUIRE_ENTRY' then 'BLOCKER' else 'WARNING' end,'PLAYER',p.player_id,coalesce(p.exclusion_reason,'Participante no elegible para puntuar.') from public.competition_event_homologation_participants p where p.homologation_id=h.id and p.scoring_eligibility_status<>'ELIGIBLE';
  update public.competition_event_homologations set revision=revision+1,eligibility_snapshot=coalesce(eligibility_snapshot,'{}'::jsonb)||jsonb_build_object('ranking_division_id',ranking_id,'eligibility_at',eligibility_at),source_results_revision=encode(extensions.digest((select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'winner',m.winner_team_id,'score',m.score) order by m.id),'[]'::jsonb)::text from public.tournament_matches m where m.tournament_id=h.tournament_id),'sha256'),'hex'),updated_at=now() where id=h.id returning revision into p_revision;
  response:=jsonb_build_object('id',h.id,'revision',p_revision,'status','DRAFT'); perform public.finish_competition_homologation_command(p_club_id,h.event_division_id,'EXTRACT',p_idempotency_key,response); return response;
end $$;

create or replace function public.calculate_competition_event_settlement(p_club_id uuid,p_settlement_id uuid,p_revision integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; s public.competition_event_settlements%rowtype; h public.competition_event_homologations%rowtype; replay jsonb; missing int; ranking_id uuid;
begin actor:=public.require_competition_settlement_access(p_club_id,false); if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if; select * into s from public.competition_event_settlements where club_id=p_club_id and id=p_settlement_id for update; if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  replay:=public.begin_competition_settlement_command(p_club_id,s.event_division_id,s.id,'CALCULATE',p_idempotency_key,jsonb_build_object('settlement',s.id,'revision',p_revision)); if replay is not null then return replay; end if; if s.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if; if s.status not in('DRAFT','CALCULATED') then raise exception 'INVALID_LIFECYCLE' using errcode='23514'; end if;
  select * into h from public.competition_event_homologations where id=s.homologation_id and club_id=p_club_id; if h.status<>'APPROVED' or h.revision<>s.homologation_revision then raise exception 'HOMOLOGATION_STALE' using errcode='23514'; end if;
  ranking_id:=nullif(s.calculation_snapshot->'event_configuration'->>'ranking_division_id','')::uuid;
  perform set_config('selpa.competition_settlement_write','allowed',true); delete from public.competition_event_settlement_issues where settlement_id=s.id; delete from public.competition_event_settlement_awards where settlement_id=s.id;
  insert into public.competition_event_settlement_awards(club_id,settlement_id,player_id,club_player_id,competition_player_entry_id,homologation_participant_id,final_position,result_code,base_points,multiplier,bonus_points,penalty_points,total_points,scoring_eligibility_status,excluded_reason,calculation_detail)
  select p_club_id,s.id,p.player_id,p.club_player_id,p.competition_player_entry_id,p.id,p.final_position,p.result_role,
    case when s.scoring_mode='NON_SCORING' or p.scoring_eligibility_status<>'ELIGIBLE' then 0 else coalesce((r.value->>'points')::integer,0) end,s.effective_multiplier,
    case when s.scoring_mode='POINTS' and p.scoring_eligibility_status='ELIGIBLE' then coalesce((s.calculation_snapshot->'series_rule'->'bonus_rules'->>p.result_role)::integer,0) else 0 end,
    case when s.scoring_mode='POINTS' and p.scoring_eligibility_status='ELIGIBLE' then -abs(coalesce((s.calculation_snapshot->'series_rule'->'penalty_rules'->>p.result_role)::integer,0)) else 0 end,
    round(((case when s.scoring_mode='NON_SCORING' or p.scoring_eligibility_status<>'ELIGIBLE' then 0 else coalesce((r.value->>'points')::integer,0) end)+case when s.scoring_mode='POINTS' and p.scoring_eligibility_status='ELIGIBLE' then coalesce((s.calculation_snapshot->'series_rule'->'bonus_rules'->>p.result_role)::integer,0)-abs(coalesce((s.calculation_snapshot->'series_rule'->'penalty_rules'->>p.result_role)::integer,0)) else 0 end)*s.effective_multiplier)::integer,
    case when s.scoring_mode='NON_SCORING' then 'NON_SCORING' else p.scoring_eligibility_status end,case when s.scoring_mode='NON_SCORING' then 'NON_SCORING_EVENT' when p.scoring_eligibility_status<>'ELIGIBLE' then p.exclusion_reason end,
    jsonb_build_object('rule_key',p.result_role,'rule_found',r.value is not null,'rounding','ROUND_NEAREST_INTEGER','homologation_revision',h.revision,'ranking_division_id',ranking_id,'tournament_team_id',p.tournament_team_id,'eligibility_at',p.participant_snapshot->>'eligibility_at')
  from public.competition_event_homologation_participants p
  left join lateral jsonb_array_elements(coalesce(s.calculation_snapshot->'points_rules','[]'::jsonb)) r(value) on upper(r.value->>'rule_key')=upper(p.result_role)
  where p.homologation_id=h.id;
  insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,entity_type,entity_id,message)
  select p_club_id,s.id,'RESULT_RULE_MISSING','BLOCKER','PLAYER',a.player_id,'No existe una regla congelada aplicable al resultado homologado.' from public.competition_event_settlement_awards a where a.settlement_id=s.id and s.scoring_mode='POINTS' and a.scoring_eligibility_status='ELIGIBLE' and coalesce((a.calculation_detail->>'rule_found')::boolean,false)=false;
  insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,entity_type,entity_id,message)
  select p_club_id,s.id,'NON_SCORING_PARTICIPANT','WARNING','PLAYER',a.player_id,'El participante no adjudica puntos.' from public.competition_event_settlement_awards a where a.settlement_id=s.id and a.scoring_eligibility_status<>'ELIGIBLE';
  insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,entity_type,entity_id,message)
  select p_club_id,s.id,'ELIGIBLE_ENTRY_INVALID','BLOCKER','PLAYER',a.player_id,'La entrada individual no coincide con la elegibilidad homologada.'
  from public.competition_event_settlement_awards a
  left join public.competition_player_entries pe on pe.id=a.competition_player_entry_id and pe.club_id=p_club_id
  where a.settlement_id=s.id and a.scoring_eligibility_status='ELIGIBLE'
    and (pe.id is null or pe.division_id<>ranking_id or pe.club_player_id<>a.club_player_id);
  if s.scoring_mode='POINTS' and (ranking_id is null or s.points_scheme_id is null or jsonb_array_length(coalesce(s.calculation_snapshot->'points_rules','[]'::jsonb))=0) then
    insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,message) values(p_club_id,s.id,'POINTS_CONFIGURATION_INVALID','BLOCKER','El esquema o la división de ranking congelados no son válidos.');
  end if;
  select count(*) into missing from public.competition_event_homologation_participants where homologation_id=h.id; if missing=0 then insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,message) values(p_club_id,s.id,'PARTICIPANTS_MISSING','BLOCKER','La homologación no tiene participantes.'); end if;
  update public.competition_event_settlements set status='CALCULATED',revision=revision+1,calculated_by=actor,calculated_at=now(),calculation_snapshot=calculation_snapshot||jsonb_build_object('result_snapshot',h.result_snapshot,'eligibility_snapshot',h.eligibility_snapshot,'calculated_at',now()),updated_at=now() where id=s.id returning * into s;
  replay:=jsonb_build_object('settlement_id',s.id,'revision',s.revision,'status',s.status); perform public.finish_competition_settlement_command(p_club_id,s.event_division_id,'CALCULATE',p_idempotency_key,replay); return replay;
end $$;

create or replace function public.transition_competition_event_settlement(p_club_id uuid,p_settlement_id uuid,p_revision integer,p_operation text,p_idempotency_key text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; s public.competition_event_settlements%rowtype; op text:=upper(p_operation); replay jsonb; pf jsonb; reason text:=nullif(btrim(p_payload->>'reason'),'');
begin actor:=public.require_competition_settlement_access(p_club_id,op in('APPROVE','REJECT','PUBLISH','SUPERSEDE')); if op='SUBMIT' and not public.is_platform_admin() and not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if; select * into s from public.competition_event_settlements where club_id=p_club_id and id=p_settlement_id for update; if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  replay:=public.begin_competition_settlement_command(p_club_id,s.event_division_id,s.id,op,p_idempotency_key,jsonb_build_object('settlement',s.id,'revision',p_revision,'payload',p_payload)); if replay is not null then return replay; end if; if s.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  pf:=public.get_competition_event_settlement_preflight(p_club_id,s.id); perform set_config('selpa.competition_settlement_write','allowed',true);
  if op='SUBMIT' then if s.status<>'CALCULATED' or jsonb_array_length(pf->'blockers')>0 then raise exception 'PREFLIGHT_BLOCKED' using errcode='23514'; end if; update public.competition_event_settlements set status='SUBMITTED',submitted_by=actor,submitted_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='APPROVE' then if s.status<>'SUBMITTED' or jsonb_array_length(pf->'blockers')>0 then raise exception 'PREFLIGHT_BLOCKED' using errcode='23514'; end if; update public.competition_event_settlements set status='APPROVED',approved_by=actor,approved_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='REJECT' then if s.status<>'SUBMITTED' or reason is null then raise exception 'REJECTION_REASON_REQUIRED' using errcode='22023'; end if; update public.competition_event_settlements set status='REJECTED',rejected_by=actor,rejected_at=now(),rejection_reason=reason,revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='SUPERSEDE' then if s.status not in('DRAFT','CALCULATED','SUBMITTED','APPROVED') or reason is null then raise exception 'INVALID_LIFECYCLE' using errcode='23514'; end if; update public.competition_event_settlements set status='SUPERSEDED',superseded_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='PUBLISH' then
    if s.status<>'APPROVED' or jsonb_array_length(pf->'blockers')>0 then raise exception 'PREFLIGHT_BLOCKED' using errcode='23514'; end if;
    perform set_config('selpa.competition_points_write','allowed',true);
    insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,effective_at,reason,rule_snapshot,metadata,created_by)
    select s.club_id,ranking.season_id,ranking.id,a.competition_player_entry_id,a.club_player_id,'TOURNAMENT_RESULT','TOURNAMENT',h.tournament_id,'COMPETITION_EVENT_SETTLEMENT','settlement:'||s.id||':award:'||a.id,a.total_points,coalesce(e.actual_ends_at,e.planned_ends_at,e.actual_starts_at,e.planned_starts_at,now()),'Settlement publicado',a.calculation_detail,
      jsonb_build_object('settlement_id',s.id,'award_id',a.id,'homologation_id',s.homologation_id,'event_id',s.event_id,'event_division_id',s.event_division_id,'tournament_id',h.tournament_id,'tournament_team_id',p.tournament_team_id,'pairs_division_id',sd.division_id,'ranking_division_id',ranking.id,'eligibility_at',a.calculation_detail->>'eligibility_at','final_position',a.final_position,'result_code',a.result_code,'base_points',a.base_points,'multiplier',a.multiplier,'bonus',a.bonus_points,'penalty',a.penalty_points,'settlement_version',s.version),actor
    from public.competition_event_settlement_awards a
    join public.competition_event_homologation_participants p on p.id=a.homologation_participant_id
    join public.competition_event_homologations h on h.id=s.homologation_id
    join public.competition_series_events e on e.id=s.event_id
    join public.competition_series_event_divisions ed on ed.id=s.event_division_id
    join public.competition_series_divisions sd on sd.id=ed.series_division_id
    join public.competition_divisions ranking on ranking.id=nullif(ed.configuration_snapshot->>'ranking_division_id','')::uuid
    where a.settlement_id=s.id and a.total_points<>0 and a.scoring_eligibility_status='ELIGIBLE';
    update public.competition_event_settlements set status='PUBLISHED',published_by=actor,published_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  else raise exception 'UNKNOWN_OPERATION' using errcode='22023'; end if;
  replay:=jsonb_build_object('settlement_id',s.id,'revision',s.revision,'status',s.status); perform public.finish_competition_settlement_command(p_club_id,s.event_division_id,op,p_idempotency_key,replay); return replay;
end $$;

create or replace function public.validate_competition_point_transaction()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_entry record; v_original public.competition_point_transactions%rowtype; historical_settlement boolean; historical_eligibility_at timestamptz;
begin
  if current_setting('selpa.competition_points_write',true) is distinct from 'allowed' then raise exception 'Los movimientos de puntos solo pueden crearse mediante operaciones autorizadas.' using errcode='42501'; end if;
  select entry.club_id,entry.club_player_id,entry.division_id,entry.status,entry.valid_from,entry.valid_until,division.season_id,division.modality,division.segment_id
    into v_entry from public.competition_player_entries entry join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id where entry.id=new.player_entry_id;
  if not found then raise exception 'Entrada competitiva inexistente.' using errcode='23503'; end if;
  if v_entry.club_id<>new.club_id or v_entry.club_player_id<>new.club_player_id or v_entry.division_id<>new.division_id or v_entry.season_id<>new.season_id then raise exception 'Club, temporada, división, entrada y jugador no pertenecen al mismo recorrido.' using errcode='23514'; end if;
  if v_entry.modality<>'INDIVIDUAL' then raise exception 'Stage 4 solo admite entradas individuales.' using errcode='23514'; end if;
  if new.transaction_type='TOURNAMENT_RESULT' and new.source_concept='COMPETITION_EVENT_SETTLEMENT' then
    historical_eligibility_at:=nullif(new.metadata->>'eligibility_at','')::timestamptz;
    if historical_eligibility_at is null then
      raise exception 'El settlement no contiene eligibility_at en su snapshot histórico.' using errcode='23514';
    end if;
  end if;
  historical_settlement:=new.transaction_type='TOURNAMENT_RESULT' and new.source_concept='COMPETITION_EVENT_SETTLEMENT' and historical_eligibility_at>=v_entry.valid_from and (v_entry.valid_until is null or historical_eligibility_at<v_entry.valid_until) and v_entry.status<>'SUSPENDED';
  if new.transaction_type='TOURNAMENT_RESULT' and new.source_concept='COMPETITION_EVENT_SETTLEMENT' and not historical_settlement then
    raise exception 'La entrada competitiva no era válida en eligibility_at.' using errcode='23514';
  end if;
  if (v_entry.status<>'ACTIVE' or v_entry.valid_until is not null) and new.transaction_type not in('REVERSAL','MANUAL_ADJUSTMENT','SYSTEM_CORRECTION') and not historical_settlement then raise exception 'La entrada competitiva no estaba vigente a la fecha efectiva.' using errcode='23514'; end if;
  if new.transaction_type='OPENING_BALANCE' and (new.source_type<>'LEGACY_OPENING_BALANCE' or new.source_id is not null) then raise exception 'Origen inválido para OPENING_BALANCE.' using errcode='23514'; end if;
  if new.transaction_type='REVERSAL' then
    select * into v_original from public.competition_point_transactions where id=new.reversed_transaction_id for update;
    if not found then raise exception 'Movimiento original inexistente.' using errcode='23503'; end if;
    if v_original.transaction_type='REVERSAL' then raise exception 'Una reversión no puede revertirse directamente.' using errcode='23514'; end if;
    if v_original.club_id<>new.club_id or v_original.season_id<>new.season_id or v_original.division_id<>new.division_id or v_original.player_entry_id<>new.player_entry_id or v_original.club_player_id<>new.club_player_id or new.points<>-v_original.points then raise exception 'La reversión no compensa exactamente al movimiento original.' using errcode='23514'; end if;
  end if;
  return new;
end $$;

-- Migration-history drift: this object lives locally in
-- 20260902120000_competition_pair_ranking_projection.sql, but production records
-- it as 20260903124241 competition_pair_ranking_projection. Do not run a global
-- db push until that history is reconciled; apply this corrective migration alone.
create or replace view public.competition_pair_ranking_projection
with (security_invoker = true) as
with effective_awards as (
  select original.metadata->>'award_id' as award_id, sum(tx.points)::bigint as points
  from public.competition_point_transactions tx
  join public.competition_point_transactions original on original.id=coalesce(tx.reversed_transaction_id,tx.id)
  where original.source_concept='COMPETITION_EVENT_SETTLEMENT'
  group by original.metadata->>'award_id'
), team_results as (
  select settlement.club_id,settlement.id settlement_id,ledger.season_id,ledger.division_id,
    participant.tournament_team_id,
    array_agg(distinct award.player_id order by award.player_id) player_ids,
    max(effective.points) points,
    (array_agg((ledger.metadata->>'pairs_division_id')::uuid))[1] pairs_division_id
  from effective_awards effective
  join public.competition_event_settlement_awards award on award.id=effective.award_id::uuid
  join public.competition_event_settlements settlement on settlement.id=award.settlement_id and settlement.status='PUBLISHED'
  join public.competition_event_homologation_participants participant on participant.id=award.homologation_participant_id
  join public.competition_point_transactions ledger on ledger.metadata->>'award_id'=award.id::text and ledger.transaction_type='TOURNAMENT_RESULT'
  where effective.points<>0
  group by settlement.club_id,settlement.id,ledger.season_id,ledger.division_id,participant.tournament_team_id
  having count(distinct award.player_id)=2
)
select club_id,season_id,division_id,player_ids[1] player1_user_id,player_ids[2] player2_user_id,
  concat(player_ids[1]::text,':',player_ids[2]::text) pair_key,sum(points)::bigint total_points,count(*)::integer settled_results,
  pairs_division_id
from team_results
where cardinality(player_ids)=2
group by club_id,season_id,division_id,pairs_division_id,player_ids;

revoke all on public.competition_pair_ranking_projection from public,anon,authenticated,service_role;
grant select on public.competition_pair_ranking_projection to service_role;

revoke all on function public.set_competition_series_ranking_division(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.set_competition_series_ranking_division(uuid,uuid,integer,uuid) to authenticated,service_role;
revoke all on function public.validate_competition_series_ranking_division(),public.guard_competition_event_division_pipeline() from public,anon,authenticated;

comment on column public.competition_series_divisions.ranking_division_id is
  'División INDIVIDUAL donde acreditan puntos los integrantes de una división PAIRS.';
comment on view public.competition_pair_ranking_projection is
  'Proyección reconstruible por settlement + tournament_team_id; usa la división individual del ledger y compensa reversals.';

commit;
