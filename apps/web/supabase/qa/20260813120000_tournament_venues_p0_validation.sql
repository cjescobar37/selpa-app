begin;

create or replace function pg_temp.run_tournament_venues_p0_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid; v_player uuid; v_club uuid; v_other_club uuid;
  v_primary uuid; v_external_venue uuid; v_own_courts uuid[]; v_external_courts uuid[];
  v_tournament uuid; v_result jsonb; v_failed boolean; v_primary_link uuid; v_external_link uuid; v_read_count integer;
begin
  if to_regclass('public.club_venues') is null or to_regclass('public.venue_courts') is null
     or to_regclass('public.tournament_venues') is null or to_regclass('public.tournament_court_assignments') is null
     or to_regprocedure('public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[])') is null then
    return query select 'FAIL', 'QA no ejecutable: falta aplicar 20260813120000_tournament_venues_p0.sql';
    return;
  end if;

  if exists (
    select 1 from public.clubs club where club.is_active
    and (select count(*) from public.club_venues venue where venue.club_id = club.id and venue.is_primary and venue.is_active) <> 1
  ) then raise exception 'Backfill inválido: un club activo no tiene exactamente un venue principal'; end if;

  select membership.user_id, membership.club_id into v_owner, v_club
  from public.club_memberships membership
  where membership.role in ('OWNER','ADMIN') and membership.status = 'APPROVED' and membership.approved_at is not null
  order by membership.created_at
  limit 1;
  select membership.user_id into v_player
  from public.club_memberships membership
  where membership.club_id = v_club and membership.role = 'PLAYER' and membership.status = 'APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  select club.id into v_other_club from public.clubs club where club.id <> v_club and club.is_active order by club.created_at limit 1;
  if v_owner is null or v_player is null or v_other_club is null then
    return query select 'FAIL', 'QA no ejecutable: se requiere OWNER/ADMIN, PLAYER y segundo club aprobados.';
    return;
  end if;

  select venue.id into v_primary from public.club_venues venue where venue.club_id = v_club and venue.is_primary and venue.is_active;
  select venue.id into v_external_venue from public.club_venues venue where venue.club_id = v_other_club and venue.is_primary and venue.is_active;
  if v_primary is null or v_external_venue is null then raise exception 'Backfill no creó venues principales'; end if;

  -- Transaction-only fixtures complete inventory where legacy courts_count was zero.
  insert into public.venue_courts(venue_id,name,sort_order,is_active,allow_external_tournaments)
  values (v_primary, 'QA Propia 1', 900, true, false), (v_primary, 'QA Propia 2', 901, true, false)
  on conflict (venue_id,name) do update set is_active = true;
  insert into public.venue_courts(venue_id,name,sort_order,is_active,allow_external_tournaments)
  values (v_external_venue, 'QA Externa 1', 900, true, true), (v_external_venue, 'QA Externa 2', 901, true, true)
  on conflict (venue_id,name) do update set is_active = true, allow_external_tournaments = true;
  update public.club_venues set allow_external_tournaments = true where id = v_external_venue;
  select array_agg(court.id order by court.sort_order) into v_own_courts from public.venue_courts court where court.venue_id = v_primary and court.name in ('QA Propia 1','QA Propia 2');
  select array_agg(court.id order by court.sort_order) into v_external_courts from public.venue_courts court where court.venue_id = v_external_venue and court.name in ('QA Externa 1','QA Externa 2');
  if array_length(v_own_courts, 1) <> 2 or array_length(v_external_courts, 1) <> 2 then raise exception 'Fixtures de canchas incompletos'; end if;
  v_failed := false;
  begin
    insert into public.club_venues(club_id,name,is_primary,is_active,sort_order)
    values (v_club,'QA Segundo predio principal',true,true,999);
  exception when unique_violation then v_failed := true; end;
  if not v_failed then raise exception 'Se aceptó un segundo predio principal activo del club'; end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select tournament.id into v_tournament from public.create_tournament_canonical(v_club, jsonb_build_object(
    'name', 'QA Tournament Venues P0', 'type', 'OPEN', 'gender', 'MALE', 'segment', 'LIBRES', 'category_id', 6,
    'start_date', (current_date + 2)::text, 'end_date', (current_date + 3)::text, 'min_pairs', 2, 'max_pairs', 8, 'price_per_player', 0
  )) tournament;
  v_result := public.replace_tournament_court_assignments(v_club, v_tournament, v_primary, v_own_courts || v_external_courts);
  if (v_result ->> 'courts_selected')::integer <> 4
     or (select club_id from public.tournaments where id = v_tournament) <> v_club
     or (select venue_id from public.tournament_venues where tournament_id = v_tournament and status = 'ACTIVE' and is_primary) <> v_primary
     or (select count(*) from public.tournament_court_assignments where tournament_id = v_tournament and status = 'ACTIVE') <> 4 then
    raise exception 'Asignación propia + externa no conservó organizer, sede principal o canchas';
  end if;
  if (select count(*) from public.tournament_venues where tournament_id = v_tournament and status = 'ACTIVE') <> 2 then raise exception 'El torneo no conservó dos predios activos'; end if;
  if (select rules_json->'tournament_courts' from public.tournaments where id = v_tournament) is null then raise exception 'No se generó snapshot compatible en rules_json'; end if;
  select id into v_primary_link from public.tournament_venues where tournament_id = v_tournament and venue_id = v_primary;
  select id into v_external_link from public.tournament_venues where tournament_id = v_tournament and venue_id = v_external_venue;
  select count(*) into v_read_count from public.club_venues where id = v_external_venue;
  if v_read_count <> 1 then raise exception 'RLS no permite leer un predio externo habilitado'; end if;

  v_failed := false;
  begin perform public.replace_tournament_court_assignments(v_club, v_tournament, v_primary, array[v_own_courts[1], v_own_courts[1]]); exception when unique_violation then v_failed := true; end;
  if not v_failed then raise exception 'Cancha duplicada aceptada'; end if;
  v_failed := false;
  begin
    insert into public.tournament_court_assignments(tournament_id,tournament_venue_id,court_id,status,sort_order,court_snapshot)
    values (v_tournament,v_primary_link,v_external_courts[1],'ACTIVE',99,'{}'::jsonb);
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Se aceptó una cancha vinculada a un predio incorrecto'; end if;
  v_failed := false;
  begin
    update public.venue_courts set is_active = false where id = v_own_courts[1];
    perform public.replace_tournament_court_assignments(v_club, v_tournament, v_primary, array[v_own_courts[1]]);
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Cancha inactiva aceptada'; end if;
  update public.venue_courts set is_active = true where id = v_own_courts[1];
  reset role;
  -- Fixture de otro club: se prepara fuera del rol del organizador para que la
  -- siguiente llamada pruebe la validación cross-club de la RPC, no el RLS del fixture.
  update public.club_venues set is_active = false where id = v_external_venue;
  set local role authenticated;
  v_failed := false;
  begin
    perform public.replace_tournament_court_assignments(v_club, v_tournament, v_primary, array[v_external_courts[1]]);
  exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'Predio inactivo aceptado'; end if;
  reset role;
  update public.club_venues set is_active = true, allow_external_tournaments = false where id = v_external_venue;
  set local role authenticated;
  v_failed := false;
  begin
    perform public.replace_tournament_court_assignments(v_club, v_tournament, v_primary, array[v_external_courts[1]]);
  exception when insufficient_privilege then v_failed := true; end;
  if not v_failed then raise exception 'Cross-club no habilitado aceptado'; end if;
  reset role;
  update public.club_venues set allow_external_tournaments = true where id = v_external_venue;

  -- These are database-level constraints; test them directly while still inside BEGIN/ROLLBACK.
  v_failed := false;
  begin
    update public.tournament_venues set is_primary = true
    where id = v_external_link;
  exception when unique_violation then v_failed := true; end;
  if not v_failed then raise exception 'Se aceptó un segundo predio principal activo del torneo'; end if;
  v_failed := false;
  begin
    insert into public.tournament_court_assignments(tournament_id,tournament_venue_id,court_id,status,sort_order,court_snapshot)
    values (v_tournament,v_external_link,v_external_courts[1],'ACTIVE',100,'{}'::jsonb);
  exception when unique_violation then v_failed := true; end;
  if not v_failed then raise exception 'Se aceptó una cancha activa duplicada para el torneo'; end if;

  perform set_config('request.jwt.claim.sub', v_player::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin perform public.replace_tournament_court_assignments(v_club, v_tournament, v_primary, v_own_courts); exception when insufficient_privilege then v_failed := true; end;
  if not v_failed then raise exception 'PLAYER pudo administrar canchas del torneo'; end if;
  v_failed := false;
  begin insert into public.venue_courts(venue_id,name,sort_order) values(v_primary,'QA PLAYER WRITE',999); exception when insufficient_privilege then v_failed := true; end;
  if not v_failed then raise exception 'PLAYER pudo escribir infraestructura ajena'; end if;
  reset role;
  return query select 'PASS', 'Tournament venues P0 válido: backfill, predio principal, canchas propias/externas, integridad, RLS y rollback.';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end $$;

select * from pg_temp.run_tournament_venues_p0_qa();
rollback;
