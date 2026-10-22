-- PROPOSAL ONLY. Depends on 20261009100429_player_career_read_models.sql.
-- Separate public projections; full career/ledger reads remain backend-only.
-- No publication flags, points, RLS policies, users or economic records changed.
begin;

create view public.public_competition_contexts_read with (security_invoker = true) as
select d.*,s.name as season_name,s.status as season_status
from public.competition_divisions d
join public.clubs club on club.id=d.club_id and club.is_active
join public.competition_seasons s on s.id=d.season_id and s.club_id=d.club_id
  and s.is_public and s.status in ('ACTIVE','CLOSED')
join public.competition_branches b on b.id=d.branch_id and b.club_id=d.club_id
  and b.is_active and b.is_visible
left join public.competition_categories cat on cat.id=d.category_id and cat.club_id=d.club_id
left join public.competition_segments seg on seg.id=d.segment_id and seg.club_id=d.club_id
where d.is_active and d.is_visible
  and (d.category_id is null or (cat.is_active and cat.is_visible))
  and (d.segment_id is null or (seg.is_active and seg.is_visible));

-- Season publication authorizes its canonical annual aggregate. Do not subtract
-- hidden-event awards or rerank: that would change the official sporting ledger.
create view public.public_player_standings_read with (security_invoker = true) as
select standing.* from public.competition_player_standings_read standing
join public.public_competition_contexts_read context on context.id=standing.division_id
  and context.club_id=standing.club_id and context.season_id=standing.season_id;

create view public.public_pair_standings_read with (security_invoker = true) as
select standing.* from public.competition_pair_standings_read standing
join public.public_competition_contexts_read context on context.id=standing.division_id
  and context.club_id=standing.club_id and context.season_id=standing.season_id;

-- Result details require every publication boundary, not merely ACTIVE season.
create view public.public_player_career_results_read with (security_invoker = true) as
select result.* from public.player_career_results_read result
join public.player_sports_eligible_read player on player.club_player_id=result.club_player_id and player.club_id=result.club_id
join public.competition_divisions d on d.id=result.division_id and d.club_id=result.club_id and d.is_visible
join public.competition_seasons season on season.id=result.season_id and season.club_id=result.club_id
  and season.is_public and season.status in ('ACTIVE','CLOSED')
join public.competition_branches branch on branch.id=d.branch_id and branch.club_id=d.club_id and branch.is_visible
left join public.competition_categories category on category.id=d.category_id and category.club_id=d.club_id
left join public.competition_segments segment on segment.id=d.segment_id and segment.club_id=d.club_id
join public.competition_series_events event on event.id=result.event_id and event.club_id=result.club_id
  and event.season_id=result.season_id and event.is_public and event.status='COMPLETED' and event.archived_at is null
join public.competition_series series on series.id=event.series_id and series.club_id=event.club_id
  and series.season_id=season.id and series.is_public and series.status in ('ACTIVE','CLOSED') and series.archived_at is null
join public.competition_event_homologations h on h.id=result.homologation_id and h.club_id=result.club_id
  and h.event_id=event.id and h.status='APPROVED' and h.superseded_by_id is null
join public.competition_series_event_divisions event_division on event_division.id=h.event_division_id
  and event_division.club_id=result.club_id and event_division.event_id=event.id and event_division.status='COMPLETED'
  and event_division.is_active and event_division.removed_at is null
join public.tournaments tournament on tournament.id=result.tournament_id and tournament.club_id=result.club_id and tournament.status='FINISHED'
where (d.category_id is null or category.is_visible) and (d.segment_id is null or segment.is_visible);

create view public.public_player_career_matches_read with (security_invoker = true) as
select match.* from public.player_career_matches_read match
join public.public_player_career_results_read result on result.homologation_id=match.homologation_id
  and result.club_player_id=match.club_player_id and result.club_id=match.club_id;

create function public.read_public_player_career_summary(p_club_player_id uuid,p_season_id uuid)
returns table(tournaments_played bigint,matches_played bigint,wins bigint,losses bigint,titles bigint,finals bigint,semifinals bigint,best_result text,best_position integer)
language sql stable security invoker set search_path='' as $$
  select count(distinct tournament_id),coalesce(sum(matches_played),0),coalesce(sum(wins),0),coalesce(sum(losses),0),
    count(*) filter(where result_role='CHAMPION'),
    count(*) filter(where result_role in ('CHAMPION','RUNNER_UP')),
    count(*) filter(where result_role='SEMIFINALIST'),
    (array_agg(result_role order by case result_role when 'CHAMPION' then 0 when 'RUNNER_UP' then 1 when 'SEMIFINALIST' then 2 else 3 end,final_position nulls last,id))[1],
    (array_agg(final_position order by case result_role when 'CHAMPION' then 0 when 'RUNNER_UP' then 1 when 'SEMIFINALIST' then 2 else 3 end,final_position nulls last,id))[1]
  from public.public_player_career_results_read where club_player_id=p_club_player_id
    and (p_season_id is null or season_id=p_season_id);
$$;

revoke all on public.public_competition_contexts_read,public.public_player_standings_read,
  public.public_pair_standings_read,public.public_player_career_results_read,public.public_player_career_matches_read from public,anon,authenticated;
grant select on public.public_competition_contexts_read,public.public_player_standings_read,
  public.public_pair_standings_read,public.public_player_career_results_read,public.public_player_career_matches_read to service_role;
revoke all on function public.read_public_player_career_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_public_player_career_summary(uuid,uuid) to service_role;
commit;
