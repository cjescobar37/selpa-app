alter table public.clubs
  add column if not exists theme_locked boolean not null default false;

alter table public.clubs
  drop constraint if exists clubs_theme_key_check;

alter table public.clubs
  add constraint clubs_theme_key_check
  check (
    theme_key in (
      'cyan',
      'magenta',
      'indigo',
      'emerald',
      'violet',
      'amber',
      'blueSteel',
      'aquaNavy',
      'limeNavy',
      'coralNavy',
      'royalCyan',
      'graphiteAqua',
      'sunsetMagenta'
    )
  );

alter table public.club_requests
  add column if not exists theme_key text not null default 'cyan';

alter table public.club_requests
  drop constraint if exists club_requests_theme_key_check;

alter table public.club_requests
  add constraint club_requests_theme_key_check
  check (
    theme_key in (
      'cyan',
      'magenta',
      'indigo',
      'emerald',
      'violet',
      'amber',
      'blueSteel',
      'aquaNavy',
      'limeNavy',
      'coralNavy',
      'royalCyan',
      'graphiteAqua',
      'sunsetMagenta'
    )
  );
