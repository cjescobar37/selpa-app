begin;

create table if not exists public.club_public_profiles (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  tagline text,
  story text,
  publication_status text not null default 'DRAFT' check (publication_status in ('DRAFT','PUBLISHED')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tagline is null or char_length(tagline) <= 120),
  check (story is null or char_length(story) <= 4000),
  check ((publication_status = 'PUBLISHED' and published_at is not null) or publication_status = 'DRAFT')
);

create table if not exists public.club_media (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  kind text not null check (kind in ('COVER','STORY','GALLERY')),
  storage_path text not null,
  public_url text not null,
  alt_text text,
  caption text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_visible boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, storage_path),
  check (alt_text is null or char_length(alt_text) <= 180),
  check (caption is null or char_length(caption) <= 500)
);

create unique index if not exists club_media_single_cover_idx on public.club_media(club_id) where kind = 'COVER';
create unique index if not exists club_media_single_story_idx on public.club_media(club_id) where kind = 'STORY';
create index if not exists club_media_gallery_order_idx on public.club_media(club_id, kind, sort_order, created_at);

create table if not exists public.club_facilities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  facility_key text not null,
  label text not null,
  description text,
  is_available boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, facility_key),
  check (facility_key ~ '^[A-Z][A-Z0-9_]{1,49}$'),
  check (char_length(label) between 1 and 80),
  check (description is null or char_length(description) <= 500)
);

create index if not exists club_facilities_order_idx on public.club_facilities(club_id, sort_order, label);

drop trigger if exists trg_club_public_profiles_updated_at on public.club_public_profiles;
create trigger trg_club_public_profiles_updated_at before update on public.club_public_profiles
for each row execute function public.set_updated_at();
drop trigger if exists trg_club_media_updated_at on public.club_media;
create trigger trg_club_media_updated_at before update on public.club_media
for each row execute function public.set_updated_at();
drop trigger if exists trg_club_facilities_updated_at on public.club_facilities;
create trigger trg_club_facilities_updated_at before update on public.club_facilities
for each row execute function public.set_updated_at();

create or replace function public.has_club_capability(p_club_id uuid, p_capability text)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.club_role;
  v_capability text := lower(btrim(coalesce(p_capability, '')));
begin
  if v_capability not in (
    'dashboard:view', 'club:view', 'club:update', 'club:branding', 'club:profile_manage',
    'memberships:view', 'memberships:manage', 'roles:view', 'roles:manage', 'ownership:transfer',
    'players:view', 'players:manage', 'players:private_view', 'ranking:view', 'ranking:manage',
    'tournaments:view', 'tournaments:create', 'tournaments:update', 'tournaments:publish',
    'tournaments:cancel', 'tournaments:delete', 'registrations:view', 'registrations:manage',
    'groups:generate', 'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
    'finance:view', 'finance:manage', 'payments:view', 'payments:manage',
    'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
    'messages:view', 'messages:reply', 'reports:operational_view', 'audit:view', 'security:manage'
  ) then
    raise exception 'Unknown club capability: %', p_capability using errcode = '22023';
  end if;

  select membership.role into v_role
  from public.club_memberships membership
  where membership.club_id = p_club_id and membership.user_id = auth.uid()
    and membership.status = 'APPROVED' and membership.approved_at is not null
  limit 1;

  if v_role::text = 'OWNER' then return true; end if;
  if v_role::text = 'ADMIN' then return v_capability <> 'ownership:transfer'; end if;
  if v_role::text = 'OPERADOR' then
    return v_capability in (
      'dashboard:view', 'club:view', 'memberships:view', 'memberships:manage',
      'players:view', 'players:manage', 'players:private_view', 'ranking:view', 'ranking:manage',
      'tournaments:view', 'tournaments:create', 'tournaments:update', 'tournaments:publish',
      'tournaments:cancel', 'registrations:view', 'registrations:manage', 'groups:generate',
      'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
      'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
      'messages:view', 'messages:reply', 'reports:operational_view'
    );
  end if;
  if v_role::text = 'PLANILLERO' then
    return v_capability in ('dashboard:view', 'club:view', 'tournaments:view', 'matches:view', 'matches:update');
  end if;
  return false;
end;
$$;

revoke all on function public.has_club_capability(uuid, text) from public, anon;
grant execute on function public.has_club_capability(uuid, text) to authenticated, service_role;

alter table public.club_public_profiles enable row level security;
alter table public.club_media enable row level security;
alter table public.club_facilities enable row level security;

