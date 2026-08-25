-- Canonical club-player lifecycle: preserve sporting history while separating
-- temporary access suspension (BLOCKED) from a logical departure (LEFT).

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'club_player_operational_status'
  ) then
    create type public.club_player_operational_status as enum ('ACTIVE', 'BLOCKED', 'LEFT');
  end if;
end;
$$;

alter table public.club_players
  alter column user_id drop not null,
  add column if not exists operational_status public.club_player_operational_status not null default 'ACTIVE',
  add column if not exists operational_reason text,
  add column if not exists operational_changed_at timestamptz not null default now(),
  add column if not exists operational_changed_by uuid references auth.users(id) on delete set null;

alter table public.club_players
  drop constraint if exists club_players_operational_reason_chk,
  add constraint club_players_operational_reason_chk check (
    operational_status = 'ACTIVE'::public.club_player_operational_status
    or length(btrim(coalesce(operational_reason, ''))) > 0
  );

create index if not exists club_players_club_operational_status_idx
  on public.club_players (club_id, operational_status);

-- Keep the existing audit primitive and extend only its closed action vocabulary.
alter table public.club_team_audit drop constraint if exists club_team_audit_action_check;
alter table public.club_team_audit drop constraint if exists club_team_audit_action_chk;
alter table public.club_team_audit add constraint club_team_audit_action_chk check (action = any (array[
  'INVITE_CREATED', 'INVITE_CANCELLED', 'INVITE_ACCEPTED', 'INVITE_DECLINED',
  'ROLE_CHANGED', 'MEMBER_REMOVED', 'OWNERSHIP_TRANSFERRED',
  'SPONSOR_CREATED', 'SPONSOR_UPDATED', 'SPONSOR_DELETED',
  'CAMPAIGN_CREATED', 'CAMPAIGN_UPDATED', 'CAMPAIGN_PUBLISHED',
  'CAMPAIGN_PAUSED', 'CAMPAIGN_ENDED', 'CAMPAIGN_DELETED',
  'PLAYER_BLOCKED', 'PLAYER_REACTIVATED', 'PLAYER_LEFT'
]));

create or replace function public.is_club_player(
  p_club_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.club_memberships membership
    join public.club_players player
      on player.club_id = membership.club_id
     and player.user_id = membership.user_id
    where membership.club_id = p_club_id
      and membership.user_id = p_user_id
      and membership.status = 'APPROVED'::public.membership_status
      and membership.approved_at is not null
      and player.approved_at is not null
      and player.operational_status = 'ACTIVE'::public.club_player_operational_status
  );
$$;

