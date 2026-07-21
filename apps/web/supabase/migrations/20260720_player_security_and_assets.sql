-- Cierre Jugador: notificaciones operativas solo por backend autorizado.
drop policy if exists notifications_insert_platform on public.notifications;

drop policy if exists user_settings_insert on public.user_settings;
drop policy if exists user_settings_update on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;
drop policy if exists user_settings_upsert_own on public.user_settings;
drop policy if exists user_settings_insert_approved_club on public.user_settings;
drop policy if exists user_settings_update_approved_club on public.user_settings;

create policy user_settings_insert_approved_club
on public.user_settings for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    active_club_id is null
    or exists (
      select 1 from public.club_memberships membership
      where membership.user_id = auth.uid()
        and membership.club_id = active_club_id
        and membership.status = 'APPROVED'::public.membership_status
        and membership.approved_at is not null
    )
  )
);

create policy user_settings_update_approved_club
on public.user_settings for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    active_club_id is null
    or exists (
      select 1 from public.club_memberships membership
      where membership.user_id = auth.uid()
        and membership.club_id = active_club_id
        and membership.status = 'APPROVED'::public.membership_status
        and membership.approved_at is not null
    )
  )
);

-- Bucket reproducible para avatar y portada. El límite del bucket cubre la portada;
-- la app aplica 3 MB para avatar y 5 MB para portada.
do $$
begin
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'player-assets'
      and not (
        array_length(storage.foldername(object.name), 1) = 2
        and (storage.foldername(object.name))[1] in ('avatars', 'covers')
        and (storage.foldername(object.name))[2]
          ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      )
  ) then
    raise exception 'player-assets contiene paths legacy no públicos; migrarlos antes de continuar.';
  end if;
end;
$$;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'player-assets',
  'player-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "player assets public read" on storage.objects;
drop policy if exists "player assets insert own" on storage.objects;
drop policy if exists "player assets update own" on storage.objects;
drop policy if exists "player assets delete own" on storage.objects;

create policy "player assets public read"
on storage.objects for select
using (bucket_id = 'player-assets');

create policy "player assets insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'player-assets'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] in ('avatars', 'covers')
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "player assets update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'player-assets'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] in ('avatars', 'covers')
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'player-assets'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] in ('avatars', 'covers')
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "player assets delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'player-assets'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] in ('avatars', 'covers')
  and (storage.foldername(name))[2] = auth.uid()::text
);
