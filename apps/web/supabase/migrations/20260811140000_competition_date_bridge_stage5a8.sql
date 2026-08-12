begin;

-- Stage 5A.8: the canonical bridge remains Event Division -> Tournament Link.
-- A tournament never receives a series_id or event_id column.
do $$
begin
  if to_regclass('public.tournaments') is null
     or to_regclass('public.competition_series_events') is null
     or to_regclass('public.competition_series_event_divisions') is null
     or to_regclass('public.competition_series_event_tournament_links') is null
     or to_regclass('public.competition_age_categories') is null
     or to_regprocedure('public.create_tournament_canonical(uuid,jsonb)') is null
     or to_regprocedure('public.create_competition_series_event(uuid,uuid,text)') is null
     or to_regprocedure('public.link_competition_series_event_tournament(uuid,uuid,uuid,uuid,integer,text,boolean,text)') is null then
    raise exception 'Stage 5A.8 requiere Tournament Engine, Stages 5A.1-5A.3 y categorías etarias.';
  end if;
end $$;

-- A prior remote attempt already created this durable idempotency primitive.
-- Reuse it only after proving it has the exact 5A.8B contract; otherwise stop
-- rather than masking an incompatible table with CREATE TABLE IF NOT EXISTS.
do $$
begin
  if to_regclass('public.competition_date_creation_commands') is null then
    execute $sql$
      create table public.competition_date_creation_commands (
        club_id uuid not null references public.clubs(id) on delete restrict,
        actor_id uuid not null references auth.users(id) on delete restrict,
        idempotency_key text not null,
        request_hash text not null,
        series_id uuid not null,
        response_payload jsonb,
        created_at timestamptz not null default now(),
        completed_at timestamptz,
        primary key (club_id, actor_id, idempotency_key),
        constraint competition_date_creation_commands_key_chk check (length(btrim(idempotency_key)) between 8 and 200),
        constraint competition_date_creation_commands_hash_chk check (request_hash ~ '^[0-9a-f]{64}$'),
        constraint competition_date_creation_commands_response_chk check (response_payload is null or jsonb_typeof(response_payload) = 'object')
      )
    $sql$;
  elsif not (
    (select count(*) from information_schema.columns column_info
      where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands') = 8
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='club_id' and column_info.udt_name='uuid' and column_info.is_nullable='NO')
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='actor_id' and column_info.udt_name='uuid' and column_info.is_nullable='NO')
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='idempotency_key' and column_info.udt_name='text' and column_info.is_nullable='NO')
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='request_hash' and column_info.udt_name='text' and column_info.is_nullable='NO')
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='series_id' and column_info.udt_name='uuid' and column_info.is_nullable='NO')
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='response_payload' and column_info.udt_name='jsonb' and column_info.is_nullable='YES')
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='created_at' and column_info.udt_name='timestamptz' and column_info.is_nullable='NO' and column_info.column_default='now()')
    and exists (select 1 from information_schema.columns column_info where column_info.table_schema='public' and column_info.table_name='competition_date_creation_commands' and column_info.column_name='completed_at' and column_info.udt_name='timestamptz' and column_info.is_nullable='YES')
    and exists (select 1 from pg_constraint constraint_info join pg_class relation on relation.oid=constraint_info.conrelid join pg_namespace schema_info on schema_info.oid=relation.relnamespace where schema_info.nspname='public' and relation.relname='competition_date_creation_commands' and constraint_info.conname='competition_date_creation_commands_pkey' and constraint_info.contype='p')
    and exists (select 1 from pg_constraint constraint_info join pg_class relation on relation.oid=constraint_info.conrelid join pg_namespace schema_info on schema_info.oid=relation.relnamespace where schema_info.nspname='public' and relation.relname='competition_date_creation_commands' and constraint_info.conname='competition_date_creation_commands_club_id_fkey' and constraint_info.contype='f')
    and exists (select 1 from pg_constraint constraint_info join pg_class relation on relation.oid=constraint_info.conrelid join pg_namespace schema_info on schema_info.oid=relation.relnamespace where schema_info.nspname='public' and relation.relname='competition_date_creation_commands' and constraint_info.conname='competition_date_creation_commands_actor_id_fkey' and constraint_info.contype='f')
    and exists (select 1 from pg_constraint constraint_info join pg_class relation on relation.oid=constraint_info.conrelid join pg_namespace schema_info on schema_info.oid=relation.relnamespace where schema_info.nspname='public' and relation.relname='competition_date_creation_commands' and constraint_info.conname='competition_date_creation_commands_key_chk' and constraint_info.contype='c')
    and exists (select 1 from pg_constraint constraint_info join pg_class relation on relation.oid=constraint_info.conrelid join pg_namespace schema_info on schema_info.oid=relation.relnamespace where schema_info.nspname='public' and relation.relname='competition_date_creation_commands' and constraint_info.conname='competition_date_creation_commands_hash_chk' and constraint_info.contype='c')
    and exists (select 1 from pg_constraint constraint_info join pg_class relation on relation.oid=constraint_info.conrelid join pg_namespace schema_info on schema_info.oid=relation.relnamespace where schema_info.nspname='public' and relation.relname='competition_date_creation_commands' and constraint_info.conname='competition_date_creation_commands_response_chk' and constraint_info.contype='c')
  ) then
    raise exception 'competition_date_creation_commands existe pero no tiene el contrato compatible de Stage 5A.8B.' using errcode='55000';
  end if;
