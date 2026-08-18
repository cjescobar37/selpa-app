begin;

do $$
begin
  if to_regclass('public.club_venues') is null or to_regclass('public.venue_courts') is null then
    raise exception 'Esta corrección requiere Tournament Venues P0 aplicado.';
  end if;
end $$;

-- RLS authorizes reads; it must not compose the venue DTO. Keeping this policy
-- table-local breaks the venue <-> court policy recursion.
drop policy if exists club_venues_read_eligible on public.club_venues;
create policy club_venues_read_eligible on public.club_venues
for select to authenticated
using (is_active);

-- This lookup is safe because club_venues_read_eligible is table-local above.
drop policy if exists venue_courts_read_eligible on public.venue_courts;
create policy venue_courts_read_eligible on public.venue_courts
for select to authenticated
using (
  is_active
  and exists (
    select 1
    from public.club_venues venue
    where venue.id = venue_courts.venue_id
      and venue.is_active
  )
);

comment on policy club_venues_read_eligible on public.club_venues is
  'P0 read authorization only. Filtering venues without active courts belongs in the application DTO, never in RLS.';

commit;
