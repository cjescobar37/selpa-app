begin;

-- The season-wide projection remains unchanged for club rankings. A circuit
-- needs its own published-settlement and sports-division boundary.
create or replace function public.get_competition_series_pair_ranking(
  p_club_id uuid, p_series_id uuid
)
returns table(
  season_id uuid, series_division_id uuid, division_id uuid, division_name text,
  ranking_position bigint, player1_user_id uuid, player2_user_id uuid,
  player1_name text, player2_name text, player1_avatar_url text, player2_avatar_url text,
  pair_key text, points bigint, events_played bigint, titles bigint,
  finals bigint, semifinals bigint, rule_id uuid, rule_version integer,
  rule_snapshot jsonb, tie_break_snapshot jsonb
)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.require_competition_series_access(p_club_id,'competition:view');
  if not exists(select 1 from public.competition_series s where s.id=p_series_id and s.club_id=p_club_id) then
    raise exception 'NOT_FOUND' using errcode='P0002';
  end if;

  return query
  with active_rules as (
    select s.season_id,sd.id series_division_id,sd.division_id,
      coalesce(sd.division_snapshot->>'division_name',sd.division_snapshot->>'category_name','Parejas') division_name,
      r.id rule_id,r.version rule_version,r.accumulation_mode,r.best_results_count,r.discard_worst_count,
      r.minimum_participations,r.tie_breakers,
      jsonb_build_object('id',r.id,'version',r.version,'accumulation_mode',r.accumulation_mode,
        'best_results_count',r.best_results_count,'discard_worst_count',r.discard_worst_count,
        'minimum_participations',r.minimum_participations,'tie_breakers',r.tie_breakers,
        'frozen_at',r.frozen_at) rule_snapshot
    from public.competition_series s
    join public.competition_series_divisions sd on sd.series_id=s.id and sd.club_id=s.club_id
      and sd.is_active and sd.removed_at is null
    join public.competition_divisions d on d.id=sd.division_id and d.club_id=s.club_id
      and d.season_id=s.season_id and d.modality='PAIRS'
    join public.competition_series_rules r on r.series_division_id=sd.id and r.status='ACTIVE'
    where s.club_id=p_club_id and s.id=p_series_id
  ), effective_awards as (
    select original.metadata->>'award_id' award_id,
      original.metadata->>'settlement_id' settlement_id,
      original.club_id,original.season_id,original.division_id,
      sum(tx.points)::bigint effective_points
    from public.competition_point_transactions tx
    join public.competition_point_transactions original
      on original.id=coalesce(tx.reversed_transaction_id,tx.id)
      and original.club_id=tx.club_id
    where original.club_id=p_club_id
      and original.source_concept='COMPETITION_EVENT_SETTLEMENT'
    group by original.club_id,original.season_id,original.division_id,
      original.metadata->>'settlement_id',original.metadata->>'award_id'
    having sum(tx.points)<>0
  ), team_events as (
    select ar.season_id,ar.series_division_id,ar.division_id,ar.division_name,
      ar.rule_id,ar.rule_version,ar.accumulation_mode,ar.best_results_count,
      ar.discard_worst_count,ar.minimum_participations,ar.tie_breakers,ar.rule_snapshot,
      event.id event_id,participant.tournament_team_id,
      array_agg(distinct award.player_id order by award.player_id) player_ids,
      -- Same once-per-team rule as competition_pair_ranking_projection.
      max(effective.effective_points)::bigint event_points,
      min(award.result_code) result_code,
      coalesce(event.actual_ends_at,event.planned_ends_at,event.updated_at) event_at
    from active_rules ar
    join public.competition_series_event_divisions ed on ed.series_division_id=ar.series_division_id
      and ed.club_id=p_club_id and ed.is_active and ed.status='COMPLETED' and ed.scoring_mode='POINTS'
    join public.competition_series_events event on event.id=ed.event_id and event.series_id=p_series_id
      and event.club_id=p_club_id and event.season_id=ar.season_id and event.status='COMPLETED'
    join public.competition_event_settlements settlement on settlement.event_division_id=ed.id
      and settlement.club_id=p_club_id and settlement.event_id=event.id and settlement.status='PUBLISHED'
    join effective_awards effective on effective.settlement_id=settlement.id::text
      and effective.club_id=p_club_id and effective.season_id=ar.season_id
      and effective.division_id=nullif(ed.configuration_snapshot->>'ranking_division_id','')::uuid
    join public.competition_event_settlement_awards award on award.id=effective.award_id::uuid
      and award.settlement_id=settlement.id and award.club_id=p_club_id
      and award.scoring_eligibility_status='ELIGIBLE'
    join public.competition_event_homologation_participants participant
      on participant.id=award.homologation_participant_id and participant.player_id=award.player_id
      and participant.homologation_id=settlement.homologation_id
    group by ar.season_id,ar.series_division_id,ar.division_id,ar.division_name,
      ar.rule_id,ar.rule_version,ar.accumulation_mode,ar.best_results_count,
      ar.discard_worst_count,ar.minimum_participations,ar.tie_breakers,ar.rule_snapshot,
      event.id,participant.tournament_team_id,event.actual_ends_at,event.planned_ends_at,event.updated_at
    having count(distinct award.player_id)=2
      and count(distinct award.result_code)=1
      and count(distinct coalesce(award.final_position,-1))=1
  ), ordered_events as (
    select te.*,te.player_ids[1] first_player,te.player_ids[2] second_player,
      row_number() over(partition by te.series_division_id,te.player_ids
        order by te.event_points desc,te.event_at desc,te.event_id) best_order,
      row_number() over(partition by te.series_division_id,te.player_ids
        order by te.event_points asc,te.event_at,te.event_id) worst_order
    from team_events te
  ), totals as (
    select oe.season_id,oe.series_division_id,oe.division_id,oe.division_name,
      oe.rule_id,oe.rule_version,oe.minimum_participations,oe.tie_breakers,oe.rule_snapshot,
      oe.first_player,oe.second_player,
      coalesce(sum(oe.event_points) filter(where oe.accumulation_mode='ALL_RESULTS'
        or (oe.accumulation_mode='BEST_N' and oe.best_order<=oe.best_results_count)
        or (oe.accumulation_mode='DROP_WORST_N' and oe.worst_order>oe.discard_worst_count)),0)::bigint points,
      count(distinct oe.event_id)::bigint events_played,
      count(*) filter(where oe.result_code='CHAMPION')::bigint titles,
      count(*) filter(where oe.result_code in('CHAMPION','RUNNER_UP'))::bigint finals,
      count(*) filter(where oe.result_code in('CHAMPION','RUNNER_UP','SEMIFINALIST'))::bigint semifinals
    from ordered_events oe
    group by oe.season_id,oe.series_division_id,oe.division_id,oe.division_name,
      oe.rule_id,oe.rule_version,oe.minimum_participations,oe.tie_breakers,oe.rule_snapshot,
      oe.first_player,oe.second_player
    having count(distinct oe.event_id)>=oe.minimum_participations
  ), named as (
    select t.*,
      coalesce(p1.display_name,nullif(concat_ws(' ',p1.first_name,p1.last_name),''),cp1.display_name,'Jugador') first_name,
      coalesce(p2.display_name,nullif(concat_ws(' ',p2.first_name,p2.last_name),''),cp2.display_name,'Jugador') second_name,
      p1.avatar_url first_avatar,p2.avatar_url second_avatar,
      coalesce((select array_agg(case upper(x.value->>'criterion')
        when 'TOURNAMENT_WINS' then t.titles when 'FINALS' then t.finals
        when 'SEMIFINALS' then t.semifinals when 'PARTICIPATIONS' then t.events_played else 0 end
        order by x.ordinality) from jsonb_array_elements(t.tie_breakers) with ordinality x(value,ordinality)),
        array[]::bigint[]) tie_vector
    from totals t
    join public.club_players cp1 on cp1.club_id=p_club_id and cp1.user_id=t.first_player
    join public.club_players cp2 on cp2.club_id=p_club_id and cp2.user_id=t.second_player
    left join public.profiles p1 on p1.user_id=t.first_player
    left join public.profiles p2 on p2.user_id=t.second_player
  )
  select n.season_id,n.series_division_id,n.division_id,n.division_name,
    row_number() over(partition by n.series_division_id
      order by n.points desc,n.tie_vector desc,n.first_player,n.second_player)::bigint,
    n.first_player,n.second_player,n.first_name,n.second_name,n.first_avatar,n.second_avatar,
    concat(n.first_player::text,':',n.second_player::text),n.points,n.events_played,n.titles,
    n.finals,n.semifinals,n.rule_id,n.rule_version,n.rule_snapshot,
    jsonb_build_object('criteria',n.tie_breakers,'values',to_jsonb(n.tie_vector))
  from named n
  order by n.series_division_id,5;
