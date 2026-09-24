begin;

-- Data API hardening: legacy/core tables that previously inherited broad
-- grants must expose only the operations used by the current application.

alter table public.club_requests enable row level security;
revoke all on table public.club_requests from public, anon, authenticated, service_role;
grant select, insert, delete on table public.club_requests to service_role;

alter table public.user_roles enable row level security;
revoke all on table public.user_roles from public, anon, authenticated, service_role;
grant select on table public.user_roles to service_role;

alter table public.categories enable row level security;
revoke all on table public.categories from public, anon, authenticated, service_role;
grant select on table public.categories to authenticated, service_role;

drop policy if exists categories_authenticated_select on public.categories;
create policy categories_authenticated_select
  on public.categories
  for select
  to authenticated
  using (true);

alter table public.club_categories enable row level security;
revoke all on table public.club_categories from public, anon, authenticated, service_role;
grant select on table public.club_categories to service_role;

-- These tables intentionally remain RLS-enabled without client policies.
-- SECURITY DEFINER routines run as their owner and therefore do not need
-- direct table grants for anon/authenticated/service_role.
alter table public.argentina_locations enable row level security;
revoke all on table public.argentina_locations
  from public, anon, authenticated, service_role;

alter table public.club_player_private enable row level security;
revoke all on table public.club_player_private
  from public, anon, authenticated, service_role;

alter table public.club_user_invites enable row level security;
revoke all on table public.club_user_invites
  from public, anon, authenticated, service_role;
grant select on table public.club_user_invites to service_role;

alter table public.competition_event_settlement_commands enable row level security;
revoke all on table public.competition_event_settlement_commands
  from public, anon, authenticated, service_role;

alter table public.competition_ranking_entry_totals enable row level security;
revoke all on table public.competition_ranking_entry_totals
  from public, anon, authenticated, service_role;

alter table public.competition_ranking_refresh_scopes enable row level security;
revoke all on table public.competition_ranking_refresh_scopes
  from public, anon, authenticated, service_role;

alter table public.competition_series_create_commands enable row level security;
revoke all on table public.competition_series_create_commands
  from public, anon, authenticated, service_role;

-- Legacy RPCs have no current app caller. Keep the definitions for rollback
-- compatibility, but remove every Data API execution path.
revoke execute on function public.create_club(text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.ensure_club_player(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;

commit;
