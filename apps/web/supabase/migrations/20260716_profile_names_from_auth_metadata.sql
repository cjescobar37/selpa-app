create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''));
  v_last_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'family_name'), ''));
  v_display_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  v_oauth_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'display_name')), '');
begin
  v_display_name := coalesce(
    v_display_name,
    nullif(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
    v_oauth_name,
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), '')
  );

  insert into public.profiles (user_id, id, email, first_name, last_name, display_name)
  values (new.id, new.id, new.email, v_first_name, v_last_name, v_display_name)
  on conflict (user_id) do update
    set email = excluded.email,
        first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name = coalesce(excluded.last_name, public.profiles.last_name),
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        updated_at = now();

  return new;
end;
$$;
