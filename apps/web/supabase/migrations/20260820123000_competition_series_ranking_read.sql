begin;

-- Stage 5A.6 projects points by season/division.  A circuit needs the same
-- canonical ledger, constrained to the settlements that belong to one series.
create or replace function public.get_competition_series_ranking(
  p_club_id uuid,
  p_series_id uuid
)
returns table(
  ranking_position bigint,
  club_player_id uuid,
  player_id uuid,
  display_name text,
  avatar_url text,
  points bigint,
  events_played bigint,
  titles bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  if not (public.is_platform_admin() or public.has_club_capability(p_club_id, 'competition:view')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.competition_series series
    where series.id = p_series_id and series.club_id = p_club_id
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  with series_awards as (
    select
      tx.club_player_id,
      award.player_id,
      award.final_position,
      settlement.event_id,
      tx.points
    from public.competition_point_transactions tx
    join public.competition_event_settlements settlement
      on settlement.id = nullif(tx.metadata ->> 'settlement_id', '')::uuid
      and settlement.club_id = tx.club_id
      and settlement.status = 'PUBLISHED'
    join public.competition_series_events event
      on event.id = settlement.event_id
      and event.club_id = settlement.club_id
      and event.series_id = p_series_id
    join public.competition_event_settlement_awards award
      on award.id = nullif(tx.metadata ->> 'award_id', '')::uuid
      and award.settlement_id = settlement.id
      and award.club_id = tx.club_id
    where tx.club_id = p_club_id
      and tx.source_concept = 'COMPETITION_EVENT_SETTLEMENT'
  ), totals as (
    select
      award.club_player_id,
      award.player_id,
      sum(award.points)::bigint as points,
      count(distinct award.event_id)::bigint as events_played,
      count(*) filter (where award.final_position = 1)::bigint as titles
    from series_awards award
    group by award.club_player_id, award.player_id
  ), named as (
    select
      totals.*,
      coalesce(profile.display_name, nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), player.display_name, 'Jugador') as resolved_name,
      profile.avatar_url
    from totals
    join public.club_players player on player.id = totals.club_player_id and player.club_id = p_club_id
    left join public.profiles profile on profile.user_id = player.user_id
  )
  select
    rank() over (order by named.points desc, named.titles desc, named.events_played desc, named.resolved_name, named.club_player_id)::bigint,
    named.club_player_id,
    named.player_id,
    named.resolved_name,
    named.avatar_url,
    named.points,
    named.events_played,
    named.titles
  from named
  order by 1, named.club_player_id;
end;
$$;

revoke all on function public.get_competition_series_ranking(uuid, uuid) from public, anon;
grant execute on function public.get_competition_series_ranking(uuid, uuid) to authenticated, service_role;

commit;
