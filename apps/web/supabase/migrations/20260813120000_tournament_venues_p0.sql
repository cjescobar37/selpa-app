begin;

do $$
begin
  if to_regclass('public.clubs') is null or to_regclass('public.tournaments') is null then
    raise exception 'Tournament venues P0 requiere clubs y tournaments.';
  end if;
  if to_regprocedure('public.has_club_capability(uuid,text)') is null then
    raise exception 'Tournament venues P0 requiere has_club_capability(uuid,text).';
  end if;
end $$;

-- Physical venues. Do not reuse public.club_facilities: that table remains the public-profile services catalog.
create table public.club_venues (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  address text,
  city text,
  province text,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  is_primary boolean not null default false,
  is_active boolean not null default true,
  allow_external_tournaments boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name)
);

create unique index club_venues_one_active_primary_idx
  on public.club_venues(club_id) where is_primary and is_active;
create index club_venues_external_lookup_idx
  on public.club_venues(is_active, allow_external_tournaments, name)
  where is_active and allow_external_tournaments;

create or replace function public.tg_club_venue_validate()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names zone where zone.name = new.timezone) then
    raise exception 'Timezone inválida.' using errcode = '22023';
  end if;
  return new;
end $$;

create table public.venue_courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.club_venues(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  surface text,
  is_covered boolean,
  has_lighting boolean,
  is_active boolean not null default true,
  allow_external_tournaments boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, name)
);

create index venue_courts_active_lookup_idx
  on public.venue_courts(venue_id, sort_order, name) where is_active;

create table public.tournament_venues (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  venue_id uuid not null references public.club_venues(id) on delete restrict,
  is_primary boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REMOVED')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, venue_id)
);

create unique index tournament_venues_one_active_primary_idx
  on public.tournament_venues(tournament_id) where is_primary and status = 'ACTIVE';
create index tournament_venues_tournament_active_idx
  on public.tournament_venues(tournament_id, sort_order) where status = 'ACTIVE';

create table public.tournament_court_assignments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  tournament_venue_id uuid not null references public.tournament_venues(id) on delete restrict,
  court_id uuid not null references public.venue_courts(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REMOVED')),
  sort_order integer not null default 0 check (sort_order >= 0),
  court_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(court_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, court_id)
);

create unique index tournament_court_assignments_active_court_idx
  on public.tournament_court_assignments(tournament_id, court_id) where status = 'ACTIVE';
create index tournament_court_assignments_tournament_active_idx
  on public.tournament_court_assignments(tournament_id, sort_order) where status = 'ACTIVE';

create or replace function public.tg_tournament_venue_assignment_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare venue public.tournament_venues%rowtype; court public.venue_courts%rowtype; court_venue public.club_venues%rowtype; organizer_id uuid;
begin
  select * into venue from public.tournament_venues where id = new.tournament_venue_id;
  select * into court from public.venue_courts where id = new.court_id;
  select * into court_venue from public.club_venues where id = court.venue_id;
  select club_id into organizer_id from public.tournaments where id = new.tournament_id;
  if venue.tournament_id is distinct from new.tournament_id then
    raise exception 'La cancha debe asignarse al venue del mismo torneo.' using errcode = '23514';
  end if;
  if court.venue_id is distinct from venue.venue_id then
    raise exception 'La cancha no pertenece al predio indicado.' using errcode = '23514';
  end if;
  if new.status = 'ACTIVE' and (not court.is_active or not court_venue.is_active) then
    raise exception 'La cancha o el predio no están activos.' using errcode = '23514';
  end if;
  if new.status = 'ACTIVE' and court_venue.club_id <> organizer_id and (not court_venue.allow_external_tournaments or not court.allow_external_tournaments) then
    raise exception 'La cancha externa no está habilitada para torneos de otros clubes.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_tournament_court_assignment_integrity
before insert or update of tournament_id, tournament_venue_id, court_id on public.tournament_court_assignments
for each row execute function public.tg_tournament_venue_assignment_integrity();

create trigger trg_club_venues_updated_at before update on public.club_venues
for each row execute function public.set_updated_at();
create trigger trg_club_venues_validate before insert or update of timezone on public.club_venues
for each row execute function public.tg_club_venue_validate();
create trigger trg_venue_courts_updated_at before update on public.venue_courts
for each row execute function public.set_updated_at();
create trigger trg_tournament_venues_updated_at before update on public.tournament_venues
for each row execute function public.set_updated_at();
create trigger trg_tournament_court_assignments_updated_at before update on public.tournament_court_assignments
for each row execute function public.set_updated_at();