create or replace function public.assert_club_player_lifecycle_actor(p_club_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'SELPA_CODE:UNAUTHORIZED' using errcode = '28000';
  end if;

  if not public.is_platform_admin()
     and not (
       public.has_club_capability(p_club_id, 'memberships:manage')
       and public.has_club_capability(p_club_id, 'players:manage')
       and exists (
         select 1 from public.club_memberships m
         where m.club_id = p_club_id
           and m.user_id = v_actor
           and m.status = 'APPROVED'::public.membership_status
           and m.role in ('OWNER'::public.club_role, 'ADMIN'::public.club_role)
       )
     ) then
    raise exception 'SELPA_CODE:CLUB_PLAYER_FORBIDDEN' using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

create or replace function public.block_club_player_atomic(
  p_club_id uuid,
  p_club_player_id uuid,
  p_reason text
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
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is null then
    raise exception 'SELPA_CODE:BLOCK_REASON_REQUIRED' using errcode = '23514';
  end if;

  v_actor := public.assert_club_player_lifecycle_actor(p_club_id);
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || p_club_player_id::text, 61));

  select * into v_player from public.club_players
  where id = p_club_player_id for update;
  if not found then
    raise exception 'SELPA_CODE:CLUB_PLAYER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_player.club_id <> p_club_id then
    raise exception 'SELPA_CODE:CROSS_CLUB' using errcode = '42501';
  end if;
  if v_player.user_id = v_actor then
    raise exception 'SELPA_CODE:SELF_ACTION_FORBIDDEN' using errcode = '42501';
  end if;
  if v_player.operational_status = 'LEFT'::public.club_player_operational_status then
    raise exception 'SELPA_CODE:PLAYER_LEFT' using errcode = '23514';
  end if;

  if v_player.user_id is not null then
    select * into v_membership from public.club_memberships
    where club_id = p_club_id and user_id = v_player.user_id for update;
    if found and v_membership.role = 'OWNER'::public.club_role then
      raise exception 'SELPA_CODE:OWNER_TRANSFER_REQUIRED' using errcode = '23514';
    end if;
    if found and v_membership.role <> 'PLAYER'::public.club_role then
      raise exception 'SELPA_CODE:ACTIVE_STAFF_ROLE' using errcode = '23514';
    end if;
  end if;

  if v_player.operational_status = 'BLOCKED'::public.club_player_operational_status then
    return jsonb_build_object('code', 'ALREADY_BLOCKED', 'club_player_id', v_player.id);
  end if;

  update public.club_players
     set operational_status = 'BLOCKED'::public.club_player_operational_status,
         operational_reason = v_reason,
         operational_changed_at = now(),
         operational_changed_by = v_actor,
         updated_at = now()
   where id = v_player.id;

  if v_player.user_id is not null and found then
    if v_membership.status not in ('APPROVED'::public.membership_status, 'BANNED'::public.membership_status) then
      raise exception 'SELPA_CODE:INVALID_MEMBERSHIP_STATUS' using errcode = '23514';
    end if;
    update public.club_memberships
       set status = 'BANNED'::public.membership_status,
           updated_at = now()
     where id = v_membership.id;
    update public.user_settings
       set active_club_id = null
     where user_id = v_player.user_id and active_club_id = p_club_id;
  end if;

  insert into public.club_team_audit (club_id, actor_user_id, action, target_user_id, membership_id, old_role, new_role, metadata)
  values (p_club_id, v_actor, 'PLAYER_BLOCKED', v_player.user_id,
    case when v_membership.id is null then null else v_membership.id end,
    case when v_membership.id is null then null else v_membership.role end,
    case when v_membership.id is null then null else v_membership.role end,
    jsonb_build_object('club_player_id', v_player.id, 'reason', v_reason, 'manual_player', v_player.user_id is null));

  return jsonb_build_object('code', 'BLOCKED', 'club_player_id', v_player.id);
end;
$$;

create or replace function public.reactivate_club_player_atomic(
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
begin
  v_actor := public.assert_club_player_lifecycle_actor(p_club_id);
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || p_club_player_id::text, 61));
  select * into v_player from public.club_players where id = p_club_player_id for update;
  if not found then raise exception 'SELPA_CODE:CLUB_PLAYER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_player.club_id <> p_club_id then raise exception 'SELPA_CODE:CROSS_CLUB' using errcode = '42501'; end if;
  if v_player.user_id = v_actor then raise exception 'SELPA_CODE:SELF_ACTION_FORBIDDEN' using errcode = '42501'; end if;
  if v_player.operational_status = 'LEFT'::public.club_player_operational_status then
    raise exception 'SELPA_CODE:PLAYER_LEFT_REQUIRES_NEW_MEMBERSHIP' using errcode = '23514';
  end if;

  if v_player.user_id is not null then
    select * into v_membership from public.club_memberships where club_id = p_club_id and user_id = v_player.user_id for update;
    if found and v_membership.role = 'OWNER'::public.club_role then raise exception 'SELPA_CODE:OWNER_TRANSFER_REQUIRED' using errcode = '23514'; end if;
    if found and v_membership.role <> 'PLAYER'::public.club_role then raise exception 'SELPA_CODE:ACTIVE_STAFF_ROLE' using errcode = '23514'; end if;
  end if;

  if v_player.operational_status = 'ACTIVE'::public.club_player_operational_status
     and (v_player.user_id is null or (found and v_membership.status = 'APPROVED'::public.membership_status)) then
    return jsonb_build_object('code', 'ALREADY_ACTIVE', 'club_player_id', v_player.id);
  end if;
  if v_player.operational_status <> 'BLOCKED'::public.club_player_operational_status then
    raise exception 'SELPA_CODE:INVALID_PLAYER_TRANSITION' using errcode = '23514';
  end if;
  if v_player.user_id is not null and (not found or v_membership.status <> 'BANNED'::public.membership_status) then
    raise exception 'SELPA_CODE:INVALID_MEMBERSHIP_STATUS' using errcode = '23514';
  end if;

  update public.club_players
     set operational_status = 'ACTIVE'::public.club_player_operational_status,
         operational_reason = null,
         operational_changed_at = now(),
         operational_changed_by = v_actor,
         updated_at = now()
   where id = v_player.id;
  if v_player.user_id is not null then
    update public.club_memberships
       set status = 'APPROVED'::public.membership_status,
           approved_by = v_actor,
           approved_at = now(),
           rejection_reason = null,
           updated_at = now()
     where id = v_membership.id;
  end if;
  insert into public.club_team_audit (club_id, actor_user_id, action, target_user_id, membership_id, old_role, new_role, metadata)
  values (p_club_id, v_actor, 'PLAYER_REACTIVATED', v_player.user_id,
    case when v_membership.id is null then null else v_membership.id end,
    case when v_membership.id is null then null else v_membership.role end,
    case when v_membership.id is null then null else v_membership.role end,
    jsonb_build_object('club_player_id', v_player.id, 'manual_player', v_player.user_id is null));
  return jsonb_build_object('code', 'REACTIVATED', 'club_player_id', v_player.id);
