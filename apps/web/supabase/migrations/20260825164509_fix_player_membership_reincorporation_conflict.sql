-- Correct the canonical PLAYER approval primitive without changing its contract.
-- The RETURNS TABLE output column `club_id` made ON CONFLICT (club_id, user_id)
-- ambiguous inside PL/pgSQL on PostgreSQL 17. Target the existing named unique
-- constraint instead so approval and LEFT reincorporation reuse the same row.

create or replace function public.approve_player_membership_atomic(p_membership_id uuid)
returns table (membership_id uuid, club_id uuid, user_id uuid, player_id uuid, active_club_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.club_memberships%rowtype;
  v_player_id uuid;
  v_active_club_id uuid;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'Sesión inválida.' using errcode = '42501';
  end if;

  select * into v_membership
  from public.club_memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.club_memberships actor_membership
    where actor_membership.club_id = v_membership.club_id
      and actor_membership.user_id = v_actor_id
      and actor_membership.role in ('OWNER'::public.club_role, 'ADMIN'::public.club_role)
      and actor_membership.status = 'APPROVED'::public.membership_status
      and actor_membership.approved_at is not null
  ) and not exists (
    select 1 from public.platform_admins platform_actor where platform_actor.user_id = v_actor_id
  ) then
    raise exception 'No tenés permisos para gestionar esta solicitud.' using errcode = '42501';
  end if;

  if v_membership.role <> 'PLAYER'::public.club_role then
    raise exception 'La membresía no corresponde a un jugador.' using errcode = '22023';
  end if;

  if v_membership.status = 'BANNED'::public.membership_status then
    raise exception 'La membresía está bloqueada.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = v_membership.user_id
      and nullif(trim(coalesce(p.first_name, '')), '') is not null
      and nullif(trim(coalesce(p.last_name, '')), '') is not null
  ) then
    raise exception 'El jugador debe completar sus datos personales antes de ser aprobado.' using errcode = '23514';
  end if;

  insert into public.club_players (
    club_id, user_id, display_name, category, gender, approved_at, approved_by
  ) values (
    v_membership.club_id, v_membership.user_id, null, null, null, v_now, v_actor_id
  )
  on conflict on constraint club_players_club_id_user_id_key do update
    set approved_at = excluded.approved_at,
        approved_by = excluded.approved_by,
        updated_at = v_now
  returning id into v_player_id;

  update public.club_memberships
  set status = 'APPROVED'::public.membership_status,
      approved_by = v_actor_id,
      approved_at = v_now,
      rejection_reason = null,
      updated_at = v_now
  where id = v_membership.id;

  select us.active_club_id into v_active_club_id
  from public.user_settings us
  where us.user_id = v_membership.user_id
  for update;

  if v_active_club_id is null or not exists (
    select 1 from public.club_memberships current_membership
    where current_membership.user_id = v_membership.user_id
      and current_membership.club_id = v_active_club_id
      and current_membership.status = 'APPROVED'::public.membership_status
      and current_membership.approved_at is not null
  ) then
    v_active_club_id := v_membership.club_id;
  end if;

  insert into public.user_settings (user_id, active_club_id)
  values (v_membership.user_id, v_active_club_id)
  on conflict (user_id) do update
    set active_club_id = excluded.active_club_id,
        updated_at = v_now;

  return query select v_membership.id, v_membership.club_id, v_membership.user_id, v_player_id, v_active_club_id;
end;
$$;

revoke all on function public.approve_player_membership_atomic(uuid) from public, anon;
grant execute on function public.approve_player_membership_atomic(uuid) to authenticated;

comment on function public.approve_player_membership_atomic(uuid) is
  'Aprueba o reincorpora una membresía PLAYER reutilizando el club_player canónico y reparando active_club_id atómicamente.';
