-- QA transaccional — nombramiento de staff para jugadores existentes.
-- Ejecutar después de 20260725_club_existing_player_staff_promotion.sql.

begin;

create or replace function pg_temp.expect_player_staff_error(p_sql text, p_code text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%SELPA_CODE:' || p_code || '%' then return; end if;
    raise exception 'Código esperado %, resultado: %', p_code, sqlerrm;
  end;
  raise exception 'La operación no produjo el error funcional esperado: %', p_code;
end;
$$;

create or replace function pg_temp.run_existing_player_staff_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $qa$
declare
  v_club uuid;
  v_owner uuid;
  v_player_only uuid;
  v_member_player uuid;
  v_owner_email text;
  v_player_only_email text;
  v_member_player_email text;
  v_membership_id uuid;
  v_invite_id uuid;
  v_result jsonb;
  v_before_player jsonb;
  v_after_player jsonb;
  v_role text;
begin
  select users.id, lower(users.email) into v_owner, v_owner_email
  from auth.users users
  where users.email is not null
  order by users.created_at
  limit 1;

  select users.id, lower(users.email) into v_player_only, v_player_only_email
  from auth.users users
  where users.email is not null and users.id <> v_owner
  order by users.created_at
  limit 1;

  select users.id, lower(users.email) into v_member_player, v_member_player_email
  from auth.users users
  where users.email is not null and users.id not in (v_owner, v_player_only)
  order by users.created_at
  limit 1;

  if v_owner is null or v_player_only is null or v_member_player is null then
    return query select 'FAIL', 'QA no ejecutable: se requieren tres usuarios reales con email';
    return;
  end if;

  insert into public.clubs as club(name, slug)
  values ('QA Player Staff', 'qa-player-staff-' || txid_current()::text)
  returning club.id into v_club;

  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
  values(v_club,v_owner,'OWNER','APPROVED',now(),v_owner);

  -- 1 y 5: jugador existente solo en club_players conserva su ficha y puede aceptar PLANILLERO.
  insert into public.club_players(club_id,user_id,display_name,approved_at,approved_by)
  values(v_club,v_player_only,'QA Player Only',now(),v_owner);
  select to_jsonb(player) into v_before_player
  from public.club_players player
  where player.club_id=v_club and player.user_id=v_player_only;

  v_result := public.create_club_team_invite_atomic(
    v_club,v_player_only_email,'PLANILLERO',v_owner
  );
  if v_result->>'operation' is distinct from 'INVITED' then
    raise exception 'Jugador solo en club_players no recibió invitación';
  end if;
  v_invite_id := (v_result->>'id')::uuid;
  perform public.accept_club_team_invite_atomic(v_invite_id,v_player_only);
  if not exists(
    select 1 from public.club_memberships membership
    where membership.club_id=v_club and membership.user_id=v_player_only
      and membership.role='PLANILLERO' and membership.status='APPROVED'
      and membership.approved_at is not null
  ) then raise exception 'Jugador solo en club_players no quedó PLANILLERO'; end if;

  select to_jsonb(player) into v_after_player
  from public.club_players player
  where player.club_id=v_club and player.user_id=v_player_only;
  if v_after_player is distinct from v_before_player then
    raise exception 'La invitación o aceptación modificó club_players';
  end if;

  -- 2-5 y 9: una única membership PLAYER se promociona a cada rol sin tocar club_players.
  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
  values(v_club,v_member_player,'PLAYER','APPROVED',now(),v_owner)
  returning id into v_membership_id;
  insert into public.club_players(club_id,user_id,display_name,approved_at,approved_by)
  values(v_club,v_member_player,'QA Membership Player',now(),v_owner);
  select to_jsonb(player) into v_before_player
  from public.club_players player
  where player.club_id=v_club and player.user_id=v_member_player;

  foreach v_role in array array['PLANILLERO','ADMIN','OPERADOR'] loop
    update public.club_memberships as membership
    set role='PLAYER'
    where membership.id=v_membership_id;

    v_result := public.create_club_team_invite_atomic(
      v_club,v_member_player_email,v_role::public.club_role,v_owner
    );
    if v_result->>'operation' is distinct from 'PROMOTED'
       or v_result->>'membership_id' is distinct from v_membership_id::text
       or v_result->>'role' is distinct from v_role then
      raise exception 'Promoción PLAYER a % no reutilizó la membership', v_role;
    end if;
    if (select count(*) from public.club_memberships membership
        where membership.club_id=v_club and membership.user_id=v_member_player) <> 1 then
      raise exception 'Promoción a % duplicó memberships', v_role;
    end if;
  end loop;

  select to_jsonb(player) into v_after_player
  from public.club_players player
  where player.club_id=v_club and player.user_id=v_member_player;
  if v_after_player is distinct from v_before_player then
    raise exception 'La promoción de membership modificó club_players';
  end if;

  -- 6: staff existente no genera invitación ni cambio implícito.
  perform pg_temp.expect_player_staff_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_member_player_email,'ADMIN',v_owner),'staff_already_exists');

  -- 7: una invitación pendiente no se duplica.
  perform public.create_club_team_invite_atomic(
    v_club,'qa-pending-'||txid_current()||'@example.test','PLANILLERO',v_owner
  );
  perform pg_temp.expect_player_staff_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,'qa-pending-'||txid_current()||'@example.test','PLANILLERO',v_owner),
    'pending_invite_exists');

  -- 8: OWNER nunca se modifica mediante el flujo de invitaciones.
  perform pg_temp.expect_player_staff_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_owner_email,'ADMIN',v_owner),'owner_already_exists');

  -- 10: los errores funcionales nuevos existen y la promoción queda auditada.
  if not exists(
    select 1 from public.club_team_audit audit
    where audit.club_id=v_club and audit.target_user_id=v_member_player
      and audit.action='ROLE_CHANGED' and audit.old_role='PLAYER'
  ) then raise exception 'La promoción PLAYER no dejó auditoría ROLE_CHANGED'; end if;

  return query select 'PASS',
    'Jugador existente puede ser nombrado staff sin duplicar membership ni modificar club_players';
exception when others then
  return query select 'FAIL', sqlerrm;
end;
$qa$;

select qa.qa_status || ' | ' || qa.qa_detail as result
from pg_temp.run_existing_player_staff_qa() qa;

rollback;
