-- Hard-delete is intentionally limited to an unstarted DRAFT aggregate.
-- Any operational or historical dependency preserves the circuit instead.
begin;

create or replace function public.delete_competition_series_draft_atomic(
  p_club_id uuid,
  p_series_id uuid,
  p_revision integer,
  p_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_series public.competition_series%rowtype;
begin
  perform public.require_competition_series_access(p_club_id, 'ranking:manage', true);

  if btrim(coalesce(p_confirmation, '')) <> 'ACEPTAR' then
    raise exception 'SERIES_DELETE_CONFIRMATION_REQUIRED' using errcode = '22023';
  end if;

  select * into v_series
  from public.competition_series series
  where series.club_id = p_club_id and series.id = p_series_id
  for update;

  if not found then raise exception 'SERIES_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_series.revision <> p_revision then raise exception 'STALE_REVISION' using errcode = '40001'; end if;
  if v_series.status <> 'DRAFT' or v_series.archived_at is not null then
    raise exception 'SERIES_DELETE_BLOCKED' using errcode = 'P0001';
  end if;

  -- Never remove an event or any of its downstream history to make deletion pass.
  if exists (select 1 from public.competition_series_events event where event.club_id = p_club_id and event.series_id = p_series_id)
     or exists (
       select 1 from public.competition_series_event_tournament_links link
       join public.competition_series_events event on event.id = link.event_id and event.club_id = link.club_id
       where event.club_id = p_club_id and event.series_id = p_series_id
     )
     or exists (
       select 1 from public.competition_event_homologations homologation
       join public.competition_series_events event on event.id = homologation.event_id and event.club_id = homologation.club_id
       where event.club_id = p_club_id and event.series_id = p_series_id
     )
     or exists (
       select 1 from public.competition_event_settlements settlement
       join public.competition_series_events event on event.id = settlement.event_id and event.club_id = settlement.club_id
       where event.club_id = p_club_id and event.series_id = p_series_id
     )
     or exists (
       select 1 from public.competition_point_transactions ledger
       where ledger.club_id = p_club_id
         and ledger.metadata ->> 'event_id' in (
           select event.id::text from public.competition_series_events event
           where event.club_id = p_club_id and event.series_id = p_series_id
         )
     ) then
    raise exception 'SERIES_DELETE_BLOCKED' using errcode = 'P0001';
  end if;

  perform set_config('selpa.competition_series_write', 'allowed', true);
  delete from public.competition_series_prizes prize
  where prize.club_id = p_club_id and prize.series_id = p_series_id;
  delete from public.competition_series_eligibility eligibility
  using public.competition_series_rules rule, public.competition_series_divisions division
  where eligibility.series_rule_id = rule.id and rule.series_division_id = division.id
    and division.club_id = p_club_id and division.series_id = p_series_id;
  delete from public.competition_series_rules rule
  using public.competition_series_divisions division
  where rule.series_division_id = division.id
    and division.club_id = p_club_id and division.series_id = p_series_id;
  delete from public.competition_series_divisions division
  where division.club_id = p_club_id and division.series_id = p_series_id;
  delete from public.competition_series_create_commands command
  where command.club_id = p_club_id
    and command.response_payload ->> 'series_id' = p_series_id::text;
  delete from public.competition_series
  where club_id = p_club_id and id = p_series_id;

  return jsonb_build_object('ok', true, 'deleted', true, 'series_id', p_series_id);
end;
$$;

revoke all on function public.delete_competition_series_draft_atomic(uuid, uuid, integer, text) from public, anon;
grant execute on function public.delete_competition_series_draft_atomic(uuid, uuid, integer, text) to authenticated, service_role;

comment on function public.delete_competition_series_draft_atomic(uuid, uuid, integer, text)
is 'Atomically removes only a DRAFT Competition Series with no events or protected history.';

notify pgrst, 'reload schema';

commit;
