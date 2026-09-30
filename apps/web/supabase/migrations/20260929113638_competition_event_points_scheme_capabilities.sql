begin;

-- Capability-only migration. Live catalog rows and events are changed later,
-- through authenticated domain RPCs with current optimistic revisions.

-- Scheduled event divisions are normally frozen. This narrow internal bypass
-- accepts only a points-scheme replacement; every other protected field must
-- remain byte-for-byte equivalent and the write guard still requires an RPC.
create or replace function public.validate_competition_event_division_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event record;
  v_series_division record;
  v_rule record;
  v_division record;
  v_tier record;
  v_scheme record;
  v_effective_scheme uuid;
  v_effective_multiplier numeric;
  points_scheme_correction boolean := false;
begin
  select e.club_id, e.series_id, e.season_id, e.event_type
    into v_event
  from public.competition_series_events e
  where e.id = new.event_id;
  select sd.club_id, sd.series_id, sd.division_id
    into v_series_division
  from public.competition_series_divisions sd
  where sd.id = new.series_division_id;
  select r.club_id, r.series_division_id
    into v_rule
  from public.competition_series_rules r
  where r.id = new.series_rule_id;
  select cd.club_id, cd.season_id
    into v_division
  from public.competition_divisions cd
  where cd.id = v_series_division.division_id;

  if v_event.club_id is null or v_series_division.club_id is null or v_rule.club_id is null
     or v_event.club_id <> new.club_id or v_series_division.club_id <> new.club_id
     or v_rule.club_id <> new.club_id or v_event.series_id <> v_series_division.series_id
     or v_rule.series_division_id <> new.series_division_id
     or v_division.club_id is distinct from new.club_id
     or v_division.season_id is distinct from v_event.season_id
  then
    raise exception 'EVENT_DIVISION_RELATION_INVALID' using errcode = '23514';
  end if;

  if new.event_tier_id is not null then
    select t.club_id, t.is_active, t.points_multiplier
      into v_tier
    from public.competition_event_tiers t
    where t.id = new.event_tier_id;
    if not found or v_tier.club_id is distinct from new.club_id or not v_tier.is_active then
      raise exception 'EVENT_TIER_SCOPE_INVALID' using errcode = '23514';
    end if;
  end if;

  if new.points_scheme_override_id is not null then
    select ps.club_id, ps.is_global, ps.is_active
      into v_scheme
    from public.points_schemes ps
    where ps.id = new.points_scheme_override_id;
    if not found or not v_scheme.is_active
       or (not v_scheme.is_global and v_scheme.club_id is distinct from new.club_id)
    then
      raise exception 'POINTS_SCHEME_SCOPE_INVALID' using errcode = '23514';
    end if;
  end if;

  if new.scoring_mode = 'NON_SCORING'
     and (new.event_tier_id is not null or new.points_scheme_override_id is not null
       or new.points_multiplier_override is not null)
  then
    raise exception 'NON_SCORING_INVALID' using errcode = '23514';
  end if;

  if new.scoring_mode = 'POINTS' then
    if v_event.event_type <> 'STANDARD' or new.event_tier_id is null then
      raise exception 'POINTS_CONFIGURATION_INVALID' using errcode = '23514';
    end if;
    v_effective_scheme := new.points_scheme_override_id;
    v_effective_multiplier := coalesce(new.points_multiplier_override, v_tier.points_multiplier);
    if v_effective_scheme is null or v_effective_multiplier is null or v_effective_multiplier <= 0
       or not exists (
         select 1 from public.points_schemes ps
         where ps.id = v_effective_scheme and ps.is_active
           and (ps.is_global or ps.club_id = new.club_id)
       )
    then
      raise exception 'POINTS_CONFIGURATION_INVALID' using errcode = '23514';
    end if;
  end if;

  if v_event.event_type in ('EXHIBITION', 'FRIENDLY')
     and new.scoring_mode is distinct from 'NON_SCORING'
  then
    raise exception 'EVENT_TYPE_SCORING_INVALID' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    points_scheme_correction :=
      current_setting('selpa.competition_event_points_scheme_write', true) = 'allowed'
      and old.status in ('DRAFT', 'SCHEDULED')
      and new.status = old.status
      and new.points_scheme_override_id is distinct from old.points_scheme_override_id
      and row(
        new.event_id, new.club_id, new.series_division_id, new.series_rule_id,
        new.event_tier_id, new.scoring_mode, new.points_multiplier_override,
        new.configuration_snapshot, new.frozen_at
      ) is not distinct from row(
        old.event_id, old.club_id, old.series_division_id, old.series_rule_id,
        old.event_tier_id, old.scoring_mode, old.points_multiplier_override,
        old.configuration_snapshot, old.frozen_at
      );

    if row(
      new.event_id, new.club_id, new.series_division_id, new.series_rule_id,
      new.event_tier_id, new.scoring_mode, new.points_scheme_override_id,
      new.points_multiplier_override, new.configuration_snapshot, new.frozen_at
    ) is distinct from row(
      old.event_id, old.club_id, old.series_division_id, old.series_rule_id,
      old.event_tier_id, old.scoring_mode, old.points_scheme_override_id,
      old.points_multiplier_override, old.configuration_snapshot, old.frozen_at
    ) and not points_scheme_correction then
      if old.status <> 'DRAFT' or new.status <> 'DRAFT'
         or new.configuration_snapshot is not null or new.frozen_at is not null
      then
        if current_setting('selpa.competition_event_schedule', true) is distinct from 'allowed'
           or old.status <> 'DRAFT' or new.status <> 'SCHEDULED'
           or old.configuration_snapshot is not null or old.frozen_at is not null
           or new.configuration_snapshot is null or new.frozen_at is null
           or row(
             new.event_id, new.club_id, new.series_division_id, new.series_rule_id,
             new.event_tier_id, new.scoring_mode, new.points_scheme_override_id,
             new.points_multiplier_override
           ) is distinct from row(
             old.event_id, old.club_id, old.series_division_id, old.series_rule_id,
             old.event_tier_id, old.scoring_mode, old.points_scheme_override_id,
             old.points_multiplier_override
           )
        then
          raise exception 'EVENT_CONFIGURATION_FROZEN' using errcode = '23514';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- INTERNAL: invoked only by the table trigger, never through the Data API.