end;
$$;

create or replace function public.leave_club_player_safely_atomic(
  p_club_id uuid,
  p_club_player_id uuid,
  p_reason text
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
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is null then raise exception 'SELPA_CODE:LEAVE_REASON_REQUIRED' using errcode = '23514'; end if;
  v_actor := public.assert_club_player_lifecycle_actor(p_club_id);
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':' || p_club_player_id::text, 61));
  select * into v_player from public.club_players where id = p_club_player_id for update;
  if not found then raise exception 'SELPA_CODE:CLUB_PLAYER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_player.club_id <> p_club_id then raise exception 'SELPA_CODE:CROSS_CLUB' using errcode = '42501'; end if;
  if v_player.user_id = v_actor then raise exception 'SELPA_CODE:SELF_ACTION_FORBIDDEN' using errcode = '42501'; end if;
  if v_player.user_id is not null then
    select * into v_membership from public.club_memberships where club_id = p_club_id and user_id = v_player.user_id for update;
    if found and v_membership.role = 'OWNER'::public.club_role then raise exception 'SELPA_CODE:OWNER_TRANSFER_REQUIRED' using errcode = '23514'; end if;
    if found and v_membership.role <> 'PLAYER'::public.club_role then raise exception 'SELPA_CODE:ACTIVE_STAFF_ROLE' using errcode = '23514'; end if;
  end if;
  if v_player.operational_status = 'LEFT'::public.club_player_operational_status then
    return jsonb_build_object('code', 'ALREADY_LEFT', 'club_player_id', v_player.id);
  end if;

  update public.club_players
     set operational_status = 'LEFT'::public.club_player_operational_status,
         operational_reason = v_reason,
         operational_changed_at = now(),
         operational_changed_by = v_actor,
         updated_at = now()
   where id = v_player.id;
  if v_player.user_id is not null and found then
    update public.club_memberships
       set status = 'REJECTED'::public.membership_status,
           approved_at = null,
           approved_by = null,
           rejection_reason = v_reason,
           updated_at = now()
     where id = v_membership.id;
    update public.user_settings set active_club_id = null
     where user_id = v_player.user_id and active_club_id = p_club_id;
  end if;
  insert into public.club_team_audit (club_id, actor_user_id, action, target_user_id, membership_id, old_role, new_role, metadata)
  values (p_club_id, v_actor, 'PLAYER_LEFT', v_player.user_id,
    case when v_membership.id is null then null else v_membership.id end,
    case when v_membership.id is null then null else v_membership.role end,
    case when v_membership.id is null then null else v_membership.role end,
    jsonb_build_object('club_player_id', v_player.id, 'reason', v_reason, 'manual_player', v_player.user_id is null));
  return jsonb_build_object('code', 'LEFT', 'club_player_id', v_player.id);
end;
$$;

-- Re-entry reuses the already canonical approval primitive. The trigger only
-- restores the operational state when that primitive has approved a PLAYER.
create or replace function public.sync_club_player_operational_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.role = 'PLAYER'::public.club_role
     and new.status = 'APPROVED'::public.membership_status
     and new.approved_at is not null
     and (old.status is distinct from new.status or old.approved_at is distinct from new.approved_at) then
    update public.club_players
       set operational_status = 'ACTIVE'::public.club_player_operational_status,
           operational_reason = null,
           operational_changed_at = now(),
           operational_changed_by = new.approved_by,
           updated_at = now()
     where club_id = new.club_id
       and user_id = new.user_id
       and operational_status = 'LEFT'::public.club_player_operational_status;
  end if;
  return new;
