begin;

do $$
begin
  if to_regprocedure('public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[])') is null
     or to_regclass('public.club_venues') is null
     or to_regclass('public.venue_courts') is null then
    raise exception 'Esta corrección requiere Tournament Venues P0 aplicado.';
  end if;
end $$;

-- P0: any active SELPA venue/court can be selected for a tournament. The
-- allow_external_tournaments flags remain reserved for the future approval model.
create or replace function public.tg_tournament_venue_assignment_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare venue public.tournament_venues%rowtype; court public.venue_courts%rowtype; court_venue public.club_venues%rowtype;
begin
  select * into venue from public.tournament_venues where id = new.tournament_venue_id;
  select * into court from public.venue_courts where id = new.court_id;
  select * into court_venue from public.club_venues where id = court.venue_id;
  if venue.tournament_id is distinct from new.tournament_id then
    raise exception 'La cancha debe asignarse al predio del mismo torneo.' using errcode = '23514';
  end if;
  if court.venue_id is distinct from venue.venue_id then
    raise exception 'La cancha no pertenece al predio indicado.' using errcode = '23514';
  end if;
  if new.status = 'ACTIVE' and (not court.is_active or not court_venue.is_active) then
    raise exception 'La cancha o el predio no están activos.' using errcode = '23514';
  end if;
  return new;
end $$;

drop policy if exists club_venues_read_eligible on public.club_venues;
create policy club_venues_read_eligible on public.club_venues for select to authenticated
using (is_active and exists (
  select 1 from public.venue_courts court
  where court.venue_id = club_venues.id and court.is_active
));

drop policy if exists venue_courts_read_eligible on public.venue_courts;
create policy venue_courts_read_eligible on public.venue_courts for select to authenticated
using (is_active and exists (
  select 1 from public.club_venues venue
  where venue.id = venue_courts.venue_id and venue.is_active
));

