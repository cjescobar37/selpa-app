-- Sprint 1 CLUB: canonical authorization, club_players hardening and club asset ownership.
-- Apply after 20260720_player_membership_atomic.sql.

begin;

create or replace function public.is_club_owner(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.club_memberships m
    where m.club_id = p_club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role = 'OWNER'
  );
$$;

create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.club_memberships m
    where m.club_id = p_club_id
      and m.user_id = auth.uid()
      and m.status = 'APPROVED'
      and m.approved_at is not null
      and m.role in ('OWNER', 'ADMIN')
  );
$$;

create or replace function public.has_club_capability(p_club_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.club_role;
  v_capability text := lower(btrim(coalesce(p_capability, '')));
begin
  if v_capability not in (
    'dashboard:view', 'club:view', 'club:update', 'club:branding',
    'memberships:view', 'memberships:manage', 'roles:view', 'roles:manage', 'ownership:transfer',
    'players:view', 'players:manage', 'players:private_view', 'ranking:view', 'ranking:manage',
    'tournaments:view', 'tournaments:create', 'tournaments:update', 'tournaments:publish',
    'tournaments:cancel', 'tournaments:delete', 'registrations:view', 'registrations:manage',
    'groups:generate', 'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
    'finance:view', 'finance:manage', 'payments:view', 'payments:manage',
    'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
    'messages:view', 'messages:reply', 'audit:view', 'security:manage'
  ) then
    raise exception 'Unknown club capability: %', p_capability using errcode = '22023';
  end if;

  select m.role into v_role
  from public.club_memberships m
  where m.club_id = p_club_id
    and m.user_id = auth.uid()
    and m.status = 'APPROVED'
    and m.approved_at is not null
  limit 1;

  if v_role = 'OWNER' then return true; end if;
  if v_role = 'ADMIN' then return v_capability <> 'ownership:transfer'; end if;
  if v_role <> 'PLANILLERO' then return false; end if;

  return v_capability in (
    'dashboard:view', 'club:view', 'players:view', 'ranking:view', 'tournaments:view',
    'registrations:view', 'registrations:manage', 'groups:generate', 'matches:view',
    'matches:update', 'matches:schedule', 'playoff:generate', 'payments:view',
    'messages:view', 'messages:reply'
  );
end;
$$;

revoke all on function public.is_club_owner(uuid) from public, anon;
revoke all on function public.is_club_admin(uuid) from public, anon;
revoke all on function public.has_club_capability(uuid, text) from public, anon;
grant execute on function public.is_club_owner(uuid) to authenticated, service_role;
grant execute on function public.is_club_admin(uuid) to authenticated, service_role;
grant execute on function public.has_club_capability(uuid, text) to authenticated, service_role;

-- club_players is created only by the atomic membership approval flow.
drop policy if exists club_players_insert_self on public.club_players;
drop policy if exists club_players_update_self on public.club_players;
drop policy if exists club_players_select on public.club_players;
drop policy if exists club_players_select_authorized on public.club_players;
drop policy if exists club_players_update_sports_admin on public.club_players;

create policy club_players_select_authorized on public.club_players
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_club_capability(club_id, 'players:view')
);

create policy club_players_update_sports_admin on public.club_players
for update to authenticated
using (public.has_club_capability(club_id, 'players:manage'))
with check (public.has_club_capability(club_id, 'players:manage'));

-- Canonical bucket configuration. Public read is intentional for public club identity/rules.
update storage.buckets
set public = true,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'club-logos';

update storage.buckets
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'club-rules';

drop policy if exists "club logos auth update" on storage.objects;
drop policy if exists "club logos auth upload" on storage.objects;
drop policy if exists "club logos public read" on storage.objects;
drop policy if exists "club rules auth update" on storage.objects;
drop policy if exists "club rules auth upload" on storage.objects;
drop policy if exists "club rules public read" on storage.objects;
drop policy if exists club_logos_insert_admin on storage.objects;
drop policy if exists club_logos_update_admin on storage.objects;
drop policy if exists club_logos_delete_admin on storage.objects;
drop policy if exists club_logos_public_read on storage.objects;
drop policy if exists club_rules_insert_admin on storage.objects;
drop policy if exists club_rules_update_admin on storage.objects;
drop policy if exists club_rules_delete_admin on storage.objects;
drop policy if exists club_rules_public_read on storage.objects;

create policy club_logos_public_read on storage.objects
for select using (bucket_id = 'club-logos');

create policy club_logos_insert_admin on storage.objects
for insert to authenticated with check (
  bucket_id = 'club-logos'
  and (storage.foldername(name))[1] = 'logos'
  and public.has_club_capability(
    case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[2])::uuid else null end,
    'club:branding'
  )
);

create policy club_logos_update_admin on storage.objects
for update to authenticated
using (bucket_id = 'club-logos' and public.has_club_capability(
  case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((storage.foldername(name))[2])::uuid else null end, 'club:branding'))
with check (bucket_id = 'club-logos' and (storage.foldername(name))[1] = 'logos' and public.has_club_capability(
  case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((storage.foldername(name))[2])::uuid else null end, 'club:branding'));

create policy club_logos_delete_admin on storage.objects
for delete to authenticated using (bucket_id = 'club-logos' and public.has_club_capability(
  case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((storage.foldername(name))[2])::uuid else null end, 'club:branding'));

create policy club_rules_public_read on storage.objects
for select using (bucket_id = 'club-rules');

create policy club_rules_insert_admin on storage.objects
for insert to authenticated with check (
  bucket_id = 'club-rules' and (storage.foldername(name))[1] = 'rules'
  and public.has_club_capability(case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((storage.foldername(name))[2])::uuid else null end, 'club:branding')
);

create policy club_rules_update_admin on storage.objects
for update to authenticated
using (bucket_id = 'club-rules' and public.has_club_capability(case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then ((storage.foldername(name))[2])::uuid else null end, 'club:branding'))
with check (bucket_id = 'club-rules' and (storage.foldername(name))[1] = 'rules' and public.has_club_capability(case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then ((storage.foldername(name))[2])::uuid else null end, 'club:branding'));

create policy club_rules_delete_admin on storage.objects
for delete to authenticated using (bucket_id = 'club-rules' and public.has_club_capability(case when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((storage.foldername(name))[2])::uuid else null end, 'club:branding'));

commit;
