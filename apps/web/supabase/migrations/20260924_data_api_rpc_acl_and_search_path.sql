begin;

-- Keep the single intentionally anonymous public DTO explicit.
revoke execute on function public.get_public_club_profile(uuid)
  from public;
grant execute on function public.get_public_club_profile(uuid)
  to anon, authenticated, service_role;

-- Authenticated application RPCs. These functions perform their own actor and
-- club authorization; anonymous execution is never part of their contract.
revoke execute on function public.add_competition_event_homologation_evidence(uuid, uuid, integer, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.add_competition_event_homologation_evidence(uuid, uuid, integer, text, text, text, text, text, jsonb)
  to authenticated, service_role;

revoke execute on function public.approve_competition_event_homologation(uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.approve_competition_event_homologation(uuid, uuid, integer, text)
  to authenticated, service_role;

revoke execute on function public.approve_competition_event_settlement(uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.approve_competition_event_settlement(uuid, uuid, integer, text)
  to authenticated, service_role;

revoke execute on function public.create_competition_event_homologation_correction(uuid, uuid, integer, text, text)
  from public, anon;
grant execute on function public.create_competition_event_homologation_correction(uuid, uuid, integer, text, text)
  to authenticated, service_role;

revoke execute on function public.create_competition_event_homologation_draft(uuid, uuid, text)
  from public, anon;
grant execute on function public.create_competition_event_homologation_draft(uuid, uuid, text)
  to authenticated, service_role;

revoke execute on function public.extract_competition_event_homologation_results(uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.extract_competition_event_homologation_results(uuid, uuid, integer, text)
  to authenticated, service_role;

revoke execute on function public.get_competition_event_homologation_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.get_competition_event_homologation_preflight(uuid, uuid)
  to authenticated, service_role;

revoke execute on function public.is_club_member_approved(uuid)
  from public, anon;
grant execute on function public.is_club_member_approved(uuid)
  to authenticated, service_role;

revoke execute on function public.is_platform_admin()
  from public, anon;
grant execute on function public.is_platform_admin()
  to authenticated, service_role;

revoke execute on function public.publish_competition_event_settlement(uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.publish_competition_event_settlement(uuid, uuid, integer, text)
  to authenticated, service_role;

revoke execute on function public.publish_tournament_atomic(uuid, uuid)
  from public, anon;
grant execute on function public.publish_tournament_atomic(uuid, uuid)
  to authenticated, service_role;

revoke execute on function public.reject_competition_event_homologation(uuid, uuid, integer, text, text)
  from public, anon;
grant execute on function public.reject_competition_event_homologation(uuid, uuid, integer, text, text)
  to authenticated, service_role;

revoke execute on function public.submit_competition_event_homologation(uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.submit_competition_event_homologation(uuid, uuid, integer, text)
  to authenticated, service_role;

revoke execute on function public.submit_competition_event_settlement(uuid, uuid, integer, text)
  from public, anon;
grant execute on function public.submit_competition_event_settlement(uuid, uuid, integer, text)
  to authenticated, service_role;

revoke execute on function public.supersede_competition_event_homologation(uuid, uuid, integer, text, text)
  from public, anon;
grant execute on function public.supersede_competition_event_homologation(uuid, uuid, integer, text, text)
  to authenticated, service_role;

-- Preserve the existing return signature to avoid a DROP, but remove the email
-- value from the result. The compatibility column is always NULL.
create or replace function public.search_club_players(
  p_club_id uuid,
  p_query text,
  p_limit integer default 20
)
returns table(
  club_player_id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  display_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with input as (
    select
      btrim(coalesce(p_query, '')) as query,
      greatest(1, least(coalesce(p_limit, 20), 20)) as result_limit
  ), authorized_actor as (
    select membership.user_id
    from public.club_memberships membership
    join public.profiles profile
      on profile.user_id = membership.user_id
    where membership.club_id = p_club_id
      and membership.user_id = auth.uid()
      and membership.role = 'PLAYER'::public.club_role
      and membership.status = 'APPROVED'::public.membership_status
      and membership.approved_at is not null
      and profile.status = 'ACTIVE'
      and public.is_club_player(p_club_id, membership.user_id)
  )
  select
    player.id as club_player_id,
    profile.user_id,
    null::text as email,
    profile.first_name,
    profile.last_name,
    coalesce(player.display_name, profile.display_name) as display_name
  from public.club_players player
  join public.profiles profile
    on profile.user_id = player.user_id
  join public.club_memberships membership
    on membership.club_id = player.club_id
   and membership.user_id = player.user_id
  cross join input
  where exists (select 1 from authorized_actor)
    and char_length(input.query) >= 2
    and player.club_id = p_club_id
    and player.user_id is not null
    and player.user_id <> auth.uid()
    and player.approved_at is not null
    and player.operational_status = 'ACTIVE'::public.club_player_operational_status
    and membership.role = 'PLAYER'::public.club_role
    and membership.status = 'APPROVED'::public.membership_status
    and membership.approved_at is not null
    and profile.status = 'ACTIVE'
    and public.is_club_player(p_club_id, player.user_id)
    and (
      coalesce(profile.last_name, '') ilike '%' || input.query || '%'
      or coalesce(profile.first_name, '') ilike '%' || input.query || '%'
      or coalesce(profile.display_name, '') ilike '%' || input.query || '%'
      or coalesce(player.display_name, '') ilike '%' || input.query || '%'
    )
  order by
    (coalesce(profile.last_name, '') ilike input.query || '%') desc,
    (coalesce(profile.first_name, '') ilike input.query || '%') desc,
    profile.last_name nulls last,
    profile.first_name nulls last
  limit (select result_limit from input);
$$;

revoke execute on function public.search_club_players(uuid, text, integer)
  from public, anon;
grant execute on function public.search_club_players(uuid, text, integer)
  to authenticated, service_role;

-- The public HTTP endpoint calls this RPC with the server-only client.
revoke execute on function public.record_club_ad_event(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_club_ad_event(uuid, text, text, text)
  to service_role;

-- Trigger/internal functions are not Data API endpoints.
revoke execute on function public.handle_new_auth_user()
  from public, anon, authenticated, service_role;
revoke execute on function public.sync_club_player_operational_approval()
  from public, anon, authenticated, service_role;
revoke execute on function public.tg_club_venue_validate()
  from public, anon, authenticated, service_role;
revoke execute on function public.tg_mark_tournament_running_from_result()
  from public, anon, authenticated, service_role;
revoke execute on function public.tg_tournament_venue_assignment_integrity()
  from public, anon, authenticated, service_role;
revoke execute on function public.validate_tournament_seed_snapshot_ranking_scope()
  from public, anon, authenticated, service_role;

-- Every referenced non-catalog object in these functions is schema-qualified.
alter function public.tg_set_updated_at() set search_path = pg_catalog;
alter function public.handle_new_user() set search_path = pg_catalog;
alter function public.set_updated_at_platform_content() set search_path = pg_catalog;
alter function public.touch_updated_at() set search_path = pg_catalog;
alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.profiles_sync_id() set search_path = pg_catalog;
alter function public.tg_sync_tournament_deadlines() set search_path = pg_catalog;
alter function public.profiles_sync_ids() set search_path = pg_catalog;
alter function public.tg_tournaments_sync_legacy() set search_path = pg_catalog;

-- These trigger helpers have no legitimate Data API caller. handle_new_user()
-- was already closed in Block 1 and is intentionally not broadened here.
revoke execute on function public.tg_set_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.set_updated_at_platform_content()
  from public, anon, authenticated, service_role;
revoke execute on function public.touch_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.set_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.profiles_sync_id()
  from public, anon, authenticated, service_role;
revoke execute on function public.tg_sync_tournament_deadlines()
  from public, anon, authenticated, service_role;
revoke execute on function public.profiles_sync_ids()
  from public, anon, authenticated, service_role;
revoke execute on function public.tg_tournaments_sync_legacy()
  from public, anon, authenticated, service_role;

commit;
