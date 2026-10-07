-- Local follow-up QA. Run only in a disposable DB after applying the new migration.
-- Historical audit is read-only and returns counts, not identities.
with administrative as (
  select user_id from public.club_memberships where role::text in ('OWNER','ADMIN','OPERADOR','PLANILLERO') and status::text <> 'REJECTED'
  union select user_id from public.platform_admins
  union select owner_user_id from public.clubs where owner_user_id is not null
), sporting_players as (
  select p.id, p.user_id from public.club_players p join administrative a on a.user_id = p.user_id
), sporting_teams as (
  select t.id from public.tournament_teams t where exists (select 1 from administrative a where a.user_id in (t.player1_user_id,t.player2_user_id))
)
select
  (select count(distinct user_id) from sporting_players) accounts_with_player_history,
  (select count(*) from sporting_players) club_player_rows,
  (select count(*) from public.club_memberships m join administrative a on a.user_id = m.user_id where m.role::text = 'PLAYER') player_membership_rows,
  (select count(*) from sporting_teams) team_rows,
  (select count(*) from public.tournament_registrations r join sporting_teams t on t.id = r.team_id) registration_rows,
  (select count(*) from public.player_active_partnerships p where exists (select 1 from sporting_players s where s.id in (p.player1_club_player_id,p.player2_club_player_id))) partnership_rows,
  (select count(*) from public.player_partner_invites p where exists (select 1 from sporting_players s where s.id in (p.sender_club_player_id,p.receiver_club_player_id))) sporting_invite_rows,
  (select count(*) from public.competition_point_transactions p join sporting_players s on s.id = p.club_player_id) ranking_ledger_rows;

-- Fixtures and all authorization epoch writes are rolled back.
begin;
do $$
declare
  v_club uuid := (select id from public.clubs order by id limit 1);
  v_staff uuid := gen_random_uuid(); v_player uuid := gen_random_uuid();
  v_peer uuid := gen_random_uuid(); v_player_id uuid; v_peer_id uuid;
  v_role text; v_denied boolean; v_function regprocedure; v_db_role text;
begin
  if v_club is null then raise exception 'QA_ACCOUNT_REQUIRES_DISPOSABLE_CLUB_FIXTURE'; end if;
  insert into auth.users(id) values (v_staff),(v_player),(v_peer);
  insert into public.profiles(user_id,first_name,last_name)
    values (v_staff,'Cuenta','Staff'),(v_player,'Cuenta','Player'),(v_peer,'Cuenta','Player')
    on conflict (user_id) do nothing;
  insert into public.club_memberships(club_id,user_id,role,status,approved_at)
    values (v_club,v_player,'PLAYER','APPROVED',now()),(v_club,v_peer,'PLAYER','APPROVED',now());
  insert into public.club_players(club_id,user_id,approved_at) values (v_club,v_player,now()) returning id into v_player_id;
  insert into public.club_players(club_id,user_id,approved_at) values (v_club,v_peer,now()) returning id into v_peer_id;
  if not public.is_club_player(v_club,v_player) then raise exception 'QA_ACCOUNT_PLAYER_REGRESSION'; end if;
  foreach v_role in array array['OWNER','ADMIN','OPERADOR','PLANILLERO'] loop
    v_denied := false;
    begin
      update public.club_memberships set role = v_role::public.club_role where club_id = v_club and user_id = v_player;
    exception when insufficient_privilege then v_denied := true; end;
    if not v_denied then raise exception 'QA_ACCOUNT_PLAYER_TO_STAFF_ALLOWED'; end if;
  end loop;
  insert into public.club_memberships(club_id,user_id,role,status,approved_at) values (v_club,v_staff,'ADMIN','APPROVED',now());
  if public.is_club_player(v_club,v_staff) then raise exception 'QA_ACCOUNT_STAFF_IS_PLAYER'; end if;
  v_denied := false;
  begin insert into public.club_players(club_id,user_id) values (v_club,v_staff);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'QA_ACCOUNT_STAFF_PLAYER_ROW_ALLOWED'; end if;
  v_denied := false;
  begin update public.club_memberships set role = 'PLAYER' where club_id = v_club and user_id = v_staff;
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'QA_ACCOUNT_STAFF_TO_PLAYER_ALLOWED'; end if;
  v_denied := false;
  begin insert into public.platform_admins(user_id) values (v_player);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'QA_ACCOUNT_PLAYER_PLATFORM_ALLOWED'; end if;
  -- Account edits remain possible; sports changes do not.
  update public.profiles set first_name = 'Administración' where user_id = v_staff;
  v_denied := false;
  begin update public.profiles set height_cm = 180 where user_id = v_staff;
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'QA_ACCOUNT_STAFF_SPORTS_EDIT_ALLOWED'; end if;
  -- Positive player pair remains supported (canonical ID order).
  insert into public.player_active_partnerships(club_id,player1_club_player_id,player2_club_player_id,status)
    values (v_club,least(v_player_id,v_peer_id),greatest(v_player_id,v_peer_id),'ACTIVE');
  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  v_denied := false;
  begin perform public.get_player_finance_overview_f1d(null);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'QA_ACCOUNT_STAFF_PLAYER_FINANCE_ALLOWED'; end if;
  foreach v_function in array array[
    'public.account_is_administrative(uuid)'::regprocedure,
    'public.account_has_player_identity(uuid)'::regprocedure,
    'public.account_assert_identity(uuid[],boolean)'::regprocedure,
    'public.account_guard_identity_transition()'::regprocedure,
    'public.player_finance_visible_obligations_f1d(uuid)'::regprocedure
  ] loop
    foreach v_db_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_db_role,v_function,'EXECUTE') then raise exception 'QA_ACCOUNT_HELPER_RPC_EXPOSED'; end if;
    end loop;
  end loop;
end;
$$;
rollback;

-- Two-session disposable QA (not executed by this pass):
-- READ COMMITTED: concurrent STAFF membership vs PLAYER membership/club_player
-- for the same fresh account, across two clubs. First transaction holds epoch;
-- second waits and, after first commit, must fail 42501. Never two identities.
-- REPEATABLE READ: establish both snapshots before assignment; same collision
-- must fail 40001 or 42501, not succeed with stale membership reads.
-- Multi-player operations use ascending account UUID order. Retry full transaction
-- after serialization/deadlock failures; no partial journal or sporting writes.