end;
$$;

drop trigger if exists club_memberships_sync_player_operational_approval on public.club_memberships;
create trigger club_memberships_sync_player_operational_approval
after update of status, approved_at on public.club_memberships
for each row execute function public.sync_club_player_operational_approval();

create or replace function public.register_team_for_tournament(
  p_tournament_id uuid, p_club_id uuid, p_partner_user_id uuid
)
returns table(team_id uuid, registration_id uuid)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_me uuid := auth.uid(); v_team_id uuid; v_reg_id uuid; v_exists int;
  v_status text; v_registration_deadline timestamptz;
begin
  if v_me is null then raise exception 'No auth user' using errcode = '28000'; end if;
  select status, registration_deadline into v_status, v_registration_deadline
  from public.tournaments where id = p_tournament_id and club_id = p_club_id for share;
  if not found then raise exception 'Torneo no encontrado'; end if;
  if v_status = 'PAUSED' then raise exception 'TOURNAMENT_PAUSED' using errcode = '23514'; end if;
  if v_status <> 'OPEN' then raise exception 'TOURNAMENT_REGISTRATION_NOT_OPEN' using errcode = '23514'; end if;
  if v_registration_deadline is not null and v_registration_deadline <= now() then raise exception 'TOURNAMENT_REGISTRATION_CLOSED' using errcode = '23514'; end if;
  if exists(select 1 from public.profiles where user_id = v_me and status = 'SUSPENDED') then raise exception 'Usuario suspendido'; end if;
  if exists(select 1 from public.profiles where user_id = p_partner_user_id and status = 'SUSPENDED') then raise exception 'El compañero está suspendido'; end if;
  if p_partner_user_id = v_me then raise exception 'No podés inscribirte con vos mismo'; end if;
  if not public.is_club_player(p_club_id, v_me) or not public.is_club_player(p_club_id, p_partner_user_id) then
    raise exception 'CLUB_PLAYER_NOT_ELIGIBLE' using errcode = '23514';
  end if;
  select count(*) into v_exists from public.tournament_teams where tournament_id = p_tournament_id and (player1_user_id = v_me or player2_user_id = v_me);
  if v_exists > 0 then raise exception 'Ya estás inscripto en este torneo'; end if;
  select count(*) into v_exists from public.tournament_teams where tournament_id = p_tournament_id and (player1_user_id = p_partner_user_id or player2_user_id = p_partner_user_id);
  if v_exists > 0 then raise exception 'Tu compañero ya está inscripto en este torneo'; end if;
  insert into public.tournament_teams(tournament_id,club_id,player1_user_id,player2_user_id,created_by)
  values(p_tournament_id,p_club_id,v_me,p_partner_user_id,v_me) returning id into v_team_id;
  insert into public.tournament_registrations(tournament_id,club_id,team_id,status,created_by)
  values(p_tournament_id,p_club_id,v_team_id,'PENDING'::public.tournament_reg_status,v_me) returning id into v_reg_id;
  return query select v_team_id,v_reg_id;
end;
$$;

revoke all on function public.assert_club_player_lifecycle_actor(uuid) from public, anon, authenticated;
revoke all on function public.block_club_player_atomic(uuid, uuid, text) from public, anon;
revoke all on function public.reactivate_club_player_atomic(uuid, uuid) from public, anon;
revoke all on function public.leave_club_player_safely_atomic(uuid, uuid, text) from public, anon;
revoke all on function public.is_club_player(uuid, uuid) from public, anon;
grant execute on function public.block_club_player_atomic(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reactivate_club_player_atomic(uuid, uuid) to authenticated, service_role;
grant execute on function public.leave_club_player_safely_atomic(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.is_club_player(uuid, uuid) to authenticated, service_role;
grant execute on function public.register_team_for_tournament(uuid, uuid, uuid) to authenticated, service_role;

comment on column public.club_players.operational_status is 'ACTIVE can operate in the club; BLOCKED is a reversible access block; LEFT is a logical departure preserving history.';
