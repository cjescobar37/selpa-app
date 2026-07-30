begin;

do $$
begin
  if to_regclass('public.competition_seasons') is null
     or to_regclass('public.competition_divisions') is null
     or to_regclass('public.competition_age_categories') is null
     or to_regclass('public.points_schemes') is null
     or to_regprocedure('public.has_club_capability(uuid,text)') is null then
    raise exception 'Stage 5A.2 requiere Competition Engine Stages 1-4 y Stage 5A.1.';
  end if;
end
$$;

create or replace function public.has_club_capability(p_club_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.club_role;
  v_capability text := lower(btrim(coalesce(p_capability, '')));
begin
  if v_capability not in (
    'dashboard:view', 'club:view', 'club:update', 'club:branding', 'club:profile_manage',
    'memberships:view', 'memberships:manage', 'roles:view', 'roles:manage', 'ownership:transfer',
    'players:view', 'players:manage', 'players:private_view', 'ranking:view', 'ranking:manage',
    'competition:view', 'competition:manage',
    'tournaments:view', 'tournaments:create', 'tournaments:update', 'tournaments:publish',
    'tournaments:cancel', 'tournaments:delete', 'registrations:view', 'registrations:manage',
    'groups:generate', 'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
    'finance:view', 'finance:manage', 'payments:view', 'payments:manage',
    'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
    'messages:view', 'messages:reply', 'reports:operational_view', 'audit:view', 'security:manage'
  ) then
    raise exception 'Unknown club capability: %', p_capability using errcode = '22023';
  end if;

  select membership.role
  into v_role
  from public.club_memberships membership
  where membership.club_id = p_club_id
    and membership.user_id = auth.uid()
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  limit 1;

  if v_role::text = 'OWNER' then return true; end if;
  if v_role::text = 'ADMIN' then return v_capability <> 'ownership:transfer'; end if;
  if v_role::text = 'OPERADOR' then
    return v_capability in (
      'dashboard:view', 'club:view', 'memberships:view', 'memberships:manage',
      'players:view', 'players:manage', 'players:private_view', 'ranking:view', 'ranking:manage',
      'competition:view', 'competition:manage',
      'tournaments:view', 'tournaments:create', 'tournaments:update', 'tournaments:publish',
      'tournaments:cancel', 'registrations:view', 'registrations:manage', 'groups:generate',
      'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
      'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
      'messages:view', 'messages:reply', 'reports:operational_view'
    );
  end if;
  if v_role::text = 'PLANILLERO' then
    return v_capability in (
      'dashboard:view', 'club:view', 'competition:view',
      'tournaments:view', 'matches:view', 'matches:update'
    );
  end if;
  return false;
end;
$$;

revoke all on function public.has_club_capability(uuid, text) from public, anon;
grant execute on function public.has_club_capability(uuid, text) to authenticated, service_role;

create table public.competition_series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_id uuid not null,
  name text not null,
  code text,
  description text,
  starts_on date,
  ends_on date,
  status text not null default 'DRAFT',
  planned_events_count integer,
  minimum_events_count integer,
  is_public boolean not null default false,
  revision integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  scheduled_by uuid references auth.users(id) on delete restrict,
  scheduled_at timestamptz,
  activated_by uuid references auth.users(id) on delete restrict,
  activated_at timestamptz,
  closed_by uuid references auth.users(id) on delete restrict,
  closed_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  archived_by uuid references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_series_season_fkey foreign key (club_id, season_id)
    references public.competition_seasons(club_id, id) on delete restrict,
  constraint competition_series_name_chk check (length(btrim(name)) > 0),
  constraint competition_series_code_chk check (code is null or length(btrim(code)) > 0),
  constraint competition_series_description_chk check (description is null or length(btrim(description)) > 0),
  constraint competition_series_status_chk check (status in ('DRAFT','SCHEDULED','ACTIVE','CLOSED','CANCELLED')),
  constraint competition_series_dates_chk check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint competition_series_planned_chk check (planned_events_count is null or planned_events_count >= 0),
  constraint competition_series_minimum_chk check (minimum_events_count is null or minimum_events_count >= 0),
  constraint competition_series_counts_chk check (
    planned_events_count is null or minimum_events_count is null or minimum_events_count <= planned_events_count
  ),
  constraint competition_series_revision_chk check (revision > 0),
  constraint competition_series_cancel_reason_chk check (
    status <> 'CANCELLED' or length(btrim(coalesce(cancellation_reason, ''))) > 0
  ),
  constraint competition_series_club_id_id_key unique (club_id, id)
);

create unique index competition_series_code_uidx
  on public.competition_series (club_id, season_id, lower(code))
  where code is not null;
create index competition_series_club_season_idx
  on public.competition_series (club_id, season_id, status, starts_on);
create index competition_series_visible_idx
  on public.competition_series (club_id, is_public, status)
  where archived_at is null;

