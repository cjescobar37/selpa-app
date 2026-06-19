-- PAMPrax P2: operational notifications and club-player message threads.
-- This migration extends the existing legacy messages/notifications tables
-- without breaking their current direct-message UI.

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  tournament_id uuid null references public.tournaments(id) on delete set null,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint message_threads_status_check check (status in ('OPEN', 'CLOSED', 'ARCHIVED'))
);

alter table public.messages add column if not exists thread_id uuid null references public.message_threads(id) on delete cascade;
alter table public.messages add column if not exists read_at timestamptz null;

alter table public.notifications add column if not exists club_id uuid null references public.clubs(id) on delete cascade;
alter table public.notifications add column if not exists tournament_id uuid null references public.tournaments(id) on delete set null;
alter table public.notifications add column if not exists actor_id uuid null references auth.users(id) on delete set null;
alter table public.notifications add column if not exists href text null;
alter table public.notifications add column if not exists read_at timestamptz null;

create index if not exists idx_message_threads_club on public.message_threads(club_id);
create index if not exists idx_message_threads_player on public.message_threads(player_user_id);
create index if not exists idx_message_threads_tournament on public.message_threads(tournament_id);
create unique index if not exists idx_message_threads_open_unique
  on public.message_threads(club_id, player_user_id, coalesce(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'OPEN';
create index if not exists idx_messages_thread on public.messages(thread_id);
create index if not exists idx_notifications_club on public.notifications(club_id);
create index if not exists idx_notifications_tournament on public.notifications(tournament_id);

alter table public.message_threads enable row level security;

drop policy if exists message_threads_select_participants on public.message_threads;
create policy message_threads_select_participants
on public.message_threads
for select
to authenticated
using (
  player_user_id = auth.uid()
  or public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists message_threads_insert_player_or_admin on public.message_threads;
create policy message_threads_insert_player_or_admin
on public.message_threads
for insert
to authenticated
with check (
  player_user_id = auth.uid()
  or public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists message_threads_update_participants on public.message_threads;
create policy message_threads_update_participants
on public.message_threads
for update
to authenticated
using (
  player_user_id = auth.uid()
  or public.is_platform_admin()
  or public.is_club_admin(club_id)
)
with check (
  player_user_id = auth.uid()
  or public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant
on public.messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and (
    recipient_user_id = auth.uid()
    or recipient_user_id is not null
  )
);
