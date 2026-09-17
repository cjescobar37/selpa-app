begin;

-- A per-event adjustment always works on a private clone. The series rule and
-- its frozen event-division snapshot remain untouched.
create or replace function public.adjust_competition_event_settlement_points(
  p_club_id uuid,
  p_settlement_id uuid,
  p_revision integer,
  p_idempotency_key text,
  p_name text,
  p_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  settlement public.competition_event_settlements%rowtype;
  source_scheme public.points_schemes%rowtype;
  cloned_scheme public.points_schemes%rowtype;
  current_rule public.points_scheme_rules%rowtype;
  replay jsonb;
  calculated jsonb;
  rules_snapshot jsonb;
  requested_rule record;
  scheme_revision integer;
  next_revision integer;
  clean_name text := btrim(coalesce(p_name, ''));
  candidate_name text;
  suffix integer := 1;
  original_scheme_id uuid;
begin
  perform public.require_competition_settlement_access(p_club_id, false);
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'competition:manage') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into settlement
  from public.competition_event_settlements
  where club_id = p_club_id and id = p_settlement_id
  for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  replay := public.begin_competition_settlement_command(
    p_club_id,
    settlement.event_division_id,
    settlement.id,
    'ADJUST_POINTS',
    p_idempotency_key,
    jsonb_build_object('settlement', settlement.id, 'revision', p_revision, 'name', clean_name, 'rules', p_rules)
  );
  if replay is not null then return replay; end if;
  if settlement.revision <> p_revision then raise exception 'PRECONDITION_FAILED' using errcode = '40001'; end if;
  if settlement.status not in ('DRAFT', 'CALCULATED') then raise exception 'SETTLEMENT_NOT_EDITABLE' using errcode = '23514'; end if;
  if settlement.scoring_mode <> 'POINTS' or settlement.points_scheme_id is null then raise exception 'POINTS_CONFIGURATION_INVALID' using errcode = '23514'; end if;
  if clean_name = '' then raise exception 'NAME_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(p_rules) is distinct from 'array' or jsonb_array_length(p_rules) <> 5 then raise exception 'POINT_RULES_REQUIRED' using errcode = '22023'; end if;
  if (select count(distinct upper(value->>'rule_key')) from jsonb_array_elements(p_rules)) <> 5
     or exists (
       select 1 from jsonb_array_elements(p_rules)
       where upper(value->>'rule_key') not in ('CHAMPION', 'RUNNER_UP', 'SEMIFINALIST', 'QUARTERFINALIST', 'PARTICIPANT')
          or jsonb_typeof(value->'points') is distinct from 'number'
          or (value->>'points')::numeric < 0
          or (value->>'points')::numeric <> trunc((value->>'points')::numeric)
     ) then
    raise exception 'POINT_RULES_INVALID' using errcode = '22023';
  end if;

  select * into source_scheme
  from public.points_schemes
  where id = settlement.points_scheme_id
    and (club_id = p_club_id or (is_global and is_active))
    and archived_at is null;
  if not found then raise exception 'SCHEME_NOT_FOUND' using errcode = 'P0002'; end if;
  original_scheme_id := coalesce(
    nullif(settlement.calculation_snapshot->'points_adjustment'->>'source_points_scheme_id', '')::uuid,
    source_scheme.id
  );

  candidate_name := clean_name;
  while exists (
    select 1 from public.points_schemes
    where club_id = p_club_id and archived_at is null and lower(btrim(name)) = lower(candidate_name)
  ) loop
    suffix := suffix + 1;
    candidate_name := clean_name || ' · ' || suffix;
  end loop;
  cloned_scheme := public.clone_points_scheme(p_club_id, source_scheme.id, candidate_name);

  for requested_rule in
    select upper(value->>'rule_key') as rule_key, (value->>'points')::integer as points
    from jsonb_array_elements(p_rules)
  loop
    select * into current_rule
    from public.points_scheme_rules
    where scheme_id = cloned_scheme.id and rule_key = requested_rule.rule_key;
    select revision into scheme_revision from public.points_schemes where id = cloned_scheme.id;
    if current_rule.id is not null then
      perform public.update_points_scheme_rule(
        p_club_id,
        cloned_scheme.id,
        current_rule.id,
        scheme_revision,
        current_rule.revision,
        requested_rule.points,
        current_rule.sort_order,
        true
      );
    else
      perform public.add_points_scheme_rule(p_club_id, cloned_scheme.id, scheme_revision, requested_rule.rule_key, requested_rule.points, 0);
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('rule_key', rule_key, 'points', points) order by sort_order, rule_key), '[]'::jsonb)
  into rules_snapshot
  from public.points_scheme_rules
  where scheme_id = cloned_scheme.id and is_active;

  perform set_config('selpa.competition_settlement_write', 'allowed', true);
  delete from public.competition_event_settlement_issues where settlement_id = settlement.id;
  delete from public.competition_event_settlement_awards where settlement_id = settlement.id;
  update public.competition_event_settlements
  set status = 'DRAFT',
      revision = revision + 1,
      points_scheme_id = cloned_scheme.id,
      calculation_snapshot = jsonb_set(
        jsonb_set(
          coalesce(calculation_snapshot, '{}'::jsonb) || jsonb_build_object('points_adjustment', jsonb_build_object('source_points_scheme_id', original_scheme_id, 'adjusted_points_scheme_id', cloned_scheme.id, 'adjusted_at', now())),
          '{points_rules}',
          rules_snapshot,
          true
        ),
        '{event_configuration,effective_points_scheme_id}',
        to_jsonb(cloned_scheme.id::text),
        true
      ),
      calculated_by = null,
      calculated_at = null,
      submitted_by = null,
      submitted_at = null,
      approved_by = null,
      approved_at = null,
      updated_at = now()
  where id = settlement.id
  returning revision into next_revision;

  calculated := public.calculate_competition_event_settlement(
    p_club_id,
    settlement.id,
    next_revision,
    left(p_idempotency_key, 180) || ':recalculate'
  );
  calculated := calculated || jsonb_build_object('points_scheme_id', cloned_scheme.id, 'points_scheme_name', candidate_name);
  perform public.finish_competition_settlement_command(p_club_id, settlement.event_division_id, 'ADJUST_POINTS', p_idempotency_key, calculated);
  return calculated;
