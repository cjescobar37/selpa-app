begin;

-- Follow-up only. Existing completed divisions and published settlements remain
-- immutable; this migration changes guards and future RPC behavior, not data.

-- Keep the existing frozen-field guard, but permit one atomic scheduled change:
-- override and the single effective scheme key must move together.
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
      and new.points_scheme_override_id is not null
      and new.revision = old.revision + 1
      and new.is_active is not distinct from old.is_active
      and (
        new.points_scheme_override_id is distinct from old.points_scheme_override_id
        or (old.status = 'SCHEDULED'
          and old.configuration_snapshot->>'effective_points_scheme_id'
              is distinct from new.points_scheme_override_id::text)
      )
      and row(
        new.event_id, new.club_id, new.series_division_id, new.series_rule_id,
        new.event_tier_id, new.scoring_mode, new.points_multiplier_override,
        new.frozen_at
      ) is not distinct from row(
        old.event_id, old.club_id, old.series_division_id, old.series_rule_id,
        old.event_tier_id, old.scoring_mode, old.points_multiplier_override,
        old.frozen_at
      )
      and (
        (old.status = 'DRAFT'
          and new.configuration_snapshot is not distinct from old.configuration_snapshot)
        or
        (old.status = 'SCHEDULED'
          and jsonb_typeof(old.configuration_snapshot) = 'object'
          and old.configuration_snapshot ? 'effective_points_scheme_id'
          and new.configuration_snapshot = jsonb_set(
            old.configuration_snapshot,
            '{effective_points_scheme_id}',
            to_jsonb(new.points_scheme_override_id::text),
            false
          ))
      )
      and not exists (
        select 1 from public.competition_event_homologations h
        where h.event_division_id = old.id
      )
      and not exists (
        select 1 from public.competition_event_settlements s
        where s.event_division_id = old.id
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

  if division_row.status = 'SCHEDULED'
     and (jsonb_typeof(division_row.configuration_snapshot) is distinct from 'object'
       or not (division_row.configuration_snapshot ? 'effective_points_scheme_id'))
  then
    raise exception 'POINTS_SCHEME_SNAPSHOT_INVALID' using errcode = '23514';
  end if;

  if division_row.points_scheme_override_id is not distinct from p_points_scheme_id
     and (division_row.status = 'DRAFT'
       or division_row.configuration_snapshot->>'effective_points_scheme_id' = p_points_scheme_id::text)
  then
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
      configuration_snapshot = case
        when division_row.status = 'SCHEDULED' then jsonb_set(
          division_row.configuration_snapshot,
          '{effective_points_scheme_id}',
          to_jsonb(p_points_scheme_id::text),
          false
        )
        else division_row.configuration_snapshot
      end,
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

-- Internal fail-closed predicate. Legitimate per-date adjustments are explicit
-- in the settlement snapshot. A published correction of a historical mismatch
-- is allowed only after its adjusted rules exactly equal the configured scheme.
create or replace function public.competition_settlement_scheme_snapshot_mismatch(
  p_club_id uuid,
  p_event_division_id uuid,
  p_settlement_id uuid default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  division_row public.competition_series_event_divisions%rowtype;
  settlement_row public.competition_event_settlements%rowtype;
  source_row public.competition_event_settlements%rowtype;
  frozen_scheme text;
  settlement_scheme text;
  adjusted_scheme text;
  source_scheme text;
  expected_rules jsonb;
  actual_rules jsonb;
  division_mismatch boolean;
begin
  select * into division_row
  from public.competition_series_event_divisions
  where id = p_event_division_id and club_id = p_club_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if division_row.scoring_mode <> 'POINTS' then return false; end if;

  frozen_scheme := nullif(division_row.configuration_snapshot->>'effective_points_scheme_id', '');
  division_mismatch := division_row.points_scheme_override_id is null
    or frozen_scheme is null
    or frozen_scheme <> division_row.points_scheme_override_id::text;
  if p_settlement_id is null then return division_mismatch; end if;

  select * into settlement_row
  from public.competition_event_settlements
  where id = p_settlement_id
    and club_id = p_club_id
    and event_division_id = p_event_division_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if settlement_row.scoring_mode <> 'POINTS' then return false; end if;

  settlement_scheme := nullif(
    settlement_row.calculation_snapshot->'event_configuration'->>'effective_points_scheme_id', ''
  );
  adjusted_scheme := nullif(
    settlement_row.calculation_snapshot->'points_adjustment'->>'adjusted_points_scheme_id', ''
  );
  source_scheme := nullif(
    settlement_row.calculation_snapshot->'points_adjustment'->>'source_points_scheme_id', ''
  );

  if not division_mismatch then
    if settlement_row.points_scheme_id = division_row.points_scheme_override_id
       and settlement_scheme = division_row.points_scheme_override_id::text then
      return false;
    end if;
    -- The existing adjustment lifecycle deliberately creates a private clone.
    if adjusted_scheme = settlement_row.points_scheme_id::text
       and settlement_scheme = adjusted_scheme
       and source_scheme = division_row.points_scheme_override_id::text then
      return false;
    end if;
    return true;
  end if;

  if settlement_row.corrected_from_id is null
     or adjusted_scheme is distinct from settlement_row.points_scheme_id::text
     or settlement_scheme is distinct from adjusted_scheme then
    return true;
  end if;

  select * into source_row
  from public.competition_event_settlements
  where id = settlement_row.corrected_from_id
    and club_id = p_club_id
    and event_division_id = p_event_division_id;
  if not found or source_row.published_at is null
     or source_row.status not in ('PUBLISHED', 'SUPERSEDED') then
    return true;
  end if;

  -- Only settlements marked by this trigger at publication have already
  -- passed the exact-rule check. A later catalog edit must not invalidate them.
  if settlement_row.status = 'PUBLISHED'
     and settlement_row.calculation_snapshot->'points_adjustment'->>'configured_scheme_verified' = 'true'
  then return false; end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('rule_key', upper(rule.rule_key), 'points', rule.points)
      order by upper(rule.rule_key)), '[]'::jsonb
  ) into expected_rules
  from public.points_scheme_rules rule
  join public.points_schemes scheme on scheme.id = rule.scheme_id
  where scheme.id = division_row.points_scheme_override_id
    and scheme.is_active
    and scheme.archived_at is null
    and (scheme.is_global or scheme.club_id = p_club_id)
    and rule.is_active;
  if expected_rules = '[]'::jsonb then return true; end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'rule_key', upper(value->>'rule_key'),
      'points', (value->>'points')::integer
    ) order by upper(value->>'rule_key')), '[]'::jsonb
  ) into actual_rules
  from jsonb_array_elements(coalesce(
    settlement_row.calculation_snapshot->'points_rules', '[]'::jsonb
  )) as rules(value);

  return actual_rules is distinct from expected_rules;
