-- Account identity only. Existing sporting/financial history is not rewritten.
begin;

-- A private serialization row prevents cross-club assignment races, including
-- REPEATABLE READ (a conflicting epoch update must abort with 40001).
create schema if not exists selpa_account_internal;
revoke all on schema selpa_account_internal from public, anon, authenticated, service_role;
create table selpa_account_internal.role_epochs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  epoch bigint not null default 0
);
alter table selpa_account_internal.role_epochs enable row level security;
revoke all on selpa_account_internal.role_epochs from public, anon, authenticated, service_role;

create function public.account_is_administrative(p_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.club_memberships m where m.user_id = p_user_id
    and m.role::text in ('OWNER','ADMIN','OPERADOR','PLANILLERO') and m.status::text <> 'REJECTED')
    or exists (select 1 from public.platform_admins a where a.user_id = p_user_id)
    or exists (select 1 from public.clubs c where c.owner_user_id = p_user_id);
$$;

create function public.account_has_player_identity(p_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.club_players p where p.user_id = p_user_id)
    or exists (select 1 from public.club_memberships m where m.user_id = p_user_id
      and m.role::text = 'PLAYER' and m.status::text <> 'REJECTED');
$$;

create function public.account_assert_identity(p_users uuid[], p_staff boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_user uuid;
begin
  -- Global deterministic order, not active club. No Auth metadata is trusted.
  for v_user in select distinct u from unnest(p_users) u where u is not null order by u loop
    insert into selpa_account_internal.role_epochs(user_id, epoch) values (v_user, 1)
      on conflict (user_id) do update set epoch = role_epochs.epoch + 1;
    if p_staff and public.account_has_player_identity(v_user) then
      raise exception 'Esta cuenta pertenece a un jugador. Para administrar el club usá una cuenta administrativa diferente.'
        using errcode = '42501';
    elsif not p_staff and public.account_is_administrative(v_user) then
      raise exception 'Esta cuenta es administrativa. Para competir usá otra cuenta con otro email y rol PLAYER.'
        using errcode = '42501';
    end if;
  end loop;
end;
$$;

create function public.account_guard_identity_transition()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_users uuid[];
  v_staff boolean := false;
  v_old_staff boolean;
begin
  case tg_table_name
  when 'club_memberships' then
    if v_new->>'status' = 'REJECTED' then return new; end if;
    v_staff := v_new->>'role' in ('OWNER','ADMIN','OPERADOR','PLANILLERO');
    v_old_staff := v_old->>'role' in ('OWNER','ADMIN','OPERADOR','PLANILLERO');
    -- Staff-to-staff edits and routine updates preserve historical conflicts.
    if tg_op = 'UPDATE' and v_new->>'user_id' = v_old->>'user_id'
       and v_staff = v_old_staff and v_old->>'status' <> 'REJECTED'
       and not (v_old->>'status' <> 'APPROVED' and v_new->>'status' = 'APPROVED') then return new; end if;
    v_users := array[(v_new->>'user_id')::uuid];
  when 'platform_admins' then
    if tg_op = 'UPDATE' and v_new->>'user_id' = v_old->>'user_id' then return new; end if;
    v_staff := true; v_users := array[(v_new->>'user_id')::uuid];
  when 'clubs' then
    if v_new->>'owner_user_id' is null or v_new->>'owner_user_id' is not distinct from v_old->>'owner_user_id' then return new; end if;
    v_staff := true; v_users := array[(v_new->>'owner_user_id')::uuid];
  when 'club_user_invites' then
    if v_new->>'status' not in ('PENDING','ACCEPTED') then return new; end if;
    if tg_op = 'UPDATE' and (v_new->>'target_user_id',v_new->>'role',v_new->>'status')
      is not distinct from (v_old->>'target_user_id',v_old->>'role',v_old->>'status') then return new; end if;
    v_staff := v_new->>'role' in ('OWNER','ADMIN','OPERADOR','PLANILLERO');
    select array_agg(u.id order by u.id) into v_users from auth.users u
      where u.id = (v_new->>'target_user_id')::uuid or lower(u.email) = lower(v_new->>'email');
  when 'club_players' then
    if tg_op = 'UPDATE' and (v_new->>'user_id',v_new->>'club_id',v_new->>'approved_at',v_new->>'operational_status',v_new->>'category',v_new->>'gender')
      is not distinct from (v_old->>'user_id',v_old->>'club_id',v_old->>'approved_at',v_old->>'operational_status',v_old->>'category',v_old->>'gender') then return new; end if;
    v_users := array[(v_new->>'user_id')::uuid];
  when 'profiles' then
    if (v_new->>'height_cm',v_new->>'dominant_hand',v_new->>'preferred_position',v_new->>'cover_url')
      is not distinct from (v_old->>'height_cm',v_old->>'dominant_hand',v_old->>'preferred_position',v_old->>'cover_url') then return new; end if;
    v_users := array[(v_new->>'user_id')::uuid];
  when 'tournament_teams' then
    if tg_op = 'UPDATE' and (v_new->>'player1_user_id',v_new->>'player2_user_id')
      is not distinct from (v_old->>'player1_user_id',v_old->>'player2_user_id') then return new; end if;
    v_users := array[(v_new->>'player1_user_id')::uuid,(v_new->>'player2_user_id')::uuid];
  when 'tournament_registrations' then
    -- Cancellation and financial lifecycle remain possible for historical rows.
    if v_new->>'status' not in ('PENDING','CONFIRMED') then return new; end if;
    if tg_op = 'UPDATE' and (v_new->>'team_id',v_new->>'status')
      is not distinct from (v_old->>'team_id',v_old->>'status') then return new; end if;
    select array[t.player1_user_id,t.player2_user_id] into v_users
      from public.tournament_teams t where t.id = (v_new->>'team_id')::uuid;
  when 'player_partner_invites' then
    if v_new->>'status' not in ('PENDING','ACCEPTED') then return new; end if;
    if tg_op = 'UPDATE' and (v_new->>'sender_club_player_id',v_new->>'receiver_club_player_id',v_new->>'status')
      is not distinct from (v_old->>'sender_club_player_id',v_old->>'receiver_club_player_id',v_old->>'status') then return new; end if;
    select array_agg(p.user_id order by p.user_id) into v_users from public.club_players p
      where p.id in ((v_new->>'sender_club_player_id')::uuid,(v_new->>'receiver_club_player_id')::uuid);
  when 'player_active_partnerships' then
    if v_new->>'status' <> 'ACTIVE' then return new; end if;
    if tg_op = 'UPDATE' and (v_new->>'player1_club_player_id',v_new->>'player2_club_player_id',v_new->>'status')
      is not distinct from (v_old->>'player1_club_player_id',v_old->>'player2_club_player_id',v_old->>'status') then return new; end if;
    select array_agg(p.user_id order by p.user_id) into v_users from public.club_players p
      where p.id in ((v_new->>'player1_club_player_id')::uuid,(v_new->>'player2_club_player_id')::uuid);
  else raise exception 'ACCOUNT_GUARD_TABLE_INVALID';
  end case;
  perform public.account_assert_identity(v_users, v_staff);
  return new;
end;
$$;

create trigger account_guard_membership before insert or update on public.club_memberships
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_platform_admin before insert or update on public.platform_admins
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_club_owner before insert or update on public.clubs
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_staff_invite before insert or update on public.club_user_invites
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_player before insert or update on public.club_players
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_sporting_profile before insert or update on public.profiles
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_team before insert or update on public.tournament_teams
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_registration before insert or update on public.tournament_registrations
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_sporting_invite before insert or update on public.player_partner_invites
  for each row execute function public.account_guard_identity_transition();
create trigger account_guard_partnership before insert or update on public.player_active_partnerships
  for each row execute function public.account_guard_identity_transition();

-- Existing canonical sporting predicate: preserve lifecycle checks and ACL.
create or replace function public.is_club_player(p_club_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select p_user_id is not null and not public.account_is_administrative(p_user_id) and exists (
    select 1 from public.club_memberships membership
    join public.club_players player on player.club_id = membership.club_id
      and player.user_id = membership.user_id
    where membership.club_id = p_club_id and membership.user_id = p_user_id
      and membership.role = 'PLAYER'::public.club_role
      and membership.status = 'APPROVED'::public.membership_status
      and membership.approved_at is not null and player.approved_at is not null
      and player.operational_status = 'ACTIVE'::public.club_player_operational_status
  );
$$;

-- Authorization boundary only: economic selection/formulas remain identical to F1D.
create or replace function public.player_finance_visible_obligations_f1d(p_club_id uuid default null)
returns setof public.club_finance_obligations
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or public.account_is_administrative(v_user) then
    raise exception 'PLAYER_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select o.* from public.club_finance_obligations o
    where o.currency_code = 'ARS' and o.debtor_type = 'USER'
      and o.debtor_user_id = v_user
      and (p_club_id is null or o.club_id = p_club_id)
    union all
    select o.* from public.club_finance_obligations o
    join public.tournament_teams team
      on team.id = o.debtor_team_id and team.club_id = o.club_id
    where o.currency_code = 'ARS' and o.debtor_type = 'TEAM'
      and (team.player1_user_id = v_user or team.player2_user_id = v_user)
      and (p_club_id is null or o.club_id = p_club_id);
end;
$$;

-- All new helpers are INTERNAL, not RPC entry points. Existing F1D grants unchanged.
revoke all on function public.account_is_administrative(uuid) from public, anon, authenticated, service_role;
revoke all on function public.account_has_player_identity(uuid) from public, anon, authenticated, service_role;
revoke all on function public.account_assert_identity(uuid[],boolean) from public, anon, authenticated, service_role;
revoke all on function public.account_guard_identity_transition() from public, anon, authenticated, service_role;
revoke all on function public.player_finance_visible_obligations_f1d(uuid) from public, anon, authenticated, service_role;

commit;
