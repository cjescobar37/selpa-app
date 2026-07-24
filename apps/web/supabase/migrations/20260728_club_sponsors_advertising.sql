begin;

alter table public.club_team_audit drop constraint if exists club_team_audit_action_check;
alter table public.club_team_audit add constraint club_team_audit_action_check check (action in (
  'INVITE_CREATED', 'INVITE_CANCELLED', 'INVITE_ACCEPTED', 'INVITE_DECLINED',
  'ROLE_CHANGED', 'MEMBER_REMOVED', 'OWNERSHIP_TRANSFERRED',
  'SPONSOR_CREATED', 'SPONSOR_UPDATED', 'SPONSOR_DELETED',
  'CAMPAIGN_CREATED', 'CAMPAIGN_UPDATED', 'CAMPAIGN_PUBLISHED',
  'CAMPAIGN_PAUSED', 'CAMPAIGN_ENDED', 'CAMPAIGN_DELETED'
));

alter table public.club_sponsors
  add column if not exists description text,
  add column if not exists category text not null default 'OTHER',
  add column if not exists contact_phone text,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists contribution_amount numeric(14,2),
  add column if not exists currency_code text not null default 'ARS',
  add column if not exists internal_notes text,
  add column if not exists visual_priority integer not null default 100,
  add column if not exists logo_path text;

alter table public.club_ad_campaigns
  add column if not exists internal_name text,
  add column if not exists cta_label text,
  add column if not exists internal_notes text,
  add column if not exists template_key text not null default 'BANNER_HORIZONTAL',
  add column if not exists image_path text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.club_sponsors drop constraint if exists club_sponsors_category_check;
alter table public.club_sponsors add constraint club_sponsors_category_check
  check (category in ('MAIN','GOLD','SILVER','BRONZE','INSTITUTIONAL','SUPPLIER','OTHER'));
alter table public.club_sponsors drop constraint if exists club_sponsors_dates_check;
alter table public.club_sponsors add constraint club_sponsors_dates_check
  check (ends_on is null or starts_on is null or ends_on >= starts_on);
alter table public.club_sponsors drop constraint if exists club_sponsors_contribution_check;
alter table public.club_sponsors add constraint club_sponsors_contribution_check
  check (contribution_amount is null or contribution_amount >= 0);
alter table public.club_sponsors drop constraint if exists club_sponsors_currency_check;
alter table public.club_sponsors add constraint club_sponsors_currency_check
  check (currency_code ~ '^[A-Z]{3}$');

alter table public.club_ad_campaigns drop constraint if exists club_ad_campaigns_status_check;
alter table public.club_ad_campaigns add constraint club_ad_campaigns_status_check
  check (status in ('draft','scheduled','active','paused','ended'));
alter table public.club_ad_campaigns drop constraint if exists club_ad_campaigns_template_check;
alter table public.club_ad_campaigns add constraint club_ad_campaigns_template_check
  check (template_key in ('BANNER_HORIZONTAL','AD_CARD','EDITORIAL_BACKGROUND'));

create table if not exists public.club_ad_campaign_placements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  campaign_id uuid not null references public.club_ad_campaigns(id) on delete cascade,
  placement_key text not null check (placement_key in (
    'CLUB_HOME_HERO',
    'CLUB_HOME_AFTER_TOURNAMENTS',
    'CLUB_HOME_AFTER_NEWS'
  )),
  created_at timestamptz not null default now(),
  unique (campaign_id, placement_key)
);

create table if not exists public.club_ad_events (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs(id) on delete cascade,
  campaign_id uuid not null references public.club_ad_campaigns(id) on delete cascade,
  placement_key text not null,
  event_type text not null check (event_type in ('impression','click')),
  session_key text not null,
  occurred_at timestamptz not null default now(),
  dedupe_window timestamptz not null,
  unique (campaign_id, placement_key, event_type, session_key, dedupe_window)
);

create index if not exists idx_club_sponsors_club_priority
  on public.club_sponsors(club_id, visual_priority, created_at desc);
create index if not exists idx_club_ad_campaigns_public
  on public.club_ad_campaigns(club_id, status, starts_at, ends_at, sort_order);
create index if not exists idx_club_ad_placements_lookup
  on public.club_ad_campaign_placements(club_id, placement_key, campaign_id);
create index if not exists idx_club_ad_events_metrics
  on public.club_ad_events(club_id, campaign_id, occurred_at desc);

insert into public.club_ad_campaign_placements(club_id, campaign_id, placement_key)
select campaign.club_id, campaign.id, campaign.slot_id
from public.club_ad_campaigns campaign
where campaign.slot_id in ('CLUB_HOME_HERO','CLUB_HOME_AFTER_TOURNAMENTS','CLUB_HOME_AFTER_NEWS')
on conflict (campaign_id, placement_key) do nothing;

alter table public.club_ad_campaign_placements enable row level security;
alter table public.club_ad_events enable row level security;

drop policy if exists club_sponsors_manage_select on public.club_sponsors;
drop policy if exists club_sponsors_select_manage on public.club_sponsors;
create policy club_sponsors_select_manage on public.club_sponsors
for select to authenticated using (
  public.is_platform_admin() or public.has_club_capability(club_id, 'sponsors:manage')
);
drop policy if exists club_sponsors_insert_manage on public.club_sponsors;
create policy club_sponsors_insert_manage on public.club_sponsors
for insert to authenticated with check (
  public.is_platform_admin() or public.has_club_capability(club_id, 'sponsors:manage')
);
drop policy if exists club_sponsors_update_manage on public.club_sponsors;
create policy club_sponsors_update_manage on public.club_sponsors
for update to authenticated using (
  public.is_platform_admin() or public.has_club_capability(club_id, 'sponsors:manage')
) with check (
  public.is_platform_admin() or public.has_club_capability(club_id, 'sponsors:manage')
);
drop policy if exists club_sponsors_delete_manage on public.club_sponsors;
create policy club_sponsors_delete_manage on public.club_sponsors
for delete to authenticated using (
  public.is_platform_admin() or public.has_club_capability(club_id, 'sponsors:manage')
);