end $$;

revoke all on function public.get_competition_series_pair_ranking(uuid,uuid) from public,anon;
grant execute on function public.get_competition_series_pair_ranking(uuid,uuid) to authenticated,service_role;

create table public.competition_series_final_pair_rankings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_id uuid not null,
  series_id uuid not null,
  series_division_id uuid not null,
  division_id uuid not null,
  ranking_position integer not null,
  player1_user_id uuid not null references auth.users(id) on delete restrict,
  player2_user_id uuid not null references auth.users(id) on delete restrict,
  player1_name text not null,
  player2_name text not null,
  player1_avatar_url text,
  player2_avatar_url text,
  pair_key text not null,
  points bigint not null,
  events_played integer not null,
  titles integer not null,
  finals integer not null,
  semifinals integer not null,
  rule_id uuid not null,
  rule_version integer not null,
  rule_snapshot jsonb not null,
  tie_break_snapshot jsonb not null,
  series_revision integer not null,
  finalized_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint competition_series_final_pair_series_fkey foreign key(club_id,series_id)
    references public.competition_series(club_id,id) on delete restrict,
  constraint competition_series_final_pair_season_fkey foreign key(club_id,season_id)
    references public.competition_seasons(club_id,id) on delete restrict,
  constraint competition_series_final_pair_series_division_fkey foreign key(club_id,series_division_id)
    references public.competition_series_divisions(club_id,id) on delete restrict,
  constraint competition_series_final_pair_division_fkey foreign key(club_id,division_id)
    references public.competition_divisions(club_id,id) on delete restrict,
  constraint competition_series_final_pair_scope_key unique(series_id,series_division_id,pair_key),
  constraint competition_series_final_pair_position_key unique(series_id,series_division_id,ranking_position),
  constraint competition_series_final_pair_order_chk check(player1_user_id<player2_user_id),
  constraint competition_series_final_pair_key_chk check(pair_key=player1_user_id::text||':'||player2_user_id::text),
  constraint competition_series_final_pair_position_chk check(ranking_position>0),
  constraint competition_series_final_pair_counts_chk check(events_played>=0 and titles>=0 and finals>=0 and semifinals>=0),
  constraint competition_series_final_pair_snapshots_chk check(jsonb_typeof(rule_snapshot)='object' and jsonb_typeof(tie_break_snapshot)='object')
);
create index competition_series_final_pair_list_idx
  on public.competition_series_final_pair_rankings(club_id,series_id,series_division_id,ranking_position);