create policy club_public_profiles_public_read on public.club_public_profiles for select
using (publication_status = 'PUBLISHED' and exists (
  select 1 from public.clubs club where club.id = club_id and club.is_active is true and club.status = 'ACTIVE'
));
create policy club_public_profiles_manage on public.club_public_profiles for all to authenticated
using (public.has_club_capability(club_id, 'club:profile_manage'))
with check (public.has_club_capability(club_id, 'club:profile_manage'));

create policy club_media_public_read on public.club_media for select
using (is_visible and exists (
  select 1 from public.club_public_profiles profile join public.clubs club on club.id = profile.club_id
  where profile.club_id = club_id and profile.publication_status = 'PUBLISHED' and club.is_active is true and club.status = 'ACTIVE'
));
create policy club_media_manage on public.club_media for all to authenticated
using (public.has_club_capability(club_id, 'club:profile_manage'))
with check (public.has_club_capability(club_id, 'club:profile_manage'));

create policy club_facilities_public_read on public.club_facilities for select
using (is_available and exists (
  select 1 from public.club_public_profiles profile join public.clubs club on club.id = profile.club_id
  where profile.club_id = club_id and profile.publication_status = 'PUBLISHED' and club.is_active is true and club.status = 'ACTIVE'
));
create policy club_facilities_manage on public.club_facilities for all to authenticated
using (public.has_club_capability(club_id, 'club:profile_manage'))
with check (public.has_club_capability(club_id, 'club:profile_manage'));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('club-profile-assets', 'club-profile-assets', true, 8388608, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy club_profile_assets_public_read on storage.objects for select
using (bucket_id = 'club-profile-assets');
create policy club_profile_assets_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'club-profile-assets' and (storage.foldername(name))[1] in ('covers','history','gallery')
  and public.has_club_capability(((storage.foldername(name))[2])::uuid, 'club:profile_manage')
);
create policy club_profile_assets_update on storage.objects for update to authenticated
using (bucket_id = 'club-profile-assets' and public.has_club_capability(((storage.foldername(name))[2])::uuid, 'club:profile_manage'))
with check (bucket_id = 'club-profile-assets' and (storage.foldername(name))[1] in ('covers','history','gallery') and public.has_club_capability(((storage.foldername(name))[2])::uuid, 'club:profile_manage'));
create policy club_profile_assets_delete on storage.objects for delete to authenticated
using (bucket_id = 'club-profile-assets' and public.has_club_capability(((storage.foldername(name))[2])::uuid, 'club:profile_manage'));

create or replace function public.get_public_club_profile(p_club_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'club_id', club.id, 'name', club.name, 'brand_name', club.brand_name, 'slug', club.slug,
    'logo_url', club.logo_url, 'description', club.description, 'city', club.city,
    'province', club.province, 'country', club.country, 'address', club.address,
    'phone', club.phone, 'mobile_phone', club.mobile_phone, 'contact_email', club.contact_email,
    'website', club.website, 'instagram', club.instagram, 'opening_hours', club.opening_hours,
    'opening_hours_json', club.opening_hours_json, 'courts_count', club.courts_count,
    'courts_surface', club.courts_surface, 'court_surfaces', club.court_surfaces,
    'theme_key', club.theme_key, 'tagline', profile.tagline, 'story', profile.story,
    'published_at', profile.published_at,
    'media', coalesce((select jsonb_agg(jsonb_build_object(
      'id', media.id, 'kind', media.kind, 'public_url', media.public_url,
      'alt_text', media.alt_text, 'caption', media.caption, 'sort_order', media.sort_order
    ) order by media.kind, media.sort_order, media.created_at) from public.club_media media
      where media.club_id = club.id and media.is_visible), '[]'::jsonb),
    'facilities', coalesce((select jsonb_agg(jsonb_build_object(
      'id', facility.id, 'facility_key', facility.facility_key, 'label', facility.label,
      'description', facility.description, 'sort_order', facility.sort_order
    ) order by facility.sort_order, facility.label) from public.club_facilities facility
      where facility.club_id = club.id and facility.is_available), '[]'::jsonb)
  )
  from public.clubs club join public.club_public_profiles profile on profile.club_id = club.id
  where club.id = p_club_id and club.is_active is true and club.status = 'ACTIVE'
    and profile.publication_status = 'PUBLISHED';
$$;

revoke all on function public.get_public_club_profile(uuid) from public;
grant execute on function public.get_public_club_profile(uuid) to anon, authenticated, service_role;
grant select, insert, update, delete on public.club_public_profiles, public.club_media, public.club_facilities to authenticated;

commit;