create table public.competition_series_divisions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  series_id uuid not null,
  division_id uuid not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  division_snapshot jsonb,
  frozen_at timestamptz,
  removed_by uuid references auth.users(id) on delete restrict,
  removed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_series_divisions_series_fkey foreign key (club_id, series_id)
    references public.competition_series(club_id, id) on delete restrict,
  constraint competition_series_divisions_division_fkey foreign key (club_id, division_id)
    references public.competition_divisions(club_id, id) on delete restrict,
  constraint competition_series_divisions_snapshot_chk check (
    division_snapshot is null or jsonb_typeof(division_snapshot) = 'object'
  ),
  constraint competition_series_divisions_removal_chk check (
    (is_active and removed_at is null and removed_by is null)
    or (not is_active and removed_at is not null and removed_by is not null)
  ),
  constraint competition_series_divisions_revision_chk check (revision > 0),
  constraint competition_series_divisions_series_division_key unique (series_id, division_id),
  constraint competition_series_divisions_club_id_id_key unique (club_id, id)
);

create index competition_series_divisions_series_idx
  on public.competition_series_divisions (series_id, is_active, sort_order);

create table public.competition_series_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  series_division_id uuid not null,
  version integer not null,
  status text not null default 'DRAFT',
  points_scheme_id uuid not null references public.points_schemes(id) on delete restrict,
  accumulation_mode text not null default 'ALL_RESULTS',
  best_results_count integer,
  discard_worst_count integer,
  minimum_participations integer not null default 0,
  master_final_qualification_count integer,
  master_final_multiplier numeric(10,4) not null default 1,
  tie_breakers jsonb not null default '[]'::jsonb,
  bonus_rules jsonb not null default '{}'::jsonb,
  penalty_rules jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  frozen_at timestamptz,
  superseded_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_series_rules_division_fkey foreign key (club_id, series_division_id)
    references public.competition_series_divisions(club_id, id) on delete restrict,
  constraint competition_series_rules_version_chk check (version > 0),
  constraint competition_series_rules_status_chk check (status in ('DRAFT','ACTIVE','SUPERSEDED')),
  constraint competition_series_rules_mode_chk check (accumulation_mode in ('ALL_RESULTS','BEST_N','DROP_WORST_N')),
  constraint competition_series_rules_mode_values_chk check (
    (accumulation_mode = 'ALL_RESULTS' and best_results_count is null and discard_worst_count is null)
    or (accumulation_mode = 'BEST_N' and best_results_count > 0 and discard_worst_count is null)
    or (accumulation_mode = 'DROP_WORST_N' and discard_worst_count > 0 and best_results_count is null)
  ),
  constraint competition_series_rules_min_participations_chk check (minimum_participations >= 0),
  constraint competition_series_rules_master_count_chk check (
    master_final_qualification_count is null or master_final_qualification_count >= 0
  ),
  constraint competition_series_rules_master_multiplier_chk check (master_final_multiplier > 0),
  constraint competition_series_rules_tie_breakers_chk check (jsonb_typeof(tie_breakers) = 'array'),
  constraint competition_series_rules_bonus_chk check (jsonb_typeof(bonus_rules) = 'object'),
  constraint competition_series_rules_penalty_chk check (jsonb_typeof(penalty_rules) = 'object'),
  constraint competition_series_rules_frozen_chk check (frozen_at is null or status = 'ACTIVE'),
  constraint competition_series_rules_superseded_chk check (
    (status = 'SUPERSEDED' and superseded_at is not null) or (status <> 'SUPERSEDED' and superseded_at is null)
  ),
  constraint competition_series_rules_revision_chk check (revision > 0),
  constraint competition_series_rules_division_version_key unique (series_division_id, version),
  constraint competition_series_rules_club_id_id_key unique (club_id, id)
);

create unique index competition_series_rules_one_active_uidx
  on public.competition_series_rules (series_division_id)
  where status = 'ACTIVE';
create index competition_series_rules_division_idx
  on public.competition_series_rules (series_division_id, version desc);

create table public.competition_series_eligibility (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  series_rule_id uuid not null,
  requires_active_entry boolean not null default true,
  allow_invited_players boolean not null default false,
  invited_points_policy text not null default 'REQUIRE_ENTRY',
  require_same_division_pair boolean not null default true,
  age_category_id uuid,
  additional_rules jsonb not null default '{}'::jsonb,
  frozen_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_series_eligibility_rule_fkey foreign key (club_id, series_rule_id)
    references public.competition_series_rules(club_id, id) on delete restrict,
  constraint competition_series_eligibility_age_fkey foreign key (club_id, age_category_id)
    references public.competition_age_categories(club_id, id) on delete restrict,
  constraint competition_series_eligibility_policy_chk check (invited_points_policy in ('NON_SCORING','REQUIRE_ENTRY')),
  constraint competition_series_eligibility_invited_chk check (
    allow_invited_players or invited_points_policy = 'REQUIRE_ENTRY'
  ),
  constraint competition_series_eligibility_rules_chk check (jsonb_typeof(additional_rules) = 'object'),
  constraint competition_series_eligibility_revision_chk check (revision > 0),
  constraint competition_series_eligibility_rule_key unique (series_rule_id),
  constraint competition_series_eligibility_club_id_id_key unique (club_id, id)
);

create index competition_series_eligibility_age_idx
  on public.competition_series_eligibility (age_category_id)
  where age_category_id is not null;

