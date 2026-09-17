begin;

-- Keep the published settlement as the source of result metadata while summing
-- every ledger movement (including reversals) against its original transaction.
-- The functions retain their public signatures and ranking/tie-break contracts.
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
      sum(tx.points)::bigint as points
    from public.competition_point_transactions tx
    join public.competition_point_transactions original
      on original.id = coalesce(tx.reversed_transaction_id, tx.id)
      and original.club_id = tx.club_id
    join public.competition_event_settlements settlement
      on settlement.id = nullif(original.metadata ->> 'settlement_id', '')::uuid
      and settlement.club_id = tx.club_id
      and settlement.status = 'PUBLISHED'
    join public.competition_series_events event
      on event.id = settlement.event_id
      and event.club_id = settlement.club_id
      and event.series_id = p_series_id
    join public.competition_event_settlement_awards award
      on award.id = nullif(original.metadata ->> 'award_id', '')::uuid
      and award.settlement_id = settlement.id
      and award.club_id = tx.club_id
    where tx.club_id = p_club_id
      and original.source_concept = 'COMPETITION_EVENT_SETTLEMENT'
    group by tx.club_player_id, award.id, award.player_id, award.final_position, settlement.event_id
    having sum(tx.points) <> 0
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

create or replace function public.get_competition_series_ranking_by_division(
  p_club_id uuid,
  p_series_id uuid
)
returns table(
  series_division_id uuid,
  division_id uuid,
  division_name text,
  ranking_position bigint,
  club_player_id uuid,
  player_id uuid,
  display_name text,
  avatar_url text,
  points bigint,
  events_played bigint,
  titles bigint,
  finals bigint,
  semifinals bigint,
  rule_id uuid,
  rule_version integer,
  rule_snapshot jsonb,
  tie_break_snapshot jsonb
)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='28000'; end if;
  if not (public.is_platform_admin() or public.has_club_capability(p_club_id,'competition:view')) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not exists(select 1 from public.competition_series s where s.id=p_series_id and s.club_id=p_club_id) then
    raise exception 'NOT_FOUND' using errcode='P0002';
  end if;

  return query
  with active_rules as (
    select sd.id series_division_id,sd.division_id,
      coalesce(sd.division_snapshot->>'division_name',sd.division_snapshot->>'category_name','División') division_name,
      r.id rule_id,r.version rule_version,r.accumulation_mode,r.best_results_count,r.discard_worst_count,
      r.minimum_participations,r.tie_breakers,
      jsonb_build_object('id',r.id,'version',r.version,'accumulation_mode',r.accumulation_mode,
        'best_results_count',r.best_results_count,'discard_worst_count',r.discard_worst_count,
        'minimum_participations',r.minimum_participations,'tie_breakers',r.tie_breakers,
        'frozen_at',r.frozen_at) rule_snapshot
    from public.competition_series_divisions sd
    join public.competition_series_rules r on r.series_division_id=sd.id and r.status='ACTIVE'
    where sd.club_id=p_club_id and sd.series_id=p_series_id and sd.is_active and sd.removed_at is null
  ), event_points as (
    select ar.series_division_id,ar.division_id,ar.division_name,ar.rule_id,ar.rule_version,
      ar.accumulation_mode,ar.best_results_count,ar.discard_worst_count,ar.minimum_participations,
      ar.tie_breakers,ar.rule_snapshot,tx.club_player_id,award.player_id,settlement.event_id,
      sum(tx.points)::bigint event_points,
      min(award.result_code) result_code,
      max(coalesce(event.actual_ends_at,event.planned_ends_at,event.updated_at)) event_at
    from active_rules ar
    join public.competition_series_event_divisions ed on ed.series_division_id=ar.series_division_id and ed.is_active and ed.status='COMPLETED'
    join public.competition_series_events event on event.id=ed.event_id and event.series_id=p_series_id and event.status='COMPLETED'
    join public.competition_event_settlements settlement on settlement.event_division_id=ed.id and settlement.status='PUBLISHED'
    join public.competition_point_transactions tx on tx.club_id=p_club_id
    join public.competition_point_transactions original on original.id=coalesce(tx.reversed_transaction_id,tx.id)
      and original.club_id=tx.club_id
      and original.source_concept='COMPETITION_EVENT_SETTLEMENT'
      and nullif(original.metadata->>'settlement_id','')::uuid=settlement.id
    join public.competition_event_settlement_awards award on award.id=nullif(original.metadata->>'award_id','')::uuid
      and award.settlement_id=settlement.id and award.club_player_id=tx.club_player_id
    group by ar.series_division_id,ar.division_id,ar.division_name,ar.rule_id,ar.rule_version,
      ar.accumulation_mode,ar.best_results_count,ar.discard_worst_count,ar.minimum_participations,
      ar.tie_breakers,ar.rule_snapshot,tx.club_player_id,award.player_id,settlement.event_id
    having sum(tx.points) <> 0
  ), ordered_events as (
    select ep.*,
      row_number() over(partition by ep.series_division_id,ep.club_player_id order by ep.event_points desc,ep.event_at desc,ep.event_id) best_order,
      row_number() over(partition by ep.series_division_id,ep.club_player_id order by ep.event_points asc,ep.event_at,ep.event_id) worst_order
    from event_points ep
  ), totals as (
    select oe.series_division_id,oe.division_id,oe.division_name,oe.rule_id,oe.rule_version,
      oe.minimum_participations,oe.tie_breakers,oe.rule_snapshot,oe.club_player_id,oe.player_id,
      coalesce(sum(oe.event_points) filter(where oe.accumulation_mode='ALL_RESULTS'
        or (oe.accumulation_mode='BEST_N' and oe.best_order<=oe.best_results_count)
        or (oe.accumulation_mode='DROP_WORST_N' and oe.worst_order>oe.discard_worst_count)),0)::bigint points,
      count(distinct oe.event_id)::bigint events_played,
      count(*) filter(where oe.result_code='CHAMPION')::bigint titles,
      count(*) filter(where oe.result_code in('CHAMPION','RUNNER_UP'))::bigint finals,
      count(*) filter(where oe.result_code in('CHAMPION','RUNNER_UP','SEMIFINALIST'))::bigint semifinals
    from ordered_events oe
    group by oe.series_division_id,oe.division_id,oe.division_name,oe.rule_id,oe.rule_version,
      oe.minimum_participations,oe.tie_breakers,oe.rule_snapshot,oe.club_player_id,oe.player_id
    having count(distinct oe.event_id)>=oe.minimum_participations
  ), named as (
    select t.*,coalesce(profile.display_name,nullif(concat_ws(' ',profile.first_name,profile.last_name),''),player.display_name,'Jugador') resolved_name,
      profile.avatar_url,
      coalesce((select array_agg(case upper(x.value->>'criterion')
        when 'TOURNAMENT_WINS' then t.titles when 'FINALS' then t.finals
        when 'SEMIFINALS' then t.semifinals when 'PARTICIPATIONS' then t.events_played else 0 end order by x.ordinality)),array[]::bigint[]) tie_vector
    from totals t
    join public.club_players player on player.id=t.club_player_id and player.club_id=p_club_id
    left join public.profiles profile on profile.user_id=player.user_id
    left join lateral jsonb_array_elements(t.tie_breakers) with ordinality x(value,ordinality) on true
    group by t.series_division_id,t.division_id,t.division_name,t.rule_id,t.rule_version,t.minimum_participations,
      t.tie_breakers,t.rule_snapshot,t.club_player_id,t.player_id,t.points,t.events_played,t.titles,t.finals,t.semifinals,
      profile.display_name,profile.first_name,profile.last_name,player.display_name,profile.avatar_url
  )
  select n.series_division_id,n.division_id,n.division_name,
    row_number() over(partition by n.series_division_id order by n.points desc,n.tie_vector desc,n.resolved_name,n.club_player_id)::bigint,
    n.club_player_id,n.player_id,n.resolved_name,n.avatar_url,n.points,n.events_played,n.titles,n.finals,n.semifinals,
    n.rule_id,n.rule_version,n.rule_snapshot,
    jsonb_build_object('criteria',n.tie_breakers,'values',to_jsonb(n.tie_vector))
  from named n
  order by n.series_division_id,4;