create trigger trg_competition_series_final_pair_rankings_guard
  before insert or update or delete on public.competition_series_final_pair_rankings
  for each row execute function public.guard_competition_series_final_ranking_mutation();

alter table public.competition_series_final_pair_rankings enable row level security;
revoke all on table public.competition_series_final_pair_rankings from public,anon,authenticated,service_role;
grant select on table public.competition_series_final_pair_rankings to authenticated,service_role;
create policy competition_series_final_pair_rankings_read on public.competition_series_final_pair_rankings
  for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));

comment on table public.competition_series_final_pair_rankings is
  'Snapshot inmutable de duplas ordenadas, una fila por pareja y división deportiva del circuito.';

-- The existing write GUCs authorize lifecycle RPCs, but they do not encode the
-- terminal state. Lock the parent Series so a concurrent close cannot race a
-- late event/rule/result write.
create or replace function public.guard_closed_competition_series_structure()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare row_data jsonb; series_id_value uuid; item_index integer;
begin
  for item_index in 1..case when tg_op='UPDATE' then 2 else 1 end loop
    row_data:=case when tg_op='DELETE' or (tg_op='UPDATE' and item_index=1)
      then to_jsonb(old) else to_jsonb(new) end;
    series_id_value:=null;
    if tg_table_name='competition_series_events' or tg_table_name='competition_series_divisions' then
      series_id_value:=(row_data->>'series_id')::uuid;
    elsif tg_table_name='competition_series_rules' then
      select sd.series_id into series_id_value from public.competition_series_divisions sd
      where sd.id=(row_data->>'series_division_id')::uuid;
    elsif tg_table_name='competition_series_eligibility' then
      select sd.series_id into series_id_value from public.competition_series_rules r
      join public.competition_series_divisions sd on sd.id=r.series_division_id
      where r.id=(row_data->>'series_rule_id')::uuid;
    elsif tg_table_name='competition_series_event_divisions' then
      select e.series_id into series_id_value from public.competition_series_events e
      where e.id=(row_data->>'event_id')::uuid;
    elsif tg_table_name='competition_series_event_tournament_links' then
      select e.series_id into series_id_value from public.competition_series_event_divisions ed
      join public.competition_series_events e on e.id=ed.event_id
      where ed.id=(row_data->>'event_division_id')::uuid;
    elsif tg_table_name in('competition_event_homologation_results','competition_event_homologation_participants',
      'competition_event_homologation_issues') then
      select e.series_id into series_id_value from public.competition_event_homologations h
      join public.competition_series_events e on e.id=h.event_id
      where h.id=(row_data->>'homologation_id')::uuid;
    elsif tg_table_name in('competition_event_settlement_awards','competition_event_settlement_issues') then
      select e.series_id into series_id_value from public.competition_event_settlements st
      join public.competition_series_events e on e.id=st.event_id
      where st.id=(row_data->>'settlement_id')::uuid;
    end if;
    if series_id_value is not null and exists(
      select 1 from public.competition_series s where s.id=series_id_value and s.status='CLOSED' for share
    ) then
      raise exception 'SERIES_FINALIZED_IMMUTABLE' using errcode='23514';
    end if;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.guard_closed_competition_series_row()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if old.status='CLOSED' then raise exception 'SERIES_FINALIZED_IMMUTABLE' using errcode='23514'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create trigger trg_closed_series_row before update or delete on public.competition_series
  for each row execute function public.guard_closed_competition_series_row();
