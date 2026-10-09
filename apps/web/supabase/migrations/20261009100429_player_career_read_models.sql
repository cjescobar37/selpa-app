-- REVIEW REQUIRED. Read-only projections; do not apply automatically.
-- No backfill, trigger, mutation, role change or replacement of Competition RPCs.
begin;

-- Same account-wide STAFF != PLAYER rule as accountRoleServer.ts. Memberships
-- and current club approval are checked before the ranking window, not after it.
create view public.player_sports_eligible_read with (security_invoker = true) as
select cp.id as club_player_id, cp.club_id, cp.user_id,
  coalesce(nullif(p.display_name,''), nullif(concat_ws(' ',p.first_name,p.last_name),''), cp.display_name, 'Jugador') as full_name,
  p.avatar_url
from public.club_players cp
join public.clubs c on c.id=cp.club_id and c.is_active
join public.club_memberships cm on cm.club_id=cp.club_id and cm.user_id=cp.user_id
  and cm.role='PLAYER' and cm.status='APPROVED' and cm.approved_at is not null
left join public.profiles p on p.user_id=cp.user_id
where cp.approved_at is not null
  and not exists (select 1 from public.platform_admins pa where pa.user_id=cp.user_id)
  and not exists (select 1 from public.clubs owned where owned.owner_user_id=cp.user_id)
  and not exists (select 1 from public.club_memberships staff where staff.user_id=cp.user_id
    and staff.role in ('OWNER','ADMIN','OPERADOR','PLANILLERO') and staff.status<>'REJECTED');

-- Competition's annual ledger universe. Points include compensating reversals;
-- rank ties use points only (competition-ranking.service.ts), per division.
create view public.competition_player_standings_read with (security_invoker = true) as
with totals as (
  select e.id as player_entry_id, e.club_player_id, e.club_id, d.id as division_id,
    d.season_id, s.name as season_name, d.modality, d.segment_id,
    cat.legacy_category_id as category, cat.name as category_name,
    case b.slug when 'caballeros' then 'M' when 'damas' then 'F' else 'MIXED' end as gender,
    player.user_id, player.full_name, player.avatar_url,
    coalesce(sum(tx.points),0)::bigint as ranking_points
  from public.competition_player_entries e
  join public.competition_divisions d on d.id=e.division_id and d.club_id=e.club_id
  join public.competition_seasons s on s.id=d.season_id and s.club_id=d.club_id
  join public.competition_branches b on b.id=d.branch_id and b.club_id=d.club_id
  left join public.competition_categories cat on cat.id=d.category_id and cat.club_id=d.club_id
  join public.player_sports_eligible_read player on player.club_player_id=e.club_player_id and player.club_id=e.club_id
  left join public.competition_point_transactions tx on tx.player_entry_id=e.id
    and tx.club_id=e.club_id and tx.season_id=d.season_id and tx.division_id=d.id
  where e.status='ACTIVE' and e.valid_until is null and d.is_active
    and d.modality='INDIVIDUAL' and d.segment_id is null
    and b.slug in ('caballeros','damas') and cat.legacy_category_id between 1 and 7
  group by e.id,e.club_player_id,e.club_id,d.id,d.season_id,s.name,d.modality,d.segment_id,
    cat.legacy_category_id,cat.name,b.slug,player.user_id,player.full_name,player.avatar_url
)
select totals.*,
  rank() over(partition by club_id,season_id,division_id order by ranking_points desc)::integer as position,
  count(*) over(partition by club_id,season_id,division_id,ranking_points)>1 as is_tied,
  count(*) over(partition by club_id,season_id,division_id)::integer as division_population,
  row_number() over(partition by club_id,season_id,division_id order by ranking_points desc,full_name,club_player_id)::integer as ordinal
from totals;

