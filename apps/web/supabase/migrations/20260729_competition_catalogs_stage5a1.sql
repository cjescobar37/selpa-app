begin;

do $$
begin
  if to_regclass('public.competition_seasons') is null
     or to_regclass('public.points_schemes') is null then
    raise exception 'Primero deben aplicarse Competition Engine Stage 1 y el esquema de puntos.';
  end if;
end
$$;

create or replace function public.is_valid_competition_age_reference_config(
  p_rule text,
  p_config jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_date text;
begin
  if jsonb_typeof(p_config) is distinct from 'object' then
    return false;
  end if;

  if p_rule <> 'FIXED_DATE' then
    return p_config = '{}'::jsonb;
  end if;

  if jsonb_object_length(p_config) <> 1 or not (p_config ? 'date') then
    return false;
  end if;

  v_date := p_config ->> 'date';
  if v_date is null or v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  perform v_date::date;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then
  return false;
end;
$$;

create table if not exists public.competition_age_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  code text not null,
  min_age integer,
  max_age integer,
  age_reference_rule text not null,
  age_reference_config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_age_categories_name_chk check (length(btrim(name)) > 0),
  constraint competition_age_categories_code_chk check (length(btrim(code)) > 0),
  constraint competition_age_categories_min_age_chk check (min_age is null or min_age between 0 and 120),
  constraint competition_age_categories_max_age_chk check (max_age is null or max_age between 0 and 120),
  constraint competition_age_categories_range_chk check (min_age is null or max_age is null or min_age <= max_age),
  constraint competition_age_categories_reference_rule_chk check (age_reference_rule in (
    'EVENT_START_DATE', 'SERIES_START_DATE', 'SEASON_START_DATE',
    'SEASON_END_DATE', 'CALENDAR_YEAR_END', 'FIXED_DATE'
  )),
  constraint competition_age_categories_reference_config_chk check (jsonb_typeof(age_reference_config) = 'object'),
  constraint competition_age_categories_reference_config_rule_chk check (
    public.is_valid_competition_age_reference_config(age_reference_rule, age_reference_config)
  ),
  constraint competition_age_categories_club_id_id_key unique (club_id, id)
);

create unique index if not exists competition_age_categories_club_code_uidx
  on public.competition_age_categories (club_id, lower(btrim(code)));

create index if not exists competition_age_categories_club_order_idx
  on public.competition_age_categories (club_id, is_active desc, sort_order, name);

create table if not exists public.competition_event_tiers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  default_points_scheme_id uuid references public.points_schemes(id) on delete restrict,
  points_multiplier numeric(10,4) not null default 1,
  is_master_final boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_event_tiers_name_chk check (length(btrim(name)) > 0),
  constraint competition_event_tiers_code_chk check (length(btrim(code)) > 0),
  constraint competition_event_tiers_description_chk check (description is null or length(btrim(description)) > 0),
  constraint competition_event_tiers_multiplier_chk check (points_multiplier > 0),
  constraint competition_event_tiers_club_id_id_key unique (club_id, id)
);

create unique index if not exists competition_event_tiers_club_code_uidx
  on public.competition_event_tiers (club_id, lower(btrim(code)));

create index if not exists competition_event_tiers_club_order_idx
  on public.competition_event_tiers (club_id, is_active desc, sort_order, name);

create index if not exists competition_event_tiers_points_scheme_idx
  on public.competition_event_tiers (default_points_scheme_id)
  where default_points_scheme_id is not null;

create or replace function public.normalize_competition_catalog_row()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.name := btrim(new.name);
  new.code := upper(btrim(new.code));
  return new;
end;
$$;

create or replace function public.validate_competition_event_tier_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_scheme_club_id uuid;
  v_scheme_is_global boolean;
begin
  if new.default_points_scheme_id is null then
    return new;
  end if;

  select scheme.club_id, scheme.is_global
  into v_scheme_club_id, v_scheme_is_global
  from public.points_schemes scheme
  where scheme.id = new.default_points_scheme_id;

  if not found then
    raise exception 'El esquema de puntos no existe.' using errcode = '23503';
  end if;

  if not v_scheme_is_global and v_scheme_club_id is distinct from new.club_id then
    raise exception 'El esquema de puntos no pertenece al club.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_competition_age_categories_normalize on public.competition_age_categories;
