-- Canonical LEFT -> ACTIVE transition for registered and manual club players.
create or replace function public.reincorporate_club_player_atomic(
  p_club_id uuid,
  p_club_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid;
  v_player public.club_players%rowtype;
  v_membership public.club_memberships%rowtype;
  v_is_manual boolean := false;
begin
  v_actor := public.assert_club_player_lifecycle_actor(p_club_id);
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || p_club_player_id::text, 61));

  select * into v_player
  from public.club_players
  where id = p_club_player_id
  for update;

  if not found then raise exception 'SELPA_CODE:CLUB_PLAYER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_player.club_id <> p_club_id then raise exception 'SELPA_CODE:CROSS_CLUB' using errcode = '42501'; end if;
  if v_player.user_id = v_actor then raise exception 'SELPA_CODE:SELF_ACTION_FORBIDDEN' using errcode = '42501'; end if;
  if v_player.operational_status <> 'LEFT'::public.club_player_operational_status then
    return jsonb_build_object('code', 'ALREADY_ACTIVE', 'club_player_id', v_player.id);
  end if;

  if v_player.user_id is not null then
    select * into v_membership
    from public.club_memberships
    where club_id = p_club_id and user_id = v_player.user_id
    for update;

    if found then
      if v_membership.role = 'OWNER'::public.club_role then raise exception 'SELPA_CODE:OWNER_TRANSFER_REQUIRED' using errcode = '23514'; end if;
      if v_membership.role <> 'PLAYER'::public.club_role then raise exception 'SELPA_CODE:ACTIVE_STAFF_ROLE' using errcode = '23514'; end if;
      perform * from public.approve_player_membership_atomic(v_membership.id);
    else
      select coalesce(p.email ~* '^manual-[a-z0-9-]+@manual\.[a-z0-9.-]+$', false)
        into v_is_manual
      from public.profiles p
      where p.user_id = v_player.user_id;
      if not v_is_manual then raise exception 'SELPA_CODE:PLAYER_MEMBERSHIP_RECONCILIATION_REQUIRED' using errcode = '23514'; end if;
    end if;
  else
    v_is_manual := true;
  end if;

  if v_is_manual then
    update public.club_players
       set operational_status = 'ACTIVE'::public.club_player_operational_status,
           operational_reason = null,
           operational_changed_at = now(),
           operational_changed_by = v_actor,
           approved_at = coalesce(approved_at, now()),
           approved_by = coalesce(approved_by, v_actor),
           updated_at = now()
     where id = v_player.id;
  end if;

  insert into public.club_team_audit (
    club_id, actor_user_id, action, target_user_id, membership_id, old_role, new_role, metadata
  ) values (
    p_club_id, v_actor, 'PLAYER_REACTIVATED', v_player.user_id,
    case when v_membership.id is null then null else v_membership.id end,
    case when v_membership.id is null then null else v_membership.role end,
    case when v_membership.id is null then null else v_membership.role end,
    jsonb_build_object('club_player_id', v_player.id, 'transition', 'LEFT_TO_ACTIVE', 'manual_player', v_is_manual)
  );

  return jsonb_build_object('code', 'REINCORPORATED', 'club_player_id', v_player.id);
end;
$$;

revoke all on function public.reincorporate_club_player_atomic(uuid, uuid) from public, anon;
grant execute on function public.reincorporate_club_player_atomic(uuid, uuid) to authenticated, service_role;

comment on function public.reincorporate_club_player_atomic(uuid, uuid) is
  'Reincorpora LEFT reutilizando el mismo club_player; restaura membership PLAYER cuando existe y preserva registros manuales e historia.';
