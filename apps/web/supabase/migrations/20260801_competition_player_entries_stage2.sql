begin;

do $$
begin
  if to_regclass('public.competition_divisions') is null then
    raise exception 'Primero debe aplicarse 20260731_competition_engine_stage1.sql';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_info
    where constraint_info.conrelid = 'public.club_players'::regclass
      and constraint_info.conname = 'club_players_club_id_id_key'
  ) then
    alter table public.club_players
      add constraint club_players_club_id_id_key unique (club_id, id);
  end if;
end
$$;

create table if not exists public.competition_player_entries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  division_id uuid not null,
  club_player_id uuid not null,
  status text not null default 'ACTIVE',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  assignment_type text not null default 'MANUAL',
  previous_entry_id uuid references public.competition_player_entries(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_player_entries_club_player_fkey foreign key (club_id, club_player_id)
    references public.club_players(club_id, id) on delete restrict,
  constraint competition_player_entries_division_fkey foreign key (club_id, division_id)
    references public.competition_divisions(club_id, id) on delete restrict,
  constraint competition_player_entries_status_chk check (
    status in ('ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'TRANSFERRED')
  ),
  constraint competition_player_entries_assignment_type_chk check (
    assignment_type in ('MANUAL', 'LEGACY_BACKFILL', 'PROMOTION', 'RELEGATION', 'CORRECTION', 'IMPORT')
  ),
  constraint competition_player_entries_dates_chk check (
    valid_until is null or valid_until >= valid_from
  ),
  constraint competition_player_entries_active_dates_chk check (
    status <> 'ACTIVE' or valid_until is null
  ),
  constraint competition_player_entries_terminal_dates_chk check (
    status not in ('TRANSFERRED', 'WITHDRAWN') or valid_until is not null
  ),
  constraint competition_player_entries_previous_not_self_chk check (
    previous_entry_id is null or previous_entry_id <> id
  ),
  constraint competition_player_entries_metadata_chk check (jsonb_typeof(metadata) = 'object')
);

create index if not exists competition_player_entries_club_idx
  on public.competition_player_entries (club_id);

create index if not exists competition_player_entries_division_status_idx
  on public.competition_player_entries (division_id, status);

create index if not exists competition_player_entries_player_status_idx
  on public.competition_player_entries (club_player_id, status);

create index if not exists competition_player_entries_player_history_idx
  on public.competition_player_entries (club_player_id, valid_from desc);

create index if not exists competition_player_entries_current_idx
  on public.competition_player_entries (club_id, club_player_id, division_id)
  where valid_until is null and status in ('ACTIVE', 'SUSPENDED');

create unique index if not exists competition_player_entries_current_division_uidx
  on public.competition_player_entries (division_id, club_player_id)
  where valid_until is null and status in ('ACTIVE', 'SUSPENDED');

create or replace function public.competition_player_entry_event(
  p_metadata jsonb,
  p_event_type text,
  p_actor_id uuid,
  p_effective_at timestamptz,
  p_reason text default null
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_set(
    coalesce(p_metadata, '{}'::jsonb),
    '{events}',
    coalesce(p_metadata->'events', '[]'::jsonb) || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'type', p_event_type,
        'actor_id', p_actor_id,
        'effective_at', p_effective_at,
        'reason', nullif(btrim(coalesce(p_reason, '')), '')
      ))
    ),
    true
  );
$$;

create or replace function public.validate_competition_player_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_division record;
  v_previous record;
  v_route_lock text;
