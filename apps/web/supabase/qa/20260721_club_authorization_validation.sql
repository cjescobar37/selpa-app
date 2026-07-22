-- QA CLUB Sprint 1 — autorización y capacidades.
-- Ejecutar el archivo completo en Supabase SQL Editor.
-- Toda mutación de datos queda contenida en esta transacción y se revierte al final.
begin;

create or replace function pg_temp.run_club_authorization_qa()
returns table(status text, detail text)
language plpgsql
as $qa$
declare
  v_club_a uuid;
  v_club_b uuid;
  v_owner_a uuid;
  v_admin_a uuid;
  v_planillero_a uuid;
  v_player_a uuid;
  v_admin_b uuid;
  v_pending_a uuid;
  v_rejected_a uuid;
  v_banned_a uuid;
  v_candidate uuid;
  v_used uuid[] := '{}'::uuid[];
begin
  select membership.club_id, membership.user_id
    into v_club_a, v_owner_a
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  if v_club_a is null then
    return query select 'FAIL', 'QA no ejecutable: falta club con OWNER APPROVED';
    return;
  end if;

  select club.id
    into v_club_b
  from public.clubs club
  where club.id <> v_club_a
    and not exists (
      select 1 from public.club_memberships membership
      where membership.club_id=club.id and membership.user_id=v_owner_a
        and membership.status='APPROVED' and membership.approved_at is not null
        and membership.role in ('OWNER','ADMIN','PLANILLERO')
    )
  order by club.created_at
  limit 1;

  if v_club_b is null then
    return query select 'FAIL', 'QA no ejecutable: falta Club B';
    return;
  end if;

  v_used := array[v_owner_a];

  select membership.user_id
    into v_admin_a
  from public.club_memberships membership
  where membership.club_id = v_club_a
    and membership.role = 'ADMIN'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  limit 1;

  if v_admin_a is null then
    select candidate.id into v_candidate
    from auth.users candidate
    where not (candidate.id = any(v_used))
      and not exists (
        select 1 from public.club_memberships membership
        where membership.club_id = v_club_a and membership.user_id = candidate.id
      )
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL', 'QA no ejecutable: falta usuario disponible para ADMIN';
      return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_a,v_candidate,'ADMIN','APPROVED',now(),v_owner_a);
    v_admin_a := v_candidate;
  end if;
  v_used := array_append(v_used,v_admin_a);

  select membership.user_id into v_planillero_a
  from public.club_memberships membership
  where membership.club_id=v_club_a and membership.role='PLANILLERO'
    and membership.status='APPROVED' and membership.approved_at is not null
  limit 1;
  if v_planillero_a is null then
    select candidate.id into v_candidate from auth.users candidate
    where not(candidate.id=any(v_used)) and not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club_a and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para PLANILLERO'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_a,v_candidate,'PLANILLERO','APPROVED',now(),v_owner_a);
    v_planillero_a:=v_candidate;
  end if;
  v_used:=array_append(v_used,v_planillero_a);

  select membership.user_id into v_player_a
  from public.club_memberships membership
  where membership.club_id=v_club_a and membership.role='PLAYER'
    and membership.status='APPROVED' and membership.approved_at is not null
  limit 1;
  if v_player_a is null then
    select candidate.id into v_candidate from auth.users candidate
    where not(candidate.id=any(v_used)) and not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club_a and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para PLAYER'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_a,v_candidate,'PLAYER','APPROVED',now(),v_owner_a);
    v_player_a:=v_candidate;
  end if;
  v_used:=array_append(v_used,v_player_a);

  select membership.user_id into v_pending_a from public.club_memberships membership
  where membership.club_id=v_club_a and membership.status='PENDING' limit 1;
  if v_pending_a is null then
    select candidate.id into v_candidate from auth.users candidate
    where not(candidate.id=any(v_used)) and not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club_a and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para PENDING'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status)
    values(v_club_a,v_candidate,'PLAYER','PENDING');
    v_pending_a:=v_candidate;
  end if;
  v_used:=array_append(v_used,v_pending_a);

  select membership.user_id into v_rejected_a from public.club_memberships membership
  where membership.club_id=v_club_a and membership.status='REJECTED' limit 1;
  if v_rejected_a is null then
    select candidate.id into v_candidate from auth.users candidate
    where not(candidate.id=any(v_used)) and not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club_a and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para REJECTED'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status)
    values(v_club_a,v_candidate,'PLAYER','REJECTED');
    v_rejected_a:=v_candidate;
  end if;
  v_used:=array_append(v_used,v_rejected_a);

  select membership.user_id into v_banned_a from public.club_memberships membership
  where membership.club_id=v_club_a and membership.status='BANNED' limit 1;
  if v_banned_a is null then
    select candidate.id into v_candidate from auth.users candidate
    where not(candidate.id=any(v_used)) and not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club_a and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para BANNED'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status)
    values(v_club_a,v_candidate,'PLAYER','BANNED');
    v_banned_a:=v_candidate;
  end if;

  select membership.user_id into v_admin_b from public.club_memberships membership
  where membership.club_id=v_club_b and membership.role='ADMIN'
    and membership.status='APPROVED' and membership.approved_at is not null
    and not exists(
      select 1 from public.club_memberships membership_a
      where membership_a.club_id=v_club_a and membership_a.user_id=membership.user_id
        and membership_a.status='APPROVED' and membership_a.approved_at is not null
        and membership_a.role in ('OWNER','ADMIN','PLANILLERO'))
  limit 1;
  if v_admin_b is null then
    select candidate.id into v_candidate from auth.users candidate
    where candidate.id<>v_owner_a
      and not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club_b and membership.user_id=candidate.id)
      and not exists(
        select 1 from public.club_memberships membership_a
        where membership_a.club_id=v_club_a and membership_a.user_id=candidate.id
          and membership_a.status='APPROVED' and membership_a.approved_at is not null
          and membership_a.role in ('OWNER','ADMIN','PLANILLERO'))
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para ADMIN Club B'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_b,v_candidate,'ADMIN','APPROVED',now(),v_owner_a);
    v_admin_b:=v_candidate;
  end if;

  perform set_config('request.jwt.claim.role','authenticated',true);

  perform set_config('request.jwt.claim.sub',v_owner_a::text,true);
  if not public.is_club_owner(v_club_a) then raise exception 'OWNER no reconocido'; end if;
  if not public.has_club_capability(v_club_a,'ownership:transfer') then raise exception 'OWNER sin transferencia'; end if;

  perform set_config('request.jwt.claim.sub',v_admin_a::text,true);
  if not public.is_club_admin(v_club_a) then raise exception 'ADMIN no reconocido'; end if;
  if public.is_club_owner(v_club_a) then raise exception 'ADMIN reconocido como OWNER'; end if;

  perform set_config('request.jwt.claim.sub',v_planillero_a::text,true);
  if not public.has_club_capability(v_club_a,'matches:update') then raise exception 'PLANILLERO sin operación'; end if;
  if public.has_club_capability(v_club_a,'club:update') then raise exception 'PLANILLERO con configuración'; end if;

  perform set_config('request.jwt.claim.sub',v_player_a::text,true);
  if public.has_club_capability(v_club_a,'dashboard:view') then raise exception 'PLAYER con dashboard'; end if;

  perform set_config('request.jwt.claim.sub',v_admin_b::text,true);
  if public.has_club_capability(v_club_a,'club:update') then raise exception 'Acceso cross-club'; end if;

  perform set_config('request.jwt.claim.sub',v_pending_a::text,true);
  if public.has_club_capability(v_club_a,'dashboard:view') then raise exception 'PENDING con capacidad'; end if;
  perform set_config('request.jwt.claim.sub',v_rejected_a::text,true);
  if public.has_club_capability(v_club_a,'dashboard:view') then raise exception 'REJECTED con capacidad'; end if;
  perform set_config('request.jwt.claim.sub',v_banned_a::text,true);
  if public.has_club_capability(v_club_a,'dashboard:view') then raise exception 'BANNED con capacidad'; end if;

  begin
    perform public.has_club_capability(v_club_a,'unknown:capability');
    raise exception 'Capacidad desconocida aceptada';
  exception when sqlstate '22023' then null;
  end;

  if exists(
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='club_players'
      and policyname in ('club_players_insert_self','club_players_update_self')
  ) then
    raise exception 'Persisten policies self-write';
  end if;

  return query select 'PASS','Autorización CLUB: matriz automática completa';
exception when others then
  return query select 'FAIL',sqlerrm;
end;
$qa$;

select * from pg_temp.run_club_authorization_qa();
rollback;
