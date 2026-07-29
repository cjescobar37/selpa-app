begin;

create table if not exists public.competition_seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'DRAFT',
  is_public boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_seasons_name_chk check (length(btrim(name)) > 0),
  constraint competition_seasons_dates_chk check (ends_on >= starts_on),
  constraint competition_seasons_status_chk check (status in ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED')),
  constraint competition_seasons_club_name_key unique (club_id, name),
  constraint competition_seasons_club_id_id_key unique (club_id, id)
);

create unique index if not exists competition_seasons_one_active_per_club_uidx
  on public.competition_seasons (club_id)
  where status = 'ACTIVE';

create index if not exists competition_seasons_club_order_idx
  on public.competition_seasons (club_id, sort_order, starts_on desc);

create table if not exists public.competition_branches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  slug text not null,
  accent_kind text not null default 'DEFAULT',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_branches_name_chk check (length(btrim(name)) > 0),
  constraint competition_branches_slug_chk check (length(btrim(slug)) > 0),
  constraint competition_branches_accent_kind_chk check (accent_kind in ('DEFAULT', 'CYAN', 'MAGENTA', 'MIXED')),
  constraint competition_branches_club_slug_key unique (club_id, slug),
  constraint competition_branches_club_id_id_key unique (club_id, id)
);

create index if not exists competition_branches_club_order_idx
  on public.competition_branches (club_id, is_active, is_visible, sort_order, name);

create table if not exists public.competition_segments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_segments_name_chk check (length(btrim(name)) > 0),
  constraint competition_segments_slug_chk check (length(btrim(slug)) > 0),
  constraint competition_segments_club_slug_key unique (club_id, slug),
  constraint competition_segments_club_id_id_key unique (club_id, id)
);

create index if not exists competition_segments_club_order_idx
  on public.competition_segments (club_id, is_active, is_visible, sort_order, name);

create table if not exists public.competition_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  short_label text not null,
  slug text not null,
  legacy_category_id smallint,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_categories_name_chk check (length(btrim(name)) > 0),
  constraint competition_categories_short_label_chk check (length(btrim(short_label)) > 0),
  constraint competition_categories_slug_chk check (length(btrim(slug)) > 0),
  constraint competition_categories_club_slug_key unique (club_id, slug),
  constraint competition_categories_club_id_id_key unique (club_id, id)
);

create index if not exists competition_categories_club_order_idx
  on public.competition_categories (club_id, is_active, is_visible, sort_order, name);

create index if not exists competition_categories_legacy_idx
  on public.competition_categories (club_id, legacy_category_id)
  where legacy_category_id is not null;

create table if not exists public.competition_divisions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  season_id uuid not null,
  modality text not null,
  branch_id uuid not null,
  segment_id uuid,
  category_id uuid,
  name_override text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_divisions_modality_chk check (modality in ('INDIVIDUAL', 'PAIRS')),
  constraint competition_divisions_name_override_chk check (name_override is null or length(btrim(name_override)) > 0),
  constraint competition_divisions_season_club_fkey foreign key (club_id, season_id)
    references public.competition_seasons(club_id, id) on delete cascade,
  constraint competition_divisions_branch_club_fkey foreign key (club_id, branch_id)
    references public.competition_branches(club_id, id) on delete restrict,
  constraint competition_divisions_segment_club_fkey foreign key (club_id, segment_id)
    references public.competition_segments(club_id, id) on delete restrict,
  constraint competition_divisions_category_club_fkey foreign key (club_id, category_id)
    references public.competition_categories(club_id, id) on delete restrict
);

create unique index if not exists competition_divisions_combination_uidx
  on public.competition_divisions (season_id, modality, branch_id, segment_id, category_id)
  nulls not distinct;

create index if not exists competition_divisions_club_season_order_idx
  on public.competition_divisions (club_id, season_id, modality, is_active, is_visible, sort_order);

drop trigger if exists trg_competition_seasons_updated_at on public.competition_seasons;
create trigger trg_competition_seasons_updated_at
  before update on public.competition_seasons
  for each row execute function public.set_updated_at();

drop trigger if exists trg_competition_branches_updated_at on public.competition_branches;
create trigger trg_competition_branches_updated_at
  before update on public.competition_branches
  for each row execute function public.set_updated_at();

drop trigger if exists trg_competition_segments_updated_at on public.competition_segments;
create trigger trg_competition_segments_updated_at
  before update on public.competition_segments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_competition_categories_updated_at on public.competition_categories;
create trigger trg_competition_categories_updated_at
  before update on public.competition_categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_competition_divisions_updated_at on public.competition_divisions;
create trigger trg_competition_divisions_updated_at
  before update on public.competition_divisions
  for each row execute function public.set_updated_at();

alter table public.competition_seasons enable row level security;
alter table public.competition_branches enable row level security;
alter table public.competition_segments enable row level security;
alter table public.competition_categories enable row level security;
alter table public.competition_divisions enable row level security;

revoke all on table public.competition_seasons from anon;
revoke all on table public.competition_branches from anon;
revoke all on table public.competition_segments from anon;
revoke all on table public.competition_categories from anon;
revoke all on table public.competition_divisions from anon;