drop policy if exists club_ad_campaigns_select_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_select_manage on public.club_ad_campaigns
for select to authenticated using (
  public.is_platform_admin()
  or public.has_club_capability(club_id, 'ads:manage')
  or (
    status in ('active','scheduled')
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  )
);
drop policy if exists club_ad_campaigns_insert_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_insert_manage on public.club_ad_campaigns
for insert to authenticated with check (
  public.is_platform_admin() or public.has_club_capability(club_id, 'ads:manage')
);
drop policy if exists club_ad_campaigns_update_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_update_manage on public.club_ad_campaigns
for update to authenticated using (
  public.is_platform_admin() or public.has_club_capability(club_id, 'ads:manage')
) with check (
  public.is_platform_admin() or public.has_club_capability(club_id, 'ads:manage')
);
drop policy if exists club_ad_campaigns_delete_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_delete_manage on public.club_ad_campaigns
for delete to authenticated using (
  public.is_platform_admin() or public.has_club_capability(club_id, 'ads:manage')
);

drop policy if exists club_ad_placements_manage on public.club_ad_campaign_placements;
create policy club_ad_placements_manage on public.club_ad_campaign_placements
for all to authenticated using (
  public.is_platform_admin() or public.has_club_capability(club_id, 'ads:manage')
) with check (
  public.is_platform_admin() or public.has_club_capability(club_id, 'ads:manage')
);
drop policy if exists club_ad_placements_public on public.club_ad_campaign_placements;
create policy club_ad_placements_public on public.club_ad_campaign_placements
for select to anon using (
  exists (
    select 1 from public.club_ad_campaigns campaign
    where campaign.id = campaign_id
      and campaign.club_id = club_id
      and campaign.status in ('active','scheduled')
      and (campaign.starts_at is null or campaign.starts_at <= now())
      and (campaign.ends_at is null or campaign.ends_at >= now())
  )
);

drop policy if exists club_ad_events_manage_read on public.club_ad_events;
create policy club_ad_events_manage_read on public.club_ad_events
for select to authenticated using (
  public.is_platform_admin() or public.has_club_capability(club_id, 'ads:manage')
);

create or replace function public.record_club_ad_event(
  p_campaign_id uuid,
  p_placement_key text,
  p_event_type text,
  p_session_key text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.club_ad_campaigns%rowtype;
  v_window timestamptz := date_trunc('hour', now());
begin
  if p_event_type not in ('impression','click')
     or length(coalesce(p_session_key, '')) < 16
     or length(p_session_key) > 128 then
    return false;
  end if;

  select campaign.* into v_campaign
  from public.club_ad_campaigns campaign
  where campaign.id = p_campaign_id
    and campaign.status in ('active','scheduled')
    and (campaign.starts_at is null or campaign.starts_at <= now())
    and (campaign.ends_at is null or campaign.ends_at >= now())
    and exists (
      select 1 from public.club_ad_campaign_placements placement
      where placement.campaign_id = campaign.id
        and placement.club_id = campaign.club_id
        and placement.placement_key = p_placement_key
    );

  if v_campaign.id is null then return false; end if;

  insert into public.club_ad_events(
    club_id, campaign_id, placement_key, event_type, session_key, dedupe_window
  ) values (
    v_campaign.club_id, v_campaign.id, p_placement_key, p_event_type,
    encode(extensions.digest(p_session_key, 'sha256'), 'hex'), v_window
  ) on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.record_club_ad_event(uuid,text,text,text) from public;
grant execute on function public.record_club_ad_event(uuid,text,text,text) to anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-commercial-assets',
  'club-commercial-assets',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists club_commercial_assets_public_read on storage.objects;
create policy club_commercial_assets_public_read on storage.objects
for select using (bucket_id = 'club-commercial-assets');

drop policy if exists club_commercial_assets_manager_insert on storage.objects;
create policy club_commercial_assets_manager_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'club-commercial-assets'
  and (storage.foldername(name))[1] in ('sponsors','campaigns')
  and public.has_club_capability(((storage.foldername(name))[2])::uuid,
    case when (storage.foldername(name))[1] = 'sponsors' then 'sponsors:manage' else 'ads:manage' end)
);
drop policy if exists club_commercial_assets_manager_update on storage.objects;
create policy club_commercial_assets_manager_update on storage.objects
for update to authenticated using (
  bucket_id = 'club-commercial-assets'
  and public.has_club_capability(((storage.foldername(name))[2])::uuid,
    case when (storage.foldername(name))[1] = 'sponsors' then 'sponsors:manage' else 'ads:manage' end)
) with check (bucket_id = 'club-commercial-assets');
drop policy if exists club_commercial_assets_manager_delete on storage.objects;
create policy club_commercial_assets_manager_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'club-commercial-assets'
  and public.has_club_capability(((storage.foldername(name))[2])::uuid,
    case when (storage.foldername(name))[1] = 'sponsors' then 'sponsors:manage' else 'ads:manage' end)
);

commit;
