-- Perfil global SELPA: datos deportivos personales, sin relación con club_players.
alter table public.profiles
  add column if not exists height_cm integer null,
  add column if not exists dominant_hand text null,
  add column if not exists preferred_position text null;

alter table public.profiles
  drop constraint if exists profiles_height_cm_check,
  drop constraint if exists profiles_dominant_hand_check,
  drop constraint if exists profiles_preferred_position_check;

alter table public.profiles
  add constraint profiles_height_cm_check
    check (height_cm is null or height_cm between 120 and 230) not valid,
  add constraint profiles_dominant_hand_check
    check (dominant_hand is null or dominant_hand in ('RIGHT', 'LEFT', 'AMBIDEXTROUS')) not valid,
  add constraint profiles_preferred_position_check
    check (preferred_position is null or preferred_position in ('DRIVE', 'REVES', 'BOTH')) not valid;