create or replace function public.is_valid_competition_series_tie_breakers(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_seen text[] := array[]::text[];
  v_criterion text;
  v_index integer := 0;
  v_total integer;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  v_total := jsonb_array_length(p_value);
  for v_item in select value from jsonb_array_elements(p_value) loop
    v_index := v_index + 1;
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ? 'criterion')
       or jsonb_typeof(coalesce(v_item->'params', '{}'::jsonb)) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_item) key where key not in ('criterion','params')) then
      return false;
    end if;
    v_criterion := upper(btrim(v_item->>'criterion'));
    if v_criterion not in (
      'TOURNAMENT_WINS','FINALS','SEMIFINALS','MASTER_RESULT','PARTICIPATIONS',
      'HEAD_TO_HEAD','LATEST_BEST_RESULT','ADMIN_DECISION'
    ) or v_criterion = any(v_seen) then return false; end if;
    if v_criterion = 'ADMIN_DECISION' and v_index <> v_total then return false; end if;
    v_seen := array_append(v_seen, v_criterion);
  end loop;
  return true;
end;
$$;

create or replace function public.is_valid_competition_division_snapshot(p_value jsonb)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select p_value is null or (
    jsonb_typeof(p_value)='object'
    and p_value ?& array['division_id','division_name','modality','branch_id','branch_name','segment_id','segment_name','category_id','category_name','season_id','season_name']
    and not exists (
      select 1 from jsonb_object_keys(p_value) as keys(key_name)
      where key_name <> all(array['division_id','division_name','modality','branch_id','branch_name','segment_id','segment_name','category_id','category_name','season_id','season_name'])
    )
  )
$$;

alter table public.competition_series_divisions
  add constraint competition_series_divisions_snapshot_shape_chk
  check (public.is_valid_competition_division_snapshot(division_snapshot));

alter table public.competition_series_rules
  add constraint competition_series_rules_tie_breakers_contract_chk
  check (public.is_valid_competition_series_tie_breakers(tie_breakers));