grant select, insert, update, delete on table public.competition_seasons to authenticated;
grant select, insert, update, delete on table public.competition_branches to authenticated;
grant select, insert, update, delete on table public.competition_segments to authenticated;
grant select, insert, update, delete on table public.competition_categories to authenticated;
grant select, insert, update, delete on table public.competition_divisions to authenticated;

grant all on table public.competition_seasons to service_role;
grant all on table public.competition_branches to service_role;
grant all on table public.competition_segments to service_role;
grant all on table public.competition_categories to service_role;
grant all on table public.competition_divisions to service_role;

do $policies$
declare
  v_table text;
begin
  foreach v_table in array array[
    'competition_seasons',
    'competition_branches',
    'competition_segments',
    'competition_categories',
    'competition_divisions'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_table || '_admin_read', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_platform_admin() or public.has_club_capability(club_id, ''ranking:view''))',
      v_table || '_admin_read',
      v_table
    );

    execute format('drop policy if exists %I on public.%I', v_table || '_manage', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin() or public.has_club_capability(club_id, ''ranking:manage'')) with check (public.is_platform_admin() or public.has_club_capability(club_id, ''ranking:manage''))',
      v_table || '_manage',
      v_table
    );
  end loop;
end
$policies$;

create or replace function public.create_default_competition_structure(
  p_club_id uuid,
  p_template_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template_key text := upper(btrim(coalesce(p_template_key, '')));
  v_year integer := extract(year from current_date)::integer;
  v_season_id uuid;
  v_created_season boolean := false;
begin
  if p_club_id is null or not exists (select 1 from public.clubs club where club.id = p_club_id) then
    raise exception 'Club inexistente.' using errcode = '22023';
  end if;

  if not public.is_platform_admin()
     and not public.has_club_capability(p_club_id, 'ranking:manage') then
    raise exception 'No tenés permisos para configurar la estructura competitiva.' using errcode = '42501';
  end if;

  if v_template_key <> 'PADEL_TRADITIONAL' then
    raise exception 'Plantilla competitiva desconocida: %', p_template_key using errcode = '22023';
  end if;

  select season.id
  into v_season_id
  from public.competition_seasons season
  where season.club_id = p_club_id
    and season.starts_on <= current_date
    and season.ends_on >= current_date
  order by (season.status = 'ACTIVE') desc, season.sort_order, season.created_at
  limit 1;

  if v_season_id is null then
    insert into public.competition_seasons (
      club_id, name, starts_on, ends_on, status, is_public, sort_order, created_by
    ) values (
      p_club_id,
      v_year::text,
      make_date(v_year, 1, 1),
      make_date(v_year, 12, 31),
      'DRAFT',
      false,
      0,
      v_actor_id
    )
    on conflict (club_id, name) do nothing
    returning id into v_season_id;

    if v_season_id is not null then
      v_created_season := true;
    else
      select season.id into v_season_id
      from public.competition_seasons season
      where season.club_id = p_club_id and season.name = v_year::text
      limit 1;
    end if;
  end if;

  insert into public.competition_branches (club_id, name, slug, accent_kind, sort_order)
  values
    (p_club_id, 'Caballeros', 'caballeros', 'CYAN', 10),
    (p_club_id, 'Damas', 'damas', 'MAGENTA', 20),
    (p_club_id, 'Mixto', 'mixto', 'MIXED', 30)
  on conflict (club_id, slug) do nothing;

  insert into public.competition_segments (club_id, name, slug, sort_order)
  values
    (p_club_id, 'Libres', 'libres', 10),
    (p_club_id, 'Veteranos', 'veteranos', 20),
    (p_club_id, 'Menores', 'menores', 30)
  on conflict (club_id, slug) do nothing;

  insert into public.competition_categories (
    club_id, name, short_label, slug, legacy_category_id, sort_order
  )
  values
    (p_club_id, '1ª', '1ª', '1a', 1, 10),
    (p_club_id, '2ª', '2ª', '2a', 2, 20),
    (p_club_id, '3ª', '3ª', '3a', 3, 30),
    (p_club_id, '4ª', '4ª', '4a', 4, 40),
    (p_club_id, '5ª', '5ª', '5a', 5, 50),
    (p_club_id, '6ª', '6ª', '6a', 6, 60),
    (p_club_id, '7ª', '7ª', '7a', 7, 70)
  on conflict (club_id, slug) do nothing;

  return jsonb_build_object(
    'club_id', p_club_id,
    'template_key', v_template_key,
    'season_id', v_season_id,
    'season_created', v_created_season,
    'divisions_created', 0
  );
end;
$$;

revoke all on function public.create_default_competition_structure(uuid, text) from public, anon;
grant execute on function public.create_default_competition_structure(uuid, text) to authenticated, service_role;

comment on table public.competition_divisions is
  'Combinaciones competitivas válidas por club, temporada y modalidad. No contiene puntos ni participantes.';
comment on column public.competition_branches.accent_kind is
  'Metadato exclusivamente visual; nunca determina reglas deportivas.';
comment on column public.competition_categories.legacy_category_id is
  'Vínculo transitorio para futuros backfills desde categories/club_categories.';
comment on function public.create_default_competition_structure(uuid, text) is
  'Crea de forma idempotente catálogos iniciales editables. No crea divisiones ni activa temporadas.';

commit;