revoke all on function public.validate_competition_event_division_integrity()
  from public, anon, authenticated, service_role;

create or replace function public.set_competition_event_division_points_scheme(
  p_club_id uuid,
  p_event_id uuid,
  p_event_division_id uuid,
  p_event_revision integer,
  p_division_revision integer,
  p_points_scheme_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  event_row public.competition_series_events%rowtype;
  division_row public.competition_series_event_divisions%rowtype;
begin
  perform public.require_competition_event_access(p_club_id, false);

  select * into event_row
  from public.competition_series_events
  where id = p_event_id and club_id = p_club_id
  for update;
  if not found then
    raise exception 'Evento inexistente.' using errcode = 'P0002';
  end if;

  select * into division_row
  from public.competition_series_event_divisions
  where id = p_event_division_id
    and event_id = event_row.id
    and club_id = p_club_id
    and is_active
  for update;
  if not found then
    raise exception 'División inexistente.' using errcode = 'P0002';
  end if;

  if event_row.revision <> p_event_revision
     or division_row.revision <> p_division_revision
  then
    raise exception 'PRECONDITION_FAILED' using errcode = '40001';
  end if;
  if event_row.archived_at is not null
     or event_row.status not in ('DRAFT', 'SCHEDULED')
     or division_row.status not in ('DRAFT', 'SCHEDULED')
  then
    raise exception 'Corrección de esquema bloqueada.' using errcode = '23514';
  end if;
  if division_row.scoring_mode <> 'POINTS' then
    raise exception 'La división no puntúa.' using errcode = '23514';
  end if;
  if p_points_scheme_id is null or not exists (
    select 1
    from public.points_schemes scheme
    where scheme.id = p_points_scheme_id
      and scheme.is_active
      and scheme.archived_at is null
      and (scheme.is_global or scheme.club_id = p_club_id)
  ) then
    raise exception 'Esquema inválido.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.competition_event_homologations homologation
    where homologation.event_division_id = division_row.id
  ) or exists (
    select 1
    from public.competition_event_settlements settlement
    where settlement.event_division_id = division_row.id
  ) then
    raise exception 'La división ya tiene homologación o liquidación.' using errcode = '23514';
  end if;

  if division_row.points_scheme_override_id is not distinct from p_points_scheme_id then
    return jsonb_build_object(
      'event_id', event_row.id,
      'event_revision', event_row.revision,
      'event_division_id', division_row.id,
      'event_division_revision', division_row.revision,
      'points_scheme_id', division_row.points_scheme_override_id,
      'changed', false
    );
  end if;

  perform set_config('selpa.competition_event_write', 'allowed', true);
  perform set_config('selpa.competition_event_points_scheme_write', 'allowed', true);

  update public.competition_series_event_divisions
  set points_scheme_override_id = p_points_scheme_id,
      revision = revision + 1
  where id = division_row.id
  returning * into division_row;

  update public.competition_series_events
  set revision = revision + 1
  where id = event_row.id
  returning * into event_row;

  return jsonb_build_object(
    'event_id', event_row.id,
    'event_revision', event_row.revision,
    'event_division_id', division_row.id,
    'event_division_revision', division_row.revision,
    'points_scheme_id', division_row.points_scheme_override_id,
    'changed', true
  );