create or replace function public.replace_tournament_court_assignments(
  p_club_id uuid,
  p_tournament_id uuid,
  p_primary_venue_id uuid,
  p_court_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid := auth.uid(); tournament public.tournaments%rowtype; primary_venue public.club_venues%rowtype;
  item record; venue_link public.tournament_venues%rowtype; selected_count integer := 0;
begin
  if actor is null then raise exception 'Sesión requerida.' using errcode = '28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'tournaments:update') then
    raise exception 'Sin permiso para configurar canchas del torneo.' using errcode = '42501';
  end if;
  select * into tournament from public.tournaments where id = p_tournament_id and club_id = p_club_id for update;
  if not found then raise exception 'Torneo no encontrado.' using errcode = 'P0002'; end if;
  if tournament.status not in ('DRAFT', 'OPEN') then raise exception 'No se pueden cambiar canchas en este estado.' using errcode = '23514'; end if;
  select * into primary_venue from public.club_venues where id = p_primary_venue_id and club_id = p_club_id and is_active for update;
  if not found then raise exception 'La sede principal debe ser un predio activo del club organizador.' using errcode = '23514'; end if;
  if coalesce(array_length(p_court_ids, 1), 0) <> coalesce((select count(distinct court_id) from unnest(coalesce(p_court_ids, '{}'::uuid[])) court_id), 0) then
    raise exception 'Una cancha no puede seleccionarse más de una vez.' using errcode = '23505';
  end if;
  if coalesce(array_length(p_court_ids, 1), 0) <> (select count(*) from public.venue_courts where id = any(coalesce(p_court_ids, '{}'::uuid[]))) then
    raise exception 'Una cancha seleccionada no existe.' using errcode = 'P0002';
  end if;
  update public.tournament_court_assignments set status = 'REMOVED' where tournament_id = tournament.id and status = 'ACTIVE';
  update public.tournament_venues set status = 'REMOVED', is_primary = false where tournament_id = tournament.id and status = 'ACTIVE';
  insert into public.tournament_venues(tournament_id, venue_id, is_primary, status, sort_order)
  values (tournament.id, primary_venue.id, true, 'ACTIVE', 0)
  on conflict (tournament_id, venue_id) do update set status = 'ACTIVE', is_primary = true, sort_order = 0
  returning * into venue_link;
  for item in
    select court.id court_id, court.name court_name, court.surface, court.is_covered, court.has_lighting,
      venue.id venue_id, venue.club_id venue_club_id, venue.name venue_name,
      court.is_active court_active, venue.is_active venue_active
    from public.venue_courts court join public.club_venues venue on venue.id = court.venue_id
    where court.id = any(coalesce(p_court_ids, '{}'::uuid[]))
    order by venue.id, court.sort_order, court.id
  loop
    if not item.venue_active or not item.court_active then raise exception 'La cancha o el predio no están activos.' using errcode = '23514'; end if;
    insert into public.tournament_venues(tournament_id, venue_id, is_primary, status, sort_order)
    values (tournament.id, item.venue_id, item.venue_id = primary_venue.id, 'ACTIVE', case when item.venue_id = primary_venue.id then 0 else 1 end)
    on conflict (tournament_id, venue_id) do update set status = 'ACTIVE', is_primary = excluded.is_primary, sort_order = excluded.sort_order
    returning * into venue_link;
    insert into public.tournament_court_assignments(tournament_id, tournament_venue_id, court_id, status, sort_order, court_snapshot)
    values (tournament.id, venue_link.id, item.court_id, 'ACTIVE', selected_count, jsonb_build_object(
      'name', item.court_name, 'venue_name', item.venue_name, 'surface', item.surface, 'is_covered', item.is_covered, 'has_lighting', item.has_lighting
    )) on conflict (tournament_id, court_id) do update set status = 'ACTIVE', tournament_venue_id = excluded.tournament_venue_id,
      sort_order = excluded.sort_order, court_snapshot = excluded.court_snapshot;
    selected_count := selected_count + 1;
  end loop;
  update public.tournaments set rules_json = coalesce(rules_json, '{}'::jsonb) || jsonb_build_object('venue_name', primary_venue.name, 'tournament_courts', coalesce((
    select jsonb_agg(jsonb_build_object('id', assignment.court_id, 'name', assignment.court_snapshot->>'name', 'complex_name', assignment.court_snapshot->>'venue_name',
      'source', case when venue.club_id = tournament.club_id then 'OWN_CLUB' else 'EXTERNAL_COMPLEX' end) order by assignment.sort_order)
    from public.tournament_court_assignments assignment join public.tournament_venues tournament_venue on tournament_venue.id = assignment.tournament_venue_id
    join public.club_venues venue on venue.id = tournament_venue.venue_id where assignment.tournament_id = tournament.id and assignment.status = 'ACTIVE'
  ), '[]'::jsonb)), rules = coalesce(rules_json, '{}'::jsonb) || jsonb_build_object('venue_name', primary_venue.name, 'tournament_courts', coalesce((
    select jsonb_agg(jsonb_build_object('id', assignment.court_id, 'name', assignment.court_snapshot->>'name', 'complex_name', assignment.court_snapshot->>'venue_name',
      'source', case when venue.club_id = tournament.club_id then 'OWN_CLUB' else 'EXTERNAL_COMPLEX' end) order by assignment.sort_order)
    from public.tournament_court_assignments assignment join public.tournament_venues tournament_venue on tournament_venue.id = assignment.tournament_venue_id
    join public.club_venues venue on venue.id = tournament_venue.venue_id where assignment.tournament_id = tournament.id and assignment.status = 'ACTIVE'
  ), '[]'::jsonb)), updated_at = now() where id = tournament.id;
  return jsonb_build_object('tournament_id', tournament.id, 'primary_venue_id', primary_venue.id, 'courts_selected', selected_count);
end $$;

comment on function public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[]) is
  'P0 canonical assignment: active courts from any SELPA venue are selectable; external approval flags are reserved for a future phase.';

commit;