end;
$$;

revoke all on function public.competition_settlement_scheme_snapshot_mismatch(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- INSERT catches ordinary draft creation before it can freeze the wrong scheme.
-- The published-correction RPC owns a pending CORRECTION command and is allowed
-- to create a blocked draft; CALCULATE/PUBLISH remain guarded until fixed.
create or replace function public.guard_competition_settlement_scheme_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.scoring_mode <> 'POINTS' then return new; end if;

  if tg_op = 'INSERT'
     and public.competition_settlement_scheme_snapshot_mismatch(
       new.club_id, new.event_division_id, null
     )
     and not (
       current_setting('selpa.competition_settlement_correction', true) = 'allowed'
       and exists (
         select 1 from public.competition_event_settlement_commands command
         where command.club_id = new.club_id
           and command.event_division_id = new.event_division_id
           and command.actor_id = auth.uid()
           and command.operation = 'CORRECTION'
           and command.response_payload is null
       )
     ) then
    raise exception 'POINTS_SCHEME_SNAPSHOT_MISMATCH' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and new.status in ('CALCULATED', 'SUBMITTED', 'APPROVED', 'PUBLISHED')
     and public.competition_settlement_scheme_snapshot_mismatch(
       new.club_id, new.event_division_id, new.id
     ) then
    raise exception 'POINTS_SCHEME_SNAPSHOT_MISMATCH' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'PUBLISHED' and new.status = 'PUBLISHED'
     and public.competition_settlement_scheme_snapshot_mismatch(
       new.club_id, new.event_division_id, null
     ) then
    new.calculation_snapshot := jsonb_set(
      new.calculation_snapshot,
      '{points_adjustment,configured_scheme_verified}',
      'true'::jsonb,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_competition_settlement_scheme_snapshot_guard
  on public.competition_event_settlements;
create trigger trg_competition_settlement_scheme_snapshot_guard
  before insert or update on public.competition_event_settlements
  for each row execute function public.guard_competition_settlement_scheme_snapshot();

revoke all on function public.guard_competition_settlement_scheme_snapshot()
  from public, anon, authenticated, service_role;

-- Preserve existing blockers and permission rules, adding one explicit
-- human-readable mismatch blocker. A correction draft may be adjusted, but
-- cannot calculate/submit/publish with the wrong table.
create or replace function public.get_competition_event_settlement_preflight(
  p_club_id uuid,
  p_settlement_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  s public.competition_event_settlements%rowtype;
  h public.competition_event_homologations%rowtype;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  award_count integer;
  mismatch boolean;
begin
  perform public.require_competition_settlement_access(p_club_id, false);
  select * into s
  from public.competition_event_settlements
  where club_id = p_club_id and id = p_settlement_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  select * into h
  from public.competition_event_homologations
  where club_id = p_club_id and id = s.homologation_id;
  if h.status <> 'APPROVED' then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'HOMOLOGATION_NOT_APPROVED'));
  end if;
  if h.revision <> s.homologation_revision then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'HOMOLOGATION_STALE'));
  end if;

  mismatch := s.scoring_mode = 'POINTS'
    and public.competition_settlement_scheme_snapshot_mismatch(
      p_club_id, s.event_division_id, s.id
    );
  if mismatch then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'POINTS_SCHEME_SNAPSHOT_MISMATCH',
      'message', 'La tabla de puntos congelada no coincide con la configuración actual. Corregí la fecha antes de liquidar.'
    ));
  end if;

  select count(*) into award_count
  from public.competition_event_settlement_awards
  where settlement_id = s.id;
  if s.status <> 'DRAFT' and award_count = 0 then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'AWARDS_MISSING'));
  end if;
  if exists (
    select 1 from public.competition_event_settlement_issues
    where settlement_id = s.id and severity = 'BLOCKER'
  ) then
    blockers := blockers || (
      select coalesce(jsonb_agg(jsonb_build_object('code', i.code, 'message', i.message)), '[]'::jsonb)
      from public.competition_event_settlement_issues i
      where i.settlement_id = s.id and i.severity = 'BLOCKER'
    );
  end if;
  warnings := (
    select coalesce(jsonb_agg(jsonb_build_object('code', i.code, 'message', i.message)), '[]'::jsonb)
    from public.competition_event_settlement_issues i
    where i.settlement_id = s.id and i.severity = 'WARNING'
  );
  return jsonb_build_object(
    'settlement_id', s.id,
    'status', s.status,
    'revision', s.revision,
    'blockers', blockers,
    'warnings', warnings,
    'allowed_actions', jsonb_build_object(
      'calculate', s.status in ('DRAFT', 'CALCULATED') and not mismatch,
      'submit', s.status = 'CALCULATED' and jsonb_array_length(blockers) = 0,
      'approve', s.status = 'SUBMITTED' and jsonb_array_length(blockers) = 0,
      'reject', s.status = 'SUBMITTED',
      'publish', s.status = 'APPROVED' and jsonb_array_length(blockers) = 0,
      'correction', s.status = 'REJECTED',
      'supersede', s.status in ('DRAFT', 'CALCULATED', 'SUBMITTED', 'APPROVED')
    )
  );
