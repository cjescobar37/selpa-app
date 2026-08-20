begin;

create or replace function pg_temp.run_tournament_pause_resume_p0_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid; v_other_owner uuid; v_club uuid; v_players uuid[]; v_tournament uuid;
  v_primary_venue uuid; v_courts uuid[]; v_link_tournament uuid; v_link_id uuid;
  v_team uuid; v_registration uuid; v_before_teams integer; v_before_registrations integer;
  v_before_venues integer; v_before_assignments integer; v_state text; v_failed boolean;
begin
  if to_regprocedure('public.pause_tournament(uuid,uuid)') is null
     or to_regprocedure('public.resume_tournament(uuid,uuid)') is null
     or to_regprocedure('public.register_team_for_tournament(uuid,uuid,uuid)') is null
     or to_regprocedure('public.create_tournament_canonical(uuid,jsonb)') is null then
    return query select 'FAIL', 'QA no ejecutable: faltan las RPC canónicas de torneo o PAUSED.'; return;
  end if;
  if not exists (
    select 1
    from information_schema.columns column_def
    where column_def.table_schema = 'public'
      and column_def.table_name = 'tournaments'
      and column_def.column_name = 'status'
      and column_def.data_type = 'text'
  ) then
    return query select 'FAIL', 'QA status: public.tournaments.status no coincide con el contrato text vigente.'; return;
  end if;

  select membership.user_id,membership.club_id into v_owner,v_club
  from public.club_memberships membership
  where membership.role in ('OWNER','ADMIN') and membership.status='APPROVED' and membership.approved_at is not null
    and exists(select 1 from public.club_venues venue where venue.club_id=membership.club_id and venue.is_primary and venue.is_active)
    and exists(select 1 from public.competition_series_event_tournament_links link where link.club_id=membership.club_id and link.status='ACTIVE')
    and (select count(distinct club_player.user_id) from public.club_players club_player where club_player.club_id=membership.club_id) >= 4
  order by membership.created_at,membership.user_id limit 1;
  select array_agg(player.user_id order by player.user_id) into v_players from (
    select distinct club_player.user_id from public.club_players club_player where club_player.club_id=v_club order by club_player.user_id limit 4
  ) player;
  select membership.user_id into v_other_owner from public.club_memberships membership
  where membership.club_id<>v_club and membership.role in ('OWNER','ADMIN') and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at,membership.user_id limit 1;
  if v_owner is null or coalesce(array_length(v_players,1),0)<4 or v_other_owner is null then
    return query select 'FAIL', 'QA no ejecutable: se requiere OWNER/ADMIN, segundo OWNER/ADMIN y cuatro jugadores del mismo club.'; return;
  end if;
  select id into v_primary_venue from public.club_venues where club_id=v_club and is_primary and is_active;
  if v_primary_venue is null then return query select 'FAIL','QA no ejecutable: falta venue principal activo.'; return; end if;
  select link.id,link.tournament_id into v_link_id,v_link_tournament
  from public.competition_series_event_tournament_links link
  join public.tournaments tournament on tournament.id=link.tournament_id and tournament.club_id=link.club_id
  where link.club_id=v_club and link.status='ACTIVE'
  order by link.linked_at limit 1;
  if v_link_id is null then return query select 'FAIL','QA no ejecutable: falta Competition link ACTIVE administrable.'; return; end if;

  -- Fixtures íntegramente transaccionales y canónicos: torneo DRAFT + inventario real de canchas.
  insert into public.venue_courts(venue_id,name,sort_order,is_active) values
    (v_primary_venue,'QA PAUSED Court 1',980,true),(v_primary_venue,'QA PAUSED Court 2',981,true)
  on conflict(venue_id,name) do update set is_active=true;
  select array_agg(id order by sort_order) into v_courts from public.venue_courts
  where venue_id=v_primary_venue and name in ('QA PAUSED Court 1','QA PAUSED Court 2');
  if coalesce(array_length(v_courts,1),0)<>2 then raise exception 'Fixtures de canchas PAUSED incompletos'; end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  select tournament.id into v_tournament from public.create_tournament_canonical(v_club,jsonb_build_object(
    'name','QA PAUSED lifecycle','type','OPEN','gender','MALE','segment','LIBRES','category_id',6,
    'start_date',(current_date+7)::text,'end_date',(current_date+8)::text,'registration_deadline',(now()+interval '2 days')::text,
    'min_pairs',2,'max_pairs',8,'price_per_player',0
  )) tournament;
  reset role;
  update public.tournaments set status='OPEN' where id=v_tournament;
  set local role authenticated; perform public.replace_tournament_court_assignments(v_club,v_tournament,v_primary_venue,v_courts); reset role;

  -- Inscripción real previa a PAUSED, que debe preservarse.
  perform set_config('request.jwt.claim.sub',v_players[1]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  select result.team_id,result.registration_id into v_team,v_registration from public.register_team_for_tournament(v_tournament,v_club,v_players[2]) result; reset role;
  if v_team is null or v_registration is null then raise exception 'No se creó inscripción fixture'; end if;
  select count(*) into v_before_teams from public.tournament_teams where tournament_id=v_tournament;
  select count(*) into v_before_registrations from public.tournament_registrations where tournament_id=v_tournament;
  select count(*) into v_before_venues from public.tournament_venues where tournament_id=v_tournament and status='ACTIVE';
  select count(*) into v_before_assignments from public.tournament_court_assignments where tournament_id=v_tournament and status='ACTIVE';

  -- OPEN -> PAUSED, preservación e inscripción bloqueada por la RPC real.
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  perform public.pause_tournament(v_club,v_tournament);
  if (select status::text from public.tournaments where id=v_tournament)<>'PAUSED' then raise exception 'OPEN -> PAUSED falló'; end if;
  if (select count(*) from public.tournament_teams where tournament_id=v_tournament)<>v_before_teams
     or (select count(*) from public.tournament_registrations where tournament_id=v_tournament)<>v_before_registrations
     or not exists(select 1 from public.tournament_registrations where id=v_registration and team_id=v_team)
     or (select count(*) from public.tournament_venues where tournament_id=v_tournament and status='ACTIVE')<>v_before_venues
     or (select count(*) from public.tournament_court_assignments where tournament_id=v_tournament and status='ACTIVE')<>v_before_assignments then
    raise exception 'PAUSED alteró inscripciones o venues/courts'; end if;
  reset role; perform set_config('request.jwt.claim.sub',v_players[3]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.register_team_for_tournament(v_tournament,v_club,v_players[4]); exception when check_violation then if sqlerrm='TOURNAMENT_PAUSED' then v_failed:=true; else raise; end if; end;
  if not v_failed then raise exception 'La inscripción durante PAUSED no devolvió TOURNAMENT_PAUSED'; end if;

  -- PAUSED -> OPEN y todos los orígenes inválidos de pause/resume.
  reset role; perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  perform public.resume_tournament(v_club,v_tournament); if (select status::text from public.tournaments where id=v_tournament)<>'OPEN' then raise exception 'PAUSED -> OPEN falló'; end if; reset role;

  -- Un vínculo Competition existente se pausa/reanuda sin cambiar su historia ni su tournament_id.
  update public.tournaments set status='OPEN' where id=v_link_tournament;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  perform public.pause_tournament(v_club,v_link_tournament); perform public.resume_tournament(v_club,v_link_tournament); reset role;
  if not exists(select 1 from public.competition_series_event_tournament_links link where link.id=v_link_id and link.tournament_id=v_link_tournament and link.status='ACTIVE') then
    raise exception 'PAUSED alteró o removió el Competition link existente';
  end if;
  foreach v_state in array array['DRAFT','RUNNING','FINISHED','CANCELLED'] loop
    update public.tournaments set status=v_state where id=v_tournament;
    perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
    v_failed:=false; begin perform public.pause_tournament(v_club,v_tournament); exception when check_violation then if sqlerrm='INVALID_STATUS_TRANSITION' then v_failed:=true; else raise; end if; end;
    if not v_failed then raise exception '% -> PAUSED aceptado',v_state; end if; reset role;
  end loop;
  foreach v_state in array array['DRAFT','OPEN','RUNNING','FINISHED','CANCELLED'] loop
    update public.tournaments set status=v_state where id=v_tournament;
    perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
    v_failed:=false; begin perform public.resume_tournament(v_club,v_tournament); exception when check_violation then if sqlerrm='INVALID_STATUS_TRANSITION' then v_failed:=true; else raise; end if; end;
    if not v_failed then raise exception '% -> resume aceptado',v_state; end if; reset role;
  end loop;

  -- La primitive canónica no permite bypass directo de lifecycle desde DRAFT.
  update public.tournaments set status='DRAFT',registration_deadline=now()+interval '1 day',signup_deadline=now()+interval '1 day' where id=v_tournament;
  perform set_config('request.jwt.claim.sub',v_players[3]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.register_team_for_tournament(v_tournament,v_club,v_players[4]); exception when check_violation then if sqlerrm='TOURNAMENT_REGISTRATION_NOT_OPEN' then v_failed:=true; else raise; end if; end;
  if not v_failed then raise exception 'La inscripción directa durante DRAFT fue aceptada'; end if;
  reset role;

  -- RLS/tenant: PLAYER y ADMIN de otro club no pueden pausar.
  update public.tournaments set status='OPEN' where id=v_tournament;
  perform set_config('request.jwt.claim.sub',v_players[1]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.pause_tournament(v_club,v_tournament); exception when insufficient_privilege then if sqlerrm='TOURNAMENT_FORBIDDEN' then v_failed:=true; else raise; end if; end;
  if not v_failed then raise exception 'PLAYER pudo pausar'; end if; reset role;
  perform set_config('request.jwt.claim.sub',v_other_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.pause_tournament(v_club,v_tournament); exception when insufficient_privilege then if sqlerrm='TOURNAMENT_FORBIDDEN' then v_failed:=true; else raise; end if; end;
  if not v_failed then raise exception 'Administrador cross-club pudo pausar'; end if; reset role;

  -- Resume puede restaurar OPEN, pero no reabre inscripciones vencidas: la RPC
  -- canónica de inscripción también debe rechazar el cierre ya vencido.
  update public.tournaments set registration_deadline=now()-interval '1 minute',signup_deadline=now()-interval '1 minute',status='OPEN' where id=v_tournament;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  perform public.pause_tournament(v_club,v_tournament); perform public.resume_tournament(v_club,v_tournament); reset role;
  if (select status::text from public.tournaments where id=v_tournament)<>'OPEN'
     or (select registration_deadline from public.tournaments where id=v_tournament)>=now()
     or (select signup_deadline from public.tournaments where id=v_tournament)>=now() then
    raise exception 'PAUSED -> OPEN alteró indebidamente el cierre vencido';
  end if;
  perform set_config('request.jwt.claim.sub',v_players[3]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.register_team_for_tournament(v_tournament,v_club,v_players[4]); exception when check_violation then if sqlerrm='TOURNAMENT_REGISTRATION_CLOSED' then v_failed:=true; else raise; end if; end;
  if not v_failed then raise exception 'La inscripción vencida fue aceptada después de reanudar'; end if;
  reset role;
  return query select 'PASS','Tournament PAUSED válido: status text, lifecycle, roles, inscripción PAUSED/vencida, preservación y rollback.';
exception when others then
  reset role; return query select 'FAIL',sqlerrm;
end $$;

select qa_status || ' | ' || qa_detail as result from pg_temp.run_tournament_pause_resume_p0_qa();
rollback;
