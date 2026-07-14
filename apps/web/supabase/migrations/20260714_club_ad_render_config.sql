alter table public.club_ad_campaigns
  add column if not exists render_config jsonb;

alter table public.club_ad_campaigns
  add column if not exists sort_order integer not null default 100;

comment on column public.club_ad_campaigns.render_config is
  'Configuración visual opcional para banners compuestos de publicidad del club. Si es null, se usa render legacy por imagen.';

create index if not exists idx_club_ad_campaigns_sort
  on public.club_ad_campaigns(club_id, slot_id, sort_order, created_at);

drop policy if exists club_sponsors_select_manage on public.club_sponsors;
create policy club_sponsors_select_manage on public.club_sponsors
for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_sponsors.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);

drop policy if exists club_sponsors_insert_manage on public.club_sponsors;
create policy club_sponsors_insert_manage on public.club_sponsors
for insert to authenticated with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_sponsors.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);

drop policy if exists club_sponsors_update_manage on public.club_sponsors;
create policy club_sponsors_update_manage on public.club_sponsors
for update to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_sponsors.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
) with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_sponsors.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);

drop policy if exists club_sponsors_delete_manage on public.club_sponsors;
create policy club_sponsors_delete_manage on public.club_sponsors
for delete to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_sponsors.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);

drop policy if exists club_ad_campaigns_select_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_select_manage on public.club_ad_campaigns
for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_ad_campaigns.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);

drop policy if exists club_ad_campaigns_insert_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_insert_manage on public.club_ad_campaigns
for insert to authenticated with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_ad_campaigns.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);

drop policy if exists club_ad_campaigns_update_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_update_manage on public.club_ad_campaigns
for update to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_ad_campaigns.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
) with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_ad_campaigns.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);

drop policy if exists club_ad_campaigns_delete_manage on public.club_ad_campaigns;
create policy club_ad_campaigns_delete_manage on public.club_ad_campaigns
for delete to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.club_memberships m
    where m.club_id = club_ad_campaigns.club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER','ADMIN')
  )
);
