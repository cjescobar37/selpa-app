-- CLUB Equipo y Roles, etapa 2A: invitaciones atómicas.
-- Aplicar después de 20260723_club_roles_stage1.sql.

begin;

create or replace function public.create_club_team_invite_atomic(
  p_club_id uuid,
  p_email text,
  p_role public.club_role,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_actor public.club_memberships;
  v_target_user_id uuid;
  v_existing_membership public.club_memberships;
  v_invite public.club_user_invites;
begin
  if p_actor_user_id is null or not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'SELPA_CODE:unauthorized' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then
    raise exception 'SELPA_CODE:cross_club_forbidden' using errcode = 'P0001';
  end if;

  select membership.* into v_actor
  from public.club_memberships membership
  where membership.club_id = p_club_id
    and membership.user_id = p_actor_user_id
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  for update;

  if not found or v_actor.role::text not in ('OWNER', 'ADMIN') then
    raise exception 'SELPA_CODE:forbidden' using errcode = 'P0001';
  end if;
  if p_role is null or p_role::text not in ('ADMIN', 'OPERADOR', 'PLANILLERO', 'PLAYER') then
    raise exception 'SELPA_CODE:invalid_role' using errcode = 'P0001';
  end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'SELPA_CODE:invalid_email' using errcode = 'P0001';
  end if;

  -- Serializa creación por club/email para que la comprobación y el insert
  -- produzcan un error funcional estable aun bajo concurrencia.
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || v_email, 0));

  select users.id into v_target_user_id
  from auth.users users
  where lower(users.email) = v_email
  order by users.created_at asc
  limit 1;

  if v_target_user_id is not null then
    select membership.* into v_existing_membership
    from public.club_memberships membership
    where membership.club_id = p_club_id
      and membership.user_id = v_target_user_id
    for update;

    if found then
      case v_existing_membership.status::text
        when 'APPROVED' then raise exception 'SELPA_CODE:membership_already_exists' using errcode = 'P0001';
        when 'PENDING' then raise exception 'SELPA_CODE:membership_pending' using errcode = 'P0001';
        when 'REJECTED' then raise exception 'SELPA_CODE:membership_rejected' using errcode = 'P0001';
        when 'BANNED' then raise exception 'SELPA_CODE:membership_banned' using errcode = 'P0001';
        else raise exception 'SELPA_CODE:membership_already_exists' using errcode = 'P0001';
      end case;
    end if;
  end if;

  if exists (
    select 1 from public.club_user_invites invite
    where invite.club_id = p_club_id
      and lower(invite.email) = v_email
      and invite.status = 'PENDING'
  ) then
    raise exception 'SELPA_CODE:pending_invite_exists' using errcode = 'P0001';
  end if;

  insert into public.club_user_invites(
    club_id, email, role, status, invited_by, target_user_id, created_at, updated_at
  ) values (
    p_club_id, v_email, p_role, 'PENDING', p_actor_user_id, v_target_user_id, now(), now()
  )
  returning * into v_invite;

  insert into public.club_team_audit(
    club_id, actor_user_id, action, target_user_id, invite_id, new_role, metadata
  ) values (
    p_club_id, p_actor_user_id, 'INVITE_CREATED', v_target_user_id, v_invite.id,
    p_role, jsonb_build_object('email', v_email)
  );

  return jsonb_build_object(
    'id', v_invite.id,
    'club_id', v_invite.club_id,
    'email', v_invite.email,
    'role', v_invite.role,
    'status', v_invite.status,
    'invited_by', v_invite.invited_by,
    'target_user_id', v_invite.target_user_id,
    'created_at', v_invite.created_at,
    'updated_at', v_invite.updated_at,
    'expires_at', v_invite.expires_at
  );
exception
  when unique_violation then
    raise exception 'SELPA_CODE:pending_invite_exists' using errcode = 'P0001';
end;
$$;

create or replace function public.accept_club_team_invite_atomic(
  p_invite_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_invite public.club_user_invites;
  v_user_email text;
  v_membership public.club_memberships;
begin
  select lower(btrim(users.email)) into v_user_email
  from auth.users users where users.id = p_user_id;
  if v_user_email is null then
    raise exception 'SELPA_CODE:unauthorized' using errcode = 'P0001';
  end if;

  select invite.* into v_invite
  from public.club_user_invites invite
  where invite.id = p_invite_id
  for update;
  if not found then
    raise exception 'SELPA_CODE:invite_not_found' using errcode = 'P0001';
  end if;
  if v_invite.status <> 'PENDING' then
    raise exception 'SELPA_CODE:invite_already_used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'SELPA_CODE:invite_expired' using errcode = 'P0001';
  end if;
  if lower(btrim(v_invite.email)) is distinct from v_user_email
     or (v_invite.target_user_id is not null and v_invite.target_user_id <> p_user_id) then
    raise exception 'SELPA_CODE:invite_identity_mismatch' using errcode = 'P0001';
  end if;
  if v_invite.role::text not in ('ADMIN', 'OPERADOR', 'PLANILLERO', 'PLAYER') then
    raise exception 'SELPA_CODE:invalid_role' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clubs where id = v_invite.club_id) then
    raise exception 'SELPA_CODE:cross_club_forbidden' using errcode = 'P0001';
  end if;

  select membership.* into v_membership
  from public.club_memberships membership
  where membership.club_id = v_invite.club_id
    and membership.user_id = p_user_id
  for update;

  if found then
    case v_membership.status::text
      when 'APPROVED' then raise exception 'SELPA_CODE:membership_already_exists' using errcode = 'P0001';
      when 'PENDING' then raise exception 'SELPA_CODE:membership_pending' using errcode = 'P0001';
      when 'REJECTED' then raise exception 'SELPA_CODE:membership_rejected' using errcode = 'P0001';
      when 'BANNED' then raise exception 'SELPA_CODE:membership_banned' using errcode = 'P0001';
      else raise exception 'SELPA_CODE:membership_already_exists' using errcode = 'P0001';
    end case;
  end if;

  insert into public.club_memberships(
    club_id, user_id, role, status, approved_at, approved_by, rejection_reason
  ) values (
    v_invite.club_id, p_user_id, v_invite.role, 'APPROVED', now(), v_invite.invited_by, null
  ) returning * into v_membership;

  update public.club_user_invites
  set status = 'ACCEPTED', resolved_by = p_user_id, resolved_at = now(),
      target_user_id = p_user_id, updated_at = now()
  where id = v_invite.id;

  insert into public.club_team_audit(
    club_id, actor_user_id, action, target_user_id, membership_id, invite_id, new_role
  ) values (
    v_invite.club_id, p_user_id, 'INVITE_ACCEPTED', p_user_id,
    v_membership.id, v_invite.id, v_invite.role
  );

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'membership_id', v_membership.id,
    'club_id', v_invite.club_id,
    'role', v_invite.role,
    'status', 'APPROVED'
  );