begin
  select
    division.club_id,
    division.season_id,
    division.modality,
    division.branch_id,
    division.segment_id,
    division.category_id,
    division.is_active,
    season.status as season_status
  into v_division
  from public.competition_divisions division
  join public.competition_seasons season
    on season.id = division.season_id and season.club_id = division.club_id
  where division.id = new.division_id and division.club_id = new.club_id;

  if not found then
    raise exception 'La división no pertenece al club indicado.' using errcode = '23503';
  end if;

  if v_division.modality <> 'INDIVIDUAL' then
    raise exception 'competition_player_entries solo admite divisiones INDIVIDUAL.' using errcode = '23514';
  end if;

  if new.status = 'ACTIVE' and new.valid_until is null then
    if v_division.season_status not in ('DRAFT', 'ACTIVE') then
      raise exception 'La temporada no admite una entrada ACTIVE.' using errcode = '23514';
    end if;
    if not v_division.is_active then
      raise exception 'La división inactiva no admite una entrada ACTIVE.' using errcode = '23514';
    end if;
  end if;

  if not exists (
    select 1 from public.club_players player
    where player.id = new.club_player_id and player.club_id = new.club_id
  ) then
    raise exception 'El jugador no pertenece al club indicado.' using errcode = '23503';
  end if;

  v_route_lock := concat_ws(
    ':', new.club_id::text, new.club_player_id::text, v_division.season_id::text,
    v_division.branch_id::text, coalesce(v_division.segment_id::text, '(NULL)')
  );
  perform pg_advisory_xact_lock(hashtextextended(v_route_lock, 0));

  if new.previous_entry_id is not null then
    select
      previous_entry.id,
      previous_entry.club_id,
      previous_entry.club_player_id,
      previous_entry.valid_from,
      previous_entry.valid_until,
      previous_division.season_id,
      previous_division.branch_id,
      previous_division.segment_id
    into v_previous
    from public.competition_player_entries previous_entry
    join public.competition_divisions previous_division
      on previous_division.id = previous_entry.division_id
     and previous_division.club_id = previous_entry.club_id
    where previous_entry.id = new.previous_entry_id;

    if not found
       or v_previous.club_id <> new.club_id
       or v_previous.club_player_id <> new.club_player_id
       or v_previous.season_id <> v_division.season_id
       or v_previous.branch_id <> v_division.branch_id
       or v_previous.segment_id is distinct from v_division.segment_id then
      raise exception 'previous_entry_id no pertenece al mismo recorrido competitivo.' using errcode = '23514';
    end if;

    if v_previous.valid_until is null or v_previous.valid_until <> new.valid_from then
      raise exception 'previous_entry_id debe estar cerrado exactamente al inicio de la nueva entrada.' using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.competition_player_entries intermediate_entry
      join public.competition_divisions intermediate_division
        on intermediate_division.id = intermediate_entry.division_id
       and intermediate_division.club_id = intermediate_entry.club_id
      where intermediate_entry.club_player_id = new.club_player_id
        and intermediate_entry.club_id = new.club_id
        and intermediate_entry.id <> v_previous.id
        and intermediate_entry.id <> new.id
        and intermediate_division.season_id = v_division.season_id
        and intermediate_division.branch_id = v_division.branch_id
        and intermediate_division.segment_id is not distinct from v_division.segment_id
        and intermediate_entry.valid_from > v_previous.valid_from
        and intermediate_entry.valid_from <= new.valid_from
    ) then
      raise exception 'previous_entry_id no es la entrada inmediatamente anterior.' using errcode = '23514';
    end if;
  end if;

  if new.valid_until is null and new.status in ('ACTIVE', 'SUSPENDED') and exists (
    select 1
    from public.competition_player_entries current_entry
    join public.competition_divisions current_division
      on current_division.id = current_entry.division_id
     and current_division.club_id = current_entry.club_id
    where current_entry.club_id = new.club_id
      and current_entry.club_player_id = new.club_player_id
      and current_entry.id <> new.id
      and current_entry.valid_until is null
      and current_entry.status in ('ACTIVE', 'SUSPENDED')
      and current_division.season_id = v_division.season_id
      and current_division.branch_id = v_division.branch_id
      and current_division.segment_id is not distinct from v_division.segment_id
  ) then
    raise exception 'El jugador ya posee una entrada vigente en el mismo recorrido competitivo.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_competition_player_entry on public.competition_player_entries;