end;
$$;

revoke all on function public.get_competition_event_settlement_preflight(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_competition_event_settlement_preflight(uuid, uuid)
  to authenticated, service_role;

-- Wrap the already-applied PAIRS-aware calculator rather than copying its
-- ledger/eligibility logic. The check runs before awards are deleted/rebuilt.
alter function public.calculate_competition_event_settlement(uuid, uuid, integer, text)
  rename to calculate_competition_event_settlement_base_20260930;

revoke all on function public.calculate_competition_event_settlement_base_20260930(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;

create or replace function public.calculate_competition_event_settlement(
  p_club_id uuid,
  p_settlement_id uuid,
  p_revision integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  settlement_row public.competition_event_settlements%rowtype;
begin
  perform public.require_competition_settlement_access(p_club_id, false);
  select * into settlement_row
  from public.competition_event_settlements
  where id = p_settlement_id and club_id = p_club_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if settlement_row.scoring_mode = 'POINTS'
     and public.competition_settlement_scheme_snapshot_mismatch(
       p_club_id, settlement_row.event_division_id, settlement_row.id
     ) then
    raise exception 'POINTS_SCHEME_SNAPSHOT_MISMATCH' using errcode = '23514';
  end if;
  return public.calculate_competition_event_settlement_base_20260930(
    p_club_id, p_settlement_id, p_revision, p_idempotency_key
  );
end;
$$;

revoke all on function public.calculate_competition_event_settlement(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.calculate_competition_event_settlement(uuid, uuid, integer, text)
  to authenticated, service_role;

-- Keep the published correction lifecycle and reversals unchanged. The sole
-- addition is an internal marker before it creates its initially blocked draft.
create or replace function public.create_competition_event_settlement_correction(
  p_club_id uuid,
  p_settlement_id uuid,
  p_revision integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  source public.competition_event_settlements%rowtype;
  replay jsonb;
  created jsonb;
  corrected public.competition_event_settlements%rowtype;
  transaction_row record;
begin
  perform public.require_competition_settlement_access(p_club_id, true);
  select * into source
  from public.competition_event_settlements
  where club_id = p_club_id and id = p_settlement_id
  for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  replay := public.begin_competition_settlement_command(
    p_club_id,
    source.event_division_id,
    source.id,
    'CORRECTION',
    p_idempotency_key,
    jsonb_build_object('settlement', source.id, 'revision', p_revision)
  );
  if replay is not null then return replay; end if;
  if source.revision <> p_revision then raise exception 'PRECONDITION_FAILED' using errcode = '40001'; end if;
  if source.status not in ('REJECTED', 'PUBLISHED') then raise exception 'INVALID_LIFECYCLE' using errcode = '23514'; end if;

  -- Only a published source may enter the narrow historical-mismatch repair.
  -- Its new draft cannot calculate/publish until the rules match the configured
  -- scheme; no completed division snapshot is changed.
  if source.status = 'PUBLISHED' then
    perform set_config('selpa.competition_settlement_correction', 'allowed', true);
  end if;
  created := public.create_competition_event_settlement_draft(p_club_id, source.event_division_id, p_idempotency_key);
  perform set_config('selpa.competition_settlement_write', 'allowed', true);
  update public.competition_event_settlements
  set corrected_from_id = source.id,
      points_scheme_id = source.points_scheme_id,
      effective_multiplier = source.effective_multiplier,
      calculation_snapshot = source.calculation_snapshot,
      revision = revision + 1,
      updated_at = now()
  where id = (created->>'settlement_id')::uuid
  returning * into corrected;

  if source.status = 'PUBLISHED' then
    for transaction_row in
      select tx.id
      from public.competition_point_transactions tx
      where tx.club_id = p_club_id
        and tx.source_concept = 'COMPETITION_EVENT_SETTLEMENT'
        and tx.transaction_type = 'TOURNAMENT_RESULT'
        and tx.metadata->>'settlement_id' = source.id::text
      order by tx.id
    loop
      perform public.reverse_competition_point_transaction(transaction_row.id, 'Corrección del settlement ' || source.id::text, auth.uid());
    end loop;
    perform set_config('selpa.competition_settlement_correction', 'allowed', true);
    perform set_config('selpa.competition_settlement_write', 'allowed', true);
    update public.competition_event_settlements
    set status = 'SUPERSEDED', superseded_by_id = corrected.id, superseded_at = now(), revision = revision + 1, updated_at = now()
    where id = source.id;
  end if;

  replay := jsonb_build_object(
    'settlement_id', corrected.id,
    'version', corrected.version,
    'revision', corrected.revision,
    'status', corrected.status,
    'corrected_from_id', source.id,
    'reversals_created', case when source.status = 'PUBLISHED' then true else false end
  );
  perform public.finish_competition_settlement_command(p_club_id, source.event_division_id, 'CORRECTION', p_idempotency_key, replay);
  return replay;
end;
$$;

revoke all on function public.create_competition_event_settlement_correction(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_competition_event_settlement_correction(uuid, uuid, integer, text)
  to authenticated, service_role;

commit;
