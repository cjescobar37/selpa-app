alter table public.platform_news
  add column if not exists club_id uuid null references public.clubs(id) on delete cascade;

create index if not exists idx_platform_news_club_status_published
  on public.platform_news (club_id, status, published_at desc);
