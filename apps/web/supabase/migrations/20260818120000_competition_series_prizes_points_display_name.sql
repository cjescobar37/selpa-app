begin;

alter table public.points_schemes
  add column if not exists display_name text;

update public.points_schemes
set display_name = name
where display_name is null;

alter table public.points_schemes
  drop constraint if exists points_schemes_display_name_chk;
alter table public.points_schemes
  add constraint points_schemes_display_name_chk
  check (display_name is null or length(btrim(display_name)) > 0);

create or replace function public.normalize_points_scheme_display_name()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.display_name := coalesce(nullif(btrim(new.display_name), ''), new.name);
  return new;
end;
$$;

drop trigger if exists trg_points_schemes_display_name on public.points_schemes;
create trigger trg_points_schemes_display_name
before insert or update of display_name on public.points_schemes
for each row execute function public.normalize_points_scheme_display_name();

create or replace function public.set_points_scheme_display_name(
  p_club_id uuid,
  p_scheme_id uuid,
  p_revision integer,
  p_display_name text
)
returns public.points_schemes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.points_schemes%rowtype;
  v_result public.points_schemes%rowtype;
  v_display_name text := btrim(coalesce(p_display_name, ''));
begin
  perform public.require_points_scheme_access(p_club_id, false);
  select * into v_current
  from public.points_schemes scheme
  where scheme.id = p_scheme_id
    and scheme.club_id = p_club_id
    and not scheme.is_global
    and scheme.archived_at is null
  for update;
  if not found then raise exception 'SCHEME_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_current.revision is distinct from p_revision then raise exception 'STALE_REVISION' using errcode = '40001'; end if;
  if v_display_name = '' then raise exception 'DISPLAY_NAME_REQUIRED' using errcode = '22023'; end if;
  if v_current.display_name is not distinct from v_display_name then return v_current; end if;
  update public.points_schemes
  set display_name = v_display_name,
      revision = revision + 1
  where id = p_scheme_id
  returning * into v_result;
  return v_result;
end;
$$;

create table public.competition_series_prizes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  series_id uuid not null,
  position_from integer not null,
  position_to integer not null,
  title text not null,
  description text,
  prize_type text not null default 'OTHER',
  amount numeric(14,2),
  currency_code text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  revision integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_series_prizes_series_fkey foreign key (club_id, series_id)
    references public.competition_series(club_id, id) on delete restrict,
  constraint competition_series_prizes_position_chk check (position_from > 0 and position_to >= position_from),
  constraint competition_series_prizes_title_chk check (length(btrim(title)) > 0),
  constraint competition_series_prizes_description_chk check (description is null or length(btrim(description)) > 0),
  constraint competition_series_prizes_type_chk check (prize_type in ('CASH','GOODS','SERVICE','TROPHY','OTHER')),
  constraint competition_series_prizes_amount_chk check (
    (amount is null and currency_code is null)
    or (amount > 0 and currency_code ~ '^[A-Z]{3}$')
  ),
  constraint competition_series_prizes_sort_chk check (sort_order >= 0),
  constraint competition_series_prizes_revision_chk check (revision > 0),
  constraint competition_series_prizes_club_id_id_key unique (club_id, id)
);

create index competition_series_prizes_series_order_idx
  on public.competition_series_prizes(series_id, is_active, sort_order, position_from);
create unique index competition_series_prizes_active_range_uidx
  on public.competition_series_prizes(series_id, position_from, position_to)
  where is_active;

create trigger trg_competition_series_prizes_guard
before insert or update or delete on public.competition_series_prizes
for each row execute function public.guard_competition_series_mutation();

create or replace function public.replace_competition_series_prizes(
  p_club_id uuid,
  p_series_id uuid,
  p_series_revision integer,
  p_prizes jsonb
)
returns setof public.competition_series_prizes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_series public.competition_series%rowtype;
  v_item jsonb;
  v_position_from integer;
  v_position_to integer;
  v_title text;
  v_description text;
  v_prize_type text;
  v_amount numeric(14,2);
  v_currency_code text;
  v_sort_order integer;
  v_is_active boolean;