end;
$$;

-- A published correction reverses its ledger first, preserves the published
-- timestamps on the superseded version, and starts a new immutable version.
alter table public.competition_event_settlements
  drop constraint competition_settlements_lifecycle_chk;
alter table public.competition_event_settlements
  add constraint competition_settlements_lifecycle_chk check(
    (status='DRAFT' and calculated_at is null and submitted_at is null and approved_at is null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='CALCULATED' and calculated_at is not null and submitted_at is null and approved_at is null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='SUBMITTED' and calculated_at is not null and submitted_at is not null and approved_at is null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='APPROVED' and calculated_at is not null and submitted_at is not null and approved_at is not null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='PUBLISHED' and calculated_at is not null and submitted_at is not null and approved_at is not null and published_at is not null and rejected_at is null and superseded_at is null) or
    (status='REJECTED' and submitted_at is not null and rejected_at is not null and length(btrim(coalesce(rejection_reason,'')))>0 and published_at is null and superseded_at is null) or
    (status='SUPERSEDED' and superseded_at is not null)
  );

create or replace function public.guard_competition_settlement_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_setting('selpa.competition_settlement_write', true) is distinct from 'allowed' then
    raise exception 'SETTLEMENT_RPC_REQUIRED' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if old.status in ('PUBLISHED', 'REJECTED', 'SUPERSEDED') then
    if old.status = 'PUBLISHED'
       and new.status = 'SUPERSEDED'
       and current_setting('selpa.competition_settlement_correction', true) = 'allowed' then
      return new;
    end if;
    raise exception 'SETTLEMENT_TERMINAL' using errcode = '23514';
  end if;
  return new;
end;
$$;

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

revoke all on function public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb) from public, anon;
grant execute on function public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb) to authenticated, service_role;
revoke all on function public.create_competition_event_settlement_correction(uuid,uuid,integer,text) from public, anon;
grant execute on function public.create_competition_event_settlement_correction(uuid,uuid,integer,text) to authenticated, service_role;
revoke all on function public.guard_competition_settlement_mutation() from public, anon, authenticated;

comment on function public.adjust_competition_event_settlement_points(uuid,uuid,integer,text,text,jsonb) is
  'Clona el esquema efectivo, lo aplica sólo al snapshot editable del settlement y recalcula sin alterar la regla general del circuito.';
comment on function public.create_competition_event_settlement_correction(uuid,uuid,integer,text) is
  'Crea una versión correctiva; si la fuente estaba publicada, genera reversals y conserva la versión anterior como SUPERSEDED.';

commit;
