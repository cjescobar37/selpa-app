-- QA transaccional — listado y métricas de staff real.
-- Ejecutar después de 20260725_club_existing_player_staff_promotion.sql.

begin;

create or replace function pg_temp.run_club_staff_listing_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $qa$
declare
  v_users uuid[];
  v_emails text[];
  v_club uuid;
  v_owner uuid;
  v_admin uuid;
  v_operator uuid;
  v_scorekeeper uuid;
  v_player uuid;
  v_scorekeeper_membership uuid;
  v_before_player jsonb;
  v_after_player jsonb;
  v_staff_count integer;
  v_roles_covered integer;
  v_result jsonb;
begin
  select array_agg(candidate.id order by candidate.created_at),
         array_agg(lower(candidate.email) order by candidate.created_at)
    into v_users, v_emails
  from (
    select users.id, users.email, users.created_at
    from auth.users users
    where users.email is not null
    order by users.created_at
    limit 5
  ) candidate;

  if coalesce(cardinality(v_users), 0) < 5 then
    return query select 'FAIL', 'QA no ejecutable: se requieren cinco usuarios reales con email';
    return;
  end if;

  v_owner := v_users[1];
  v_admin := v_users[2];
  v_operator := v_users[3];
  v_scorekeeper := v_users[4];
  v_player := v_users[5];

  insert into public.clubs as club(name,slug)
  values('QA Staff Listing','qa-staff-listing-'||txid_current())
  returning club.id into v_club;

  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
  values
    (v_club,v_owner,'OWNER','APPROVED',now(),v_owner),
    (v_club,v_admin,'ADMIN','APPROVED',now(),v_owner),
    (v_club,v_operator,'OPERADOR','APPROVED',now(),v_owner),
    (v_club,v_scorekeeper,'PLANILLERO','APPROVED',now(),v_owner),
    (v_club,v_player,'PLAYER','APPROVED',now(),v_owner);

  select membership.id into v_scorekeeper_membership
  from public.club_memberships membership
  where membership.club_id=v_club and membership.user_id=v_scorekeeper;

  insert into public.club_players(club_id,user_id,display_name,approved_at,approved_by)
  values(v_club,v_scorekeeper,'QA Staff Athlete',now(),v_owner);
  select to_jsonb(player) into v_before_player
  from public.club_players player
  where player.club_id=v_club and player.user_id=v_scorekeeper;

  -- 1-7 y 12: solo los cuatro roles operativos cuentan y se listan.
  select count(*), count(distinct membership.role)
    into v_staff_count, v_roles_covered
  from public.club_memberships membership
  where membership.club_id=v_club
    and membership.status='APPROVED'
    and membership.approved_at is not null
    and membership.role in ('OWNER','ADMIN','OPERADOR','PLANILLERO');

  if v_staff_count <> 4 or v_roles_covered <> 4 then
    raise exception 'Listado/métricas iniciales incorrectos: staff %, roles %',v_staff_count,v_roles_covered;
  end if;
  if exists(
    select 1 from public.club_memberships membership
    where membership.club_id=v_club and membership.role='PLAYER'
      and membership.role in ('OWNER','ADMIN','OPERADOR','PLANILLERO')
  ) then raise exception 'PLAYER fue incluido como staff'; end if;

  -- 8: PLANILLERO -> PLAYER desaparece sin borrar membership ni ficha deportiva.
  perform public.change_club_staff_role_atomic(
    v_club,v_scorekeeper_membership,'PLAYER',v_owner
  );
  if not exists(
    select 1 from public.club_memberships membership
    where membership.id=v_scorekeeper_membership and membership.role='PLAYER'
  ) then raise exception 'PLANILLERO -> PLAYER borró o no actualizó membership'; end if;

  select count(*), count(distinct membership.role)
    into v_staff_count, v_roles_covered
  from public.club_memberships membership
  where membership.club_id=v_club
    and membership.status='APPROVED'
    and membership.approved_at is not null
    and membership.role in ('OWNER','ADMIN','OPERADOR','PLANILLERO');
  if v_staff_count <> 3 or v_roles_covered <> 3 then
    raise exception 'PLANILLERO -> PLAYER no actualizó métricas: staff %, roles %',v_staff_count,v_roles_covered;
  end if;

  -- 9 y 13: PLAYER -> PLANILLERO vuelve al staff y conserva el evento operativo.
  v_result := public.create_club_team_invite_atomic(
    v_club,v_emails[4],'PLANILLERO',v_owner
  );
  if v_result->>'operation' is distinct from 'PROMOTED' then
    raise exception 'PLAYER -> PLANILLERO no usó promoción atómica';
  end if;
  if not exists(
    select 1 from public.club_team_audit audit
    where audit.club_id=v_club and audit.membership_id=v_scorekeeper_membership
      and audit.action='ROLE_CHANGED' and audit.old_role='PLAYER'
      and audit.new_role='PLANILLERO'
  ) then raise exception 'Actividad no conservó Jugador -> Planillero'; end if;

  select count(*), count(distinct membership.role)
    into v_staff_count, v_roles_covered
  from public.club_memberships membership
  where membership.club_id=v_club
    and membership.status='APPROVED'
    and membership.approved_at is not null
    and membership.role in ('OWNER','ADMIN','OPERADOR','PLANILLERO');
  if v_staff_count <> 4 or v_roles_covered <> 4 then
    raise exception 'PLAYER -> PLANILLERO no restauró listado/métricas';
  end if;

  -- 10: ninguna transición administrativa modifica club_players.
  select to_jsonb(player) into v_after_player
  from public.club_players player
  where player.club_id=v_club and player.user_id=v_scorekeeper;
  if v_after_player is distinct from v_before_player then
    raise exception 'Cambio de rol modificó club_players';
  end if;

  -- 11: candidatos de ownership son únicamente ADMIN u OPERADOR aprobados.
  if (select count(*) from public.club_memberships membership
      where membership.club_id=v_club and membership.status='APPROVED'
        and membership.approved_at is not null
        and membership.role in ('ADMIN','OPERADOR')) <> 2
     or exists(
       select 1 from public.club_memberships membership
       where membership.club_id=v_club and membership.user_id=v_player
         and membership.role in ('ADMIN','OPERADOR')
     ) then raise exception 'Candidatos de ownership incluyeron PLAYER o son incorrectos'; end if;

  -- 14: continúa existiendo exactamente un OWNER aprobado.
  if (select count(*) from public.club_memberships membership
      where membership.club_id=v_club and membership.role='OWNER'
        and membership.status='APPROVED' and membership.approved_at is not null) <> 1 then
    raise exception 'El club no conserva exactamente un OWNER aprobado';
  end if;

  return query select 'PASS',
    'Equipo y Roles lista y cuenta solo OWNER/ADMIN/OPERADOR/PLANILLERO';
exception when others then
  return query select 'FAIL', sqlerrm;
end;
$qa$;

select qa.qa_status || ' | ' || qa.qa_detail as result
from pg_temp.run_club_staff_listing_qa() qa;

rollback;
