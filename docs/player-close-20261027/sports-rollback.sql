-- REVIEW ONLY. For a baseline where these ten views and two RPCs were absent.
-- No CASCADE, data changes, ledger changes, or changes to pre-existing projections.
begin;
drop function if exists public.read_public_player_career_summary(uuid,uuid);
drop view if exists public.public_player_career_matches_read;
drop view if exists public.public_player_career_results_read;
drop view if exists public.public_pair_standings_read;
drop view if exists public.public_player_standings_read;
drop view if exists public.public_competition_contexts_read;
drop function if exists public.read_player_career_summary(uuid,uuid);
drop view if exists public.competition_pair_standings_read;
drop view if exists public.player_career_results_read;
drop view if exists public.player_career_matches_read;
drop view if exists public.competition_player_standings_read;
drop view if exists public.player_sports_eligible_read;
commit;
