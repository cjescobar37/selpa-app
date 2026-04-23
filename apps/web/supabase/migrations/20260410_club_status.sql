do $$
begin
  if not exists (select 1 from pg_type where typname = 'club_status') then
    create type public.club_status as enum (
      'PENDING_APPROVAL',
      'ACTIVE',
      'REJECTED',
      'SUSPENDED'
    );
  end if;
end $$;

alter table public.clubs
  add column if not exists status public.club_status not null default 'PENDING_APPROVAL';

update public.clubs
set status = case
  when is_active is true then 'ACTIVE'::public.club_status
  else 'PENDING_APPROVAL'::public.club_status
end
where status is null
   or status = 'PENDING_APPROVAL'::public.club_status;

create index if not exists idx_clubs_status on public.clubs(status);