-- Current APPROVED homologation is the authority for participation/placement.
-- A registration is never evidence of a played tournament. A decided WO may
-- establish participation/placement, but is not a computable match or win/loss.
create view public.player_career_matches_read with (security_invoker = true) as
select distinct p.club_player_id, p.player_id as user_id, h.club_id, d.season_id,
  d.id as division_id, h.id as homologation_id, m.id, t.id as tournament_id,
  t.name as tournament_name, p.tournament_team_id,
  coalesce(m.scheduled_at::date,t.starts_on,t.start_date) as sports_date,
  m.winner_team_id=p.tournament_team_id as won,
  (m.team1_id is not null and m.team2_id is not null and m.team1_id<>m.team2_id
    and coalesce(m.score->>'walkover','false')<>'true'
    and upper(coalesce(m.score->>'type','')) not in ('WALKOVER','WO','BYE','ADMINISTRATIVE')
    and upper(coalesce(m.score->>'text','')) !~ '\mWO\M|WALKOVER|\mBYE\M'
    and coalesce(m.score->>'bye','false')<>'true'
    and coalesce(m.score->>'administrative','false')<>'true') as computable
from public.competition_event_homologation_participants p
join public.competition_event_homologations h on h.id=p.homologation_id and h.club_id=p.club_id
  and h.status='APPROVED' and h.superseded_by_id is null
join public.competition_series_event_divisions ed on ed.id=h.event_division_id and ed.club_id=h.club_id
join public.competition_series_divisions sd on sd.id=ed.series_division_id and sd.club_id=h.club_id
join public.competition_divisions d on d.id=sd.division_id and d.club_id=h.club_id
join public.tournaments t on t.id=h.tournament_id and t.club_id=h.club_id and t.status<>'CANCELLED'
join public.tournament_matches m on m.tournament_id=t.id and m.club_id=h.club_id
  and (m.team1_id=p.tournament_team_id or m.team2_id=p.tournament_team_id)
  and m.status='PLAYED' and m.winner_team_id is not null
  and m.winner_team_id in (m.team1_id,m.team2_id)
where p.participation_status<>'INVITED'
  and m.team1_id is not null and m.team2_id is not null and m.team1_id<>m.team2_id
  and upper(coalesce(m.score->>'type',''))<>'BYE'
  and coalesce(m.score->>'bye','false')<>'true'
  and upper(coalesce(m.score->>'type',''))<>'ADMINISTRATIVE'
  and coalesce(m.score->>'administrative','false')<>'true'
  and upper(coalesce(m.score->>'text','')) !~ '\mBYE\M';

create view public.player_career_results_read with (security_invoker = true) as
select p.id, p.club_player_id, p.player_id as user_id, p.club_id,
  d.season_id, d.id as division_id, h.id as homologation_id, h.event_id,
  h.tournament_id, coalesce(h.tournament_snapshot->>'name',t.name) as tournament_name,
  coalesce(t.starts_on,t.start_date) as sports_date,
  coalesce(t.category,cat.legacy_category_id) as category,
  case when t.category is not null then t.category::text || 'ª categoría' else cat.name end as category_name,
  p.result_role, p.final_position, p.scoring_eligibility_status,
  coalesce(nullif(other.participant_snapshot->>'display_name',''),'Pareja sin nombre publicado') as partner_name,
  case when p.scoring_eligibility_status='NON_SCORING' then 0 else points.net_points end as points,
  counts.matches_played, counts.wins, counts.losses
from public.competition_event_homologation_participants p
join public.competition_event_homologations h on h.id=p.homologation_id and h.club_id=p.club_id
  and h.status='APPROVED' and h.superseded_by_id is null
join public.competition_series_event_divisions ed on ed.id=h.event_division_id and ed.club_id=h.club_id
join public.competition_series_divisions sd on sd.id=ed.series_division_id and sd.club_id=h.club_id
join public.competition_divisions d on d.id=sd.division_id and d.club_id=h.club_id
left join public.competition_categories cat on cat.id=d.category_id and cat.club_id=d.club_id
join public.tournaments t on t.id=h.tournament_id and t.club_id=h.club_id and t.status<>'CANCELLED'
left join public.competition_event_homologation_participants other
  on other.homologation_id=p.homologation_id and other.tournament_team_id=p.tournament_team_id and other.player_id<>p.player_id
