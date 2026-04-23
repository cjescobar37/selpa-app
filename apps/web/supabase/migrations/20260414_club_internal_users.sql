do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'club_role'
      and e.enumlabel = 'OPERATIVO'
  ) then
    alter type public.club_role add value 'OPERATIVO';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'club_invite_status'
  ) then
    create type public.club_invite_status as enum (
      'PENDING',
      'ACCEPTED',
      'DECLINED',
      'CANCELLED'
    );
  end if;
end $$;

create table if not exists public.club_user_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null,
  role public.club_role not null,
  status public.club_invite_status not null default 'PENDING',
  invited_by uuid not null references auth.users(id),
  resolved_by uuid references auth.users(id),
  resolved_at timestamp with time zone,
  target_user_id uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint club_user_invites_email_not_blank check (btrim(email) <> ''),
  constraint club_user_invites_resolved_requires_actor check (
    (resolved_at is null and resolved_by is null)
    or (resolved_at is not null and resolved_by is not null)
  ),
  constraint club_user_invites_pending_not_resolved check (
    status <> 'PENDING'
    or (resolved_at is null and resolved_by is null)
  )
);

create index if not exists idx_club_user_invites_club_id
  on public.club_user_invites(club_id);

create index if not exists idx_club_user_invites_email
  on public.club_user_invites(lower(email));

create index if not exists idx_club_user_invites_target_user_id
  on public.club_user_invites(target_user_id);

create unique index if not exists idx_club_user_invites_pending_unique
  on public.club_user_invites(club_id, lower(email))
  where status = 'PENDING';

alter table public.club_user_invites enable row level security;
