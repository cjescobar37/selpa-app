-- Correct E.164 validation. The prior expression escaped its own escape
-- character, so valid values such as +5492954319389 were rejected.
alter table public.profiles
  drop constraint if exists profiles_phone_e164_check;

alter table public.profiles
  add constraint profiles_phone_e164_check
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$') not valid;
