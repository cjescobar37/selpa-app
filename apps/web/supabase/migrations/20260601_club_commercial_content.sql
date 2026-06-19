create table if not exists public.club_sponsors (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  logo_url text,
  website_url text,
  contact_name text,
  contact_email text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  sponsor_id uuid references public.club_sponsors(id) on delete set null,
  slot_id text not null,
  title text not null,
  description text,
  image_url text,
  target_url text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_ad_campaigns_dates_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists idx_club_sponsors_club on public.club_sponsors(club_id);
create index if not exists idx_club_sponsors_status on public.club_sponsors(status);
create index if not exists idx_club_ad_campaigns_club on public.club_ad_campaigns(club_id);
create index if not exists idx_club_ad_campaigns_slot on public.club_ad_campaigns(club_id, slot_id);
create index if not exists idx_club_ad_campaigns_status on public.club_ad_campaigns(status);
create index if not exists idx_club_ad_campaigns_sponsor on public.club_ad_campaigns(sponsor_id);

drop trigger if exists trg_club_sponsors_updated_at on public.club_sponsors;
create trigger trg_club_sponsors_updated_at before update on public.club_sponsors
for each row execute function public.set_updated_at();

drop trigger if exists trg_club_ad_campaigns_updated_at on public.club_ad_campaigns;
create trigger trg_club_ad_campaigns_updated_at before update on public.club_ad_campaigns
for each row execute function public.set_updated_at();

alter table public.club_sponsors enable row level security;
alter table public.club_ad_campaigns enable row level security;

drop policy if exists club_sponsors_select_manage on public.club_sponsors;
create policy club_sponsors_select_manage on public.club_sponsors
for select using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists club_sponsors_insert_manage on public.club_sponsors;
create policy club_sponsors_insert_manage on public.club_sponsors
for insert to authenticated with check (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists club_sponsors_update_manage on public.club_sponsors;
create policy club_sponsors_update_manage on public.club_sponsors
for update to authenticated using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
) with check (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists club_sponsors_delete_manage on public.club_sponsors;
create policy club_sponsors_delete_manage on public.club_sponsors
for delete to authenticated using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists club_ad_campaigns_public_read_active on public.club_ad_campaigns;
create policy club_ad_campaigns_public_read_active on public.club_ad_campaigns
for select using (
  status = 'active'
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

drop policy if exists club_ad_campaigns_select_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_select_manage on public.club_ad_campaigns
for select to authenticated using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists club_ad_campaigns_insert_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_insert_manage on public.club_ad_campaigns
for insert to authenticated with check (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists club_ad_campaigns_update_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_update_manage on public.club_ad_campaigns
for update to authenticated using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
) with check (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);

drop policy if exists club_ad_campaigns_delete_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_delete_manage on public.club_ad_campaigns
for delete to authenticated using (
  public.is_platform_admin()
  or public.is_club_admin(club_id)
);
