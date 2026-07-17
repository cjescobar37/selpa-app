-- Datos globales de contacto y presentación del jugador. No pertenecen a club_players.
alter table public.profiles
  add column if not exists phone_country_code text,
  add column if not exists phone_area_code text,
  add column if not exists phone_number text,
  add column if not exists phone_e164 text,
  add column if not exists cover_url text;

alter table public.profiles
  drop constraint if exists profiles_phone_country_code_check,
  drop constraint if exists profiles_phone_area_code_check,
  drop constraint if exists profiles_phone_number_check,
  drop constraint if exists profiles_phone_e164_check;

alter table public.profiles
  add constraint profiles_phone_country_code_check
    check (phone_country_code is null or phone_country_code = '+54') not valid,
  add constraint profiles_phone_area_code_check
    check (phone_area_code is null or phone_area_code ~ '^[0-9]{2,5}$') not valid,
  add constraint profiles_phone_number_check
    check (phone_number is null or phone_number ~ '^[0-9]{6,8}$') not valid,
  add constraint profiles_phone_e164_check
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$') not valid;