create trigger trg_closed_series_events before insert or update or delete on public.competition_series_events
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_series_divisions before insert or update or delete on public.competition_series_divisions
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_series_rules before insert or update or delete on public.competition_series_rules
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_series_eligibility before insert or update or delete on public.competition_series_eligibility
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_event_divisions before insert or update or delete on public.competition_series_event_divisions
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_event_links before insert or update or delete on public.competition_series_event_tournament_links
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_homologation_results before insert or update or delete on public.competition_event_homologation_results
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_homologation_participants before insert or update or delete on public.competition_event_homologation_participants
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_homologation_issues before insert or update or delete on public.competition_event_homologation_issues
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_settlement_awards before insert or update or delete on public.competition_event_settlement_awards
  for each row execute function public.guard_closed_competition_series_structure();
create trigger trg_closed_settlement_issues before insert or update or delete on public.competition_event_settlement_issues
  for each row execute function public.guard_closed_competition_series_structure();

revoke all on function public.guard_closed_competition_series_structure(),
  public.guard_closed_competition_series_row() from public,anon,authenticated;

create or replace function public.get_competition_series_finalization_preflight(p_club_id uuid,p_series_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.competition_series%rowtype; blockers jsonb:='[]'::jsonb; event_count integer; completed_count integer;
begin
  perform public.require_competition_series_access(p_club_id,'competition:view');
  select * into s from public.competition_series where id=p_series_id and club_id=p_club_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  select count(*),count(*) filter(where status='COMPLETED') into event_count,completed_count
  from public.competition_series_events where series_id=s.id and club_id=s.club_id and archived_at is null;
  if s.status='CANCELLED' then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','SERIES_CANCELLED','message','El circuito está cancelado.')); end if;
  if s.status not in('ACTIVE','CLOSED') then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','SERIES_NOT_ACTIVE','message','El circuito debe estar activo para finalizarlo.')); end if;
  if event_count=0 or completed_count=0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','EVENTS_MISSING','message','El circuito necesita al menos una fecha finalizada.')); end if;
  if exists(select 1 from public.competition_series_events e where e.series_id=s.id and e.archived_at is null and e.status not in('COMPLETED','CANCELLED')) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','EVENT_PENDING','message','Falta finalizar una o más fechas.'));
  end if;
  if exists(select 1 from public.competition_series_event_divisions ed join public.competition_series_events e on e.id=ed.event_id
    where e.series_id=s.id and e.status='COMPLETED' and ed.is_active and ed.status not in('COMPLETED','CANCELLED')) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','EVENT_DIVISION_PENDING','message','Falta cerrar una división de una fecha.'));
  end if;
  if exists(select 1 from public.competition_series_event_divisions ed join public.competition_series_events e on e.id=ed.event_id
    where e.series_id=s.id and e.status='COMPLETED' and ed.is_active and ed.status='COMPLETED'
      and not exists(select 1 from public.competition_event_homologations h where h.event_division_id=ed.id and h.status='APPROVED')) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','HOMOLOGATION_PENDING','message','Todavía hay resultados por homologar.'));
  end if;
  if exists(select 1 from public.competition_series_event_divisions ed join public.competition_series_events e on e.id=ed.event_id
    where e.series_id=s.id and e.status='COMPLETED' and ed.is_active and ed.status='COMPLETED' and ed.scoring_mode='POINTS'
      and not exists(select 1 from public.competition_event_settlements st where st.event_division_id=ed.id and st.status='PUBLISHED')) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','SETTLEMENT_PENDING','message','Hay puntos pendientes de publicación.'));
  end if;
  if exists(select 1 from public.competition_series_rules r join public.competition_series_divisions sd on sd.id=r.series_division_id
    cross join lateral jsonb_array_elements(r.tie_breakers) item
    where sd.series_id=s.id and sd.is_active and r.status='ACTIVE' and upper(item->>'criterion') in('HEAD_TO_HEAD','MASTER_RESULT','LATEST_BEST_RESULT','ADMIN_DECISION')) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','TIE_BREAK_REQUIRES_RESOLUTION','message','El desempate configurado requiere una resolución antes de finalizar.'));
  end if;
  if exists(select 1 from public.competition_series_divisions sd where sd.series_id=s.id and sd.is_active
    and exists(select 1 from public.competition_series_event_divisions ed join public.competition_series_events e on e.id=ed.event_id
      where e.series_id=s.id and ed.series_division_id=sd.id and ed.scoring_mode='POINTS')
    and not exists(select 1 from public.get_competition_series_ranking_by_division(p_club_id,s.id) r where r.series_division_id=sd.id)) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','FINAL_RANKING_EMPTY','message','El ranking final no tiene participantes elegibles.'));
  end if;
  if exists(select 1 from public.competition_series_divisions sd
    join public.competition_divisions d on d.id=sd.division_id and d.modality='PAIRS'
    where sd.series_id=s.id and sd.club_id=s.club_id and sd.is_active and sd.removed_at is null
      and exists(select 1 from public.competition_series_event_divisions ed
        join public.competition_series_events e on e.id=ed.event_id
        where ed.series_division_id=sd.id and ed.is_active and ed.status='COMPLETED'
          and ed.scoring_mode='POINTS' and e.series_id=s.id and e.status='COMPLETED')
      and not exists(select 1 from public.get_competition_series_pair_ranking(p_club_id,s.id) pair
        where pair.series_division_id=sd.id)) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','FINAL_PAIR_RANKING_EMPTY',
      'message','El ranking de parejas de una división no tiene resultados elegibles.'));
  end if;
  return jsonb_build_object('series_id',s.id,'status',s.status,'revision',s.revision,'events_total',event_count,
    'events_completed',completed_count,'can_finalize',s.status='CLOSED' or jsonb_array_length(blockers)=0,'blockers',blockers,
    'champions',case when s.status='CLOSED' then coalesce((select jsonb_agg(to_jsonb(fr) order by fr.series_division_id) from public.competition_series_final_rankings fr where fr.series_id=s.id and fr.ranking_position=1),'[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.finalize_competition_series_atomic(p_club_id uuid,p_series_id uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.competition_series%rowtype; actor uuid; pf jsonb; closed_at_value timestamptz:=clock_timestamp(); result jsonb;
begin
  actor:=public.require_competition_series_access(p_club_id,'competition:manage',true);
  select * into s from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if s.status='CLOSED' then
    return jsonb_build_object('series_id',s.id,'status',s.status,'revision',s.revision,'closed_at',s.closed_at,'replayed',true,
      'champions',coalesce((select jsonb_agg(to_jsonb(fr) order by fr.series_division_id) from public.competition_series_final_rankings fr where fr.series_id=s.id and fr.ranking_position=1),'[]'::jsonb),
      'pair_champions',coalesce((select jsonb_agg(to_jsonb(pair) order by pair.series_division_id) from public.competition_series_final_pair_rankings pair where pair.series_id=s.id and pair.ranking_position=1),'[]'::jsonb));
  end if;
  if s.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  pf:=public.get_competition_series_finalization_preflight(p_club_id,s.id);
  if not coalesce((pf->>'can_finalize')::boolean,false) then raise exception 'SERIES_FINALIZE_BLOCKED:%',pf->'blockers' using errcode='23514'; end if;
  perform set_config('selpa.competition_series_finalize','allowed',true);
  insert into public.competition_series_final_rankings(club_id,series_id,series_division_id,division_id,ranking_position,
    club_player_id,player_id,display_name,avatar_url,points,events_played,titles,finals,semifinals,rule_id,rule_version,
    rule_snapshot,tie_break_snapshot,series_revision,finalized_by,finalized_at)
  select p_club_id,s.id,r.series_division_id,r.division_id,r.ranking_position::integer,r.club_player_id,r.player_id,
    r.display_name,r.avatar_url,r.points,r.events_played::integer,r.titles::integer,r.finals::integer,r.semifinals::integer,
    r.rule_id,r.rule_version,r.rule_snapshot,r.tie_break_snapshot,s.revision,actor,closed_at_value
  from public.get_competition_series_ranking_by_division(p_club_id,s.id) r;
  if not exists(select 1 from public.competition_series_final_rankings fr where fr.series_id=s.id and fr.ranking_position=1) then
    raise exception 'SERIES_FINAL_RANKING_EMPTY' using errcode='23514';
  end if;
  insert into public.competition_series_final_pair_rankings(
    club_id,season_id,series_id,series_division_id,division_id,ranking_position,
    player1_user_id,player2_user_id,player1_name,player2_name,player1_avatar_url,player2_avatar_url,
    pair_key,points,events_played,titles,finals,semifinals,rule_id,rule_version,
    rule_snapshot,tie_break_snapshot,series_revision,finalized_by,finalized_at)
  select p_club_id,r.season_id,s.id,r.series_division_id,r.division_id,r.ranking_position::integer,
    r.player1_user_id,r.player2_user_id,r.player1_name,r.player2_name,r.player1_avatar_url,r.player2_avatar_url,
    r.pair_key,r.points,r.events_played::integer,r.titles::integer,r.finals::integer,r.semifinals::integer,
    r.rule_id,r.rule_version,r.rule_snapshot,r.tie_break_snapshot,s.revision,actor,closed_at_value
  from public.get_competition_series_pair_ranking(p_club_id,s.id) r;
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set status='CLOSED',closed_by=actor,closed_at=closed_at_value where id=s.id returning * into s;
  perform set_config('selpa.competition_series_finalize','',true);
  perform set_config('selpa.competition_series_write','',true);
  select jsonb_build_object('series_id',s.id,'status',s.status,'revision',s.revision,'closed_at',s.closed_at,'replayed',false,
    'champions',coalesce(jsonb_agg(to_jsonb(fr) order by fr.series_division_id),'[]'::jsonb),
    'pair_champions',coalesce((select jsonb_agg(to_jsonb(pair) order by pair.series_division_id)
      from public.competition_series_final_pair_rankings pair where pair.series_id=s.id and pair.ranking_position=1),'[]'::jsonb)) into result
  from public.competition_series_final_rankings fr where fr.series_id=s.id and fr.ranking_position=1;
  return result;
end $$;

revoke all on function public.get_competition_series_finalization_preflight(uuid,uuid),
  public.finalize_competition_series_atomic(uuid,uuid,integer) from public,anon;
grant execute on function public.get_competition_series_finalization_preflight(uuid,uuid),
  public.finalize_competition_series_atomic(uuid,uuid,integer) to authenticated,service_role;

commit;