create or replace function public.require_competition_series_access(
  p_club_id uuid,
  p_capability text,
  p_lifecycle boolean default false
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  if v_actor is null then raise exception 'Sesión requerida.' using errcode = '28000'; end if;
  if not exists (select 1 from public.clubs club where club.id = p_club_id) then
    raise exception 'Club inexistente.' using errcode = 'P0002';
  end if;
  if public.is_platform_admin() then return v_actor; end if;
  if not public.has_club_capability(p_club_id, p_capability) then
    raise exception 'Sin permisos para gestionar Competition Series.' using errcode = '42501';
  end if;
  if p_lifecycle then
    select membership.role::text into v_role
    from public.club_memberships membership
    where membership.club_id = p_club_id and membership.user_id = v_actor
      and membership.status = 'APPROVED' and membership.approved_at is not null;
    if v_role not in ('OWNER','ADMIN') then
      raise exception 'Solo OWNER o ADMIN pueden cambiar el ciclo de vida.' using errcode = '42501';
    end if;
  end if;
  return v_actor;
end;
$$;

create or replace function public.guard_competition_series_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if current_setting('selpa.competition_series_write', true) is distinct from 'allowed' then
    raise exception 'La estructura de Competition Series solo puede modificarse mediante RPC autorizada.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.revision := old.revision + 1;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.validate_competition_series_rule_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_scheme record;
begin
  select scheme.club_id, scheme.is_global, scheme.is_active
  into v_scheme
  from public.points_schemes scheme
  where scheme.id = new.points_scheme_id;
  if not found then raise exception 'Esquema de puntos inexistente.' using errcode = '23503'; end if;
  if not v_scheme.is_active then raise exception 'El esquema de puntos está inactivo.' using errcode = '23514'; end if;
  if not v_scheme.is_global and v_scheme.club_id is distinct from new.club_id then
    raise exception 'El esquema de puntos pertenece a otro club.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_competition_series_guard before insert or update or delete on public.competition_series
  for each row execute function public.guard_competition_series_mutation();
create trigger trg_competition_series_divisions_guard before insert or update or delete on public.competition_series_divisions
  for each row execute function public.guard_competition_series_mutation();
create trigger trg_competition_series_rules_guard before insert or update or delete on public.competition_series_rules
  for each row execute function public.guard_competition_series_mutation();
create trigger trg_competition_series_eligibility_guard before insert or update or delete on public.competition_series_eligibility
  for each row execute function public.guard_competition_series_mutation();
create trigger trg_competition_series_rules_scope before insert or update of club_id, points_scheme_id on public.competition_series_rules
  for each row execute function public.validate_competition_series_rule_scope();

create or replace function public.create_competition_series(p_club_id uuid, p_season_id uuid, p_name text)
returns public.competition_series
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_season public.competition_seasons%rowtype; v_actor uuid; v_result public.competition_series%rowtype;
begin
  perform public.require_competition_series_access(p_club_id, 'competition:manage');
  select * into v_season from public.competition_seasons season where season.id = p_season_id and season.club_id = p_club_id;
  if not found then raise exception 'Temporada inexistente.' using errcode='P0002'; end if;
  v_actor := public.require_competition_series_access(v_season.club_id, 'competition:manage');
  if length(btrim(coalesce(p_name,''))) = 0 then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series(club_id,season_id,name,created_by)
  values(v_season.club_id,p_season_id,btrim(p_name),v_actor) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.update_competition_series_draft(
  p_club_id uuid, p_series_id uuid, p_revision integer, p_name text, p_code text default null,
  p_description text default null, p_starts_on date default null, p_ends_on date default null,
  p_planned_events_count integer default null, p_minimum_events_count integer default null,
  p_is_public boolean default false
)
returns public.competition_series
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_series public.competition_series%rowtype; v_season public.competition_seasons%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  perform public.require_competition_series_access(v_series.club_id,'competition:manage');
  if v_series.status <> 'DRAFT' then raise exception 'Solo puede editarse un circuito DRAFT.' using errcode='23514'; end if;
  if v_series.revision <> p_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  select * into v_season from public.competition_seasons where id=v_series.season_id and club_id=v_series.club_id;
  if length(btrim(coalesce(p_name,'')))=0 then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if p_starts_on is not null and (p_starts_on < v_season.starts_on or p_starts_on > v_season.ends_on)
     or p_ends_on is not null and (p_ends_on < v_season.starts_on or p_ends_on > v_season.ends_on) then
    raise exception 'Las fechas deben estar dentro de la temporada.' using errcode='23514';
  end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set name=btrim(p_name), code=nullif(upper(btrim(coalesce(p_code,''))),''),
    description=nullif(btrim(coalesce(p_description,'')),''), starts_on=p_starts_on, ends_on=p_ends_on,
    planned_events_count=p_planned_events_count, minimum_events_count=p_minimum_events_count,
    is_public=coalesce(p_is_public,false)
  where id=p_series_id returning * into v_series;
  return v_series;
end;
$$;

create or replace function public.add_competition_series_division(
  p_club_id uuid, p_series_id uuid, p_division_id uuid, p_sort_order integer, p_series_revision integer
)
returns public.competition_series_divisions
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_series public.competition_series%rowtype; v_division public.competition_divisions%rowtype; v_result public.competition_series_divisions%rowtype; v_actor uuid;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  v_actor:=public.require_competition_series_access(v_series.club_id,'competition:manage');
  if v_series.status not in ('DRAFT','SCHEDULED') then raise exception 'La estructura está congelada.' using errcode='23514'; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  select * into v_division from public.competition_divisions where id=p_division_id;
  if not found or v_division.club_id<>v_series.club_id or v_division.season_id<>v_series.season_id then
    raise exception 'La división no pertenece al club y temporada del circuito.' using errcode='23514';
  end if;
  if not v_division.is_active then raise exception 'La división está inactiva.' using errcode='23514'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  select * into v_result from public.competition_series_divisions where series_id=p_series_id and division_id=p_division_id for update;
  if found then
    if v_result.frozen_at is not null then raise exception 'La división está congelada.' using errcode='23514'; end if;
    if v_result.is_active and v_result.sort_order = p_sort_order then return v_result; end if;
    update public.competition_series_divisions set is_active=true,removed_at=null,removed_by=null,sort_order=p_sort_order
      where id=v_result.id returning * into v_result;
  else
    insert into public.competition_series_divisions(club_id,series_id,division_id,sort_order,created_by)
      values(v_series.club_id,p_series_id,p_division_id,p_sort_order,v_actor) returning * into v_result;
  end if;
  update public.competition_series set updated_at=now() where id=p_series_id;
  return v_result;
end;
$$;

create or replace function public.remove_competition_series_division(
  p_club_id uuid, p_series_division_id uuid, p_series_revision integer
)
returns public.competition_series_divisions
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_link public.competition_series_divisions%rowtype; v_series public.competition_series%rowtype; v_actor uuid;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_link from public.competition_series_divisions where id=p_series_division_id and club_id=p_club_id for update;
  if not found then raise exception 'División del circuito inexistente.' using errcode='P0002'; end if;
  select * into v_series from public.competition_series where id=v_link.series_id for update;
  v_actor:=public.require_competition_series_access(v_series.club_id,'competition:manage');
  if v_series.status not in ('DRAFT','SCHEDULED') or v_link.frozen_at is not null then raise exception 'La estructura está congelada.' using errcode='23514'; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series_divisions set is_active=false,removed_at=now(),removed_by=v_actor where id=v_link.id returning * into v_link;
  update public.competition_series set updated_at=now() where id=v_series.id;
  return v_link;
end;
$$;

create or replace function public.create_competition_series_rule_version(
  p_club_id uuid, p_series_division_id uuid, p_points_scheme_id uuid, p_clone_rule_id uuid default null
)
returns public.competition_series_rules
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_link public.competition_series_divisions%rowtype; v_series public.competition_series%rowtype; v_source public.competition_series_rules%rowtype; v_result public.competition_series_rules%rowtype; v_actor uuid; v_version integer;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_link from public.competition_series_divisions where id=p_series_division_id and club_id=p_club_id for update;
  if not found then raise exception 'División del circuito inexistente.' using errcode='P0002'; end if;
  select * into v_series from public.competition_series where id=v_link.series_id for update;
  v_actor:=public.require_competition_series_access(v_series.club_id,'competition:manage');
  if v_series.status not in ('DRAFT','SCHEDULED') or v_link.frozen_at is not null then raise exception 'Las reglas están congeladas.' using errcode='23514'; end if;
  if p_clone_rule_id is not null then
    select * into v_source from public.competition_series_rules where id=p_clone_rule_id and series_division_id=p_series_division_id;
    if not found then raise exception 'Regla de origen inexistente.' using errcode='P0002'; end if;
  end if;
  select coalesce(max(version),0)+1 into v_version from public.competition_series_rules where series_division_id=p_series_division_id;
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series_rules(
    club_id,series_division_id,version,points_scheme_id,accumulation_mode,best_results_count,
    discard_worst_count,minimum_participations,master_final_qualification_count,master_final_multiplier,
    tie_breakers,bonus_rules,penalty_rules,effective_from,created_by
  ) values(
    v_series.club_id,p_series_division_id,v_version,coalesce(p_points_scheme_id,v_source.points_scheme_id),
    coalesce(v_source.accumulation_mode,'ALL_RESULTS'),v_source.best_results_count,v_source.discard_worst_count,
    coalesce(v_source.minimum_participations,0),v_source.master_final_qualification_count,
    coalesce(v_source.master_final_multiplier,1),coalesce(v_source.tie_breakers,'[]'::jsonb),
    coalesce(v_source.bonus_rules,'{}'::jsonb),coalesce(v_source.penalty_rules,'{}'::jsonb),v_source.effective_from,v_actor
  ) returning * into v_result;
  if p_clone_rule_id is not null then
    insert into public.competition_series_eligibility(
      club_id,series_rule_id,requires_active_entry,allow_invited_players,invited_points_policy,
      require_same_division_pair,age_category_id,additional_rules,created_by
    ) select v_series.club_id,v_result.id,e.requires_active_entry,e.allow_invited_players,e.invited_points_policy,
      e.require_same_division_pair,e.age_category_id,e.additional_rules,v_actor
      from public.competition_series_eligibility e where e.series_rule_id=p_clone_rule_id;
  end if;
  return v_result;
end;
$$;

create or replace function public.update_competition_series_rule_draft(
  p_club_id uuid, p_rule_id uuid, p_revision integer, p_config jsonb
)
returns public.competition_series_rules
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_rule public.competition_series_rules%rowtype; v_link public.competition_series_divisions%rowtype; v_series public.competition_series%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_rule from public.competition_series_rules where id=p_rule_id and club_id=p_club_id for update;
  if not found then raise exception 'Regla inexistente.' using errcode='P0002'; end if;
  select * into v_link from public.competition_series_divisions where id=v_rule.series_division_id;
  select * into v_series from public.competition_series where id=v_link.series_id;
  perform public.require_competition_series_access(v_rule.club_id,'competition:manage');
  if v_rule.status<>'DRAFT' or v_rule.frozen_at is not null or v_series.status not in ('DRAFT','SCHEDULED') then raise exception 'Solo se editan reglas DRAFT.' using errcode='23514'; end if;
  if v_rule.revision<>p_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'Configuración inválida.' using errcode='22023'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series_rules set
    points_scheme_id=coalesce((p_config->>'points_scheme_id')::uuid,points_scheme_id),
    accumulation_mode=coalesce(nullif(upper(btrim(p_config->>'accumulation_mode')),''),accumulation_mode),
    best_results_count=case when p_config ? 'best_results_count' then (p_config->>'best_results_count')::integer else best_results_count end,
    discard_worst_count=case when p_config ? 'discard_worst_count' then (p_config->>'discard_worst_count')::integer else discard_worst_count end,
    minimum_participations=coalesce((p_config->>'minimum_participations')::integer,minimum_participations),
    master_final_qualification_count=case when p_config ? 'master_final_qualification_count' then (p_config->>'master_final_qualification_count')::integer else master_final_qualification_count end,
    master_final_multiplier=coalesce((p_config->>'master_final_multiplier')::numeric,master_final_multiplier),
    tie_breakers=coalesce(p_config->'tie_breakers',tie_breakers),bonus_rules=coalesce(p_config->'bonus_rules',bonus_rules),
    penalty_rules=coalesce(p_config->'penalty_rules',penalty_rules),
    effective_from=case when p_config ? 'effective_from' then (p_config->>'effective_from')::timestamptz else effective_from end
  where id=p_rule_id returning * into v_rule;
  return v_rule;
end;
$$;

create or replace function public.set_competition_series_eligibility(p_club_id uuid, p_rule_id uuid, p_revision integer, p_config jsonb)
returns public.competition_series_eligibility
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_rule public.competition_series_rules%rowtype; v_actor uuid; v_result public.competition_series_eligibility%rowtype; v_current public.competition_series_eligibility%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_rule from public.competition_series_rules where id=p_rule_id and club_id=p_club_id for update;
  if not found then raise exception 'Regla inexistente.' using errcode='P0002'; end if;
  v_actor:=public.require_competition_series_access(v_rule.club_id,'competition:manage');
  if v_rule.status<>'DRAFT' or v_rule.frozen_at is not null then raise exception 'La elegibilidad solo se edita en una regla DRAFT.' using errcode='23514'; end if;
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'Elegibilidad inválida.' using errcode='22023'; end if;
  select * into v_current from public.competition_series_eligibility where series_rule_id=p_rule_id for update;
  if found and (p_revision is null or v_current.revision<>p_revision) then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  if not found and p_revision is not null then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series_eligibility(
    club_id,series_rule_id,requires_active_entry,allow_invited_players,invited_points_policy,
    require_same_division_pair,age_category_id,additional_rules,created_by
  ) values(
    v_rule.club_id,p_rule_id,coalesce((p_config->>'requires_active_entry')::boolean,true),
    coalesce((p_config->>'allow_invited_players')::boolean,false),
    coalesce(nullif(upper(btrim(p_config->>'invited_points_policy')),''),'REQUIRE_ENTRY'),
    coalesce((p_config->>'require_same_division_pair')::boolean,true),
    nullif(p_config->>'age_category_id','')::uuid,coalesce(p_config->'additional_rules','{}'::jsonb),v_actor
  ) on conflict(series_rule_id) do update set
    requires_active_entry=excluded.requires_active_entry,allow_invited_players=excluded.allow_invited_players,
    invited_points_policy=excluded.invited_points_policy,require_same_division_pair=excluded.require_same_division_pair,
    age_category_id=excluded.age_category_id,additional_rules=excluded.additional_rules
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.activate_competition_series_rule_version(p_club_id uuid, p_rule_id uuid, p_revision integer)
returns public.competition_series_rules
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_rule public.competition_series_rules%rowtype; v_link public.competition_series_divisions%rowtype; v_series public.competition_series%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_rule from public.competition_series_rules where id=p_rule_id and club_id=p_club_id for update;
  if not found then raise exception 'Regla inexistente.' using errcode='P0002'; end if;
  select * into v_link from public.competition_series_divisions where id=v_rule.series_division_id for update;
  select * into v_series from public.competition_series where id=v_link.series_id for update;
  perform public.require_competition_series_access(v_rule.club_id,'competition:manage');
  if v_rule.status<>'DRAFT' or v_series.status not in ('DRAFT','SCHEDULED') then raise exception 'La versión no puede activarse.' using errcode='23514'; end if;
  if v_rule.revision<>p_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  if not exists(select 1 from public.competition_series_eligibility e where e.series_rule_id=p_rule_id) then raise exception 'La versión necesita elegibilidad.' using errcode='23514'; end if;
  if exists(select 1 from public.competition_series_rules r where r.series_division_id=v_rule.series_division_id and r.status='ACTIVE' and r.frozen_at is not null) then raise exception 'La regla activa está congelada.' using errcode='23514'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series_rules set status='SUPERSEDED',superseded_at=now()
    where series_division_id=v_rule.series_division_id and status='ACTIVE';
  update public.competition_series_rules set status='ACTIVE',superseded_at=null where id=p_rule_id returning * into v_rule;
  return v_rule;
end;
$$;

create or replace function public.delete_competition_series_rule_draft(p_club_id uuid, p_rule_id uuid, p_revision integer)
returns uuid
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_rule public.competition_series_rules%rowtype; v_link public.competition_series_divisions%rowtype; v_series public.competition_series%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_rule from public.competition_series_rules where id=p_rule_id and club_id=p_club_id for update;
  if not found then return p_rule_id; end if;
  select * into v_link from public.competition_series_divisions where id=v_rule.series_division_id;
  select * into v_series from public.competition_series where id=v_link.series_id for update;
  perform public.require_competition_series_access(v_rule.club_id,'competition:manage');
  if v_rule.status<>'DRAFT' or v_rule.frozen_at is not null or v_series.status not in ('DRAFT','SCHEDULED') then
    raise exception 'Solo puede eliminarse una versión DRAFT nunca activada.' using errcode='23514';
  end if;
  if v_rule.revision<>p_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  delete from public.competition_series_eligibility where series_rule_id=p_rule_id;
  delete from public.competition_series_rules where id=p_rule_id;
  return p_rule_id;
end;
$$;

create or replace function public.validate_competition_series_ready(p_series_id uuid)
returns void
language plpgsql stable security definer set search_path=pg_catalog,public
as $$
declare v_series public.competition_series%rowtype; v_season public.competition_seasons%rowtype;
begin
  select * into v_series from public.competition_series where id=p_series_id;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  select * into v_season from public.competition_seasons where id=v_series.season_id and club_id=v_series.club_id;
  if v_series.code is null or v_series.starts_on is null or v_series.ends_on is null then raise exception 'Código y fechas son obligatorios.' using errcode='23514'; end if;
  if v_series.starts_on<v_season.starts_on or v_series.ends_on>v_season.ends_on then raise exception 'Fechas fuera de temporada.' using errcode='23514'; end if;
  if not exists(select 1 from public.competition_series_divisions d where d.series_id=p_series_id and d.is_active) then raise exception 'El circuito necesita una división.' using errcode='23514'; end if;
  if exists(
    select 1 from public.competition_series_divisions d
    where d.series_id=p_series_id and d.is_active and not exists(
      select 1 from public.competition_series_rules r join public.competition_series_eligibility e on e.series_rule_id=r.id
      join public.points_schemes ps on ps.id=r.points_scheme_id
      join public.competition_divisions division on division.id=d.division_id and division.club_id=d.club_id
      left join public.competition_age_categories age on age.id=e.age_category_id and age.club_id=e.club_id
      where r.series_division_id=d.id and r.status='ACTIVE' and ps.is_active
        and (ps.is_global or ps.club_id=v_series.club_id)
        and division.is_active
        and (e.age_category_id is null or age.is_active)
        and jsonb_array_length(r.tie_breakers)>0
    )
  ) then raise exception 'Cada división necesita regla ACTIVE, elegibilidad, desempates y esquema válido.' using errcode='23514'; end if;
end;
$$;

create or replace function public.schedule_competition_series(p_club_id uuid,p_series_id uuid,p_revision integer)
returns public.competition_series language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.competition_series%rowtype; a uuid;
begin perform public.require_competition_series_access(p_club_id,'competition:manage'); select * into v from public.competition_series where id=p_series_id and club_id=p_club_id for update;
if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
a:=public.require_competition_series_access(v.club_id,'competition:manage');
if v.status='SCHEDULED' then return v; end if;
if v.status<>'DRAFT' or v.revision<>p_revision then raise exception 'Estado o revisión inválidos.' using errcode='40001'; end if;
perform public.validate_competition_series_ready(v.id); perform set_config('selpa.competition_series_write','allowed',true);
update public.competition_series set status='SCHEDULED',scheduled_by=a,scheduled_at=now() where id=v.id returning * into v; return v; end; $$;

create or replace function public.return_competition_series_to_draft(p_club_id uuid,p_series_id uuid,p_revision integer)
returns public.competition_series language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.competition_series%rowtype;
begin perform public.require_competition_series_access(p_club_id,'competition:manage'); select * into v from public.competition_series where id=p_series_id and club_id=p_club_id for update;
if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
perform public.require_competition_series_access(v.club_id,'competition:manage');
if v.status='DRAFT' then return v; end if;
if v.status<>'SCHEDULED' or v.revision<>p_revision then raise exception 'Estado o revisión inválidos.' using errcode='40001'; end if;
perform set_config('selpa.competition_series_write','allowed',true);
update public.competition_series set status='DRAFT',scheduled_by=null,scheduled_at=null where id=v.id returning * into v; return v; end; $$;

create or replace function public.activate_competition_series(p_club_id uuid,p_series_id uuid,p_revision integer,p_confirm boolean)
returns public.competition_series language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.competition_series%rowtype; a uuid;
begin perform public.require_competition_series_access(p_club_id,'competition:manage',true); select * into v from public.competition_series where id=p_series_id and club_id=p_club_id for update;
if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
a:=public.require_competition_series_access(v.club_id,'competition:manage',true);
if not p_confirm then raise exception 'La activación requiere confirmación explícita.' using errcode='22023'; end if;
if v.status='ACTIVE' then return v; end if;
if v.status<>'SCHEDULED' or v.revision<>p_revision then raise exception 'Estado o revisión inválidos.' using errcode='40001'; end if;
perform public.validate_competition_series_ready(v.id); perform set_config('selpa.competition_series_write','allowed',true);
if exists(
  select 1 from public.competition_series_rules r
  join public.competition_series_divisions d on d.id=r.series_division_id
  where d.series_id=v.id and d.is_active and r.status='DRAFT'
) then raise exception 'No puede activarse con versiones DRAFT pendientes.' using errcode='23514'; end if;
update public.competition_series_divisions d set frozen_at=now(),division_snapshot=jsonb_build_object(
  'division_id',div.id,'division_name',coalesce(div.name_override,cat.name,branch.name),'modality',div.modality,
  'branch_id',branch.id,'branch_name',branch.name,'segment_id',segment.id,'segment_name',segment.name,
  'category_id',cat.id,'category_name',cat.name,'season_id',season.id,'season_name',season.name
) from public.competition_divisions div join public.competition_branches branch on branch.id=div.branch_id
  join public.competition_seasons season on season.id=div.season_id
  left join public.competition_segments segment on segment.id=div.segment_id
  left join public.competition_categories cat on cat.id=div.category_id
  where d.series_id=v.id and d.is_active and div.id=d.division_id;
update public.competition_series_rules r set frozen_at=now() from public.competition_series_divisions d
  where d.series_id=v.id and d.id=r.series_division_id and d.is_active and r.status='ACTIVE';
update public.competition_series_eligibility e set frozen_at=now() from public.competition_series_rules r
  join public.competition_series_divisions d on d.id=r.series_division_id
  where d.series_id=v.id and r.status='ACTIVE' and e.series_rule_id=r.id;
update public.competition_series set status='ACTIVE',activated_by=a,activated_at=now() where id=v.id returning * into v; return v; end; $$;

create or replace function public.close_competition_series(p_club_id uuid,p_series_id uuid,p_revision integer)
returns public.competition_series language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.competition_series%rowtype; a uuid; begin perform public.require_competition_series_access(p_club_id,'competition:manage',true); select * into v from public.competition_series where id=p_series_id and club_id=p_club_id for update;
if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if; a:=public.require_competition_series_access(v.club_id,'competition:manage',true);
if v.status='CLOSED' then return v; end if;
if v.status<>'ACTIVE' or v.revision<>p_revision then raise exception 'Estado o revisión inválidos.' using errcode='40001'; end if;
perform set_config('selpa.competition_series_write','allowed',true); update public.competition_series set status='CLOSED',closed_by=a,closed_at=now() where id=v.id returning * into v; return v; end; $$;

create or replace function public.cancel_competition_series(p_club_id uuid,p_series_id uuid,p_revision integer,p_reason text)
returns public.competition_series language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.competition_series%rowtype; a uuid; begin perform public.require_competition_series_access(p_club_id,'competition:manage',true); select * into v from public.competition_series where id=p_series_id and club_id=p_club_id for update;
if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if; a:=public.require_competition_series_access(v.club_id,'competition:manage',true);
if v.status='CANCELLED' and v.cancellation_reason=btrim(coalesce(p_reason,'')) then return v; end if;
if v.status not in ('DRAFT','SCHEDULED','ACTIVE') or v.revision<>p_revision or length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Estado, revisión o motivo inválidos.' using errcode='23514'; end if;
perform set_config('selpa.competition_series_write','allowed',true); update public.competition_series set status='CANCELLED',cancelled_by=a,cancelled_at=now(),cancellation_reason=btrim(p_reason) where id=v.id returning * into v; return v; end; $$;

create or replace function public.archive_competition_series(p_club_id uuid,p_series_id uuid,p_revision integer)
returns public.competition_series language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.competition_series%rowtype; a uuid; begin perform public.require_competition_series_access(p_club_id,'competition:manage',true); select * into v from public.competition_series where id=p_series_id and club_id=p_club_id for update;
if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if; a:=public.require_competition_series_access(v.club_id,'competition:manage',true);
if v.archived_at is not null then return v; end if;
if v.status not in ('CLOSED','CANCELLED') or v.archived_at is not null or v.revision<>p_revision then raise exception 'Solo se archivan circuitos terminales no archivados.' using errcode='23514'; end if;
perform set_config('selpa.competition_series_write','allowed',true); update public.competition_series set archived_by=a,archived_at=now() where id=v.id returning * into v; return v; end; $$;

alter table public.competition_series enable row level security;
alter table public.competition_series_divisions enable row level security;
alter table public.competition_series_rules enable row level security;
alter table public.competition_series_eligibility enable row level security;

revoke all on table public.competition_series,public.competition_series_divisions,public.competition_series_rules,public.competition_series_eligibility from public,anon,authenticated;
grant select on table public.competition_series,public.competition_series_divisions,public.competition_series_rules,public.competition_series_eligibility to authenticated;
grant all on table public.competition_series,public.competition_series_divisions,public.competition_series_rules,public.competition_series_eligibility to service_role;

create policy competition_series_admin_read on public.competition_series for select to authenticated
  using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_series_divisions_admin_read on public.competition_series_divisions for select to authenticated
  using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_series_rules_admin_read on public.competition_series_rules for select to authenticated
  using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_series_eligibility_admin_read on public.competition_series_eligibility for select to authenticated
  using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));

