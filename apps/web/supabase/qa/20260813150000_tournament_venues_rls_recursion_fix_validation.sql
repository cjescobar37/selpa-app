begin;

create or replace function pg_temp.run_tournament_venues_rls_recursion_fix_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid; v_player uuid; v_club uuid; v_other_club uuid;
  v_primary uuid; v_external uuid; v_own_court uuid; v_external_court uuid; v_tournament uuid;
  v_result jsonb; v_count integer; v_rows integer; v_returned_id uuid;
  v_venue_name_before text; v_court_name_before text; v_venue_name_after text; v_court_name_after text;
  v_insert_rejected boolean;
begin
  if to_regclass('public.club_venues') is null
     or to_regclass('public.venue_courts') is null
     or to_regprocedure('public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[])') is null then
    return query select 'FAIL', 'QA no ejecutable: faltan Tournament Venues P0 o la corrección RLS.';
    return;
  end if;

  select membership.user_id, membership.club_id into v_owner, v_club
  from public.club_memberships membership
  where membership.role in ('OWNER','ADMIN') and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  select membership.user_id into v_player
  from public.club_memberships membership
  where membership.club_id=v_club and membership.role='PLAYER' and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  select club.id into v_other_club from public.clubs club where club.is_active and club.id<>v_club order by club.created_at limit 1;
  if v_owner is null or v_player is null or v_other_club is null then
    return query select 'FAIL', 'QA no ejecutable: se requiere OWNER/ADMIN, PLAYER y segundo club activo.';
    return;
  end if;

  select id into v_primary from public.club_venues where club_id=v_club and is_primary and is_active limit 1;
  select id into v_external from public.club_venues where club_id=v_other_club and is_primary and is_active limit 1;
  if v_primary is null or v_external is null then raise exception 'Faltan venues principales activos'; end if;

  insert into public.venue_courts(venue_id,name,sort_order,is_active)
  values (v_primary,'QA RLS propia',995,true),(v_external,'QA RLS externa',995,true)
  on conflict (venue_id,name) do update set is_active=true;
  select id into v_own_court from public.venue_courts where venue_id=v_primary and name='QA RLS propia';
  select id into v_external_court from public.venue_courts where venue_id=v_external and name='QA RLS externa';

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  -- These two reads prove the policies do not recurse, for own and external inventory.
  select count(*) into v_count from public.club_venues where id in (v_primary,v_external);
  if v_count<>2 then raise exception 'OWNER/ADMIN no pudo leer predios propios y externos activos'; end if;
  select count(*) into v_count from public.venue_courts where id in (v_own_court,v_external_court);
  if v_count<>2 then raise exception 'OWNER/ADMIN no pudo leer canchas propias y externas activas'; end if;
  select id into v_tournament from public.create_tournament_canonical(v_club,jsonb_build_object(
    'name','QA RLS P0', 'type','OPEN', 'gender','MALE', 'segment','LIBRES', 'category_id',6,
    'start_date',(current_date+2)::text,'min_pairs',2,'price_per_player',0
  ));
  v_result:=public.replace_tournament_court_assignments(v_club,v_tournament,v_primary,array[v_own_court,v_external_court]);
  if (v_result->>'courts_selected')::integer<>2
     or (select club_id from public.tournaments where id=v_tournament) is distinct from v_club
     or (select venue_id from public.tournament_venues where tournament_id=v_tournament and is_primary and status='ACTIVE') is distinct from v_primary then
    raise exception 'La RPC cross-club modificó organizer o predio principal';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub',v_player::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  select count(*) into v_count from public.club_venues where id in (v_primary,v_external);
  if v_count<>2 then raise exception 'PLAYER no pudo leer predios activos'; end if;
  select count(*) into v_count from public.venue_courts where id in (v_own_court,v_external_court);
  if v_count<>2 then raise exception 'PLAYER no pudo leer canchas activas'; end if;

  -- RLS UPDATE/DELETE can legally affect zero rows without throwing. Measure
  -- RETURNING + ROW_COUNT and recheck with the enclosing QA transaction.
  select name into v_venue_name_before from public.club_venues where id=v_primary;
  select name into v_court_name_before from public.venue_courts where id=v_own_court;

  v_returned_id:=null;
  update public.club_venues set name='QA RLS venue bloqueado' where id=v_primary returning id into v_returned_id;
  get diagnostics v_rows = row_count;
  if v_rows<>0 or v_returned_id is not null then raise exception 'PLAYER actualizó club_venues'; end if;
  v_returned_id:=null;
  update public.venue_courts set name='QA RLS cancha bloqueada' where id=v_own_court returning id into v_returned_id;
  get diagnostics v_rows = row_count;
  if v_rows<>0 or v_returned_id is not null then raise exception 'PLAYER actualizó venue_courts'; end if;

  v_insert_rejected:=false;
  begin
    insert into public.club_venues(club_id,name,is_primary,is_active,sort_order)
    values(v_club,'QA RLS PLAYER venue',false,true,996)
    returning id into v_returned_id;
  exception when insufficient_privilege then v_insert_rejected:=true; end;
  if not v_insert_rejected or v_returned_id is not null then raise exception 'PLAYER insertó club_venues'; end if;
  v_returned_id:=null;
  v_insert_rejected:=false;
  begin
    insert into public.venue_courts(venue_id,name,sort_order)
    values(v_primary,'QA RLS PLAYER cancha',996)
    returning id into v_returned_id;
  exception when insufficient_privilege then v_insert_rejected:=true; end;
  if not v_insert_rejected or v_returned_id is not null then raise exception 'PLAYER insertó venue_courts'; end if;

  v_returned_id:=null;
  delete from public.club_venues where id=v_primary returning id into v_returned_id;
  get diagnostics v_rows = row_count;
  if v_rows<>0 or v_returned_id is not null then raise exception 'PLAYER eliminó club_venues'; end if;
  v_returned_id:=null;
  delete from public.venue_courts where id=v_own_court returning id into v_returned_id;
  get diagnostics v_rows = row_count;
  if v_rows<>0 or v_returned_id is not null then raise exception 'PLAYER eliminó venue_courts'; end if;

  reset role;
  select name into v_venue_name_after from public.club_venues where id=v_primary;
  select name into v_court_name_after from public.venue_courts where id=v_own_court;
  if v_venue_name_after is distinct from v_venue_name_before or v_court_name_after is distinct from v_court_name_before then
    raise exception 'La infraestructura cambió durante la prueba PLAYER';
  end if;

  return query select 'PASS','Tournament Venues RLS P0 válido: lectura sin recursión, own/external, PLAYER read-only y RPC cross-club.';
exception when others then
  reset role;
  return query select 'FAIL',sqlerrm;
end $$;

select * from pg_temp.run_tournament_venues_rls_recursion_fix_qa();
rollback;
