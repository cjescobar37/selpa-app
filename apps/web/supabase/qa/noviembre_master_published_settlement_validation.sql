-- Historical, read-only validation of Noviembre Master's completed correction.
-- Returns one row of checks; it never creates another correction or changes data.
begin transaction read only;

with target as (
  select d.id, d.club_id, d.points_scheme_override_id
  from public.competition_series_event_divisions d
  where d.id = '68346ad8-3e23-42ad-8e82-8621dad954b3'::uuid
), versions as (
  select s.*
  from public.competition_event_settlements s
  join target d on d.id = s.event_division_id and d.club_id = s.club_id
), current_version as (
  select * from versions where version = 2 and status = 'PUBLISHED'
), previous_version as (
  select * from versions where version = 1 and status = 'SUPERSEDED'
), expected_rules(rule_key, points) as (
  values
    ('CHAMPION', 750), ('RUNNER_UP', 500), ('SEMIFINALIST', 400),
    ('QUARTERFINALIST', 250), ('EIGHTH_FINALIST', 150),
    ('SIXTEENTH_FINALIST', 100), ('PARTICIPANT', 50)
), frozen_rules as (
  select upper(value->>'rule_key') as rule_key, (value->>'points')::integer as points
  from current_version s,
    jsonb_array_elements(coalesce(s.calculation_snapshot->'points_rules', '[]'::jsonb)) as rules(value)
), old_ledger as (
  select tx.*
  from public.competition_point_transactions tx
  join previous_version s on tx.metadata->>'settlement_id' = s.id::text
  where tx.source_concept = 'COMPETITION_EVENT_SETTLEMENT'
    and tx.transaction_type = 'TOURNAMENT_RESULT'
), new_ledger as (
  select tx.*
  from public.competition_point_transactions tx
  join current_version s on tx.metadata->>'settlement_id' = s.id::text
  where tx.source_concept = 'COMPETITION_EVENT_SETTLEMENT'
    and tx.transaction_type = 'TOURNAMENT_RESULT'
)
select
  (select count(*) = 1 from versions where status = 'PUBLISHED')
    and (select count(*) = 1 from current_version) as one_active_published_v2,
  (select count(*) = 1 from previous_version) as previous_v1_superseded,
  exists (
    select 1 from current_version v2
    join previous_version v1 on v2.corrected_from_id = v1.id
      and v1.superseded_by_id = v2.id
    join public.competition_event_homologations h on h.id = v2.homologation_id
    where h.status = 'APPROVED' and v2.published_at is not null
  ) as correction_link_and_homologation,
  (select count(*) = 7 from frozen_rules)
    and not exists (
      select 1 from expected_rules e
      full join frozen_rules f using (rule_key)
      where e.rule_key is null or f.rule_key is null
        or e.points is distinct from f.points
    ) as frozen_rules_match_750_500_400_250_150_100_50,
  exists (
    select 1 from public.competition_event_settlement_awards a
    join current_version s on s.id = a.settlement_id
    where a.scoring_eligibility_status = 'ELIGIBLE'
  ) and not exists (
    select 1 from public.competition_event_settlement_awards a
    join current_version s on s.id = a.settlement_id
    left join expected_rules e on e.rule_key = upper(a.result_code)
    where a.scoring_eligibility_status = 'ELIGIBLE'
      and (e.rule_key is null or a.base_points is distinct from e.points)
  ) as v2_awards_use_correct_base_points,
  exists (select 1 from old_ledger)
    and not exists (
      select 1 from old_ledger old_tx
      left join public.competition_point_transactions reversal
        on reversal.reversed_transaction_id = old_tx.id
      group by old_tx.id, old_tx.points
      having count(reversal.id) <> 1
        or old_tx.points + coalesce(sum(reversal.points), 0) <> 0
    ) as v1_reversed_exactly_once_and_net_zero,
  exists (select 1 from new_ledger)
    and not exists (
      select 1 from public.competition_event_settlement_awards a
      join current_version s on s.id = a.settlement_id
      where a.scoring_eligibility_status = 'ELIGIBLE' and a.total_points <> 0
        and (select count(*) from new_ledger tx
             where tx.metadata->>'award_id' = a.id::text
               and tx.points = a.total_points) <> 1
    ) and not exists (
      select 1 from new_ledger tx
      left join public.competition_event_settlement_awards a
        on a.id::text = tx.metadata->>'award_id'
      join current_version s on s.id::text = tx.metadata->>'settlement_id'
      where a.id is null or a.settlement_id <> s.id
        or a.scoring_eligibility_status <> 'ELIGIBLE'
        or a.total_points <> tx.points
    ) as v2_ledger_matches_awards_without_duplicates,
  exists (select 1 from new_ledger)
    and not exists (
      select 1 from (
        select distinct tx.club_id, tx.season_id, tx.division_id
        from new_ledger tx
      ) scope
      cross join current_version s
      left join public.competition_ranking_refresh_scopes ranking
        on ranking.club_id = scope.club_id
        and ranking.season_id = scope.season_id
        and ranking.division_id = scope.division_id
      where ranking.refreshed_at is null or ranking.refreshed_at < s.published_at
    ) as ranking_refreshed_at_or_after_v2_publication;

rollback;
