-- Solo lectura. Compara el saldo legacy con el ledger para todas las temporadas ACTIVE.
with eligible as (
  select entry.id as player_entry_id, entry.club_id, division.season_id,
         entry.division_id, entry.club_player_id, player.user_id,
         coalesce(profile.display_name, player.display_name, 'Jugador') as full_name,
         category.legacy_category_id as category,
         case branch.slug when 'caballeros' then 'M' when 'damas' then 'F' end as gender,
         coalesce(player.ranking_points, 0)::bigint as legacy_points
  from public.competition_player_entries entry
  join public.competition_divisions division
    on division.id = entry.division_id and division.club_id = entry.club_id
  join public.competition_seasons season
    on season.id = division.season_id and season.club_id = division.club_id and season.status = 'ACTIVE'
  join public.club_players player
    on player.id = entry.club_player_id and player.club_id = entry.club_id and player.approved_at is not null
  join public.competition_branches branch
    on branch.id = division.branch_id and branch.club_id = division.club_id
  left join public.competition_categories category
    on category.id = division.category_id and category.club_id = division.club_id
  left join public.profiles profile on profile.user_id = player.user_id
  where division.is_active and division.modality = 'INDIVIDUAL' and division.segment_id is null
    and entry.status = 'ACTIVE' and entry.valid_until is null
), totals as (
  select transaction.player_entry_id, coalesce(sum(transaction.points), 0)::bigint as ledger_points
  from public.competition_point_transactions transaction
  group by transaction.player_entry_id
), compared as (
  select eligible.*, coalesce(totals.ledger_points, 0) as ledger_points,
         coalesce(totals.ledger_points, 0) - eligible.legacy_points as difference
  from eligible left join totals using (player_entry_id)
), integrity as (
  select
    count(*) filter (where entry.id is null) as orphan_transactions,
    count(*) filter (where season.id is null or season.club_id <> transaction.club_id) as invalid_season_relations,
    count(*) filter (where division.id is null or division.club_id <> transaction.club_id or division.season_id <> transaction.season_id) as invalid_division_relations,
    count(*) filter (where entry.id is null or entry.club_id <> transaction.club_id or entry.division_id <> transaction.division_id or entry.club_player_id <> transaction.club_player_id) as invalid_club_relations,
    count(*) filter (where transaction.transaction_type = 'REVERSAL') as reversed_transactions
  from public.competition_point_transactions transaction
  left join public.competition_player_entries entry on entry.id = transaction.player_entry_id
  left join public.competition_seasons season on season.id = transaction.season_id
  left join public.competition_divisions division on division.id = transaction.division_id
), duplicates as (
  select count(*) as duplicate_transactions from (
    select transaction.idempotency_key
    from public.competition_point_transactions transaction
    group by transaction.idempotency_key having count(*) > 1
  ) duplicate
)
select jsonb_build_object(
  'eligible_players', (select count(*) from eligible),
  'players_compared', (select count(*) from compared),
  'exact_matches', (select count(*) from compared where difference = 0),
  'mismatches', (select count(*) from compared where difference <> 0),
  'zero_point_matches', (select count(*) from compared where legacy_points = 0 and ledger_points = 0),
  'legacy_total', (select coalesce(sum(legacy_points), 0) from compared),
  'ledger_total', (select coalesce(sum(ledger_points), 0) from compared),
  'difference_total', (select coalesce(sum(difference), 0) from compared),
  'missing_opening_balances', (select count(*) from compared c where c.legacy_points <> 0 and not exists (
    select 1 from public.competition_point_transactions transaction
    where transaction.player_entry_id = c.player_entry_id and transaction.transaction_type = 'OPENING_BALANCE'
  )),
  'duplicate_transactions', (select duplicate_transactions from duplicates),
  'orphan_transactions', (select orphan_transactions from integrity),
  'invalid_club_relations', (select invalid_club_relations from integrity),
  'invalid_season_relations', (select invalid_season_relations from integrity),
  'invalid_division_relations', (select invalid_division_relations from integrity),
  'reversed_transactions', (select reversed_transactions from integrity)
) as summary;

with eligible as (
  select entry.id as player_entry_id, player.id as player_id,
         coalesce(profile.display_name, player.display_name, 'Jugador') as full_name,
         category.legacy_category_id as category,
         case branch.slug when 'caballeros' then 'M' when 'damas' then 'F' end as gender,
         coalesce(player.ranking_points, 0)::bigint as legacy_points
  from public.competition_player_entries entry
  join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id
  join public.competition_seasons season on season.id=division.season_id and season.club_id=division.club_id and season.status='ACTIVE'
  join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id and player.approved_at is not null
  join public.competition_branches branch on branch.id=division.branch_id and branch.club_id=division.club_id
  left join public.competition_categories category on category.id=division.category_id and category.club_id=division.club_id
  left join public.profiles profile on profile.user_id=player.user_id
  where division.is_active and division.modality='INDIVIDUAL' and division.segment_id is null
    and entry.status='ACTIVE' and entry.valid_until is null
), totals as (
  select transaction.player_entry_id, sum(transaction.points)::bigint as ledger_points
  from public.competition_point_transactions transaction group by transaction.player_entry_id
)
select eligible.player_id, eligible.full_name, eligible.category, eligible.gender,
       eligible.legacy_points, coalesce(totals.ledger_points, 0) as ledger_points,
       coalesce(totals.ledger_points, 0) - eligible.legacy_points as difference
from eligible left join totals using(player_entry_id)
where coalesce(totals.ledger_points, 0) <> eligible.legacy_points
order by abs(coalesce(totals.ledger_points, 0) - eligible.legacy_points) desc, eligible.full_name;
