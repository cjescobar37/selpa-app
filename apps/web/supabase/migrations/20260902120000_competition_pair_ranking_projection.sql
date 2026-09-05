begin;

-- Rebuildable projection: pairs are identified from the two competitors who
-- received the same settled tournament result, never from active partnerships
-- or the sum of individual standings.
create or replace view public.competition_pair_ranking_projection
with (security_invoker = true) as
with transaction_awards as (
  select
    coalesce(tx.reversed_transaction_id, tx.id) as award_transaction_id,
    tx.points
  from public.competition_point_transactions tx
), award_totals as (
  select
    original.metadata->>'award_id' as award_id,
    sum(ta.points)::bigint as points
  from transaction_awards ta
  join public.competition_point_transactions original on original.id = ta.award_transaction_id
  where original.source_concept = 'COMPETITION_EVENT_SETTLEMENT'
  group by original.metadata->>'award_id'
), team_awards as (
  select
    settlement.club_id,
    settlement.id as settlement_id,
    division.season_id,
    division.id as division_id,
    participant.tournament_team_id,
    array_agg(award.player_id order by award.player_id) as player_ids,
    max(totals.points) as points
  from award_totals totals
  join public.competition_event_settlement_awards award on award.id = totals.award_id::uuid
  join public.competition_event_settlements settlement on settlement.id = award.settlement_id and settlement.status = 'PUBLISHED'
  join public.competition_event_homologation_participants participant on participant.id = award.homologation_participant_id
  join public.competition_series_event_divisions event_division on event_division.id = settlement.event_division_id
  join public.competition_series_divisions series_division on series_division.id = event_division.series_division_id
  join public.competition_divisions division on division.id = series_division.division_id
  where totals.points <> 0
  group by settlement.club_id, settlement.id, division.season_id, division.id, participant.tournament_team_id
  having count(*) = 2 and cardinality(array_agg(distinct award.player_id)) = 2
)
select
  club_id,
  season_id,
  division_id,
  player_ids[1] as player1_user_id,
  player_ids[2] as player2_user_id,
  concat(player_ids[1]::text, ':', player_ids[2]::text) as pair_key,
  sum(points)::bigint as total_points,
  count(*)::integer as settled_results
from team_awards
group by club_id, season_id, division_id, player_ids;

revoke all on public.competition_pair_ranking_projection from public, anon, authenticated;

comment on view public.competition_pair_ranking_projection is
  'Proyección reconstruible de puntos logrados juntos. Compensa reversals del ledger y nunca usa player_active_partnerships.';

commit;
