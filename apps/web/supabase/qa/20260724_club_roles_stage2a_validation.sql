-- QA transaccional — CLUB Equipo y Roles, Etapa 2A.
-- Ejecutar completo en Supabase SQL Editor después de aplicar
-- 20260724_club_roles_stage2a_atomic_invites.sql.

begin;

create or replace function pg_temp.expect_stage2a_error(p_sql text, p_code text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%SELPA_CODE:' || p_code || '%' then
      return;
    end if;
    raise exception 'Código esperado %, resultado: %', p_code, sqlerrm;
  end;
  raise exception 'La operación no produjo el error funcional esperado: %', p_code;
end;
$$;

create or replace function pg_temp.run_club_roles_stage2a_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $qa$
declare
  v_club uuid;
  v_club_b uuid;
  v_owner uuid;
  v_admin uuid;
  v_operator uuid;
  v_scorekeeper uuid;
  v_player uuid;
  v_candidate uuid;
  v_target_email text;
  v_invite uuid;
  v_result jsonb;
  v_before_player jsonb;
  v_after_player jsonb;
  v_used uuid[];
  v_role text;
  v_function_name text;
begin
  select membership.club_id, membership.user_id
    into v_club, v_owner
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;
  if v_club is null then
    return query select 'FAIL', 'QA no ejecutable: falta club con OWNER APPROVED'; return;
  end if;

  insert into public.clubs as club(name, slug)
  values ('QA Etapa 2A Club B', 'qa-etapa-2a-' || txid_current()::text)
  returning club.id into v_club_b;

  v_used := array[v_owner];
  foreach v_role in array array['ADMIN','OPERADOR','PLANILLERO','PLAYER'] loop
    select users.id into v_candidate
    from auth.users users
    where users.email is not null
      and not (users.id = any(v_used))
      and not exists (
        select 1 from public.club_memberships membership
        where membership.club_id = v_club and membership.user_id = users.id
      )
    order by users.created_at
    limit 1;
    if v_candidate is null then
      return query select 'FAIL', 'QA no ejecutable: faltan usuarios reales con email para autoaprovisionar actores'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club,v_candidate,v_role::public.club_role,'APPROVED',now(),v_owner);
    if v_role='ADMIN' then v_admin:=v_candidate;
    elsif v_role='OPERADOR' then v_operator:=v_candidate;
    elsif v_role='PLANILLERO' then v_scorekeeper:=v_candidate;
    else v_player:=v_candidate;
    end if;
    v_used := array_append(v_used,v_candidate);
  end loop;

  -- 1-5: OWNER y ADMIN crean los cuatro roles admitidos.
  foreach v_role in array array['ADMIN','OPERADOR','PLANILLERO','PLAYER'] loop
    v_result := public.create_club_team_invite_atomic(
      v_club, 'qa-owner-'||lower(v_role)||'-'||txid_current()||'@example.test',
      v_role::public.club_role, v_owner
    );
    if v_result->>'role' is distinct from v_role or v_result->>'status' is distinct from 'PENDING' then
      raise exception 'OWNER no creó invitación % correctamente', v_role;
    end if;
    v_result := public.create_club_team_invite_atomic(
      v_club, 'qa-admin-'||lower(v_role)||'-'||txid_current()||'@example.test',
      v_role::public.club_role, v_admin
    );
    if v_result->>'role' is distinct from v_role then
      raise exception 'ADMIN no creó invitación % correctamente', v_role;
    end if;
  end loop;

  -- 6-8: roles sin roles:manage no crean invitaciones.
  perform pg_temp.expect_stage2a_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,'qa-denied-op-'||txid_current()||'@example.test','ADMIN',v_operator),'forbidden');
  perform pg_temp.expect_stage2a_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,'qa-denied-plan-'||txid_current()||'@example.test','ADMIN',v_scorekeeper),'forbidden');
  perform pg_temp.expect_stage2a_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,'qa-denied-player-'||txid_current()||'@example.test','ADMIN',v_player),'forbidden');

  -- 9-11: OWNER, OPERATIVO e email inválido.
  perform pg_temp.expect_stage2a_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,'qa-owner-role-'||txid_current()||'@example.test','OWNER',v_owner),'invalid_role');
  begin
    execute format('select %L::public.club_role','OPERATIVO');
    raise exception 'OPERATIVO fue aceptado por public.club_role';
  exception when invalid_text_representation then null;
  end;
  perform pg_temp.expect_stage2a_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,'email-invalido','ADMIN',v_owner),'invalid_email');

  -- 12: invitación duplicada explícita.
  perform public.create_club_team_invite_atomic(
    v_club,'qa-duplicate-'||txid_current()||'@example.test','ADMIN',v_owner);
  perform pg_temp.expect_stage2a_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,'qa-duplicate-'||txid_current()||'@example.test','ADMIN',v_owner),'pending_invite_exists');

  -- Liberamos un usuario real para estados de membership y aceptación.
  delete from public.club_memberships as membership
  where membership.club_id=v_club and membership.user_id=v_operator;
  select lower(users.email) into v_target_email
  from auth.users users where users.id=v_operator;

  -- 13-16: ningún estado existente se rehabilita desde una invitación.
  foreach v_role in array array['APPROVED','PENDING','REJECTED','BANNED'] loop
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club,v_operator,'PLAYER',v_role::public.membership_status,
      case when v_role='APPROVED' then now() else null end,v_owner);
    perform pg_temp.expect_stage2a_error(format(
      'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
      v_club,v_target_email,'PLAYER',v_owner),
      case v_role when 'APPROVED' then 'membership_already_exists'
        when 'PENDING' then 'membership_pending' when 'REJECTED' then 'membership_rejected'
        else 'membership_banned' end);
    delete from public.club_memberships as membership
    where membership.club_id=v_club and membership.user_id=v_operator;
  end loop;

  -- 17-23: aceptación, rol, repetición, vencimiento, identidad y club_players.
  v_result := public.create_club_team_invite_atomic(v_club,v_target_email,'OPERADOR',v_owner);
  v_invite := (v_result->>'id')::uuid;
  if exists(
    select 1 from public.club_players player
    where player.club_id=v_club and player.user_id=v_operator
  ) then
    delete from public.club_players as player
    where player.club_id=v_club and player.user_id=v_operator;
  end if;
  v_result := public.accept_club_team_invite_atomic(v_invite,v_operator);
  if not exists(
    select 1 from public.club_memberships membership
    where membership.club_id=v_club and membership.user_id=v_operator
      and membership.role='OPERADOR' and membership.status='APPROVED'
      and membership.approved_at is not null
  ) then
    raise exception 'Aceptación no creó membership OPERADOR APPROVED';
  end if;
  if exists(
    select 1 from public.club_players player
    where player.club_id=v_club and player.user_id=v_operator
  ) then
    raise exception 'Aceptación creó club_players';
  end if;
  perform pg_temp.expect_stage2a_error(format(
    'select public.accept_club_team_invite_atomic(%L,%L)',v_invite,v_operator),'invite_already_used');

  delete from public.club_memberships as membership
  where membership.club_id=v_club and membership.user_id=v_operator;
  v_result := public.create_club_team_invite_atomic(v_club,v_target_email,'PLAYER',v_owner);
  v_invite := (v_result->>'id')::uuid;
  update public.club_user_invites as invite
  set expires_at=now()-interval '1 minute'
  where invite.id=v_invite;
  perform pg_temp.expect_stage2a_error(format(
    'select public.accept_club_team_invite_atomic(%L,%L)',v_invite,v_operator),'invite_expired');

  update public.club_user_invites as invite
  set status='CANCELLED',resolved_at=now(),resolved_by=v_owner
  where invite.id=v_invite;
  v_result := public.create_club_team_invite_atomic(v_club,v_target_email,'PLAYER',v_owner);
  v_invite := (v_result->>'id')::uuid;
  perform pg_temp.expect_stage2a_error(format(
    'select public.accept_club_team_invite_atomic(%L,%L)',v_invite,v_player),'invite_identity_mismatch');

  insert into public.club_players(club_id,user_id,display_name,category,gender,approved_at,approved_by)
  values(v_club,v_operator,'QA preservado',null,null,now(),v_owner)
  on conflict(club_id,user_id) do update set display_name='QA preservado',approved_at=excluded.approved_at;
  select to_jsonb(player) into v_before_player from public.club_players player
  where player.club_id=v_club and player.user_id=v_operator;
  perform public.accept_club_team_invite_atomic(v_invite,v_operator);
  select to_jsonb(player) into v_after_player from public.club_players player
  where player.club_id=v_club and player.user_id=v_operator;
  if v_after_player is distinct from v_before_player then raise exception 'Aceptación modificó club_players'; end if;

  -- 24-25: rechazo atómico y segunda ejecución controlada.
  delete from public.club_memberships as membership
  where membership.club_id=v_club and membership.user_id=v_operator;
  v_result := public.create_club_team_invite_atomic(v_club,v_target_email,'PLAYER',v_owner);
  v_invite := (v_result->>'id')::uuid;
  perform public.reject_club_team_invite_atomic(v_invite,v_operator);
  if not exists(
       select 1 from public.club_user_invites invite
       where invite.id=v_invite and invite.status='DECLINED' and invite.resolved_by=v_operator
     )
     or not exists(
       select 1 from public.club_team_audit audit
       where audit.invite_id=v_invite and audit.action='INVITE_DECLINED'
     ) then
    raise exception 'Rechazo no actualizó invitación y auditoría';
  end if;
  perform pg_temp.expect_stage2a_error(format(
    'select public.reject_club_team_invite_atomic(%L,%L)',v_invite,v_operator),'invite_already_used');

  -- 26-31: OWNER/ADMIN cancelan; otros roles y segunda ejecución fallan.
  foreach v_candidate in array array[v_owner,v_admin] loop
    v_result := public.create_club_team_invite_atomic(
      v_club,'qa-cancel-'||v_candidate||'-'||txid_current()||'@example.test','PLAYER',v_owner);
    v_invite := (v_result->>'id')::uuid;
    perform public.cancel_club_team_invite_atomic(v_invite,v_candidate);
    if not exists(
      select 1 from public.club_user_invites invite
      where invite.id=v_invite and invite.status='CANCELLED'
    ) then
      raise exception 'Cancelación autorizada no persistió';
    end if;
  end loop;
  foreach v_candidate in array array[v_scorekeeper,v_player] loop
    v_result := public.create_club_team_invite_atomic(
      v_club,'qa-denied-cancel-'||v_candidate||'-'||txid_current()||'@example.test','PLAYER',v_owner);
    v_invite := (v_result->>'id')::uuid;
    perform pg_temp.expect_stage2a_error(format(
      'select public.cancel_club_team_invite_atomic(%L,%L)',v_invite,v_candidate),'forbidden');
  end loop;
  -- OPERADOR se recrea como actor solo para validar cancelación denegada.
  update public.club_memberships as membership
  set role='OPERADOR'
  where membership.club_id=v_club and membership.user_id=v_operator;
  v_result := public.create_club_team_invite_atomic(
    v_club,'qa-denied-cancel-op-'||txid_current()||'@example.test','PLAYER',v_owner);
  v_invite := (v_result->>'id')::uuid;
  perform pg_temp.expect_stage2a_error(format(
    'select public.cancel_club_team_invite_atomic(%L,%L)',v_invite,v_operator),'forbidden');
  perform public.cancel_club_team_invite_atomic(v_invite,v_owner);
  perform pg_temp.expect_stage2a_error(format(
    'select public.cancel_club_team_invite_atomic(%L,%L)',v_invite,v_owner),'invite_already_used');

  -- 32: no hay escalada cross-club.
  perform pg_temp.expect_stage2a_error(format(
    'select public.create_club_team_invite_atomic(%L,%L,%L::public.club_role,%L)',
    v_club_b,'qa-cross-'||txid_current()||'@example.test','ADMIN',v_owner),'forbidden');

  -- 33: fallo de auditoría revierte también la invitación.
  execute $ddl$
    create or replace function pg_temp.fail_stage2a_audit() returns trigger language plpgsql as $fn$
    begin
      if new.metadata->>'email' like 'qa-rollback-%' then raise exception 'QA forced audit failure'; end if;
      return new;
    end $fn$
  $ddl$;
  create trigger qa_stage2a_force_audit_failure before insert on public.club_team_audit
  for each row execute function pg_temp.fail_stage2a_audit();
  begin
    perform public.create_club_team_invite_atomic(
      v_club,'qa-rollback-'||txid_current()||'@example.test','ADMIN',v_owner);
    raise exception 'Fallo de auditoría no abortó la operación';
  exception when others then
    if sqlerrm = 'Fallo de auditoría no abortó la operación' then raise; end if;
  end;
  if exists(
    select 1 from public.club_user_invites invite
    where invite.email='qa-rollback-'||txid_current()||'@example.test'
  ) then
    raise exception 'Fallo de auditoría dejó invitación parcial';
  end if;
  drop trigger qa_stage2a_force_audit_failure on public.club_team_audit;

  -- 34: SECURITY DEFINER, search_path y grants únicamente service_role.
  foreach v_function_name in array array[
    'create_club_team_invite_atomic','accept_club_team_invite_atomic',
    'reject_club_team_invite_atomic','cancel_club_team_invite_atomic'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc proc
      where proc.pronamespace='public'::regnamespace and proc.proname=v_function_name
        and proc.prosecdef
        and 'search_path=pg_catalog, public, auth'=any(proc.proconfig)
        and has_function_privilege('service_role',proc.oid,'EXECUTE')
        and not has_function_privilege('authenticated',proc.oid,'EXECUTE')
        and not has_function_privilege('anon',proc.oid,'EXECUTE')
    ) then raise exception 'Seguridad o grants incorrectos en %',v_function_name; end if;
  end loop;

  return query select 'PASS', 'Etapa 2A válida: creación, aceptación, rechazo y cancelación de invitaciones';
exception when others then
  return query select 'FAIL', sqlerrm;
end;
$qa$;

select qa.qa_status || ' | ' || qa.qa_detail as result
from pg_temp.run_club_roles_stage2a_qa() qa;

rollback;
