alter table public.profiles
  add column if not exists country_code text,
  add column if not exists country text,
  add column if not exists province_id text,
  add column if not exists province text,
  add column if not exists city_id text;

create table if not exists public.argentina_locations (
  country_code text not null default 'AR',
  province_id text not null,
  province text not null,
  city_id text primary key,
  city text not null,
  department_id text,
  department text,
  unique (province_id, city_id)
);

alter table public.argentina_locations enable row level security;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''));
  v_last_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'family_name'), ''));
  v_display_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  v_oauth_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'display_name')), '');
  v_country_code text := nullif(trim(new.raw_user_meta_data ->> 'country_code'), '');
  v_country text := nullif(trim(new.raw_user_meta_data ->> 'country'), '');
  v_province_id text := nullif(trim(new.raw_user_meta_data ->> 'province_id'), '');
  v_city_id text := nullif(trim(new.raw_user_meta_data ->> 'city_id'), '');
  v_birth_date_raw text := nullif(trim(new.raw_user_meta_data ->> 'birth_date'), '');
  v_birth_date date;
  v_gender text := nullif(trim(new.raw_user_meta_data ->> 'gender'), '');
  v_avatar_url text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')), '');
  v_location public.argentina_locations%rowtype;
  v_has_location boolean := false;
begin
  if v_gender is not null and v_gender not in ('FEMALE', 'MALE') then
    raise exception 'Invalid gender metadata';
  end if;

  if v_birth_date_raw is not null then
    begin
      v_birth_date := v_birth_date_raw::date;
      if to_char(v_birth_date, 'YYYY-MM-DD') <> v_birth_date_raw or v_birth_date > current_date then
        raise exception 'Invalid birth date metadata';
      end if;
    exception when others then
      raise exception 'Invalid birth date metadata';
    end;
  end if;

  v_display_name := coalesce(
    v_display_name,
    nullif(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
    v_oauth_name,
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), '')
  );

  if v_province_id is not null or v_city_id is not null then
    if v_country_code is distinct from 'AR' or v_province_id is null or v_city_id is null then
      raise exception 'Invalid Argentina location metadata';
    end if;

    select *
    into v_location
    from public.argentina_locations
    where country_code = 'AR'
      and province_id = v_province_id
      and city_id = v_city_id;

    if not found then
      raise exception 'Invalid province and city combination';
    end if;

    v_has_location := true;
    v_country_code := 'AR';
    v_country := 'Argentina';
  else
    v_country_code := null;
    v_country := null;
  end if;

  insert into public.profiles (
    user_id,
    id,
    email,
    first_name,
    last_name,
    display_name,
    country_code,
    country,
    province_id,
    province,
    city_id,
    city,
    birth_date,
    gender,
    avatar_url
  )
  values (
    new.id,
    new.id,
    new.email,
    v_first_name,
    v_last_name,
    v_display_name,
    v_country_code,
    v_country,
    case when v_has_location then v_location.province_id end,
    case when v_has_location then v_location.province end,
    case when v_has_location then v_location.city_id end,
    case when v_has_location then v_location.city end,
    v_birth_date,
    v_gender,
    v_avatar_url
  )
  on conflict (user_id) do update
    set email = excluded.email,
        first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name = coalesce(excluded.last_name, public.profiles.last_name),
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        country_code = coalesce(excluded.country_code, public.profiles.country_code),
        country = coalesce(excluded.country, public.profiles.country),
        province_id = coalesce(excluded.province_id, public.profiles.province_id),
        province = coalesce(excluded.province, public.profiles.province),
        city_id = coalesce(excluded.city_id, public.profiles.city_id),
        city = coalesce(excluded.city, public.profiles.city),
        birth_date = coalesce(excluded.birth_date, public.profiles.birth_date),
        gender = coalesce(excluded.gender, public.profiles.gender),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();

  return new;
end;
$$;
