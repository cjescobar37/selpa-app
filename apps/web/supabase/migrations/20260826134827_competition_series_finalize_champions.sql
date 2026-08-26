begin;

do $$
begin
  if to_regclass('public.competition_series') is null
     or to_regclass('public.competition_series_events') is null
     or to_regclass('public.competition_series_event_divisions') is null
     or to_regclass('public.competition_event_homologations') is null
     or to_regclass('public.competition_event_settlements') is null
     or to_regclass('public.competition_point_transactions') is null
     or to_regprocedure('public.require_competition_series_access(uuid,text,boolean)') is null then
    raise exception 'El cierre final de circuitos requiere Competition Engine Stages 5A.2-5A.6.';
  end if;
end
$$;

create table public.competition_series_final_rankings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  series_id uuid not null,
  series_division_id uuid not null,
  division_id uuid not null,
  ranking_position integer not null,
  club_player_id uuid not null,
  player_id uuid not null,
  display_name text not null,
  avatar_url text,
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
  constraint competition_series_final_rankings_series_fkey foreign key (club_id, series_id)
    references public.competition_series(club_id, id) on delete restrict,
  constraint competition_series_final_rankings_series_division_fkey foreign key (club_id, series_division_id)
    references public.competition_series_divisions(club_id, id) on delete restrict,
  constraint competition_series_final_rankings_division_fkey foreign key (club_id, division_id)
    references public.competition_divisions(club_id, id) on delete restrict,
  constraint competition_series_final_rankings_scope_key unique (series_id, series_division_id, club_player_id),
  constraint competition_series_final_rankings_position_key unique (series_id, series_division_id, ranking_position),
  constraint competition_series_final_rankings_club_id_id_key unique (club_id, id),
  constraint competition_series_final_rankings_position_chk check (ranking_position > 0),
  constraint competition_series_final_rankings_counts_chk check (events_played >= 0 and titles >= 0 and finals >= 0 and semifinals >= 0),
  constraint competition_series_final_rankings_name_chk check (length(btrim(display_name)) > 0),
  constraint competition_series_final_rankings_rule_snapshot_chk check (jsonb_typeof(rule_snapshot) = 'object'),
  constraint competition_series_final_rankings_tie_snapshot_chk check (jsonb_typeof(tie_break_snapshot) = 'object')
);

create index competition_series_final_rankings_list_idx
  on public.competition_series_final_rankings (club_id, series_id, series_division_id, ranking_position);

create or replace function public.guard_competition_series_final_ranking_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if current_setting('selpa.competition_series_finalize', true) is distinct from 'allowed' then
    raise exception 'SERIES_FINAL_RANKING_IMMUTABLE' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create trigger trg_competition_series_final_rankings_guard
  before insert or update or delete on public.competition_series_final_rankings
  for each row execute function public.guard_competition_series_final_ranking_mutation();

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
      min(award.final_position) final_position,
      max(coalesce(event.actual_ends_at,event.planned_ends_at,event.updated_at)) event_at
    from active_rules ar
    join public.competition_series_event_divisions ed on ed.series_division_id=ar.series_division_id and ed.is_active and ed.status='COMPLETED'
    join public.competition_series_events event on event.id=ed.event_id and event.series_id=p_series_id and event.status='COMPLETED'
    join public.competition_event_settlements settlement on settlement.event_division_id=ed.id and settlement.status='PUBLISHED'
    join public.competition_point_transactions tx on tx.club_id=p_club_id
      and tx.source_concept='COMPETITION_EVENT_SETTLEMENT'
      and nullif(tx.metadata->>'settlement_id','')::uuid=settlement.id
    join public.competition_event_settlement_awards award on award.id=nullif(tx.metadata->>'award_id','')::uuid
      and award.settlement_id=settlement.id and award.club_player_id=tx.club_player_id
    group by ar.series_division_id,ar.division_id,ar.division_name,ar.rule_id,ar.rule_version,
      ar.accumulation_mode,ar.best_results_count,ar.discard_worst_count,ar.minimum_participations,
      ar.tie_breakers,ar.rule_snapshot,tx.club_player_id,award.player_id,settlement.event_id
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
      count(*) filter(where oe.final_position=1)::bigint titles,
      count(*) filter(where oe.final_position<=2)::bigint finals,
      count(*) filter(where oe.final_position<=4)::bigint semifinals
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
      'champions',coalesce((select jsonb_agg(to_jsonb(fr) order by fr.series_division_id) from public.competition_series_final_rankings fr where fr.series_id=s.id and fr.ranking_position=1),'[]'::jsonb));
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
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set status='CLOSED',closed_by=actor,closed_at=closed_at_value where id=s.id returning * into s;
  select jsonb_build_object('series_id',s.id,'status',s.status,'revision',s.revision,'closed_at',s.closed_at,'replayed',false,
    'champions',coalesce(jsonb_agg(to_jsonb(fr) order by fr.series_division_id),'[]'::jsonb)) into result
  from public.competition_series_final_rankings fr where fr.series_id=s.id and fr.ranking_position=1;
  return result;
end $$;

create or replace function public.close_competition_series(p_club_id uuid,p_series_id uuid,p_revision integer)
returns public.competition_series language plpgsql security definer set search_path=pg_catalog,public as $$
declare result public.competition_series%rowtype;
begin
  perform public.finalize_competition_series_atomic(p_club_id,p_series_id,p_revision);
  select * into result from public.competition_series where id=p_series_id and club_id=p_club_id;
  return result;
end $$;

create or replace function public.guard_closed_competition_series_result_mutation()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare event_division_id_value uuid; series_id_value uuid;
begin
  event_division_id_value:=case when tg_op='DELETE' then old.event_division_id else new.event_division_id end;
  select e.series_id into series_id_value from public.competition_series_event_divisions ed
  join public.competition_series_events e on e.id=ed.event_id where ed.id=event_division_id_value;
  if exists(select 1 from public.competition_series s where s.id=series_id_value and s.status='CLOSED') then
    raise exception 'SERIES_FINALIZED_IMMUTABLE' using errcode='23514';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create trigger trg_competition_homologations_closed_series
  before insert or update or delete on public.competition_event_homologations
  for each row execute function public.guard_closed_competition_series_result_mutation();
create trigger trg_competition_settlements_closed_series
  before insert or update or delete on public.competition_event_settlements
  for each row execute function public.guard_closed_competition_series_result_mutation();

alter table public.competition_series_final_rankings enable row level security;
revoke all on table public.competition_series_final_rankings from public,anon,authenticated;
grant select on table public.competition_series_final_rankings to authenticated,service_role;
create policy competition_series_final_rankings_read on public.competition_series_final_rankings
  for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));

revoke all on function public.get_competition_series_ranking_by_division(uuid,uuid),
  public.get_competition_series_finalization_preflight(uuid,uuid),public.finalize_competition_series_atomic(uuid,uuid,integer)
  from public,anon;
grant execute on function public.get_competition_series_ranking_by_division(uuid,uuid),
  public.get_competition_series_finalization_preflight(uuid,uuid),public.finalize_competition_series_atomic(uuid,uuid,integer)
  to authenticated,service_role;
revoke all on function public.guard_competition_series_final_ranking_mutation(),public.guard_closed_competition_series_result_mutation()
  from public,anon,authenticated;

comment on table public.competition_series_final_rankings is 'Snapshot inmutable del ranking final y campeones por división al cerrar una Competition Series.';
comment on function public.finalize_competition_series_atomic(uuid,uuid,integer) is 'Valida fechas, homologaciones y publicaciones; congela ranking final por división y cierra la Series atómicamente.';

commit;
