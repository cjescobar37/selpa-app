begin;

create or replace function pg_temp.run_competition_catalog_idempotency_qa()
returns table(result text)
language plpgsql
as $$
declare
  owner_id uuid := gen_random_uuid();
  player_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  v_club_id uuid := gen_random_uuid();
  v_other_club_id uuid := gen_random_uuid();
  v_season_id uuid;
  v_branch_id uuid;
  v_segment_id uuid;
  v_category_id uuid;
  v_division_id uuid;
  division public.competition_divisions%rowtype;
  replay jsonb;
  token text := replace(gen_random_uuid()::text, '-', '');
begin
  if to_regprocedure('public.manage_competition_catalog_entry(uuid,text,text,uuid,text,text,text,integer,text)') is null then
    return query select 'FAIL | migration missing';
    return;
  end if;

  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (owner_id, 'authenticated', 'authenticated', 'qa.catalog.fix.owner.' || token || '@example.invalid', now(), '{}', '{}', now(), now()),
    (player_id, 'authenticated', 'authenticated', 'qa.catalog.fix.player.' || token || '@example.invalid', now(), '{}', '{}', now(), now()),
    (outsider_id, 'authenticated', 'authenticated', 'qa.catalog.fix.outsider.' || token || '@example.invalid', now(), '{}', '{}', now(), now());

  insert into public.profiles (user_id, id, email, display_name)
  select id, id, email, 'QA catalog fix'
  from auth.users
  where id in (owner_id, player_id, outsider_id)
  on conflict do nothing;

  insert into public.clubs (id, name, slug, is_active, status, owner_user_id, approved_at, approved_by)
  values
    (v_club_id, 'QA Catalog Fix ' || token, 'qa-catalog-fix-' || token, true, 'ACTIVE', owner_id, now(), owner_id),
    (v_other_club_id, 'QA Catalog Fix Other ' || token, 'qa-catalog-fix-other-' || token, true, 'ACTIVE', outsider_id, now(), outsider_id);

  insert into public.club_memberships (club_id, user_id, role, status, approved_by, approved_at)
  values
    (v_club_id, owner_id, 'OWNER', 'APPROVED', owner_id, now()),
    (v_club_id, player_id, 'PLAYER', 'APPROVED', owner_id, now()),
    (v_other_club_id, outsider_id, 'OWNER', 'APPROVED', outsider_id, now());

  insert into public.competition_seasons (club_id, name, starts_on, ends_on, status, created_by)
  values (v_club_id, 'QA 2026', date '2026-01-01', date '2026-12-31', 'ACTIVE', owner_id)
  returning id into v_season_id;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  replay := public.manage_competition_catalog_entry(v_club_id, 'branch', 'CREATE', null, 'Mixto', 'mixto-' || token, null, 1, 'MIXED');
  v_branch_id := (replay ->> 'id')::uuid;
  if replay ->> '_catalog_action' <> 'CREATED' then raise exception 'new branch was not CREATED'; end if;

  replay := public.manage_competition_catalog_entry(v_club_id, 'branch', 'CREATE', null, 'Mixto', 'mixto-' || token, null, 1, 'MIXED');
  if (replay ->> 'id')::uuid <> v_branch_id or replay ->> '_catalog_action' <> 'ALREADY_ACTIVE' then
    raise exception 'active replay is not idempotent';
  end if;
  if (select count(*) from public.competition_branches b where b.club_id = v_club_id and b.slug = 'mixto-' || token) <> 1 then
    raise exception 'branch duplicate created';
  end if;

  v_segment_id := (public.manage_competition_catalog_entry(v_club_id, 'segment', 'CREATE', null, 'Libres', 'libres-' || token, null, 1, 'DEFAULT') ->> 'id')::uuid;
  v_category_id := (public.manage_competition_catalog_entry(v_club_id, 'category', 'CREATE', null, '7ª', '7a-' || token, '7ª', 1, 'DEFAULT') ->> 'id')::uuid;

  perform public.manage_competition_catalog_entry(v_club_id, 'category', 'DEACTIVATE', v_category_id);
  replay := public.manage_competition_catalog_entry(v_club_id, 'category', 'CREATE', null, '7ª', '7a-' || token, '7ª', 1, 'DEFAULT');
  if (replay ->> 'id')::uuid <> v_category_id
     or replay ->> '_catalog_action' <> 'REACTIVATED'
     or not (replay ->> 'is_active')::boolean then
    raise exception 'inactive category was not reactivated';
  end if;
  if (select count(*) from public.competition_categories c where c.club_id = v_club_id and c.slug = '7a-' || token) <> 1 then
    raise exception 'category duplicate created';
  end if;

  division := public.ensure_competition_division(v_club_id, v_season_id, 'PAIRS', v_branch_id, v_segment_id, v_category_id);
  v_division_id := division.id;
  if not exists (
    select 1
    from public.competition_divisions d
    where d.id = v_division_id
      and d.club_id = v_club_id
      and d.season_id = v_season_id
      and d.modality = 'PAIRS'
      and d.branch_id = v_branch_id
      and d.segment_id = v_segment_id
      and d.category_id = v_category_id
      and d.is_active
  ) then
    raise exception 'Mixto Libres 7ª PAIRS division missing';
  end if;

  begin
    perform public.manage_competition_catalog_entry(v_other_club_id, 'branch', 'CREATE', null, 'Cross club', 'cross-' || token, null, 1, 'DEFAULT');
    raise exception 'cross-club accepted';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', player_id, 'role', 'authenticated')::text, true);
  begin
    perform public.manage_competition_catalog_entry(v_club_id, 'category', 'CREATE', null, 'Blocked', 'blocked-' || token, 'Blocked', 1, 'DEFAULT');
    raise exception 'PLAYER accepted';
  exception when insufficient_privilege then null;
  end;

  reset role;
  return query select 'PASS | catalog CREATE idempotente: nuevo, activo, reactivación, unicidad, PLAYER, tenant y división Mixto · Libres · 7ª';
exception when others then
  reset role;
  return query select 'FAIL | ' || sqlerrm;
end
$$;

select * from pg_temp.run_competition_catalog_idempotency_qa();
rollback;