begin
  v_actor := public.require_competition_series_access(p_club_id, 'competition:manage');
  select * into v_series
  from public.competition_series series
  where series.id = p_series_id and series.club_id = p_club_id
  for update;
  if not found then raise exception 'SERIES_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_series.revision is distinct from p_series_revision then raise exception 'STALE_REVISION' using errcode = '40001'; end if;
  if v_series.status <> 'DRAFT' or v_series.archived_at is not null then
    raise exception 'SERIES_PRIZES_NOT_EDITABLE' using errcode = '23514';
  end if;
  if p_prizes is null or jsonb_typeof(p_prizes) <> 'array' or jsonb_array_length(p_prizes) > 50 then
    raise exception 'SERIES_PRIZES_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_series_id::text, 0));
  perform set_config('selpa.competition_series_write', 'allowed', true);
  delete from public.competition_series_prizes prize
  where prize.club_id = p_club_id and prize.series_id = p_series_id;

  for v_item in select value from jsonb_array_elements(p_prizes) loop
    if jsonb_typeof(v_item) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(v_item) as keys(key_name)
         where key_name not in ('position_from','position_to','title','description','prize_type','amount','currency_code','sort_order','is_active')
       ) then
      raise exception 'SERIES_PRIZE_SHAPE_INVALID' using errcode = '22023';
    end if;
    v_position_from := (v_item ->> 'position_from')::integer;
    v_position_to := coalesce((v_item ->> 'position_to')::integer, v_position_from);
    v_title := btrim(coalesce(v_item ->> 'title', ''));
    v_description := nullif(btrim(coalesce(v_item ->> 'description', '')), '');
    v_prize_type := upper(btrim(coalesce(v_item ->> 'prize_type', 'OTHER')));
    v_amount := case when v_item ? 'amount' and jsonb_typeof(v_item -> 'amount') <> 'null' then (v_item ->> 'amount')::numeric else null end;
    v_currency_code := case when v_amount is null then null else upper(btrim(coalesce(v_item ->> 'currency_code', ''))) end;
    v_sort_order := coalesce((v_item ->> 'sort_order')::integer, 0);
    v_is_active := coalesce((v_item ->> 'is_active')::boolean, true);

    insert into public.competition_series_prizes(
      club_id, series_id, position_from, position_to, title, description,
      prize_type, amount, currency_code, sort_order, is_active, created_by, updated_by
    ) values (
      p_club_id, p_series_id, v_position_from, v_position_to, v_title, v_description,
      v_prize_type, v_amount, v_currency_code, v_sort_order, v_is_active, v_actor, v_actor
    );
  end loop;

  if exists (
    select 1
    from public.competition_series_prizes left_prize
    join public.competition_series_prizes right_prize
      on right_prize.series_id = left_prize.series_id
     and right_prize.id > left_prize.id
     and right_prize.is_active
     and int4range(right_prize.position_from, right_prize.position_to, '[]')
         && int4range(left_prize.position_from, left_prize.position_to, '[]')
    where left_prize.series_id = p_series_id and left_prize.is_active
  ) then
    raise exception 'SERIES_PRIZE_RANGES_OVERLAP' using errcode = '23514';
  end if;

  update public.competition_series
  set updated_at = updated_at
  where id = p_series_id;

  return query
  select prize.*
  from public.competition_series_prizes prize
  where prize.club_id = p_club_id and prize.series_id = p_series_id
  order by prize.sort_order, prize.position_from, prize.id;
end;
$$;

alter table public.competition_series_prizes enable row level security;
revoke all on table public.competition_series_prizes from public, anon, authenticated;
grant select on table public.competition_series_prizes to authenticated;
grant all on table public.competition_series_prizes to service_role;

create policy competition_series_prizes_admin_read
on public.competition_series_prizes
for select to authenticated
using (public.is_platform_admin() or public.has_club_capability(club_id, 'competition:view'));

revoke all on function public.normalize_points_scheme_display_name() from public, anon, authenticated;
revoke all on function public.set_points_scheme_display_name(uuid,uuid,integer,text) from public, anon;
grant execute on function public.set_points_scheme_display_name(uuid,uuid,integer,text) to authenticated, service_role;
revoke all on function public.replace_competition_series_prizes(uuid,uuid,integer,jsonb) from public, anon;
grant execute on function public.replace_competition_series_prizes(uuid,uuid,integer,jsonb) to authenticated, service_role;

comment on table public.competition_series_prizes is 'Premios normalizados por posición para un circuito. No participa del settlement ni del ledger.';
comment on column public.points_schemes.display_name is 'Etiqueta pública del esquema. name conserva el identificador/nombre administrativo existente.';

commit;