end;
$$;

create index if not exists competition_date_creation_commands_series_idx
  on public.competition_date_creation_commands (club_id, series_id, created_at desc);

alter table public.competition_date_creation_commands enable row level security;
revoke all on table public.competition_date_creation_commands from public, anon, authenticated;
grant all on table public.competition_date_creation_commands to service_role;
drop policy if exists competition_date_creation_commands_owner_read on public.competition_date_creation_commands;
create policy competition_date_creation_commands_owner_read
  on public.competition_date_creation_commands for select to authenticated
  using (actor_id = auth.uid() and (public.is_platform_admin() or public.has_club_capability(club_id, 'competition:manage')));

create or replace function public.get_competition_date_creation_context(
  p_club_id uuid,
  p_series_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_series public.competition_series%rowtype;
  v_result jsonb;
  v_expected integer;
begin
  perform public.require_competition_event_access(p_club_id, false);
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'tournaments:create') then
    raise exception 'Sin permiso para crear torneos.' using errcode = '42501';
  end if;

  select * into v_series
  from public.competition_series series
  where series.id = p_series_id and series.club_id = p_club_id;
  if not found then raise exception 'Circuito inexistente.' using errcode = 'P0002'; end if;
  if v_series.status not in ('SCHEDULED', 'ACTIVE') or v_series.archived_at is not null then
    raise exception 'El circuito no admite nuevas fechas.' using errcode = '23514';
  end if;

  select count(*) into v_expected
  from public.competition_series_divisions series_division
  where series_division.series_id = v_series.id
    and series_division.club_id = v_series.club_id
    and series_division.is_active;
  if v_expected = 0 then
    raise exception 'El circuito no tiene divisiones activas.' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'series_id', v_series.id,
    'series_revision', v_series.revision,
    'series_name', v_series.name,
    'season', jsonb_build_object('id', season.id, 'name', season.name, 'starts_on', season.starts_on, 'ends_on', season.ends_on),
    'allowed_actions', jsonb_build_object('create_date', true),
    'divisions', coalesce(jsonb_agg(jsonb_build_object(
      'series_division_id', series_division.id,
      'division_id', division.id,
      'rule_id', rule.id,
      'rule_revision', rule.revision,
      'points_scheme_id', rule.points_scheme_id,
      'modality', division.modality,
      'branch_id', branch.id,
      'branch_name', branch.name,
      'branch_slug', branch.slug,
      'segment_id', segment.id,
      'segment_name', segment.name,
      'segment_slug', segment.slug,
      'category_id', category.id,
      'category_name', category.name,
      'legacy_category_id', category.legacy_category_id,
      'age_category_id', eligibility.age_category_id,
      'age_category_name', age.name
    ) order by series_division.sort_order, series_division.id), '[]'::jsonb)
  ) into v_result
  from public.competition_seasons season
  left join public.competition_series_divisions series_division
    on series_division.series_id = v_series.id and series_division.club_id = v_series.club_id and series_division.is_active
  join public.competition_divisions division
    on division.id = series_division.division_id and division.club_id = v_series.club_id
   and division.season_id = v_series.season_id and division.is_active
  join public.competition_branches branch on branch.id = division.branch_id and branch.club_id = v_series.club_id and branch.is_active
  join public.competition_segments segment on segment.id = division.segment_id and segment.club_id = v_series.club_id and segment.is_active
  left join public.competition_categories category on category.id = division.category_id and category.club_id = v_series.club_id and category.is_active
  join public.competition_series_rules rule
    on rule.series_division_id = series_division.id and rule.status = 'ACTIVE'
  join public.competition_series_eligibility eligibility on eligibility.series_rule_id = rule.id and eligibility.club_id = v_series.club_id
  left join public.competition_age_categories age on age.id = eligibility.age_category_id and age.club_id = v_series.club_id and age.is_active
  where season.id = v_series.season_id and season.club_id = v_series.club_id
    and branch.slug in ('caballeros', 'damas', 'mixto')
    and segment.slug in ('libres', 'menores', 'veteranos')
    and (
      (segment.slug = 'libres' and eligibility.age_category_id is null and category.legacy_category_id between 1 and 8)
      or
      (segment.slug = 'menores' and age.id is not null and age.max_age is not null and age.max_age <= 18
       and age.age_reference_rule in ('EVENT_START_DATE', 'CALENDAR_YEAR_END', 'FIXED_DATE'))
      or
      (segment.slug = 'veteranos' and age.id is not null and age.min_age is not null and age.min_age >= 18
       and age.age_reference_rule in ('EVENT_START_DATE', 'CALENDAR_YEAR_END', 'FIXED_DATE'))
    )
  group by season.id, season.name, season.starts_on, season.ends_on;

  if v_result is null or jsonb_array_length(v_result -> 'divisions') = 0
     or jsonb_array_length(v_result -> 'divisions') <> v_expected
     or exists (select 1 from jsonb_array_elements(v_result -> 'divisions') item where item ->> 'rule_id' is null) then
    raise exception 'El circuito tiene divisiones sin regla o elegibilidad deportiva válida.' using errcode = '23514';
  end if;
  return v_result;
