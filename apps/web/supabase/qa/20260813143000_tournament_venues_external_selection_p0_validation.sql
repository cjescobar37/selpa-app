begin;

create or replace function pg_temp.run_tournament_venues_external_selection_p0_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid; v_club uuid; v_other_club uuid; v_primary uuid; v_external uuid;
  v_own_court uuid; v_external_court uuid; v_tournament uuid; v_result jsonb; v_failed boolean;
begin
  if to_regprocedure('public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[])') is null then
    return query select 'FAIL', 'QA no ejecutable: falta aplicar 20260813143000_tournament_venues_external_selection_p0.sql';
    return;
  end if;

  select membership.user_id, membership.club_id into v_owner, v_club
  from public.club_memberships membership
  where membership.role in ('OWNER','ADMIN') and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  select club.id into v_other_club from public.clubs club where club.is_active and club.id <> v_club order by club.created_at limit 1;
  if v_owner is null or v_other_club is null then
    return query select 'FAIL', 'QA no ejecutable: se requiere OWNER/ADMIN aprobado y segundo club activo.';
    return;
  end if;

  select id into v_primary from public.club_venues where club_id=v_club and is_primary and is_active limit 1;
  select id into v_external from public.club_venues where club_id=v_other_club and is_primary and is_active limit 1;
  if v_primary is null or v_external is null then raise exception 'Faltan predios principales activos'; end if;

  -- No external approval flags: P0 must still allow these active courts.
  insert into public.venue_courts(venue_id,name,sort_order,is_active,allow_external_tournaments)
  values (v_primary,'QA P0 propia',990,true,false), (v_external,'QA P0 externa',990,true,false)
  on conflict (venue_id,name) do update set is_active=true,allow_external_tournaments=false;
  update public.club_venues set allow_external_tournaments=false where id=v_external;
  select id into v_own_court from public.venue_courts where venue_id=v_primary and name='QA P0 propia';
  select id into v_external_court from public.venue_courts where venue_id=v_external and name='QA P0 externa';

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  select id into v_tournament from public.create_tournament_canonical(v_club,jsonb_build_object(
    'name','QA P0 predio externo', 'type','OPEN', 'gender','MALE', 'segment','LIBRES', 'category_id',6,
    'start_date',(current_date+2)::text,'min_pairs',2,'price_per_player',0
  ));
  v_result:=public.replace_tournament_court_assignments(v_club,v_tournament,v_primary,array[v_own_court,v_external_court]);
  if (v_result->>'courts_selected')::integer<>2
     or (select club_id from public.tournaments where id=v_tournament) is distinct from v_club
     or (select venue_id from public.tournament_venues where tournament_id=v_tournament and status='ACTIVE' and is_primary) is distinct from v_primary
     or (select count(*) from public.tournament_venues where tournament_id=v_tournament and status='ACTIVE')<>2 then
    raise exception 'El predio externo P0 alteró organizer/sede principal o no quedó asignado';
  end if;

  v_failed:=false;
  begin update public.venue_courts set name='No permitido' where id=v_external_court; exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception 'El organizador pudo editar una cancha externa'; end if;

  reset role;
  return query select 'PASS','Tournament Venues P0 external selection: predio externo activo sin aprobación, organizer/sede principal y solo lectura validados.';
exception when others then
  reset role;
  return query select 'FAIL',sqlerrm;
end $$;

select * from pg_temp.run_tournament_venues_external_selection_p0_qa();
rollback;