end $$;

revoke all on function public.get_competition_series_ranking(uuid,uuid),
  public.get_competition_series_ranking_by_division(uuid,uuid) from public,anon;
grant execute on function public.get_competition_series_ranking(uuid,uuid),
  public.get_competition_series_ranking_by_division(uuid,uuid) to authenticated,service_role;

-- A direct ledger reversal bypasses the settlement guard. Serialize it with
-- finalization and reject it once the owning series has been closed.
create or replace function public.guard_closed_competition_series_ledger_insert()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare settlement_id_value uuid; series_status text;
begin
  if new.transaction_type='REVERSAL' then
    select nullif(original.metadata->>'settlement_id','')::uuid into settlement_id_value
    from public.competition_point_transactions original
    where original.id=new.reversed_transaction_id
      and original.source_concept='COMPETITION_EVENT_SETTLEMENT';
  elsif new.source_concept='COMPETITION_EVENT_SETTLEMENT' then
    settlement_id_value:=nullif(new.metadata->>'settlement_id','')::uuid;
  end if;

  if settlement_id_value is not null then
    select series.status into series_status
    from public.competition_event_settlements settlement
    join public.competition_series_events event on event.id=settlement.event_id
    join public.competition_series series on series.id=event.series_id
    where settlement.id=settlement_id_value and settlement.club_id=new.club_id
    for share of series;
    if series_status='CLOSED' then
      raise exception 'SERIES_FINALIZED_IMMUTABLE' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create trigger trg_guard_closed_competition_series_ledger_insert
  before insert on public.competition_point_transactions
  for each row execute function public.guard_closed_competition_series_ledger_insert();
revoke all on function public.guard_closed_competition_series_ledger_insert() from public,anon,authenticated;

commit;
