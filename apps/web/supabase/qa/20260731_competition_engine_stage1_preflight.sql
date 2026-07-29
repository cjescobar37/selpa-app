-- Solo lectura. Ejecutar completo en Supabase SQL Editor.

select
  current_database() as database_name,
  current_setting('server_version') as postgres_version,
  to_regclass('public.club_players') is not null as has_club_players,
  exists (
    select 1 from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'club_players'
      and column_info.column_name = 'ranking_points'
  ) as has_ranking_points,
  to_regclass('public.player_active_partnerships') is not null as has_active_partnerships,
  to_regclass('public.player_partner_invites') is not null as has_partner_invites,
  to_regclass('public.points_schemes') is not null as has_points_schemes,
  to_regclass('public.points_scheme_rules') is not null as has_points_scheme_rules,
  exists (
    select 1 from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'tournaments'
      and column_info.column_name = 'segment'
  ) as has_tournament_segment,
  to_regclass('public.tournament_matches') is not null as has_tournament_matches,
  to_regclass('public.club_categories') is not null as has_club_categories;

select
  player.club_id,
  coalesce(nullif(to_jsonb(player)->>'gender', ''), '(NULL)') as gender,
  count(*) as players
from public.club_players player
group by player.club_id, coalesce(nullif(to_jsonb(player)->>'gender', ''), '(NULL)')
order by player.club_id, gender;

select
  player.club_id,
  coalesce(nullif(to_jsonb(player)->>'category', ''), '(NULL)') as category,
  count(*) as players
from public.club_players player
group by player.club_id, coalesce(nullif(to_jsonb(player)->>'category', ''), '(NULL)')
order by player.club_id, category;

select
  club_category.club_id,
  club_category.category_id,
  category.name,
  club_category.is_enabled
from public.club_categories club_category
left join public.categories category on category.id = club_category.category_id
order by club_category.club_id, club_category.category_id;

select
  tournament.club_id,
  coalesce(nullif(to_jsonb(tournament)->>'gender', ''), '(NULL)') as gender,
  count(*) as tournaments
from public.tournaments tournament
group by tournament.club_id, coalesce(nullif(to_jsonb(tournament)->>'gender', ''), '(NULL)')
order by tournament.club_id, gender;

select
  tournament.club_id,
  coalesce(nullif(to_jsonb(tournament)->>'segment', ''), '(NULL)') as segment,
  count(*) as tournaments
from public.tournaments tournament
group by tournament.club_id, coalesce(nullif(to_jsonb(tournament)->>'segment', ''), '(NULL)')
order by tournament.club_id, segment;

select
  tournament.club_id,
  coalesce(
    nullif(to_jsonb(tournament)->>'category_id', ''),
    nullif(to_jsonb(tournament)->>'category', ''),
    '(NULL)'
  ) as category,
  count(*) as tournaments
from public.tournaments tournament
group by tournament.club_id, coalesce(
  nullif(to_jsonb(tournament)->>'category_id', ''),
  nullif(to_jsonb(tournament)->>'category', ''),
  '(NULL)'
)
order by tournament.club_id, category;

select
  partnership.club_id,
  count(*) filter (where partnership.status = 'ACTIVE') as active_partnerships,
  count(*) filter (
    where partnership.status = 'ACTIVE'
      and coalesce(player1.gender, '') <> coalesce(player2.gender, '')
  ) as active_partnerships_with_different_gender
from public.player_active_partnerships partnership
join public.club_players player1 on player1.id = partnership.player1_club_player_id
join public.club_players player2 on player2.id = partnership.player2_club_player_id
group by partnership.club_id
order by partnership.club_id;

select
  player.club_id,
  count(*) as players,
  count(*) filter (
    where nullif(to_jsonb(player)->>'ranking_points', '') is not null
  ) as players_with_ranking_points,
  coalesce(sum(
    case
      when (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+$'
        then (to_jsonb(player)->>'ranking_points')::bigint
      else 0
    end
  ), 0) as ranking_points_total
from public.club_players player
group by player.club_id
order by player.club_id;
