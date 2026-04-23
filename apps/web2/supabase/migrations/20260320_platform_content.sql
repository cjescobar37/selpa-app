create extension if not exists pgcrypto;

create table if not exists public.platform_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  body text,
  cover_url text,
  gallery_urls text[] not null default '{}',
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  placement text not null default 'GRID' check (placement in ('HERO','GRID','ARCHIVE')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  link_url text,
  slot text not null default 'HOME_GRID' check (slot in ('HOME_HERO','HOME_GRID','HOME_INLINE')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text,
  logo_url text,
  tier text not null default 'SPONSOR' check (tier in ('SPONSOR','PARTNER','LOCAL')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_platform_content()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_platform_news_updated_at on public.platform_news;
create trigger trg_platform_news_updated_at before update on public.platform_news
for each row execute function public.set_updated_at_platform_content();

drop trigger if exists trg_platform_ads_updated_at on public.platform_ad_campaigns;
create trigger trg_platform_ads_updated_at before update on public.platform_ad_campaigns
for each row execute function public.set_updated_at_platform_content();

drop trigger if exists trg_platform_sponsors_updated_at on public.platform_sponsors;
create trigger trg_platform_sponsors_updated_at before update on public.platform_sponsors
for each row execute function public.set_updated_at_platform_content();

alter table public.platform_news enable row level security;
alter table public.platform_ad_campaigns enable row level security;
alter table public.platform_sponsors enable row level security;

drop policy if exists platform_news_public_read on public.platform_news;
create policy platform_news_public_read on public.platform_news for select using (status = 'PUBLISHED');

drop policy if exists platform_ads_public_read on public.platform_ad_campaigns;
create policy platform_ads_public_read on public.platform_ad_campaigns for select using (status = 'ACTIVE');

drop policy if exists platform_sponsors_public_read on public.platform_sponsors;
create policy platform_sponsors_public_read on public.platform_sponsors for select using (status = 'ACTIVE');

insert into public.platform_news (title, slug, excerpt, body, status, placement, published_at)
select 'Apertura oficial del circuito PAMPRAX', 'apertura-oficial-del-circuito-pamprax', 'Ya está abierta la temporada con calendario confirmado y cupos activos.', 'Contenido inicial editable desde platform.', 'PUBLISHED', 'HERO', now()
where not exists (select 1 from public.platform_news where slug = 'apertura-oficial-del-circuito-pamprax');