create trigger trg_validate_competition_player_entry
  before insert or update of club_id, division_id, club_player_id, status, valid_from, valid_until, previous_entry_id
  on public.competition_player_entries
  for each row execute function public.validate_competition_player_entry();

drop trigger if exists trg_competition_player_entries_updated_at on public.competition_player_entries;
create trigger trg_competition_player_entries_updated_at
  before update on public.competition_player_entries
  for each row execute function public.set_updated_at();

create or replace function public.assign_player_to_competition_division(
  p_club_id uuid,
  p_club_player_id uuid,
  p_division_id uuid,
  p_assignment_type text default 'MANUAL',
  p_reason text default null,
  p_effective_at timestamptz default now()
)
returns public.competition_player_entries
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_assignment_type text := upper(btrim(coalesce(p_assignment_type, '')));
  v_division record;
  v_current public.competition_player_entries%rowtype;
  v_result public.competition_player_entries%rowtype;
  v_route_lock text;
begin
  if v_actor_id is null then
    raise exception 'Sesión inválida.' using errcode = '28000';
  end if;

  if p_effective_at is null then
    raise exception 'La fecha efectiva es obligatoria.' using errcode = '22023';
  end if;

  if v_assignment_type not in ('MANUAL', 'LEGACY_BACKFILL', 'PROMOTION', 'RELEGATION', 'CORRECTION', 'IMPORT') then
    raise exception 'Tipo de asignación inválido: %', p_assignment_type using errcode = '22023';
  end if;

  if not public.is_platform_admin()
     and not public.has_club_capability(p_club_id, 'ranking:manage') then
    raise exception 'No tenés permisos para gestionar divisiones competitivas.' using errcode = '42501';
  end if;

  perform 1
  from public.club_players player
  where player.id = p_club_player_id and player.club_id = p_club_id
  for update;
  if not found then
    raise exception 'Jugador inexistente en el club.' using errcode = '22023';
  end if;

  select
    division.id,
    division.club_id,
    division.season_id,
    division.modality,
    division.branch_id,
    division.segment_id,
    division.category_id,
    division.is_active,
    season.status as season_status
  into v_division
  from public.competition_divisions division
  join public.competition_seasons season
    on season.id = division.season_id and season.club_id = division.club_id
  where division.id = p_division_id and division.club_id = p_club_id
  for update of division, season;

  if not found then
    raise exception 'División inexistente en el club.' using errcode = '22023';
  end if;
  if v_division.modality <> 'INDIVIDUAL' then
    raise exception 'Solo se pueden asignar jugadores a divisiones INDIVIDUAL.' using errcode = '23514';
  end if;
  if v_division.season_status not in ('DRAFT', 'ACTIVE') then
    raise exception 'La temporada no admite nuevas asignaciones.' using errcode = '23514';
  end if;
  if not v_division.is_active then
    raise exception 'La división está inactiva.' using errcode = '23514';
  end if;

  v_route_lock := concat_ws(
    ':', p_club_id::text, p_club_player_id::text, v_division.season_id::text,
    v_division.branch_id::text, coalesce(v_division.segment_id::text, '(NULL)')
  );
  perform pg_advisory_xact_lock(hashtextextended(v_route_lock, 0));

  select entry.*
  into v_current
  from public.competition_player_entries entry
  join public.competition_divisions current_division
    on current_division.id = entry.division_id and current_division.club_id = entry.club_id
  where entry.club_id = p_club_id
    and entry.club_player_id = p_club_player_id
    and entry.valid_until is null
    and entry.status in ('ACTIVE', 'SUSPENDED')
    and current_division.season_id = v_division.season_id
    and current_division.branch_id = v_division.branch_id
    and current_division.segment_id is not distinct from v_division.segment_id
  order by entry.valid_from desc
  limit 1
  for update of entry;

  if found and v_current.division_id = p_division_id then
    if v_current.status = 'ACTIVE' then
      return v_current;
    end if;

    update public.competition_player_entries entry
    set status = 'ACTIVE',
        reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), entry.reason),
        metadata = public.competition_player_entry_event(
          entry.metadata, 'REACTIVATED', v_actor_id, p_effective_at, p_reason
        )
    where entry.id = v_current.id
    returning entry.* into v_result;
    return v_result;
  end if;

  if found then
    if p_effective_at < v_current.valid_from then
      raise exception 'La fecha efectiva no puede ser anterior a la entrada vigente.' using errcode = '22023';
    end if;

    update public.competition_player_entries entry
    set status = 'TRANSFERRED',
        valid_until = p_effective_at,
        reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), entry.reason),
        metadata = public.competition_player_entry_event(
          entry.metadata, 'TRANSFERRED', v_actor_id, p_effective_at, p_reason
        )
    where entry.id = v_current.id;
  end if;

  insert into public.competition_player_entries (
    club_id,
    division_id,
    club_player_id,
    status,
    valid_from,
    assigned_by,
    assignment_type,
    previous_entry_id,
    reason,
    metadata
  ) values (
    p_club_id,
    p_division_id,
    p_club_player_id,
    'ACTIVE',
    p_effective_at,
    v_actor_id,
    v_assignment_type,
    case when v_current.id is null then null else v_current.id end,
    nullif(btrim(coalesce(p_reason, '')), ''),
    public.competition_player_entry_event('{}'::jsonb, 'ASSIGNED', v_actor_id, p_effective_at, p_reason)
  )
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.set_competition_player_entry_status(
  p_entry_id uuid,
  p_status text,
  p_reason text default null,
  p_effective_at timestamptz default now()
)
returns public.competition_player_entries
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_status text := upper(btrim(coalesce(p_status, '')));
  v_entry public.competition_player_entries%rowtype;
  v_division record;
  v_result public.competition_player_entries%rowtype;
  v_route_lock text;
