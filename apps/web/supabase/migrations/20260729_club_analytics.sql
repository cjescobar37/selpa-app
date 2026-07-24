begin;

create index if not exists club_players_club_approved_idx
  on public.club_players(club_id, approved_at desc);
create index if not exists club_memberships_club_status_approved_idx
  on public.club_memberships(club_id, status, approved_at);
create index if not exists tournaments_club_created_idx
  on public.tournaments(club_id, created_at desc);
create index if not exists tournament_registrations_club_created_idx
  on public.tournament_registrations(club_id, created_at desc);
create index if not exists tournament_teams_club_tournament_idx
  on public.tournament_teams(club_id, tournament_id);
create index if not exists tournament_matches_club_created_idx
  on public.tournament_matches(club_id, created_at desc);
create index if not exists platform_news_club_status_published_idx
  on public.platform_news(club_id, status, published_at desc)
  where club_id is not null;

commit;
