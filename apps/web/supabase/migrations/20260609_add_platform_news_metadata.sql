alter table public.platform_news
  add column if not exists metadata jsonb not null default '{}'::jsonb;
