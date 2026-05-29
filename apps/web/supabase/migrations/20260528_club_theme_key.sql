alter table public.clubs
  add column if not exists theme_key text not null default 'cyan';

alter table public.clubs
  add constraint clubs_theme_key_check
  check (theme_key in ('cyan', 'magenta', 'indigo', 'emerald', 'violet', 'amber', 'blueSteel'));
