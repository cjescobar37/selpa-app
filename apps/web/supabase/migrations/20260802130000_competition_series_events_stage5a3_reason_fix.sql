begin;

create or replace function public.transition_competition_series_event(
  p_club_id uuid,
  p_event_id uuid,
  p_revision integer,
  p_operation text,
  p_key text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  e public.competition_series_events%rowtype;
  s public.competition_series%rowtype;
  d record;
  a uuid;
  op text:=upper(p_operation);
  prior jsonb;
  result jsonb;
  comp jsonb;
  terminal integer;
  completed integer;
  active_count integer;
  v_reason text:=nullif(btrim(p_payload->>'reason'),'');
  ns timestamptz;
  ne timestamptz;
  ntz text;
  nvenue text;
  naddress text;
begin
  prior:=public.competition_event_begin_command(p_club_id,p_event_id,p_revision,op,p_key,p_payload);
  if prior is not null then return prior; end if;
  select * into e from public.competition_series_events event where event.id=p_event_id and event.club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  a:=public.require_competition_event_access(p_club_id,true);
  select * into s from public.competition_series series where series.id=e.series_id and series.club_id=e.club_id and series.season_id=e.season_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if (e.archived_at is not null and op<>'ARCHIVE') or s.archived_at is not null or s.status in ('CLOSED','CANCELLED') then raise exception 'Agregado inmutable.' using errcode='23514'; end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  if op='SCHEDULE' then
    if s.status<>'ACTIVE' or e.status<>'DRAFT' then raise exception 'Scheduling no permitido.' using errcode='23514'; end if;
    comp:=public.get_competition_series_event_completeness(p_club_id,e.id);
    if (comp->'blockers')::text like '%EVENT_RULE_CHANGED:%' then raise exception 'EVENT_RULE_CHANGED' using errcode='23505'; end if;
    if not (comp->>'complete')::boolean then raise exception 'Evento incompleto: %',comp->'blockers' using errcode='23514'; end if;
    if exists(select 1 from public.competition_series_event_divisions division where division.event_id=e.id and (not division.is_active or division.removed_at is not null) and division.status<>'DRAFT')
       or exists(select 1 from public.competition_series_event_divisions division where division.event_id=e.id and division.is_active and (division.status<>'DRAFT' or division.removed_at is not null or division.configuration_snapshot is not null or division.frozen_at is not null)) then
      raise exception 'EVENT_DIVISIONS_NOT_DRAFT' using errcode='23514';
    end if;
    perform set_config('selpa.competition_event_schedule','allowed',true);
    for d in
      select division.*,rule.version,tier.code tier_code,tier.name tier_name,tier.is_master_final,tier.points_multiplier,tier.is_active tier_active,
        eligibility.id eligibility_id,eligibility.revision eligibility_revision,to_jsonb(eligibility) eligibility_snapshot,series_division.division_snapshot
      from public.competition_series_event_divisions division
      join public.competition_series_rules rule on rule.id=division.series_rule_id
      join public.competition_series_divisions series_division on series_division.id=division.series_division_id
      left join public.competition_event_tiers tier on tier.id=division.event_tier_id
      left join public.competition_series_eligibility eligibility on eligibility.series_rule_id=rule.id
      where division.event_id=e.id and division.is_active and division.status='DRAFT' and division.removed_at is null
        and division.configuration_snapshot is null and division.frozen_at is null
      for update of division
    loop
      update public.competition_series_event_divisions division set
        status='SCHEDULED',frozen_at=now(),
        configuration_snapshot=jsonb_strip_nulls(jsonb_build_object(
          'rule_id',d.series_rule_id,'rule_version',d.version,'eligibility_id',d.eligibility_id,
          'eligibility_revision',d.eligibility_revision,'eligibility',d.eligibility_snapshot,
          'tier_id',d.event_tier_id,'tier_code',d.tier_code,'tier_name',d.tier_name,
          'tier_is_master_final',d.is_master_final,'effective_points_scheme_id',d.points_scheme_override_id,
          'effective_multiplier',coalesce(d.points_multiplier_override,d.points_multiplier),
          'scoring_mode',d.scoring_mode,'division',d.division_snapshot,'frozen_at',now()
        )),revision=division.revision+1,updated_at=now()
      where division.id=d.id;
    end loop;
    update public.competition_series_events event set status='SCHEDULED',scheduled_by=a,scheduled_at=now(),revision=event.revision+1,updated_at=now() where event.id=e.id returning * into e;
    perform set_config('selpa.competition_event_schedule','',true);
  elsif op='RESCHEDULE' then
    if s.status<>'ACTIVE' or e.status<>'SCHEDULED' or v_reason is null then raise exception 'Reprogramación no permitida.' using errcode='23514'; end if;
    ns:=case when p_payload ? 'planned_starts_at' then (p_payload->>'planned_starts_at')::timestamptz else e.planned_starts_at end;
    ne:=case when p_payload ? 'planned_ends_at' then (p_payload->>'planned_ends_at')::timestamptz else e.planned_ends_at end;
    ntz:=case when p_payload ? 'timezone' then nullif(btrim(p_payload->>'timezone'),'') else e.timezone end;
    nvenue:=case when p_payload ? 'venue_name' then nullif(btrim(p_payload->>'venue_name'),'') else e.venue_name end;
    naddress:=case when p_payload ? 'venue_address' then nullif(btrim(p_payload->>'venue_address'),'') else e.venue_address end;
    if ns is null or ne is null or ne<ns or ntz is null or not exists(select 1 from pg_catalog.pg_timezone_names zone where zone.name=ntz) then raise exception 'Planificación inválida.' using errcode='22023'; end if;
    perform set_config('selpa.competition_event_history_insert','allowed',true);
    insert into public.competition_series_event_schedule_history(
      club_id,event_id,previous_planned_starts_at,previous_planned_ends_at,new_planned_starts_at,new_planned_ends_at,
      previous_timezone,new_timezone,previous_venue_name,new_venue_name,previous_venue_address,new_venue_address,
      reason,changed_by,resulting_event_revision
    ) values(e.club_id,e.id,e.planned_starts_at,e.planned_ends_at,ns,ne,e.timezone,ntz,e.venue_name,nvenue,e.venue_address,naddress,v_reason,a,e.revision+1);
    perform set_config('selpa.competition_event_history_insert','',true);
    update public.competition_series_events event set planned_starts_at=ns,planned_ends_at=ne,timezone=ntz,venue_name=nvenue,venue_address=naddress,revision=event.revision+1,updated_at=now() where event.id=e.id returning * into e;
  elsif op='COMPLETE_DIVISION' or op='CANCEL_DIVISION' then
    if s.status<>'ACTIVE' or e.status<>'SCHEDULED' then raise exception 'Lifecycle no permitido.' using errcode='23514'; end if;
    select * into d from public.competition_series_event_divisions division where division.id=(p_payload->>'division_id')::uuid and division.event_id=e.id and division.is_active and division.status='SCHEDULED' for update;
    if not found then raise exception 'División no programada.' using errcode='P0002'; end if;
    if op='CANCEL_DIVISION' and v_reason is null then raise exception 'Motivo obligatorio.' using errcode='22023'; end if;
    update public.competition_series_event_divisions division set
      status=case when op='COMPLETE_DIVISION' then 'COMPLETED' else 'CANCELLED' end,
      completed_by=case when op='COMPLETE_DIVISION' then a end,completed_at=case when op='COMPLETE_DIVISION' then now() end,
      cancelled_by=case when op='CANCEL_DIVISION' then a end,cancelled_at=case when op='CANCEL_DIVISION' then now() end,
      cancellation_reason=case when op='CANCEL_DIVISION' then v_reason end,revision=division.revision+1,updated_at=now()
    where division.id=d.id;
    select count(*) filter(where division.status in ('COMPLETED','CANCELLED')),count(*) filter(where division.status='COMPLETED'),count(*)
      into terminal,completed,active_count from public.competition_series_event_divisions division where division.event_id=e.id and division.is_active;
    update public.competition_series_events event set
      status=case when terminal=active_count and completed=0 then 'CANCELLED' else event.status end,
      cancelled_by=case when terminal=active_count and completed=0 then a else event.cancelled_by end,
      cancelled_at=case when terminal=active_count and completed=0 then now() else event.cancelled_at end,
      cancellation_reason=case when terminal=active_count and completed=0 then 'Todas las divisiones fueron canceladas.' else event.cancellation_reason end,
      revision=event.revision+1,updated_at=now()
    where event.id=e.id returning * into e;
  elsif op='COMPLETE' then
    if s.status<>'ACTIVE' or e.status<>'SCHEDULED' then raise exception 'Finalización no permitida.' using errcode='23514'; end if;
    select count(*) filter(where division.status in ('COMPLETED','CANCELLED')),count(*) filter(where division.status='COMPLETED'),count(*)
      into terminal,completed,active_count from public.competition_series_event_divisions division where division.event_id=e.id and division.is_active;
    if active_count=0 or terminal<>active_count or completed=0 then raise exception 'Divisiones pendientes.' using errcode='23514'; end if;
    update public.competition_series_events event set status='COMPLETED',completed_by=a,completed_at=now(),revision=event.revision+1,updated_at=now() where event.id=e.id returning * into e;
  elsif op='CANCEL' then
    if s.status<>'ACTIVE' or e.status not in ('DRAFT','SCHEDULED') or v_reason is null then raise exception 'Cancelación no permitida.' using errcode='23514'; end if;
    if exists(select 1 from public.competition_series_event_divisions division where division.event_id=e.id and division.is_active and division.status='COMPLETED') then raise exception 'Evento con divisiones completadas.' using errcode='23514'; end if;
    update public.competition_series_event_tournament_links link set status='REMOVED',ended_at=now(),ended_by=a,reason=v_reason,revision=link.revision+1,updated_at=now()
      where link.status='ACTIVE' and exists(select 1 from public.competition_series_event_divisions division where division.id=link.event_division_id and division.event_id=e.id and division.is_active);
    update public.competition_series_event_divisions division set status='CANCELLED',cancelled_by=a,cancelled_at=now(),cancellation_reason=v_reason,revision=division.revision+1,updated_at=now()
      where division.event_id=e.id and division.is_active and division.status in ('DRAFT','SCHEDULED');
    update public.competition_series_events event set status='CANCELLED',cancelled_by=a,cancelled_at=now(),cancellation_reason=v_reason,revision=event.revision+1,updated_at=now()
      where event.id=e.id returning * into e;
  elsif op='ARCHIVE' then
    if e.status not in ('COMPLETED','CANCELLED') then raise exception 'Solo eventos terminales.' using errcode='23514'; end if;
    if e.archived_at is not null then
      result:=jsonb_build_object('event_id',e.id,'status',e.status,'revision',e.revision,'archived_at',e.archived_at);
      perform public.competition_event_finish_command(p_club_id,e.id,op,p_key,p_payload,result);
      return result;
    end if;
    update public.competition_series_events event set archived_by=a,archived_at=now(),revision=event.revision+1,updated_at=now() where event.id=e.id returning * into e;
  else
    raise exception 'Operación inválida.' using errcode='22023';
  end if;
  result:=jsonb_build_object('event_id',e.id,'status',e.status,'revision',e.revision,'archived_at',e.archived_at);
  perform public.competition_event_finish_command(p_club_id,e.id,op,p_key,p_payload,result);
  return result;
end
$$;

revoke all on function public.transition_competition_series_event(uuid,uuid,integer,text,text,jsonb) from public,anon;
grant execute on function public.transition_competition_series_event(uuid,uuid,integer,text,text,jsonb) to authenticated,service_role;

comment on function public.transition_competition_series_event(uuid,uuid,integer,text,text,jsonb)
is 'Stage 5A.3 lifecycle atomico. v_reason evita colisiones PL/pgSQL con columnas reason y todas las columnas SQL se califican por alias.';

commit;
