-- Solo lectura. No crea ni modifica datos.
-- El mapeo M/F -> caballeros/damas es una propuesta legacy revisable,
-- no una regla canónica del motor competitivo.

with player_source as (
  select
    player.id as club_player_id,
    player.club_id,
    player.user_id,
    coalesce(
      nullif(btrim(player.display_name), ''),
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      'Jugador'
    ) as player_name,
    nullif(upper(btrim(coalesce(player.gender, ''))), '') as legacy_gender,
    player.category as legacy_category,
    case
      when (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (to_jsonb(player)->>'ranking_points')::numeric
      else null
    end as ranking_points,
    case upper(btrim(coalesce(player.gender, '')))
      when 'M' then 'caballeros'
      when 'F' then 'damas'
      else null
    end as proposed_branch_slug
  from public.club_players player
  left join public.profiles profile on profile.user_id = player.user_id
),
candidate_counts as (
  select
    source.*,
    (
      select count(*)
      from public.competition_seasons season
      where season.club_id = source.club_id
        and season.status in ('DRAFT', 'ACTIVE')
        and season.starts_on <= current_date
        and season.ends_on >= current_date
    ) as season_candidates,
    (
      select count(*)
      from public.competition_branches branch
      where branch.club_id = source.club_id
        and branch.slug = source.proposed_branch_slug
        and branch.is_active
    ) as branch_candidates,
    (
      select count(*)
      from public.competition_categories category
      where category.club_id = source.club_id
        and category.legacy_category_id = source.legacy_category
        and category.is_active
    ) as category_candidates,
    (
      select count(*)
      from public.competition_divisions division
      join public.competition_seasons season
        on season.id = division.season_id and season.club_id = division.club_id
      join public.competition_branches branch
        on branch.id = division.branch_id and branch.club_id = division.club_id
      join public.competition_categories category
        on category.id = division.category_id and category.club_id = division.club_id
      where division.club_id = source.club_id
        and division.modality = 'INDIVIDUAL'
        and division.segment_id is null
        and division.is_active
        and season.status in ('DRAFT', 'ACTIVE')
        and season.starts_on <= current_date
        and season.ends_on >= current_date
        and branch.slug = source.proposed_branch_slug
        and branch.is_active
        and category.legacy_category_id = source.legacy_category
        and category.is_active
    ) as division_candidates
  from player_source source
)
select
  candidate.club_id,
  candidate.club_player_id,
  candidate.player_name,
  candidate.legacy_gender,
  candidate.legacy_category,
  candidate.ranking_points,
  (
    select branch.name
    from public.competition_branches branch
    where branch.club_id = candidate.club_id
      and branch.slug = candidate.proposed_branch_slug
      and branch.is_active
    order by branch.sort_order, branch.name
    limit 1
  ) as candidate_branch,
  (
    select category.name
    from public.competition_categories category
    where category.club_id = candidate.club_id
      and category.legacy_category_id = candidate.legacy_category
      and category.is_active
    order by category.sort_order, category.name
    limit 1
  ) as candidate_category,
  (
    select division.id
    from public.competition_divisions division
    join public.competition_seasons season
      on season.id = division.season_id and season.club_id = division.club_id
    join public.competition_branches branch
      on branch.id = division.branch_id and branch.club_id = division.club_id
    join public.competition_categories category
      on category.id = division.category_id and category.club_id = division.club_id
    where division.club_id = candidate.club_id
      and division.modality = 'INDIVIDUAL'
      and division.segment_id is null
      and division.is_active
      and season.status in ('DRAFT', 'ACTIVE')
      and season.starts_on <= current_date
      and season.ends_on >= current_date
      and branch.slug = candidate.proposed_branch_slug
      and branch.is_active
      and category.legacy_category_id = candidate.legacy_category
      and category.is_active
    order by season.status = 'ACTIVE' desc, division.sort_order, division.created_at
    limit 1
  ) as candidate_individual_division_id,
  candidate.division_candidates as candidate_division_count,
  case
    when candidate.legacy_gender not in ('M', 'F')
      or candidate.legacy_category is null
      or candidate.legacy_category < 1
      then 'INVALID_LEGACY_DATA'
    when candidate.season_candidates = 0 then 'MISSING_SEASON'
    when candidate.branch_candidates = 0 then 'MISSING_BRANCH'
    when candidate.category_candidates = 0 then 'MISSING_CATEGORY'
    when candidate.division_candidates = 0 then 'MISSING_DIVISION'
    when candidate.division_candidates > 1 then 'AMBIGUOUS_DIVISION'
    else 'READY'
  end as diagnostic_status
from candidate_counts candidate
order by candidate.club_id, candidate.player_name, candidate.club_player_id;