end;
$$;

create or replace function public.reject_club_team_invite_atomic(
  p_invite_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_invite public.club_user_invites;
  v_user_email text;
begin
  select lower(btrim(users.email)) into v_user_email
  from auth.users users where users.id = p_user_id;
  if v_user_email is null then
    raise exception 'SELPA_CODE:unauthorized' using errcode = 'P0001';
  end if;

  select invite.* into v_invite
  from public.club_user_invites invite
  where invite.id = p_invite_id
  for update;
  if not found then
    raise exception 'SELPA_CODE:invite_not_found' using errcode = 'P0001';
  end if;
  if v_invite.status <> 'PENDING' then
    raise exception 'SELPA_CODE:invite_already_used' using errcode = 'P0001';
  end if;
  if lower(btrim(v_invite.email)) is distinct from v_user_email
     or (v_invite.target_user_id is not null and v_invite.target_user_id <> p_user_id) then
    raise exception 'SELPA_CODE:invite_identity_mismatch' using errcode = 'P0001';
  end if;

  update public.club_user_invites
  set status = 'DECLINED', resolved_by = p_user_id, resolved_at = now(),
      target_user_id = p_user_id, updated_at = now()
  where id = v_invite.id;

  insert into public.club_team_audit(
    club_id, actor_user_id, action, target_user_id, invite_id, new_role
  ) values (
    v_invite.club_id, p_user_id, 'INVITE_DECLINED', p_user_id, v_invite.id, v_invite.role
  );

  return jsonb_build_object('invite_id', v_invite.id, 'status', 'DECLINED');
end;
$$;

create or replace function public.cancel_club_team_invite_atomic(
  p_invite_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_invite public.club_user_invites;
  v_actor public.club_memberships;
begin
  if p_actor_user_id is null or not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'SELPA_CODE:unauthorized' using errcode = 'P0001';
  end if;

  select invite.* into v_invite
  from public.club_user_invites invite
  where invite.id = p_invite_id
  for update;
  if not found then
    raise exception 'SELPA_CODE:invite_not_found' using errcode = 'P0001';
  end if;
  if v_invite.status <> 'PENDING' then
    raise exception 'SELPA_CODE:invite_already_used' using errcode = 'P0001';
  end if;

  select membership.* into v_actor
  from public.club_memberships membership
  where membership.club_id = v_invite.club_id
    and membership.user_id = p_actor_user_id
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  for update;
  if not found or v_actor.role::text not in ('OWNER', 'ADMIN') then
    raise exception 'SELPA_CODE:forbidden' using errcode = 'P0001';
  end if;

  update public.club_user_invites
  set status = 'CANCELLED', resolved_by = p_actor_user_id,
      resolved_at = now(), updated_at = now()
  where id = v_invite.id;

  insert into public.club_team_audit(
    club_id, actor_user_id, action, target_user_id, invite_id, new_role
  ) values (
    v_invite.club_id, p_actor_user_id, 'INVITE_CANCELLED',
    v_invite.target_user_id, v_invite.id, v_invite.role
  );

  return jsonb_build_object('invite_id', v_invite.id, 'status', 'CANCELLED');
end;
$$;

comment on function public.create_club_team_invite_atomic(uuid, text, public.club_role, uuid) is
  'Compatibilidad Etapa 2A: actor derivado por endpoint autenticado; migración futura pendiente a auth.uid().';
comment on function public.cancel_club_team_invite_atomic(uuid, uuid) is
  'Compatibilidad Etapa 2A: actor derivado por endpoint autenticado; migración futura pendiente a auth.uid().';

revoke all on function public.create_club_team_invite_atomic(uuid, text, public.club_role, uuid) from public, anon, authenticated;
revoke all on function public.accept_club_team_invite_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_club_team_invite_atomic(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_club_team_invite_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_club_team_invite_atomic(uuid, text, public.club_role, uuid) to service_role;
grant execute on function public.accept_club_team_invite_atomic(uuid, uuid) to service_role;
grant execute on function public.reject_club_team_invite_atomic(uuid, uuid) to service_role;
grant execute on function public.cancel_club_team_invite_atomic(uuid, uuid) to service_role;

commit;