revoke all on function public.require_competition_series_access(uuid,text,boolean),public.guard_competition_series_mutation(),public.validate_competition_series_rule_scope(),public.validate_competition_series_ready(uuid),public.is_valid_competition_series_tie_breakers(jsonb),public.is_valid_competition_division_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.is_valid_competition_series_tie_breakers(jsonb) to service_role;

revoke all on function public.create_competition_series(uuid,uuid,text) from public,anon;
revoke all on function public.update_competition_series_draft(uuid,uuid,integer,text,text,text,date,date,integer,integer,boolean) from public,anon;
revoke all on function public.add_competition_series_division(uuid,uuid,uuid,integer,integer) from public,anon;
revoke all on function public.remove_competition_series_division(uuid,uuid,integer) from public,anon;
revoke all on function public.create_competition_series_rule_version(uuid,uuid,uuid,uuid) from public,anon;
revoke all on function public.update_competition_series_rule_draft(uuid,uuid,integer,jsonb) from public,anon;
revoke all on function public.set_competition_series_eligibility(uuid,uuid,integer,jsonb) from public,anon;
revoke all on function public.activate_competition_series_rule_version(uuid,uuid,integer) from public,anon;
revoke all on function public.delete_competition_series_rule_draft(uuid,uuid,integer) from public,anon;
revoke all on function public.schedule_competition_series(uuid,uuid,integer) from public,anon;
revoke all on function public.return_competition_series_to_draft(uuid,uuid,integer) from public,anon;
revoke all on function public.activate_competition_series(uuid,uuid,integer,boolean) from public,anon;
revoke all on function public.close_competition_series(uuid,uuid,integer) from public,anon;
revoke all on function public.cancel_competition_series(uuid,uuid,integer,text) from public,anon;
revoke all on function public.archive_competition_series(uuid,uuid,integer) from public,anon;

