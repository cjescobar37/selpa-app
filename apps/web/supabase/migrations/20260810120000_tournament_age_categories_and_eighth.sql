begin;

-- En el catálogo legacy el ID numérico es la categoría deportiva. Por eso 8va
-- debe ocupar el ID 8; nunca se renombra una fila ajena para conseguirlo.
do $$
declare
  v_name text;
begin
  select category.name into v_name
  from public.categories category
  where category.id = 8;

  if found and lower(btrim(v_name)) <> '8va' then
    raise exception 'CATEGORY_ID_8_ALREADY_IN_USE: %', v_name using errcode = '23505';
  end if;

  if exists (
    select 1 from public.categories category
    where lower(btrim(category.name)) = '8va' and category.id <> 8
  ) then
    raise exception 'CATEGORY_8VA_EXISTS_WITH_NON_CANONICAL_ID' using errcode = '23505';
  end if;

  insert into public.categories (id, name)
  values (8, '8va')
  on conflict (id) do nothing;
end;
$$;

alter table public.tournaments
  alter column category_id drop not null,
  add column if not exists age_category_id uuid;

alter table public.tournaments
  drop constraint if exists tournaments_category_chk,
  add constraint tournaments_category_chk
    check (category is null or category between 1 and 8);

alter table public.tournaments
  drop constraint if exists tournaments_age_category_club_fkey,
  add constraint tournaments_age_category_club_fkey
    foreign key (club_id, age_category_id)
    references public.competition_age_categories (club_id, id)
    on delete restrict;

alter table public.tournaments
  drop constraint if exists tournaments_category_rule_chk,
  add constraint tournaments_category_rule_chk check (
    (
      segment = 'LIBRES'
      and age_category_id is null
      and (
        (category_rule = 'FIXED_CATEGORY' and fixed_category_id between 1 and 8 and category_sum_target is null)
        -- fixed_category_id puede estar informado únicamente en filas Suma
        -- legacy. El trigger exige la forma canónica en altas/cambios deportivos.
        or (category_rule = 'CATEGORY_SUM' and category_sum_target between 2 and 16)
      )
    )
    or (
      segment in ('MENORES', 'VETERANOS')
      and age_category_id is not null
      and category_rule = 'FIXED_CATEGORY'
      and category_id is null
      and category is null
      and fixed_category_id is null
      and category_sum_target is null
    )
    or (
      -- Compatibilidad con filas legacy previas a age_category_id.
      segment in ('MENORES', 'VETERANOS')
      and age_category_id is null
      and category_id is not null
      and category_rule = 'FIXED_CATEGORY'
      and fixed_category_id is not null
      and category_sum_target is null
    )
  ) not valid;

create index if not exists tournaments_age_category_id_idx
  on public.tournaments (age_category_id)
  where age_category_id is not null;

create or replace function public.validate_tournament_age_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_age public.competition_age_categories%rowtype;
begin
  if new.segment = 'LIBRES' then
    if new.age_category_id is not null then
      raise exception 'LIBRES_NO_ADMITE_CATEGORIA_ETARIA' using errcode = '23514';
    end if;

    if new.category_rule = 'CATEGORY_SUM' and new.fixed_category_id is not null then
      -- Una fila Suma histórica puede editar campos no deportivos. Cualquier
      -- alta o cambio de scope debe adoptar el payload canónico actual.
      if tg_op = 'UPDATE'
         and old.segment = 'LIBRES'
         and old.category_rule = 'CATEGORY_SUM'
         and old.fixed_category_id is not null
         and new.club_id is not distinct from old.club_id
         and new.gender is not distinct from old.gender
         and new.segment is not distinct from old.segment
         and new.category_id is not distinct from old.category_id
         and new.category is not distinct from old.category
         and new.category_rule is not distinct from old.category_rule
         and new.fixed_category_id is not distinct from old.fixed_category_id
         and new.category_sum_target is not distinct from old.category_sum_target
         and new.age_category_id is not distinct from old.age_category_id then
        return new;
      end if;
      raise exception 'CATEGORY_SUM_REQUIERE_PAYLOAD_CANONICO' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.segment not in ('MENORES', 'VETERANOS') then
    return new;
  end if;

  -- Los históricos sin referencia continúan editables; toda alta nueva debe ser explícita.
  if new.age_category_id is null then
    if tg_op = 'UPDATE'
       and old.segment in ('MENORES', 'VETERANOS')
       and old.age_category_id is null
       and new.club_id is not distinct from old.club_id
       and new.gender is not distinct from old.gender
       and new.segment is not distinct from old.segment
       and new.category_id is not distinct from old.category_id
       and new.category is not distinct from old.category
       and new.category_rule is not distinct from old.category_rule
       and new.fixed_category_id is not distinct from old.fixed_category_id
       and new.category_sum_target is not distinct from old.category_sum_target then
      return new;
    end if;
    raise exception 'CATEGORIA_ETARIA_REQUERIDA' using errcode = '23514';
  end if;

  select category.* into v_age
  from public.competition_age_categories category
  where category.id = new.age_category_id
    and category.club_id = new.club_id;

  if not found then
    raise exception 'CATEGORIA_ETARIA_INVALIDA_PARA_CLUB' using errcode = '23503';
  end if;
  if not v_age.is_active and (tg_op = 'INSERT' or old.age_category_id is distinct from new.age_category_id) then
    raise exception 'CATEGORIA_ETARIA_INACTIVA' using errcode = '23514';
  end if;
  if new.segment = 'MENORES' and (v_age.max_age is null or v_age.max_age > 18) then
    raise exception 'CATEGORIA_ETARIA_NO_ES_DE_MENORES' using errcode = '23514';
  end if;
  if new.segment = 'VETERANOS' and (v_age.min_age is null or v_age.min_age < 18) then
    raise exception 'CATEGORIA_ETARIA_NO_ES_DE_VETERANOS' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_tournament_age_category on public.tournaments;
create trigger trg_validate_tournament_age_category
before insert or update of club_id, gender, segment, category_id, category,
  category_rule, fixed_category_id, category_sum_target, age_category_id
on public.tournaments
for each row execute function public.validate_tournament_age_category();

comment on column public.tournaments.age_category_id is
  'Categoría etaria configurable para torneos MENORES/VETERANOS. NULL en LIBRES y en históricos legacy.';

commit;
