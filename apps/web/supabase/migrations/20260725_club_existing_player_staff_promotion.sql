-- CLUB Equipo y Roles: permitir nombrar staff a jugadores existentes.
-- Aplicar después de 20260724_club_roles_stage2b_atomic_members.sql.

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
  v_promoted_membership public.club_memberships;
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

  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || v_email, 0));

  select users.id into v_target_user_id
  from auth.users users
  where lower(users.email) = v_email
  order by users.created_at asc
  limit 1;

  if exists (
    select 1 from public.club_user_invites invite
    where invite.club_id = p_club_id
      and lower(invite.email) = v_email
      and invite.status = 'PENDING'
  ) then
    raise exception 'SELPA_CODE:pending_invite_exists' using errcode = 'P0001';
  end if;

  if v_target_user_id is not null then
    select membership.* into v_existing_membership
    from public.club_memberships membership
    where membership.club_id = p_club_id
      and membership.user_id = v_target_user_id
    for update;

    if found then
      case v_existing_membership.status::text
        when 'APPROVED' then
          if v_existing_membership.role = 'OWNER' then
            raise exception 'SELPA_CODE:owner_already_exists' using errcode = 'P0001';
          elsif v_existing_membership.role::text in ('ADMIN', 'OPERADOR', 'PLANILLERO') then
            raise exception 'SELPA_CODE:staff_already_exists' using errcode = 'P0001';
          elsif v_existing_membership.role = 'PLAYER'
                and p_role::text in ('ADMIN', 'OPERADOR', 'PLANILLERO') then
            select changed.* into v_promoted_membership
            from public.change_club_staff_role_atomic(
              p_club_id, v_existing_membership.id, p_role, p_actor_user_id
            ) changed;

            return jsonb_build_object(
              'operation', 'PROMOTED',
              'membership_id', v_promoted_membership.id,
              'club_id', v_promoted_membership.club_id,
              'user_id', v_promoted_membership.user_id,
              'role', v_promoted_membership.role,
              'status', v_promoted_membership.status
            );
          else
            raise exception 'SELPA_CODE:membership_already_exists' using errcode = 'P0001';
          end if;
        when 'PENDING' then raise exception 'SELPA_CODE:membership_pending' using errcode = 'P0001';
        when 'REJECTED' then raise exception 'SELPA_CODE:membership_rejected' using errcode = 'P0001';
        when 'BANNED' then raise exception 'SELPA_CODE:membership_banned' using errcode = 'P0001';
        else raise exception 'SELPA_CODE:membership_already_exists' using errcode = 'P0001';
      end case;
    end if;
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
    'operation', 'INVITED',
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

comment on function public.create_club_team_invite_atomic(uuid, text, public.club_role, uuid) is
  'Crea invitaciones de equipo o promociona atómicamente una membership PLAYER aprobada; nunca modifica club_players.';

revoke all on function public.create_club_team_invite_atomic(uuid, text, public.club_role, uuid)
  from public, anon, authenticated;
grant execute on function public.create_club_team_invite_atomic(uuid, text, public.club_role, uuid)
  to service_role;

commit;