create trigger trg_competition_age_categories_normalize
  before insert or update on public.competition_age_categories
  for each row execute function public.normalize_competition_catalog_row();

drop trigger if exists trg_competition_event_tiers_normalize on public.competition_event_tiers;
create trigger trg_competition_event_tiers_normalize
  before insert or update on public.competition_event_tiers
  for each row execute function public.normalize_competition_catalog_row();

drop trigger if exists trg_competition_event_tiers_validate_scope on public.competition_event_tiers;
create trigger trg_competition_event_tiers_validate_scope
  before insert or update of club_id, default_points_scheme_id on public.competition_event_tiers
  for each row execute function public.validate_competition_event_tier_scope();

drop trigger if exists trg_competition_age_categories_updated_at on public.competition_age_categories;
create trigger trg_competition_age_categories_updated_at
  before update on public.competition_age_categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_competition_event_tiers_updated_at on public.competition_event_tiers;
create trigger trg_competition_event_tiers_updated_at
  before update on public.competition_event_tiers
  for each row execute function public.set_updated_at();

alter table public.competition_age_categories enable row level security;
alter table public.competition_event_tiers enable row level security;

revoke all on table public.competition_age_categories from public, anon, authenticated;
revoke all on table public.competition_event_tiers from public, anon, authenticated;
grant select, insert, update on table public.competition_age_categories to authenticated;
grant select, insert, update on table public.competition_event_tiers to authenticated;
grant all on table public.competition_age_categories to service_role;
grant all on table public.competition_event_tiers to service_role;

drop policy if exists competition_age_categories_authorized_read on public.competition_age_categories;
create policy competition_age_categories_authorized_read
  on public.competition_age_categories for select to authenticated
  using (public.is_platform_admin() or public.has_club_capability(club_id, 'ranking:view'));

drop policy if exists competition_age_categories_admin_insert on public.competition_age_categories;
create policy competition_age_categories_admin_insert
  on public.competition_age_categories for insert to authenticated
  with check (public.is_platform_admin() or public.is_club_admin(club_id));

drop policy if exists competition_age_categories_admin_update on public.competition_age_categories;
create policy competition_age_categories_admin_update
  on public.competition_age_categories for update to authenticated
  using (public.is_platform_admin() or public.is_club_admin(club_id))
  with check (public.is_platform_admin() or public.is_club_admin(club_id));

drop policy if exists competition_event_tiers_authorized_read on public.competition_event_tiers;
create policy competition_event_tiers_authorized_read
  on public.competition_event_tiers for select to authenticated
  using (public.is_platform_admin() or public.has_club_capability(club_id, 'ranking:view'));

drop policy if exists competition_event_tiers_admin_insert on public.competition_event_tiers;
create policy competition_event_tiers_admin_insert
  on public.competition_event_tiers for insert to authenticated
  with check (public.is_platform_admin() or public.is_club_admin(club_id));

drop policy if exists competition_event_tiers_admin_update on public.competition_event_tiers;
create policy competition_event_tiers_admin_update
  on public.competition_event_tiers for update to authenticated
  using (public.is_platform_admin() or public.is_club_admin(club_id))
  with check (public.is_platform_admin() or public.is_club_admin(club_id));

