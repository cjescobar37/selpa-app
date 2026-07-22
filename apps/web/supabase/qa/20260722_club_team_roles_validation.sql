-- QA CLUB Sprint 2 — Equipo y Roles.
-- Ejecutar el archivo completo en Supabase SQL Editor.
-- Toda mutación de datos queda contenida en esta transacción y se revierte al final.
begin;

create or replace function pg_temp.run_club_team_roles_qa()
returns table(status text, detail text)
language plpgsql
as $qa$
declare
  v_club_a uuid;
  v_club_b uuid;
  v_owner_a uuid;
  v_owner_membership_a uuid;
  v_admin_a uuid;
  v_admin_membership_a uuid;
  v_planillero_a uuid;
  v_planillero_membership_a uuid;
  v_admin_b uuid;
  v_admin_membership_b uuid;
  v_candidate uuid;
  v_invite uuid;
  v_cancelled uuid;
  v_expired uuid;
  v_used uuid[] := '{}'::uuid[];
begin
  select membership.club_id, membership.user_id, membership.id
    into v_club_a, v_owner_a, v_owner_membership_a
  from public.club_memberships membership
  where membership.role='OWNER'
    and membership.status='APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  if v_club_a is null then
    return query select 'FAIL','QA no ejecutable: falta club con OWNER APPROVED';
    return;
  end if;

  select club.id into v_club_b
  from public.clubs club
  where club.id<>v_club_a
    and not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=club.id and membership.user_id=v_owner_a
        and membership.status='APPROVED' and membership.approved_at is not null
        and membership.role in ('OWNER','ADMIN','PLANILLERO'))
  order by club.created_at
  limit 1;
  if v_club_b is null then
    return query select 'FAIL','QA no ejecutable: falta Club B';
    return;
  end if;

  v_used:=array[v_owner_a];

  select membership.user_id,membership.id
    into v_admin_a,v_admin_membership_a
  from public.club_memberships membership
  where membership.club_id=v_club_a and membership.role='ADMIN'
    and membership.status='APPROVED' and membership.approved_at is not null
  limit 1;
  if v_admin_a is null then
    select candidate.id into v_candidate from auth.users candidate
    where candidate.email is not null
      and not(candidate.id=any(v_used))
      and not exists(select 1 from public.club_memberships membership
        where membership.club_id=v_club_a and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario con email para ADMIN'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_a,v_candidate,'ADMIN','APPROVED',now(),v_owner_a)
    returning id into v_admin_membership_a;
    v_admin_a:=v_candidate;
  end if;
  v_used:=array_append(v_used,v_admin_a);

  select membership.user_id,membership.id
    into v_planillero_a,v_planillero_membership_a
  from public.club_memberships membership
  where membership.club_id=v_club_a and membership.role='PLANILLERO'
    and membership.status='APPROVED' and membership.approved_at is not null
  limit 1;
  if v_planillero_a is null then
    select candidate.id into v_candidate from auth.users candidate
    where candidate.email is not null
      and not(candidate.id=any(v_used))
      and not exists(select 1 from public.club_memberships membership
        where membership.club_id=v_club_a and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario con email para PLANILLERO'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_a,v_candidate,'PLANILLERO','APPROVED',now(),v_owner_a)
    returning id into v_planillero_membership_a;
    v_planillero_a:=v_candidate;
  end if;

  select membership.user_id,membership.id
    into v_admin_b,v_admin_membership_b
  from public.club_memberships membership
  where membership.club_id=v_club_b and membership.role='ADMIN'
    and membership.status='APPROVED' and membership.approved_at is not null
  limit 1;
  if v_admin_b is null then
    select candidate.id into v_candidate from auth.users candidate
    where candidate.email is not null
      and not exists(select 1 from public.club_memberships membership
        where membership.club_id=v_club_b and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario con email para ADMIN Club B'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_b,v_candidate,'ADMIN','APPROVED',now(),v_owner_a)
    returning id into v_admin_membership_b;
    v_admin_b:=v_candidate;
  end if;

  perform public.change_club_staff_role_atomic(v_club_a,v_planillero_membership_a,'ADMIN',v_owner_a);
  if (select membership.role='ADMIN' from public.club_memberships membership where membership.id=v_planillero_membership_a) is distinct from true then
    raise exception 'OWNER no cambió PLANILLERO a ADMIN';
  end if;

  perform public.change_club_staff_role_atomic(v_club_a,v_planillero_membership_a,'PLANILLERO',v_admin_a);
  if (select membership.role='PLANILLERO' from public.club_memberships membership where membership.id=v_planillero_membership_a) is distinct from true then
    raise exception 'ADMIN no cambió ADMIN a PLANILLERO';
  end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_planillero_a::text,true);
  if public.has_club_capability(v_club_a,'audit:view') then raise exception 'PLANILLERO puede ver auditoría'; end if;

  begin
    perform public.change_club_staff_role_atomic(v_club_a,v_admin_membership_a,'ADMIN',v_planillero_a);
    raise exception 'PLANILLERO administró roles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.change_club_staff_role_atomic(v_club_a,v_owner_membership_a,'ADMIN',v_admin_a);
    raise exception 'ADMIN modificó OWNER';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_club_staff_atomic(v_club_a,v_owner_membership_a,v_admin_a);
    raise exception 'ADMIN removió OWNER';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.transfer_club_ownership_atomic(v_club_a,v_admin_membership_a,v_admin_a);
    raise exception 'ADMIN transfirió ownership';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.change_club_staff_role_atomic(v_club_a,v_admin_membership_a,'OWNER',v_owner_a);
    raise exception 'Se creó OWNER por rol';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.change_club_staff_role_atomic(v_club_b,v_admin_membership_b,'PLANILLERO',v_owner_a);
    raise exception 'Cross-club permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.club_memberships set role='ADMIN' where id=v_owner_membership_a;
    raise exception 'UPDATE directo degradó OWNER';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.club_memberships where id=v_owner_membership_a;
    raise exception 'DELETE directo removió OWNER';
  exception when insufficient_privilege then null;
  end;

  update public.club_user_invites
  set status='CANCELLED',resolved_by=v_owner_a,resolved_at=now(),updated_at=now()
  where club_id=v_club_a
    and lower(email)=(select lower(email) from auth.users where id=v_planillero_a)
    and status='PENDING';

  insert into public.club_user_invites(club_id,email,role,status,invited_by,target_user_id)
  select v_club_a,lower(email),'PLANILLERO','PENDING',v_owner_a,v_planillero_a
  from auth.users where id=v_planillero_a
  returning id into v_invite;

  begin
    perform public.accept_club_staff_invite_atomic(v_invite,v_admin_a);
    raise exception 'Usuario distinto aceptó invitación';
  exception when insufficient_privilege then null;
  end;
  perform public.accept_club_staff_invite_atomic(v_invite,v_planillero_a);
  if (select invite.status='ACCEPTED' from public.club_user_invites invite where invite.id=v_invite) is distinct from true then
    raise exception 'Invitación no aceptada';
  end if;
  if not exists(select 1 from public.club_team_audit audit where audit.invite_id=v_invite and audit.action='INVITE_ACCEPTED') then
    raise exception 'Aceptación sin auditoría';
  end if;
  begin
    perform public.accept_club_staff_invite_atomic(v_invite,v_planillero_a);
    raise exception 'Invitación aceptada dos veces';
  exception when unique_violation then null;
  end;

  insert into public.club_user_invites(club_id,email,role,status,invited_by,target_user_id,resolved_by,resolved_at)
  select v_club_a,lower(email),'ADMIN','CANCELLED',v_owner_a,v_planillero_a,v_owner_a,now()
  from auth.users where id=v_planillero_a returning id into v_cancelled;
  begin
    perform public.accept_club_staff_invite_atomic(v_cancelled,v_planillero_a);
    raise exception 'Invitación cancelada aceptada';
  exception when unique_violation then null;
  end;

  insert into public.club_user_invites(club_id,email,role,status,invited_by,target_user_id,expires_at)
  select v_club_a,lower(email),'PLANILLERO','PENDING',v_owner_a,v_planillero_a,now()-interval '1 minute'
  from auth.users where id=v_planillero_a returning id into v_expired;
  begin
    perform public.accept_club_staff_invite_atomic(v_expired,v_planillero_a);
    raise exception 'Invitación vencida aceptada';
  exception when invalid_parameter_value then null;
  end;

  insert into public.user_settings(user_id,active_club_id)
  values(v_planillero_a,v_club_a)
  on conflict(user_id) do update set active_club_id=excluded.active_club_id;
  perform public.remove_club_staff_atomic(v_club_a,v_planillero_membership_a,v_admin_a);
  if exists(select 1 from public.club_memberships membership where membership.id=v_planillero_membership_a) then
    raise exception 'Remoción falló';
  end if;
  if not coalesce((select settings.active_club_id<>v_club_a from public.user_settings settings where settings.user_id=v_planillero_a),true) then
    raise exception 'active_club_id no reparado';
  end if;
  if not exists(select 1 from public.club_team_audit audit where audit.membership_id=v_planillero_membership_a and audit.action='MEMBER_REMOVED') then
    raise exception 'Remoción sin auditoría';
  end if;

  perform public.transfer_club_ownership_atomic(v_club_a,v_admin_membership_a,v_owner_a);
  if (select membership.role='OWNER' from public.club_memberships membership where membership.id=v_admin_membership_a) is distinct from true then
    raise exception 'Nuevo OWNER incorrecto';
  end if;
  if (select membership.role='ADMIN' from public.club_memberships membership where membership.id=v_owner_membership_a) is distinct from true then
    raise exception 'OWNER anterior no pasó a ADMIN';
  end if;
  if (select count(*) from public.club_memberships membership
      where membership.club_id=v_club_a and membership.role='OWNER'
        and membership.status='APPROVED' and membership.approved_at is not null)<>1 then
    raise exception 'No quedó exactamente un OWNER';
  end if;
  if not exists(select 1 from public.club_team_audit audit where audit.club_id=v_club_a and audit.action='OWNERSHIP_TRANSFERRED') then
    raise exception 'Transferencia sin auditoría';
  end if;

  return query select 'PASS','Equipo y Roles: matriz automática completa';
exception when others then
  return query select 'FAIL',sqlerrm;
end;
$qa$;

select * from pg_temp.run_club_team_roles_qa();
rollback;
