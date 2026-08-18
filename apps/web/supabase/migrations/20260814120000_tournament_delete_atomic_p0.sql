-- P0: hard-delete transaccional solo para borradores sin historia deportiva.
create or replace function public.delete_tournament_draft_atomic(
  p_club_id uuid,
  p_tournament_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_tournament public.tournaments%rowtype;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  if not public.has_club_capability(p_club_id, 'tournaments:delete') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id and club_id = p_club_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tournament.status <> 'DRAFT' then
    raise exception 'TOURNAMENT_DELETE_BLOCKED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.competition_series_event_tournament_links link
    where link.tournament_id = p_tournament_id
  ) or exists (
    select 1
    from public.competition_event_homologations homologation
    where homologation.tournament_id = p_tournament_id
  ) then
    raise exception 'TOURNAMENT_DELETE_BLOCKED' using errcode = 'P0001';
  end if;

  -- Dependencias de un DRAFT sin actividad competitiva. La función completa
  -- se ejecuta en la transacción de la RPC: cualquier fallo revierte todo.
  delete from public.tournament_court_assignments where tournament_id = p_tournament_id;
  delete from public.tournament_venues where tournament_id = p_tournament_id;
  delete from public.payments where tournament_id = p_tournament_id;
  delete from public.tournament_team_seed_snapshots where tournament_id = p_tournament_id;
  delete from public.tournament_matches where tournament_id = p_tournament_id;
  delete from public.tournament_group_teams where tournament_id = p_tournament_id;
  delete from public.tournament_groups where tournament_id = p_tournament_id;
  delete from public.tournament_registrations where tournament_id = p_tournament_id;
  delete from public.tournament_teams where tournament_id = p_tournament_id;
  delete from public.tournaments where id = p_tournament_id and club_id = p_club_id;

  return jsonb_build_object('ok', true, 'deleted', true, 'tournament_id', p_tournament_id);
end;
$$;

revoke all on function public.delete_tournament_draft_atomic(uuid, uuid) from public, anon;
grant execute on function public.delete_tournament_draft_atomic(uuid, uuid) to authenticated, service_role;

comment on function public.delete_tournament_draft_atomic(uuid, uuid) is
  'Atomically removes a DRAFT tournament and disposable dependencies; refuses Competition-linked or homologated history.';
