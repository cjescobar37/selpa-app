alter table public.club_players
  add column if not exists preferred_position text;

alter table public.club_players
  drop constraint if exists club_players_preferred_position_check;

alter table public.club_players
  add constraint club_players_preferred_position_check
  check (preferred_position is null or preferred_position in ('DRIVE', 'REVES', 'BOTH'));