end;
$$;

revoke all on function public.set_competition_event_division_points_scheme(uuid, uuid, uuid, integer, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_competition_event_division_points_scheme(uuid, uuid, uuid, integer, integer, uuid)
  to authenticated, service_role;

create or replace function public.set_competition_event_tier_default_points_scheme(
  p_club_id uuid,
  p_event_tier_id uuid,
  p_points_scheme_id uuid
)
returns public.competition_event_tiers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  tier_row public.competition_event_tiers%rowtype;
begin
  perform public.require_competition_event_access(p_club_id, false);

  select * into tier_row
  from public.competition_event_tiers
  where id = p_event_tier_id
    and club_id = p_club_id
    and is_active
  for update;
  if not found then
    raise exception 'Tier inválido.' using errcode = 'P0002';
  end if;
  if p_points_scheme_id is not null and not exists (
    select 1
    from public.points_schemes scheme
    where scheme.id = p_points_scheme_id
      and scheme.is_active
      and scheme.archived_at is null
      and (scheme.is_global or scheme.club_id = p_club_id)
  ) then
    raise exception 'Esquema inválido.' using errcode = '23514';
  end if;
  if tier_row.default_points_scheme_id is not distinct from p_points_scheme_id then
    return tier_row;
  end if;

  update public.competition_event_tiers
  set default_points_scheme_id = p_points_scheme_id
  where id = tier_row.id
  returning * into tier_row;
  return tier_row;
end;
$$;

revoke all on function public.set_competition_event_tier_default_points_scheme(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_competition_event_tier_default_points_scheme(uuid, uuid, uuid)
  to authenticated, service_role;

-- A null p_scheme_override_id now means "use the selected tier default" and,
-- only when that default is absent, "use the active series rule scheme". The
-- resolved scheme is persisted on the event division so scheduling snapshots
-- and settlements remain deterministic.
create or replace function public.configure_competition_series_event_division(
  p_club_id uuid,
  p_event_id uuid,
  p_division_id uuid,
  p_event_revision integer,
  p_scoring_mode text,
  p_event_tier_id uuid default null,
  p_scheme_override_id uuid default null,
  p_multiplier_override numeric default null
)
returns public.competition_series_event_divisions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  event_row public.competition_series_events%rowtype;
  division_row public.competition_series_event_divisions%rowtype;
  series_row public.competition_series%rowtype;
  tier_row public.competition_event_tiers%rowtype;
  rule_row public.competition_series_rules%rowtype;
  result public.competition_series_event_divisions%rowtype;
  mode text := upper(p_scoring_mode);
  resolved_scheme_id uuid;
begin
  perform public.require_competition_event_access(p_club_id, false);
  select * into event_row
  from public.competition_series_events
  where id = p_event_id and club_id = p_club_id
  for update;
  if not found then raise exception 'Evento inexistente.' using errcode = 'P0002'; end if;

  series_row := public.require_competition_event_series_state(
    p_club_id,
    event_row.series_id,
    event_row.season_id,
    array['SCHEDULED', 'ACTIVE']
  );
  if event_row.revision <> p_event_revision then raise exception 'PRECONDITION_FAILED' using errcode = '40001'; end if;

  select * into division_row
  from public.competition_series_event_divisions
  where id = p_division_id and event_id = event_row.id and is_active
  for update;
  if not found then raise exception 'División inexistente.' using errcode = 'P0002'; end if;
  if event_row.status <> 'DRAFT' or event_row.archived_at is not null or division_row.status <> 'DRAFT' then
    raise exception 'Configuración bloqueada.' using errcode = '23514';
  end if;
  if mode not in ('POINTS', 'NON_SCORING') then raise exception 'Scoring inválido.' using errcode = '22023'; end if;

  if mode = 'NON_SCORING' then
    if p_event_tier_id is not null or p_scheme_override_id is not null or p_multiplier_override is not null then
      raise exception 'NON_SCORING no admite tier ni overrides.' using errcode = '23514';
    end if;
  else
    if event_row.event_type <> 'STANDARD' or p_event_tier_id is null then
      raise exception 'POINTS requiere STANDARD y tier.' using errcode = '23514';
    end if;

    select * into tier_row
    from public.competition_event_tiers
    where id = p_event_tier_id and club_id = p_club_id and is_active;
    if not found then raise exception 'Tier inválido.' using errcode = '23514'; end if;

    select * into rule_row
    from public.competition_series_rules
    where id = division_row.series_rule_id
      and club_id = p_club_id
      and status = 'ACTIVE';
    if not found then raise exception 'Regla de circuito inválida.' using errcode = '23514'; end if;

    resolved_scheme_id := coalesce(
      p_scheme_override_id,
      tier_row.default_points_scheme_id,
      rule_row.points_scheme_id
    );
    if resolved_scheme_id is null or not exists (
      select 1
      from public.points_schemes scheme
      where scheme.id = resolved_scheme_id
        and scheme.is_active
        and scheme.archived_at is null
        and (scheme.is_global or scheme.club_id = p_club_id)
    ) then
      raise exception 'Esquema inválido.' using errcode = '23514';
    end if;
    if p_multiplier_override is not null and p_multiplier_override <= 0 then
      raise exception 'Multiplicador inválido.' using errcode = '23514';
    end if;
  end if;

  if row(
    division_row.scoring_mode,
    division_row.event_tier_id,
    division_row.points_scheme_override_id,
    division_row.points_multiplier_override
  ) is not distinct from row(
    mode,
    case when mode = 'POINTS' then p_event_tier_id end,
    case when mode = 'POINTS' then resolved_scheme_id end,
    case when mode = 'POINTS' then p_multiplier_override end
  ) then
    return division_row;
  end if;

  perform set_config('selpa.competition_event_write', 'allowed', true);
  update public.competition_series_event_divisions
  set scoring_mode = mode,
      event_tier_id = case when mode = 'POINTS' then p_event_tier_id end,
      points_scheme_override_id = case when mode = 'POINTS' then resolved_scheme_id end,
      points_multiplier_override = case when mode = 'POINTS' then p_multiplier_override end,
      revision = revision + 1,
      updated_at = now()
  where id = division_row.id
  returning * into result;

  update public.competition_series_events
  set revision = revision + 1,
      updated_at = now()
  where id = event_row.id;
  return result;
end;
$$;

-- RPC REQUIRED: authenticated Competition admins and trusted server flows.
revoke all on function public.configure_competition_series_event_division(uuid, uuid, uuid, integer, text, uuid, uuid, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.configure_competition_series_event_division(uuid, uuid, uuid, integer, text, uuid, uuid, numeric)
  to authenticated, service_role;

-- The tournament wizard used to pass the series-rule scheme as an explicit
-- override, bypassing the selected tier default. Preserve the atomic bridge,
-- but let the configuration RPC resolve tier -> series when no override was
-- deliberately supplied in the event payload.
create or replace function public.create_competition_date_tournament_atomic(
  p_club_id uuid,
  p_series_id uuid,
  p_series_revision integer,
  p_series_division_id uuid,
  p_rule_id uuid,
  p_rule_revision integer,
  p_idempotency_key text,
  p_event_payload jsonb,
  p_tournament_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid;
  command_row public.competition_date_creation_commands%rowtype;
  series_row public.competition_series%rowtype;
  series_division public.competition_series_divisions%rowtype;
  competition_division public.competition_divisions%rowtype;
  rule_row public.competition_series_rules%rowtype;
  eligibility_row public.competition_series_eligibility%rowtype;
  tier_row public.competition_event_tiers%rowtype;
  tournament_row public.tournaments%rowtype;
  event_row public.competition_series_events%rowtype;
  event_division public.competition_series_event_divisions%rowtype;
  link_result jsonb;
  response jsonb;
  key text := btrim(coalesce(p_idempotency_key, ''));
  request_hash text;
  event_name text := btrim(coalesce(p_event_payload->>'name', p_tournament_payload->>'name', ''));
  event_type text := upper(coalesce(nullif(btrim(p_event_payload->>'event_type'), ''), 'STANDARD'));
  scoring_mode text := upper(coalesce(nullif(btrim(p_event_payload->>'scoring_mode'), ''), ''));
  scheme_override_id uuid := nullif(p_event_payload->>'points_scheme_override_id', '')::uuid;
  effective_scheme_id uuid;
  link_key text;
  context jsonb;
  scope jsonb;
  gender text;
  segment text;
  tournament_input jsonb;
begin
  actor := public.require_competition_event_access(p_club_id, false);
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'tournaments:create') then
    raise exception 'Sin permiso para crear torneos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_event_payload) is distinct from 'object'
     or jsonb_typeof(p_tournament_payload) is distinct from 'object'
  then raise exception 'Payload inválido.' using errcode = '22023'; end if;
  if length(key) not between 8 and 200 then raise exception 'Solicitud inválida.' using errcode = '22023'; end if;

  request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'series_id', p_series_id,
    'series_revision', p_series_revision,
    'series_division_id', p_series_division_id,
    'rule_id', p_rule_id,
    'rule_revision', p_rule_revision,
    'event', p_event_payload,
    'tournament', p_tournament_payload
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.competition_date_creation_commands(
    club_id, actor_id, idempotency_key, request_hash, series_id
  ) values (p_club_id, actor, key, request_hash, p_series_id)
  on conflict (club_id, actor_id, idempotency_key) do nothing
  returning * into command_row;
  if not found then
    select * into command_row
    from public.competition_date_creation_commands command
    where command.club_id = p_club_id
      and command.actor_id = actor
      and command.idempotency_key = key
    for update;
    if command_row.request_hash is distinct from request_hash
       or command_row.series_id is distinct from p_series_id
    then raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    if command_row.response_payload is not null then return command_row.response_payload; end if;
    raise exception 'La solicitud todavía está en proceso.' using errcode = '55P03';
  end if;

  select * into series_row
  from public.competition_series series
  where series.id = p_series_id and series.club_id = p_club_id
  for update;
  if not found then raise exception 'Circuito inexistente.' using errcode = 'P0002'; end if;
  if series_row.revision <> p_series_revision then raise exception 'PRECONDITION_FAILED' using errcode = '40001'; end if;
  if series_row.status not in ('SCHEDULED', 'ACTIVE') or series_row.archived_at is not null then
    raise exception 'El circuito no admite nuevas fechas.' using errcode = '23514';
  end if;

  select * into series_division
  from public.competition_series_divisions division
  where division.id = p_series_division_id
    and division.club_id = p_club_id
    and division.series_id = series_row.id
    and division.is_active
  for update;
  if not found then raise exception 'División de circuito inválida.' using errcode = '23514'; end if;

  select * into competition_division
  from public.competition_divisions division
  where division.id = series_division.division_id
    and division.club_id = p_club_id
    and division.season_id = series_row.season_id
    and division.is_active;
  if not found then raise exception 'La división no pertenece a la temporada del circuito.' using errcode = '23514'; end if;

  select * into rule_row
  from public.competition_series_rules rule
  where rule.id = p_rule_id
    and rule.club_id = p_club_id
    and rule.series_division_id = series_division.id
    and rule.status = 'ACTIVE';
  if not found or rule_row.revision <> p_rule_revision then
    raise exception 'Regla obsoleta o inválida.' using errcode = '40001';
  end if;
  select * into eligibility_row
  from public.competition_series_eligibility eligibility
  where eligibility.series_rule_id = rule_row.id;
  if not found then raise exception 'La regla requiere elegibilidad.' using errcode = '23514'; end if;

  context := public.get_competition_date_creation_context(p_club_id, p_series_id);
  select item into scope
  from jsonb_array_elements(context->'divisions') item
  where (item->>'series_division_id')::uuid = p_series_division_id;
  if scope is null then raise exception 'La división no pertenece al contexto canónico.' using errcode = '23514'; end if;
  gender := case scope->>'branch_slug'
    when 'caballeros' then 'MALE'
    when 'damas' then 'FEMALE'
    when 'mixto' then 'MIXED'
  end;
  segment := upper(scope->>'segment_slug');

  if scoring_mode not in ('POINTS', 'NON_SCORING') then raise exception 'Scoring inválido.' using errcode = '22023'; end if;
  if p_tournament_payload ? 'rule_id'
     and nullif(p_tournament_payload->>'rule_id', '')::uuid is distinct from rule_row.id
  then raise exception 'La regla declarada contradice al circuito.' using errcode = '23514'; end if;
  if p_tournament_payload ? 'points_scheme_id'
     and nullif(p_tournament_payload->>'points_scheme_id', '') is not null
  then raise exception 'Competition administra la tabla de puntos; Tournament no debe declararla.' using errcode = '23514'; end if;
  if (p_tournament_payload ? 'points_enabled' and public.tournament_json_truthy(p_tournament_payload->'points_enabled'))
     or (jsonb_typeof(p_tournament_payload->'points_config') = 'object'
       and public.tournament_json_truthy(p_tournament_payload->'points_config'->'enabled'))
  then raise exception 'Competition administra los puntos; Tournament debe mantener puntos legacy desactivados.' using errcode = '23514'; end if;

  if scoring_mode = 'POINTS' then
    select * into tier_row
    from public.competition_event_tiers tier
    where tier.id = nullif(p_event_payload->>'event_tier_id', '')::uuid
      and tier.club_id = p_club_id
      and tier.is_active;
    if not found then raise exception 'El tier del evento es obligatorio y debe estar activo.' using errcode = '23514'; end if;
    effective_scheme_id := coalesce(scheme_override_id, tier_row.default_points_scheme_id, rule_row.points_scheme_id);
    if effective_scheme_id is null or not exists (
      select 1 from public.points_schemes scheme
      where scheme.id = effective_scheme_id
        and scheme.is_active
        and scheme.archived_at is null
        and (scheme.is_global or scheme.club_id = p_club_id)
    ) then raise exception 'La tabla de puntos no está disponible.' using errcode = '23514'; end if;
  else
    if nullif(p_event_payload->>'event_tier_id', '') is not null
       or scheme_override_id is not null
       or nullif(p_event_payload->>'points_multiplier', '') is not null
    then raise exception 'NON_SCORING no admite tier, tabla ni multiplicador.' using errcode = '23514'; end if;
  end if;

  link_key := 'bridge-' || encode(extensions.digest(convert_to(
    p_club_id::text || ':' || actor::text || ':' || key || ':tournament-link', 'UTF8'
  ), 'sha256'), 'hex');
  if (p_tournament_payload ? 'gender' and upper(btrim(p_tournament_payload->>'gender')) is distinct from gender)
     or (p_tournament_payload ? 'segment' and upper(btrim(p_tournament_payload->>'segment')) is distinct from segment)
     or (p_tournament_payload ? 'category_id' and nullif(p_tournament_payload->>'category_id', '')::integer is distinct from (scope->>'legacy_category_id')::integer)
     or (p_tournament_payload ? 'age_category_id' and nullif(p_tournament_payload->>'age_category_id', '')::uuid is distinct from nullif(scope->>'age_category_id', '')::uuid)
  then raise exception 'El payload Tournament contradice al circuito.' using errcode = '23514'; end if;

  tournament_input := (p_tournament_payload - array['points_enabled', 'points_scheme_id']) || jsonb_build_object(
    'gender', gender,
    'segment', segment,
    'segment_type', segment,
    'category_rule', 'FIXED_CATEGORY',
    'category_id', case when segment = 'LIBRES' then (scope->>'legacy_category_id')::integer end,
    'age_category_id', case when segment <> 'LIBRES' then scope->>'age_category_id' end,
    'points_config', jsonb_build_object(
      'enabled', false,
      'editable', false,
      'winner', 0,
      'finalist', 0,
      'semifinalist', 0,
      'quarterfinalist', 0,
      'eighthFinalist', 0,
      'participation', 0
    )
  );
  tournament_row := public.create_tournament_canonical(p_club_id, tournament_input);
  event_row := public.create_competition_series_event(p_club_id, series_row.id, event_name);
  event_row := public.update_competition_series_event_draft(
    p_club_id,
    event_row.id,
    event_row.revision,
    jsonb_strip_nulls(jsonb_build_object(
      'event_type', event_type,
      'planned_starts_at', coalesce(p_event_payload->>'planned_starts_at', p_tournament_payload->>'start_date'),
      'planned_ends_at', coalesce(p_event_payload->>'planned_ends_at', p_tournament_payload->>'end_date'),
      'timezone', nullif(btrim(p_event_payload->>'timezone'), ''),
      'venue_name', nullif(btrim(p_event_payload->>'venue_name'), ''),
      'venue_address', nullif(btrim(p_event_payload->>'venue_address'), ''),
      'is_public', coalesce((p_event_payload->>'is_public')::boolean, false)
    ))
  );
  event_division := public.add_competition_series_event_division(
    p_club_id, event_row.id, series_division.id, 0, event_row.revision
  );
  select * into event_row from public.competition_series_events
  where id = event_row.id and club_id = p_club_id;
  event_division := public.configure_competition_series_event_division(
    p_club_id,
    event_row.id,
    event_division.id,
    event_row.revision,
    scoring_mode,
    case when scoring_mode = 'POINTS' then tier_row.id end,
    case when scoring_mode = 'POINTS' then scheme_override_id end,
    null
  );
  select * into event_row from public.competition_series_events
  where id = event_row.id and club_id = p_club_id;
  link_result := public.link_competition_series_event_tournament(
    p_club_id,
    event_row.id,
    event_division.id,
    tournament_row.id,
    event_row.revision,
    link_key,
    false,
    null
  );
  response := jsonb_build_object(
    'tournament_id', tournament_row.id,
    'event_id', event_row.id,
    'event_division_id', event_division.id,
    'link_id', (link_result->>'link_id')::uuid,
    'event_revision', link_result->'revision',
    'reused', false
  );
  update public.competition_date_creation_commands command
  set response_payload = response,
      completed_at = now()
  where command.club_id = p_club_id
    and command.actor_id = actor
    and command.idempotency_key = key;
  return response;
end;
$$;

-- RPC REQUIRED: authenticated admins create the date; service_role is reserved
-- for trusted server flows.
revoke all on function public.create_competition_date_tournament_atomic(uuid, uuid, integer, uuid, uuid, integer, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_competition_date_tournament_atomic(uuid, uuid, integer, uuid, uuid, integer, text, jsonb, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
