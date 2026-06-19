alter table public.tournaments
  add column if not exists segment text;

alter table public.tournaments
  drop constraint if exists tournaments_segment_chk;

alter table public.tournaments
  add constraint tournaments_segment_chk
  check (segment = any (array['LIBRES'::text, 'MENORES'::text, 'VETERANOS'::text]));

update public.tournaments
set segment = coalesce(
  nullif(segment, ''),
  case
    when rules_json ->> 'segment_type' in ('LIBRES', 'MENORES', 'VETERANOS') then rules_json ->> 'segment_type'
    when rules_json ->> 'segment' in ('LIBRES', 'MENORES', 'VETERANOS') then rules_json ->> 'segment'
    when rules ->> 'segment_type' in ('LIBRES', 'MENORES', 'VETERANOS') then rules ->> 'segment_type'
    when rules ->> 'segment' in ('LIBRES', 'MENORES', 'VETERANOS') then rules ->> 'segment'
    else 'LIBRES'
  end
);

alter table public.tournaments
  alter column segment set default 'LIBRES';

alter table public.tournaments
  alter column segment set not null;