begin
  if v_actor_id is null then
    raise exception 'Sesión inválida.' using errcode = '28000';
  end if;
  if p_effective_at is null then
    raise exception 'La fecha efectiva es obligatoria.' using errcode = '22023';
  end if;
  if v_target_status not in ('ACTIVE', 'SUSPENDED', 'WITHDRAWN') then
    raise exception 'Estado de destino inválido: %', p_status using errcode = '22023';
  end if;

  select entry.* into v_entry
  from public.competition_player_entries entry
  where entry.id = p_entry_id
  for update;
  if not found then
    raise exception 'Entrada competitiva inexistente.' using errcode = '22023';
  end if;

  if not public.is_platform_admin()
     and not public.has_club_capability(v_entry.club_id, 'ranking:manage') then
    raise exception 'No tenés permisos para gestionar divisiones competitivas.' using errcode = '42501';
  end if;

  select
    division.season_id,
    division.branch_id,
    division.segment_id,
    division.is_active,
    season.status as season_status
  into v_division
  from public.competition_divisions division
  join public.competition_seasons season
    on season.id = division.season_id and season.club_id = division.club_id
  where division.id = v_entry.division_id and division.club_id = v_entry.club_id
  for update of division, season;

  v_route_lock := concat_ws(
    ':', v_entry.club_id::text, v_entry.club_player_id::text, v_division.season_id::text,
    v_division.branch_id::text, coalesce(v_division.segment_id::text, '(NULL)')
  );
  perform pg_advisory_xact_lock(hashtextextended(v_route_lock, 0));

  if v_entry.status = v_target_status then
    return v_entry;
  end if;

  if v_entry.status = 'TRANSFERRED' or v_entry.status = 'WITHDRAWN' then
    raise exception 'Una entrada % no puede reactivarse ni cambiar de estado.', v_entry.status using errcode = '23514';
  end if;

  if v_target_status = 'ACTIVE' then
    if v_entry.status <> 'SUSPENDED' then
      raise exception 'Solo una entrada SUSPENDED puede reactivarse.' using errcode = '23514';
    end if;
    if v_division.season_status not in ('DRAFT', 'ACTIVE') then
      raise exception 'La temporada no permite reactivar entradas.' using errcode = '23514';
    end if;
    if not v_division.is_active then
      raise exception 'La división está inactiva.' using errcode = '23514';
    end if;
    if exists (
      select 1
      from public.competition_player_entries later_entry
      join public.competition_divisions later_division
        on later_division.id = later_entry.division_id and later_division.club_id = later_entry.club_id
      where later_entry.club_id = v_entry.club_id
        and later_entry.club_player_id = v_entry.club_player_id
        and later_entry.id <> v_entry.id
        and later_entry.valid_until is null
        and later_entry.status in ('ACTIVE', 'SUSPENDED')
        and later_division.season_id = v_division.season_id
        and later_division.branch_id = v_division.branch_id
        and later_division.segment_id is not distinct from v_division.segment_id
    ) then
      raise exception 'El recorrido ya posee una entrada posterior vigente.' using errcode = '23505';
    end if;
  elsif v_target_status = 'SUSPENDED' then
    if v_entry.status <> 'ACTIVE' then
      raise exception 'Solo una entrada ACTIVE puede suspenderse.' using errcode = '23514';
    end if;
  elsif v_target_status = 'WITHDRAWN' then
    if v_entry.status not in ('ACTIVE', 'SUSPENDED') then
      raise exception 'Solo una entrada vigente puede retirarse.' using errcode = '23514';
    end if;
    if p_effective_at < v_entry.valid_from then
      raise exception 'La fecha efectiva no puede ser anterior al inicio de la entrada.' using errcode = '22023';
    end if;
  end if;

  update public.competition_player_entries entry
  set status = v_target_status,
      valid_until = case when v_target_status = 'WITHDRAWN' then p_effective_at else null end,
      reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), entry.reason),
      metadata = public.competition_player_entry_event(
        entry.metadata, v_target_status, v_actor_id, p_effective_at, p_reason
      )
  where entry.id = v_entry.id
  returning entry.* into v_result;

  return v_result;