create or replace function public.initialize_competition_catalogs_stage5a1(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_age_before integer;
  v_tier_before integer;
begin
  if p_club_id is null or not exists (select 1 from public.clubs club where club.id = p_club_id) then
    raise exception 'Club inexistente.' using errcode = '22023';
  end if;

  if not public.is_platform_admin() and not public.is_club_admin(p_club_id) then
    raise exception 'Solo OWNER o ADMIN pueden inicializar estos catálogos.' using errcode = '42501';
  end if;

  select count(*)::integer into v_age_before
  from public.competition_age_categories category
  where category.club_id = p_club_id;

  select count(*)::integer into v_tier_before
  from public.competition_event_tiers tier
  where tier.club_id = p_club_id;

  insert into public.competition_age_categories (
    club_id, name, code, min_age, max_age, age_reference_rule, sort_order, created_by
  ) values
    (p_club_id, 'Libre', 'LIBRE', null, null, 'CALENDAR_YEAR_END', 10, v_actor_id),
    (p_club_id, 'Sub 12', 'SUB12', null, 11, 'CALENDAR_YEAR_END', 20, v_actor_id),
    (p_club_id, 'Sub 14', 'SUB14', null, 13, 'CALENDAR_YEAR_END', 30, v_actor_id),
    (p_club_id, 'Sub 16', 'SUB16', null, 15, 'CALENDAR_YEAR_END', 40, v_actor_id),
    (p_club_id, 'Sub 18', 'SUB18', null, 17, 'CALENDAR_YEAR_END', 50, v_actor_id),
    (p_club_id, '+35', 'PLUS35', 35, null, 'CALENDAR_YEAR_END', 60, v_actor_id),
    (p_club_id, '+45', 'PLUS45', 45, null, 'CALENDAR_YEAR_END', 70, v_actor_id),
    (p_club_id, '+55', 'PLUS55', 55, null, 'CALENDAR_YEAR_END', 80, v_actor_id)
  on conflict do nothing;

  insert into public.competition_event_tiers (
    club_id, name, code, points_multiplier, is_master_final, sort_order, created_by
  ) values
    (p_club_id, 'Challenger', 'CHALLENGER', 1, false, 10, v_actor_id),
    (p_club_id, 'Open', 'OPEN', 1, false, 20, v_actor_id),
    (p_club_id, 'Master', 'MASTER', 1, false, 30, v_actor_id),
    (p_club_id, 'Master Final', 'MASTER_FINAL', 1, true, 40, v_actor_id)
  on conflict do nothing;

  return jsonb_build_object(
    'club_id', p_club_id,
    'age_categories_created', (select count(*)::integer from public.competition_age_categories category where category.club_id = p_club_id) - v_age_before,
    'event_tiers_created', (select count(*)::integer from public.competition_event_tiers tier where tier.club_id = p_club_id) - v_tier_before,
    'age_categories_total', (select count(*)::integer from public.competition_age_categories category where category.club_id = p_club_id),
    'event_tiers_total', (select count(*)::integer from public.competition_event_tiers tier where tier.club_id = p_club_id)
  );
end;
$$;

revoke all on function public.normalize_competition_catalog_row() from public, anon, authenticated;
revoke all on function public.validate_competition_event_tier_scope() from public, anon, authenticated;
revoke all on function public.is_valid_competition_age_reference_config(text, jsonb) from public, anon, authenticated;
revoke all on function public.initialize_competition_catalogs_stage5a1(uuid) from public, anon;
grant execute on function public.normalize_competition_catalog_row() to service_role;
grant execute on function public.validate_competition_event_tier_scope() to service_role;
grant execute on function public.is_valid_competition_age_reference_config(text, jsonb) to authenticated, service_role;
grant execute on function public.initialize_competition_catalogs_stage5a1(uuid) to authenticated, service_role;

comment on table public.competition_age_categories is
  'Categorías etarias configurables por club. Se desactivan para conservar historial; futuras referencias deben usar ON DELETE RESTRICT y snapshots.';
comment on column public.competition_age_categories.age_reference_rule is
  'Regla algorítmica para resolver la fecha de edad. La plantilla usa CALENDAR_YEAR_END; Sub 12 significa menos de 12 años al 31 de diciembre.';
comment on table public.competition_event_tiers is
  'Jerarquías configurables de eventos. No reemplazan todavía tournaments.tournament_type ni se vinculan automáticamente con torneos.';
comment on function public.initialize_competition_catalogs_stage5a1(uuid) is
  'Inicializa categorías etarias y jerarquías editables sin sobrescribir personalizaciones existentes.';

commit;