-- One primary physical venue per club, with courts generated once from the legacy aggregate.
insert into public.club_venues (club_id, name, address, city, province, is_primary, is_active, allow_external_tournaments, sort_order)
select club.id, club.name, nullif(btrim(club.address), ''), nullif(btrim(club.city), ''), nullif(btrim(club.province), ''),
  not exists (select 1 from public.club_venues venue where venue.club_id = club.id and venue.is_primary and venue.is_active),
  coalesce(club.is_active, true), false, 0
from public.clubs club
on conflict (club_id, name) do nothing;

insert into public.venue_courts (venue_id, name, sort_order, surface, is_active, allow_external_tournaments)
select venue.id, format('Cancha %s', series.number), series.number - 1, nullif(btrim(club.courts_surface), ''), true, false
from public.clubs club
join public.club_venues venue on venue.club_id = club.id and venue.is_primary and venue.is_active
cross join lateral generate_series(1, greatest(coalesce(club.courts_count, 0), 0)) as series(number)
on conflict (venue_id, name) do nothing;

alter table public.club_venues enable row level security;
alter table public.venue_courts enable row level security;
alter table public.tournament_venues enable row level security;
alter table public.tournament_court_assignments enable row level security;

create policy club_venues_read_eligible on public.club_venues for select to authenticated
using (is_active and (allow_external_tournaments or public.has_club_capability(club_id, 'tournaments:view')));
create policy club_venues_manage_owner on public.club_venues for all to authenticated
using (public.has_club_capability(club_id, 'club:update'))
with check (public.has_club_capability(club_id, 'club:update'));
create policy venue_courts_read_eligible on public.venue_courts for select to authenticated
using (is_active and exists (
  select 1 from public.club_venues venue
  where venue.id = venue_courts.venue_id and venue.is_active
    and (venue.allow_external_tournaments or public.has_club_capability(venue.club_id, 'tournaments:view'))
));
create policy venue_courts_manage_owner on public.venue_courts for all to authenticated
using (exists (select 1 from public.club_venues venue where venue.id = venue_courts.venue_id and public.has_club_capability(venue.club_id, 'club:update')))
with check (exists (select 1 from public.club_venues venue where venue.id = venue_courts.venue_id and public.has_club_capability(venue.club_id, 'club:update')));
create policy tournament_venues_read_manager on public.tournament_venues for select to authenticated
using (exists (select 1 from public.tournaments tournament where tournament.id = tournament_venues.tournament_id and public.has_club_capability(tournament.club_id, 'tournaments:view')));
create policy tournament_court_assignments_read_manager on public.tournament_court_assignments for select to authenticated
using (exists (select 1 from public.tournaments tournament where tournament.id = tournament_court_assignments.tournament_id and public.has_club_capability(tournament.club_id, 'tournaments:view')));

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
      venue.id venue_id, venue.club_id venue_club_id, venue.name venue_name, venue.allow_external_tournaments venue_external,
      court.allow_external_tournaments court_external, court.is_active court_active, venue.is_active venue_active
    from public.venue_courts court join public.club_venues venue on venue.id = court.venue_id
    where court.id = any(coalesce(p_court_ids, '{}'::uuid[]))
    order by venue.id, court.sort_order, court.id
  loop
    if not item.venue_active or not item.court_active then raise exception 'La cancha o el predio no están activos.' using errcode = '23514'; end if;
    if item.venue_club_id <> tournament.club_id and (not item.venue_external or not item.court_external) then
      raise exception 'La cancha externa no está habilitada para torneos de otros clubes.' using errcode = '42501';
    end if;
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

revoke all on public.club_venues, public.venue_courts, public.tournament_venues, public.tournament_court_assignments from public, anon;
grant select, insert, update, delete on public.club_venues, public.venue_courts to authenticated;
grant select on public.tournament_venues, public.tournament_court_assignments to authenticated;
grant select, insert, update, delete on public.club_venues, public.venue_courts, public.tournament_venues, public.tournament_court_assignments to service_role;
revoke all on function public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[]) from public, anon;
grant execute on function public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[]) to authenticated, service_role;

comment on table public.club_venues is 'Physical playing venues. public.club_facilities remains the profile services catalog.';
comment on function public.replace_tournament_court_assignments(uuid,uuid,uuid,uuid[]) is 'Canonical atomic assignment of existing venue courts to a tournament; updates rules_json only as a legacy compatibility snapshot.';

commit;