end;
$$;

alter table public.competition_player_entries enable row level security;

revoke all on table public.competition_player_entries from anon;
revoke all on table public.competition_player_entries from authenticated;
grant select on table public.competition_player_entries to authenticated;
grant all on table public.competition_player_entries to service_role;

drop policy if exists competition_player_entries_admin_read on public.competition_player_entries;
create policy competition_player_entries_admin_read
  on public.competition_player_entries
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.has_club_capability(club_id, 'ranking:view')
  );

revoke all on function public.competition_player_entry_event(jsonb, text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.competition_player_entry_event(jsonb, text, uuid, timestamptz, text) to service_role;

revoke all on function public.assign_player_to_competition_division(uuid, uuid, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.assign_player_to_competition_division(uuid, uuid, uuid, text, text, timestamptz) to authenticated, service_role;

revoke all on function public.set_competition_player_entry_status(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.set_competition_player_entry_status(uuid, text, text, timestamptz) to authenticated, service_role;

comment on table public.competition_player_entries is
  'Historial canónico de pertenencia de un club_player a divisiones competitivas INDIVIDUAL.';
comment on column public.competition_player_entries.metadata is
  'Metadatos y eventos mínimos de auditoría; no es fuente canónica de puntos.';
comment on function public.assign_player_to_competition_division(uuid, uuid, uuid, text, text, timestamptz) is
  'Asigna o transfiere atómicamente un jugador dentro de un recorrido temporada+rama+segmento.';
comment on function public.set_competition_player_entry_status(uuid, text, text, timestamptz) is
  'Suspende, reactiva o retira una entrada competitiva sin borrar historial.';

commit;