left join lateral (
  select sum(tx.points)::bigint as net_points
  from public.competition_event_settlement_awards award
  join public.competition_event_settlements settlement on settlement.id=award.settlement_id
    and settlement.status='PUBLISHED' and settlement.homologation_id=h.id
  join public.competition_point_transactions original on original.metadata->>'award_id'=award.id::text
    and original.source_concept='COMPETITION_EVENT_SETTLEMENT' and original.club_id=p.club_id
    and original.reversed_transaction_id is null
  join public.competition_point_transactions tx on tx.club_id=original.club_id
    and (tx.id=original.id or tx.reversed_transaction_id=original.id)
  where award.homologation_participant_id=p.id
) points on true
cross join lateral (
  select count(*) filter(where m.computable)::integer as matches_played,
    count(*) filter(where m.computable and m.won)::integer as wins,
    count(*) filter(where m.computable and not m.won)::integer as losses,
    count(*)::integer as decided_matches
  from public.player_career_matches_read m where m.homologation_id=h.id and m.user_id=p.player_id
) counts
where p.participation_status<>'INVITED'
  and (counts.decided_matches>0 or (p.participation_status='FINISHED' and p.result_role in ('CHAMPION','RUNNER_UP','SEMIFINALIST')));

create view public.competition_pair_standings_read with (security_invoker = true) as
with scoped_pairs as (
  -- The ledger division credits individuals; pairs_division_id is the actual
  -- PAIRS competition context. Never sum active partners' individual totals.
  select club_id,season_id,pairs_division_id as division_id,pair_key,
    player1_user_id,player2_user_id,sum(total_points)::bigint as total_points
  from public.competition_pair_ranking_projection
  where pairs_division_id is not null
  group by club_id,season_id,pairs_division_id,pair_key,player1_user_id,player2_user_id
)
select pair.club_id,pair.season_id,pair.division_id,pair.pair_key as partnership_id,
  pair.player1_user_id,pair.player2_user_id,
  p1.full_name as player1_name,p2.full_name as player2_name,
  p1.avatar_url as player1_avatar_url,p2.avatar_url as player2_avatar_url,
  pair.total_points as combined_points,
  rank() over(partition by pair.club_id,pair.season_id,pair.division_id order by pair.total_points desc)::integer as position
from scoped_pairs pair
join public.player_sports_eligible_read p1 on p1.club_id=pair.club_id and p1.user_id=pair.player1_user_id
join public.player_sports_eligible_read p2 on p2.club_id=pair.club_id and p2.user_id=pair.player2_user_id;

create function public.read_player_career_summary(p_club_player_id uuid,p_season_id uuid)
returns table(tournaments_played bigint,matches_played bigint,wins bigint,losses bigint,titles bigint,finals bigint,semifinals bigint,best_result text,best_position integer)
language sql stable security invoker set search_path='' as $$
  select count(distinct tournament_id),coalesce(sum(matches_played),0),coalesce(sum(wins),0),coalesce(sum(losses),0),
    count(*) filter(where result_role='CHAMPION'),
    count(*) filter(where result_role in ('CHAMPION','RUNNER_UP')),
    count(*) filter(where result_role='SEMIFINALIST'),
    (array_agg(result_role order by case result_role when 'CHAMPION' then 0 when 'RUNNER_UP' then 1 when 'SEMIFINALIST' then 2 else 3 end,final_position nulls last,id))[1],
    (array_agg(final_position order by case result_role when 'CHAMPION' then 0 when 'RUNNER_UP' then 1 when 'SEMIFINALIST' then 2 else 3 end,final_position nulls last,id))[1]
  from public.player_career_results_read where club_player_id=p_club_player_id
    and (p_season_id is null or season_id=p_season_id);
$$;

-- Backend only. No expanded public RLS or anonymous direct table/JSON access.
revoke all on public.player_sports_eligible_read,public.competition_player_standings_read,
  public.player_career_matches_read,public.player_career_results_read,public.competition_pair_standings_read from public,anon,authenticated;
grant select on public.player_sports_eligible_read,public.competition_player_standings_read,
  public.player_career_matches_read,public.player_career_results_read,public.competition_pair_standings_read to service_role;
revoke all on function public.read_player_career_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_player_career_summary(uuid,uuid) to service_role;
commit;
