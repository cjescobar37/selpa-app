begin;

create or replace function pg_temp.run_tournament_delete_atomic_p0_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_club uuid; v_draft uuid; v_actor uuid; v_court_count integer; v_venue_count integer;
  v_player_one uuid; v_player_two uuid; v_team uuid; v_registration uuid; v_result jsonb;
  v_linked_tournament uuid; v_linked_club uuid; v_linked_actor uuid; v_failed boolean;
begin
  if to_regprocedure('public.delete_tournament_draft_atomic(uuid,uuid)') is null then
    return query select 'FAIL', 'QA no ejecutable: falta delete_tournament_draft_atomic.'; return;
  end if;

  select tournament.club_id, tournament.id, membership.user_id
  into v_club, v_draft, v_actor
  from public.tournaments tournament
  join public.club_memberships membership
    on membership.club_id = tournament.club_id
   and membership.role in ('OWNER','ADMIN')
   and membership.status = 'APPROVED'
   and membership.approved_at is not null
  where tournament.status = 'DRAFT'
    and exists (select 1 from public.tournament_venues venue where venue.tournament_id = tournament.id)
    and exists (select 1 from public.tournament_court_assignments assignment where assignment.tournament_id = tournament.id)
    and not exists (select 1 from public.competition_series_event_tournament_links link where link.tournament_id = tournament.id)
    and not exists (select 1 from public.competition_event_homologations homologation where homologation.tournament_id = tournament.id)
  order by tournament.created_at, membership.user_id
  limit 1;

  if v_draft is null then
    return query select 'FAIL', 'QA no ejecutable: falta DRAFT descartable con venue y cancha asignada.'; return;
  end if;

  select player.user_id into v_player_one
  from public.club_players player
  where player.club_id = v_club
    and not exists (select 1 from public.tournament_teams team where team.tournament_id = v_draft and (team.player1_user_id = player.user_id or team.player2_user_id = player.user_id))
  order by player.created_at, player.user_id limit 1;
  select player.user_id into v_player_two
  from public.club_players player
  where player.club_id = v_club and player.user_id <> v_player_one
    and not exists (select 1 from public.tournament_teams team where team.tournament_id = v_draft and (team.player1_user_id = player.user_id or team.player2_user_id = player.user_id))
  order by player.created_at, player.user_id limit 1;
  if v_player_one is null or v_player_two is null then
    return query select 'FAIL', 'QA no ejecutable: faltan dos jugadores del club del borrador.'; return;
  end if;

  insert into public.tournament_teams(tournament_id,club_id,player1_user_id,player2_user_id,created_by)
  values(v_draft,v_club,v_player_one,v_player_two,v_actor)
  returning id into v_team;
  insert into public.tournament_registrations(tournament_id,club_id,team_id,status,created_by)
  values(v_draft,v_club,v_team,'PENDING'::public.tournament_reg_status,v_actor)
  returning id into v_registration;
  select count(*) into v_venue_count from public.tournament_venues where tournament_id = v_draft;
  select count(*) into v_court_count from public.tournament_court_assignments where tournament_id = v_draft;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_result := public.delete_tournament_draft_atomic(v_club, v_draft);
  reset role;

  if coalesce((v_result ->> 'deleted')::boolean, false) is not true
     or exists (select 1 from public.tournaments where id = v_draft)
     or exists (select 1 from public.tournament_venues where tournament_id = v_draft)
     or exists (select 1 from public.tournament_court_assignments where tournament_id = v_draft)
     or exists (select 1 from public.tournament_teams where tournament_id = v_draft or id = v_team)
     or exists (select 1 from public.tournament_registrations where tournament_id = v_draft or id = v_registration) then
    raise exception 'La eliminación DRAFT no fue atómica para torneo/venues/canchas/pareja/inscripción';
  end if;
  if v_venue_count < 1 or v_court_count < 1 then raise exception 'El fixture no ejercitó venues/canchas'; end if;

  select link.tournament_id, link.club_id, membership.user_id
  into v_linked_tournament, v_linked_club, v_linked_actor
  from public.competition_series_event_tournament_links link
  join public.club_memberships membership
    on membership.club_id = link.club_id
   and membership.role in ('OWNER','ADMIN')
   and membership.status = 'APPROVED'
   and membership.approved_at is not null
  where link.status = 'ACTIVE'
  order by link.linked_at, membership.user_id
  limit 1;
  if v_linked_tournament is null then
    return query select 'FAIL', 'QA no ejecutable: falta Competition link ACTIVE para probar historia protegida.'; return;
  end if;
  update public.tournaments set status = 'DRAFT' where id = v_linked_tournament and club_id = v_linked_club;
  perform set_config('request.jwt.claim.sub', v_linked_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.delete_tournament_draft_atomic(v_linked_club, v_linked_tournament);
  exception when raise_exception then
    if sqlerrm = 'TOURNAMENT_DELETE_BLOCKED' then v_failed := true; else raise; end if;
  end;
  reset role;
  if not v_failed or not exists (
    select 1 from public.competition_series_event_tournament_links link
    where link.tournament_id = v_linked_tournament and link.club_id = v_linked_club and link.status = 'ACTIVE'
  ) then
    raise exception 'La historia Competition no quedó protegida';
  end if;

  return query select 'PASS', 'Delete DRAFT atómico: venues, canchas, pareja/inscripción y Competition link protegido; ROLLBACK final.';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result from pg_temp.run_tournament_delete_atomic_p0_qa();
rollback;