end;
$$;

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
  v_actor uuid;
  v_command public.competition_date_creation_commands%rowtype;
  v_series public.competition_series%rowtype;
  v_series_division public.competition_series_divisions%rowtype;
  v_competition_division public.competition_divisions%rowtype;
  v_rule public.competition_series_rules%rowtype;
  v_eligibility public.competition_series_eligibility%rowtype;
  v_tier public.competition_event_tiers%rowtype;
  v_tournament public.tournaments%rowtype;
  v_event public.competition_series_events%rowtype;
  v_event_division public.competition_series_event_divisions%rowtype;
  v_link jsonb;
  v_response jsonb;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_event_name text := btrim(coalesce(p_event_payload ->> 'name', p_tournament_payload ->> 'name', ''));
  v_event_type text := upper(coalesce(nullif(btrim(p_event_payload ->> 'event_type'), ''), 'STANDARD'));
  v_scoring_mode text := upper(coalesce(nullif(btrim(p_event_payload ->> 'scoring_mode'), ''), ''));
  v_link_key text;
  v_context jsonb;
  v_scope jsonb;
  v_gender text;
  v_segment text;
  v_tournament_input jsonb;
begin
  v_actor := public.require_competition_event_access(p_club_id, false);
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'tournaments:create') then
    raise exception 'Sin permiso para crear torneos.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_event_payload) is distinct from 'object' or jsonb_typeof(p_tournament_payload) is distinct from 'object' then
    raise exception 'Payload inválido.' using errcode = '22023';
  end if;
  if length(v_key) not between 8 and 200 then raise exception 'Solicitud inválida.' using errcode = '22023'; end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'series_id', p_series_id, 'series_revision', p_series_revision, 'series_division_id', p_series_division_id,
    'rule_id', p_rule_id, 'rule_revision', p_rule_revision, 'event', p_event_payload, 'tournament', p_tournament_payload
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.competition_date_creation_commands(club_id, actor_id, idempotency_key, request_hash, series_id)
  values (p_club_id, v_actor, v_key, v_hash, p_series_id)
  on conflict (club_id, actor_id, idempotency_key) do nothing
  returning * into v_command;
  if not found then
    select * into v_command from public.competition_date_creation_commands command
    where command.club_id = p_club_id and command.actor_id = v_actor and command.idempotency_key = v_key
    for update;
    if v_command.request_hash is distinct from v_hash or v_command.series_id is distinct from p_series_id then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_command.response_payload is not null then return v_command.response_payload; end if;
    raise exception 'La solicitud todavía está en proceso.' using errcode = '55P03';
  end if;

  select * into v_series from public.competition_series series
  where series.id = p_series_id and series.club_id = p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode = 'P0002'; end if;
  if v_series.revision <> p_series_revision then raise exception 'PRECONDITION_FAILED' using errcode = '40001'; end if;
  if v_series.status not in ('SCHEDULED', 'ACTIVE') or v_series.archived_at is not null then raise exception 'El circuito no admite nuevas fechas.' using errcode = '23514'; end if;
  select * into v_series_division from public.competition_series_divisions division
  where division.id = p_series_division_id and division.club_id = p_club_id and division.series_id = v_series.id and division.is_active for update;
  if not found then raise exception 'División de circuito inválida.' using errcode = '23514'; end if;
  select * into v_competition_division
  from public.competition_divisions division
  where division.id = v_series_division.division_id
    and division.club_id = p_club_id
    and division.season_id = v_series.season_id
    and division.is_active;
  if not found then raise exception 'La división no pertenece a la temporada del circuito.' using errcode = '23514'; end if;
  select * into v_rule from public.competition_series_rules rule
  where rule.id = p_rule_id and rule.club_id = p_club_id and rule.series_division_id = v_series_division.id and rule.status = 'ACTIVE';
  if not found or v_rule.revision <> p_rule_revision then raise exception 'Regla obsoleta o inválida.' using errcode = '40001'; end if;
  select * into v_eligibility from public.competition_series_eligibility eligibility where eligibility.series_rule_id = v_rule.id;
  if not found then raise exception 'La regla requiere elegibilidad.' using errcode = '23514'; end if;
  -- Reuse the same validator exposed by the context RPC. It verifies eligibility,
  -- age category, branch/segment/category and season before any write occurs.
  v_context := public.get_competition_date_creation_context(p_club_id, p_series_id);
  select item into v_scope from jsonb_array_elements(v_context->'divisions') item
  where (item->>'series_division_id')::uuid=p_series_division_id;
  if v_scope is null then raise exception 'La división no pertenece al contexto canónico.' using errcode='23514'; end if;
  v_gender:=case v_scope->>'branch_slug' when 'caballeros' then 'MALE' when 'damas' then 'FEMALE' when 'mixto' then 'MIXED' end;
  v_segment:=upper(v_scope->>'segment_slug');
  if v_scoring_mode not in ('POINTS', 'NON_SCORING') then
    raise exception 'Scoring inválido.' using errcode = '22023';
  end if;
  if p_tournament_payload ? 'rule_id'
     and nullif(p_tournament_payload ->> 'rule_id', '')::uuid is distinct from v_rule.id then
    raise exception 'La regla declarada contradice al circuito.' using errcode = '23514';
  end if;
  if p_tournament_payload ? 'points_scheme_id'
     and nullif(p_tournament_payload ->> 'points_scheme_id', '') is not null then
    raise exception 'Competition administra la tabla de puntos; Tournament no debe declararla.' using errcode = '23514';
  end if;
  if (p_tournament_payload ? 'points_enabled' and public.tournament_json_truthy(p_tournament_payload -> 'points_enabled'))
     or (jsonb_typeof(p_tournament_payload -> 'points_config') = 'object'
       and public.tournament_json_truthy(p_tournament_payload -> 'points_config' -> 'enabled')) then
    raise exception 'Competition administra los puntos; Tournament debe mantener puntos legacy desactivados.' using errcode = '23514';
  end if;
  if v_scoring_mode = 'POINTS' then
    if not exists (select 1 from public.points_schemes scheme where scheme.id = v_rule.points_scheme_id and scheme.is_active and (scheme.is_global or scheme.club_id = p_club_id)) then
      raise exception 'La tabla de puntos no está disponible.' using errcode = '23514';
    end if;
    select * into v_tier from public.competition_event_tiers tier
    where tier.id = nullif(p_event_payload ->> 'event_tier_id', '')::uuid and tier.club_id = p_club_id and tier.is_active;
    if not found then raise exception 'El tier del evento es obligatorio y debe estar activo.' using errcode = '23514'; end if;
  else
    if nullif(p_event_payload ->> 'event_tier_id', '') is not null
       or nullif(p_event_payload ->> 'points_scheme_id', '') is not null
       or nullif(p_event_payload ->> 'points_multiplier', '') is not null then
      raise exception 'NON_SCORING no admite tier, tabla ni multiplicador.' using errcode = '23514';
    end if;
  end if;
  v_link_key := 'bridge-' || encode(extensions.digest(convert_to(
    p_club_id::text || ':' || v_actor::text || ':' || v_key || ':tournament-link', 'UTF8'), 'sha256'), 'hex');

  if (p_tournament_payload?'gender' and upper(btrim(p_tournament_payload->>'gender')) is distinct from v_gender)
     or (p_tournament_payload?'segment' and upper(btrim(p_tournament_payload->>'segment')) is distinct from v_segment)
     or (p_tournament_payload?'category_id' and nullif(p_tournament_payload->>'category_id','')::integer is distinct from (v_scope->>'legacy_category_id')::integer)
     or (p_tournament_payload?'age_category_id' and nullif(p_tournament_payload->>'age_category_id','')::uuid is distinct from nullif(v_scope->>'age_category_id','')::uuid) then
    raise exception 'El payload Tournament contradice al circuito.' using errcode='23514';
  end if;
  v_tournament_input:=(p_tournament_payload-array['points_enabled','points_scheme_id'])||jsonb_build_object('gender',v_gender,'segment',v_segment,'segment_type',v_segment,
    'category_rule','FIXED_CATEGORY','category_id',case when v_segment='LIBRES' then (v_scope->>'legacy_category_id')::integer end,
    'age_category_id',case when v_segment<>'LIBRES' then v_scope->>'age_category_id' end,
    'points_config',jsonb_build_object('enabled',false,'editable',false,'winner',0,'finalist',0,'semifinalist',0,
      'quarterfinalist',0,'eighthFinalist',0,'participation',0));
  v_tournament := public.create_tournament_canonical(p_club_id,v_tournament_input);
  v_event := public.create_competition_series_event(p_club_id, v_series.id, v_event_name);
  v_event := public.update_competition_series_event_draft(p_club_id, v_event.id, v_event.revision,
    jsonb_strip_nulls(jsonb_build_object(
      'event_type', v_event_type,
      'planned_starts_at', coalesce(p_event_payload ->> 'planned_starts_at', p_tournament_payload ->> 'start_date'),
      'planned_ends_at', coalesce(p_event_payload ->> 'planned_ends_at', p_tournament_payload ->> 'end_date'),
      'timezone', nullif(btrim(p_event_payload ->> 'timezone'), ''),
      'venue_name', nullif(btrim(p_event_payload ->> 'venue_name'), ''),
      'venue_address', nullif(btrim(p_event_payload ->> 'venue_address'), ''),
      'is_public', coalesce((p_event_payload ->> 'is_public')::boolean, false)
    ))
  );
  v_event_division := public.add_competition_series_event_division(p_club_id, v_event.id, v_series_division.id, 0, v_event.revision);
  select * into v_event from public.competition_series_events event where event.id = v_event.id and event.club_id = p_club_id;
  v_event_division := public.configure_competition_series_event_division(
    p_club_id, v_event.id, v_event_division.id, v_event.revision, v_scoring_mode,
    case when v_scoring_mode = 'POINTS' then v_tier.id else null end,
    case when v_scoring_mode = 'POINTS' then v_rule.points_scheme_id else null end,
    null
  );
  select * into v_event from public.competition_series_events event where event.id = v_event.id and event.club_id = p_club_id;
  v_link := public.link_competition_series_event_tournament(p_club_id, v_event.id, v_event_division.id, v_tournament.id, v_event.revision, v_link_key, false, null);
  v_response := jsonb_build_object(
    'tournament_id', v_tournament.id, 'event_id', v_event.id, 'event_division_id', v_event_division.id,
    'link_id', (v_link ->> 'link_id')::uuid, 'event_revision', v_link -> 'revision', 'reused', false
  );
  update public.competition_date_creation_commands command
  set response_payload = v_response, completed_at = now()
  where command.club_id = p_club_id and command.actor_id = v_actor and command.idempotency_key = v_key;
  return v_response;
end;
$$;

revoke all on function public.get_competition_date_creation_context(uuid,uuid) from public, anon;
revoke all on function public.create_competition_date_tournament_atomic(uuid,uuid,integer,uuid,uuid,integer,text,jsonb,jsonb) from public, anon;
grant execute on function public.get_competition_date_creation_context(uuid,uuid) to authenticated;
grant execute on function public.create_competition_date_tournament_atomic(uuid,uuid,integer,uuid,uuid,integer,text,jsonb,jsonb) to authenticated;

comment on table public.competition_date_creation_commands is 'Stage 5A.8 durable idempotency for atomic Competition date + Tournament creation.';
comment on function public.create_competition_date_tournament_atomic(uuid,uuid,integer,uuid,uuid,integer,text,jsonb,jsonb) is 'Stage 5A.8 atomic bridge: creates Tournament DRAFT, Event DRAFT, Event Division DRAFT and ACTIVE link. No settlement, ledger or ranking effects.';

commit;