grant execute on function public.create_competition_series(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.update_competition_series_draft(uuid,uuid,integer,text,text,text,date,date,integer,integer,boolean) to authenticated,service_role;
grant execute on function public.add_competition_series_division(uuid,uuid,uuid,integer,integer) to authenticated,service_role;
grant execute on function public.remove_competition_series_division(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.create_competition_series_rule_version(uuid,uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.update_competition_series_rule_draft(uuid,uuid,integer,jsonb) to authenticated,service_role;
grant execute on function public.set_competition_series_eligibility(uuid,uuid,integer,jsonb) to authenticated,service_role;
grant execute on function public.activate_competition_series_rule_version(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.delete_competition_series_rule_draft(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.schedule_competition_series(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.return_competition_series_to_draft(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.activate_competition_series(uuid,uuid,integer,boolean) to authenticated,service_role;
grant execute on function public.close_competition_series(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.cancel_competition_series(uuid,uuid,integer,text) to authenticated,service_role;
grant execute on function public.archive_competition_series(uuid,uuid,integer) to authenticated,service_role;

comment on table public.competition_series is 'Circuitos configurables por club y temporada. ARCHIVED es una marca ortogonal, no un estado deportivo.';
comment on table public.competition_series_rules is 'Versiones deportivas por división de circuito. ACTIVE nunca se edita; frozen_at vuelve la versión histórica e inmutable.';
comment on column public.competition_series_divisions.division_snapshot is 'Identidad visible de división, rama, segmento, categoría y temporada congelada al activar. No contiene reglas ni elegibilidad.';

commit;
