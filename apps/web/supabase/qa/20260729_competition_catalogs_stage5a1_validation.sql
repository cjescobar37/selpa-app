begin;

create or replace function pg_temp.run_competition_catalogs_stage5a1_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid;
  v_admin uuid;
  v_player uuid;
  v_outsider uuid;
  v_club_a uuid;
  v_club_b uuid;
  v_season_id uuid;
  v_age_id uuid;
  v_tier_id uuid;
  v_other_age_id uuid;
  v_same_scheme_id uuid;
  v_other_scheme_id uuid;
  v_global_scheme_id uuid;
  v_missing_scheme_id uuid := gen_random_uuid();
  v_result jsonb;
  v_fixture_users uuid[];
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if to_regclass('auth.users') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.clubs') is null
     or to_regclass('public.club_memberships') is null
     or to_regclass('public.platform_admins') is null
     or to_regclass('public.competition_seasons') is null
     or to_regclass('public.points_schemes') is null
     or to_regclass('public.competition_age_categories') is null
     or to_regclass('public.competition_event_tiers') is null then
    return query select 'FAIL', 'QA no ejecutable: falta una tabla estructural de Stage 5A.1 o de sus fixtures';
    return;
  end if;

  if to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.is_platform_admin()') is null
     or to_regprocedure('public.is_club_admin(uuid)') is null
     or to_regprocedure('public.has_club_capability(uuid,text)') is null
     or to_regprocedure('public.is_valid_competition_age_reference_config(text,jsonb)') is null
     or to_regprocedure('public.initialize_competition_catalogs_stage5a1(uuid)') is null then
    return query select 'FAIL', 'QA no ejecutable: falta una función estructural de autorización o Stage 5A.1';
    return;
  end if;

  if to_regrole('authenticated') is null then
    return query select 'FAIL', 'QA no ejecutable: falta el rol authenticated';
    return;
  end if;

  if position(
    'jsonb_object_length' in
    pg_get_functiondef(to_regprocedure('public.is_valid_competition_age_reference_config(text,jsonb)'))
  ) > 0 and to_regprocedure('pg_catalog.jsonb_object_length(jsonb)') is null then
    return query select 'FAIL', 'Stage 5A.1 requiere corrección: jsonb_object_length(jsonb) no existe en PostgreSQL 17';
    return;
  end if;

  v_owner := gen_random_uuid();
  v_admin := gen_random_uuid();
  v_player := gen_random_uuid();
  v_outsider := gen_random_uuid();
  v_club_a := gen_random_uuid();
  v_club_b := gen_random_uuid();

  begin
    insert into auth.users (
      id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      (v_owner, 'authenticated', 'authenticated', 'qa.stage5a1.' || v_token || '.owner@example.invalid', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"QA Stage5A1 Owner"}'::jsonb, now(), now()),
      (v_admin, 'authenticated', 'authenticated', 'qa.stage5a1.' || v_token || '.admin@example.invalid', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"QA Stage5A1 Admin"}'::jsonb, now(), now()),
      (v_player, 'authenticated', 'authenticated', 'qa.stage5a1.' || v_token || '.player@example.invalid', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"QA Stage5A1 Player"}'::jsonb, now(), now()),
      (v_outsider, 'authenticated', 'authenticated', 'qa.stage5a1.' || v_token || '.outsider@example.invalid', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"QA Stage5A1 Outsider"}'::jsonb, now(), now());
  exception when insufficient_privilege then
    select array_agg(candidate.user_id order by candidate.created_at, candidate.user_id)
    into v_fixture_users
    from (
      select auth_user.id as user_id, auth_user.created_at
      from auth.users auth_user
      inner join public.profiles profile on profile.user_id = auth_user.id
      where auth_user.email is not null
        and not exists (
          select 1 from public.platform_admins platform_admin
          where platform_admin.user_id = auth_user.id
        )
      order by auth_user.created_at, auth_user.id
      limit 4
    ) candidate;

    if coalesce(array_length(v_fixture_users, 1), 0) < 4 then
      return query select 'FAIL', 'QA no ejecutable: SQL Editor no permite crear auth.users y se requieren cuatro usuarios reales con perfil válido';
      return;
    end if;

    v_owner := v_fixture_users[1];
    v_admin := v_fixture_users[2];
    v_player := v_fixture_users[3];
    v_outsider := v_fixture_users[4];
  end;

  insert into public.profiles (user_id, id, email, display_name)
  select auth_user.id, auth_user.id, auth_user.email,
    coalesce(auth_user.raw_user_meta_data ->> 'display_name', 'QA Stage 5A1')
  from auth.users auth_user
  where auth_user.id = any (array[v_owner, v_admin, v_player, v_outsider])
  on conflict (user_id) do nothing;

  if not exists (select 1 from public.profiles profile where profile.user_id = v_owner)
     or not exists (select 1 from public.profiles profile where profile.user_id = v_admin)
     or not exists (select 1 from public.profiles profile where profile.user_id = v_player)
     or not exists (select 1 from public.profiles profile where profile.user_id = v_outsider) then
    return query select 'FAIL', 'QA no ejecutable: el trigger de auth.users no creó los perfiles QA requeridos';
    return;
  end if;

  insert into public.clubs (
    id, name, slug, is_active, status, owner_user_id, approved_at, approved_by
  ) values
    (v_club_a, 'QA Stage 5A1 Club A ' || v_token, 'qa-stage5a1-a-' || v_token, true, 'ACTIVE', v_owner, now(), v_owner),
    (v_club_b, 'QA Stage 5A1 Club B ' || v_token, 'qa-stage5a1-b-' || v_token, true, 'ACTIVE', v_outsider, now(), v_outsider);

  insert into public.club_memberships (
    club_id, user_id, role, status, approved_by, approved_at
  ) values
    (v_club_a, v_owner, 'OWNER', 'APPROVED', v_owner, now()),
    (v_club_a, v_admin, 'ADMIN', 'APPROVED', v_owner, now()),
    (v_club_a, v_player, 'PLAYER', 'APPROVED', v_owner, now()),
    (v_club_b, v_outsider, 'OWNER', 'APPROVED', v_outsider, now());

  insert into public.competition_seasons (
    club_id, name, starts_on, ends_on, status, created_by
  ) values (
    v_club_a, 'QA Stage 5A1 Season ' || v_token, current_date, current_date + 30, 'DRAFT', v_owner
  ) returning id into v_season_id;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  select public.initialize_competition_catalogs_stage5a1(v_club_a) into v_result;
  if coalesce((v_result ->> 'age_categories_total')::integer, 0) < 8
     or coalesce((v_result ->> 'event_tiers_total')::integer, 0) < 4 then
    raise exception 'la inicialización no creó los catálogos mínimos';
  end if;

  select public.initialize_competition_catalogs_stage5a1(v_club_a) into v_result;
  if (v_result ->> 'age_categories_created')::integer <> 0
     or (v_result ->> 'event_tiers_created')::integer <> 0 then
    raise exception 'la inicialización no es idempotente';
  end if;

  if not exists (
    select 1 from public.competition_age_categories category
    where category.club_id = v_club_a and category.code = 'SUB12'
      and category.min_age is null and category.max_age = 11
      and category.age_reference_rule = 'CALENDAR_YEAR_END'
  ) then
    raise exception 'Sub 12 no representa menores de 12 al cierre del año calendario';
  end if;

  update public.competition_age_categories as category
  set name = 'QA Libre personalizada', is_active = false
  where category.club_id = v_club_a and category.code = 'LIBRE';

  select public.initialize_competition_catalogs_stage5a1(v_club_a) into v_result;
  if not exists (
    select 1 from public.competition_age_categories category
    where category.club_id = v_club_a and category.code = 'LIBRE'
      and category.name = 'QA Libre personalizada' and category.is_active = false
  ) then
    raise exception 'la reinicialización sobrescribió una personalización';
  end if;

  insert into public.competition_age_categories (
    club_id, name, code, min_age, max_age, age_reference_rule, sort_order, created_by
  ) values (v_club_a, 'QA Veteranos A', 'qa_veteranos_a', 40, 49, 'EVENT_START_DATE', 900, v_owner)
  returning id into v_age_id;

  update public.competition_age_categories as category
  set name = 'QA Veteranos A editada', is_active = false
  where category.id = v_age_id and category.club_id = v_club_a;
  if not found then raise exception 'OWNER no pudo editar una categoría'; end if;

  insert into public.competition_event_tiers (
    club_id, name, code, description, points_multiplier, sort_order, created_by
  ) values (v_club_a, 'QA Open regional', 'qa_open_regional', 'Jerarquía QA', 1.25, 900, v_owner)
  returning id into v_tier_id;

  reset role;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  update public.competition_event_tiers as tier
  set name = 'QA Open regional editado', is_active = false
  where tier.id = v_tier_id and tier.club_id = v_club_a;
  if not found then raise exception 'ADMIN no pudo editar una jerarquía'; end if;

  begin
    insert into public.competition_age_categories (club_id, name, code, age_reference_rule, created_by)
    values (v_club_a, 'QA duplicada', 'QA_VETERANOS_A', 'EVENT_START_DATE', v_admin);
    raise exception 'se aceptó un código duplicado sin distinguir mayúsculas';
  exception when unique_violation then null;
  end;

  begin
    insert into public.competition_age_categories (
      club_id, name, code, min_age, max_age, age_reference_rule, created_by
    ) values (v_club_a, 'QA rango inválido', 'QA_INVALID_RANGE', 50, 40, 'EVENT_START_DATE', v_admin);
    raise exception 'se aceptó un rango etario inválido';
  exception when check_violation then null;
  end;

  insert into public.competition_age_categories (
    club_id, name, code, age_reference_rule, age_reference_config, created_by
  ) values (
    v_club_a, 'QA fecha fija', 'QA_FIXED_DATE', 'FIXED_DATE', '{"date":"2026-12-31"}'::jsonb, v_admin
  );

  begin
    insert into public.competition_age_categories (
      club_id, name, code, age_reference_rule, age_reference_config, created_by
    ) values (
      v_club_a, 'QA fecha imposible', 'QA_INVALID_FIXED_DATE', 'FIXED_DATE', '{"date":"2026-02-30"}'::jsonb, v_admin
    );
    raise exception 'se aceptó una fecha fija inexistente';
  exception when check_violation then null;
  end;

  begin
    insert into public.competition_age_categories (
      club_id, name, code, age_reference_rule, age_reference_config, created_by
    ) values (
      v_club_a, 'QA config incompatible', 'QA_INVALID_CONFIG', 'EVENT_START_DATE', '{"date":"2026-12-31"}'::jsonb, v_admin
    );
    raise exception 'se aceptó configuración incompatible con la regla';
  exception when check_violation then null;
  end;

  begin
    insert into public.competition_event_tiers (club_id, name, code, points_multiplier, created_by)
    values (v_club_a, 'QA multiplicador inválido', 'QA_INVALID_MULTIPLIER', 0, v_admin);
    raise exception 'se aceptó un multiplicador inválido';
  exception when check_violation then null;
  end;

  reset role;
  insert into public.points_schemes (club_id, name, is_global, is_active, created_by)
  values (v_club_a, 'QA esquema privado propio ' || v_token, false, true, v_owner)
  returning id into v_same_scheme_id;

  insert into public.points_schemes (club_id, name, is_global, is_active, created_by)
  values (v_club_b, 'QA esquema privado externo ' || v_token, false, true, v_outsider)
  returning id into v_other_scheme_id;

  insert into public.points_schemes (club_id, name, is_global, is_active, created_by)
  values (null, 'QA esquema global ' || v_token, true, true, v_owner)
  returning id into v_global_scheme_id;

  if v_same_scheme_id is null or v_other_scheme_id is null or v_global_scheme_id is null then
    raise exception 'los fixtures de points_schemes no devolvieron sus IDs';
  end if;

  insert into public.competition_age_categories (club_id, name, code, age_reference_rule, created_by)
  values (v_club_b, 'QA otro club', 'QA_OTHER_CLUB', 'EVENT_START_DATE', v_owner)
  returning id into v_other_age_id;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;

  if not exists (
    select 1 from public.points_schemes scheme
    where scheme.id = v_global_scheme_id and scheme.is_global = true
  ) then
    raise exception 'el esquema global QA no es visible para el OWNER';
  end if;

  if not exists (
    select 1 from public.points_schemes scheme
    where scheme.id = v_same_scheme_id and scheme.club_id = v_club_a and scheme.is_global = false
  ) then
    raise exception 'el esquema propio QA no es visible para el OWNER';
  end if;

  if exists (
    select 1 from public.points_schemes scheme
    where scheme.id = v_other_scheme_id
  ) then
    raise exception 'RLS expuso al OWNER el esquema privado de otro club';
  end if;

  while exists (
    select 1 from public.points_schemes scheme
    where scheme.id = v_missing_scheme_id
  ) loop
    v_missing_scheme_id := gen_random_uuid();
  end loop;

  insert into public.competition_event_tiers (
    club_id, name, code, default_points_scheme_id, points_multiplier, created_by
  ) values (
    v_club_a, 'QA tier global', 'QA_GLOBAL_SCHEME', v_global_scheme_id, 1, v_owner
  );

  insert into public.competition_event_tiers (
    club_id, name, code, default_points_scheme_id, points_multiplier, created_by
  ) values (
    v_club_a, 'QA tier propio', 'QA_SAME_CLUB_SCHEME', v_same_scheme_id, 1, v_owner
  );

  begin
    insert into public.competition_event_tiers (
      club_id, name, code, default_points_scheme_id, points_multiplier, created_by
    ) values (
      v_club_a, 'QA tier externo', 'QA_EXTERNAL_SCHEME', v_other_scheme_id, 1, v_owner
    );
    raise exception 'se aceptó un esquema privado de otro club';
  exception when foreign_key_violation or check_violation then null;
  end;

  begin
    insert into public.competition_event_tiers (
      club_id, name, code, default_points_scheme_id, points_multiplier, created_by
    ) values (
      v_club_a, 'QA tier inexistente', 'QA_MISSING_SCHEME', v_missing_scheme_id, 1, v_owner
    );
    raise exception 'se aceptó un esquema de puntos inexistente';
  exception when foreign_key_violation then null;
  end;

  update public.competition_age_categories as category
  set name = 'QA aislamiento vulnerado'
  where category.id = v_other_age_id and category.club_id = v_club_b;
  if found then raise exception 'OWNER pudo modificar el catálogo de otro club'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', v_player::text, true);
  set local role authenticated;
  begin
    insert into public.competition_event_tiers (club_id, name, code, points_multiplier, created_by)
    values (v_club_a, 'QA PLAYER', 'QA_PLAYER_DENIED', 1, v_player);
    raise exception 'PLAYER pudo crear una jerarquía';
  exception when insufficient_privilege then null;
  end;

  reset role;
  if not exists (
    select 1 from public.competition_age_categories category
    where category.id = v_age_id and category.club_id = v_club_a and category.is_active = false
  ) then
    raise exception 'la desactivación no preservó la categoría';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;
  begin
    delete from public.competition_age_categories category
    where category.id = v_age_id and category.club_id = v_club_a;
    raise exception 'OWNER pudo eliminar físicamente una categoría';
  exception when insufficient_privilege then null;
  end;
  reset role;

  return query select 'PASS', 'Stage 5A.1 válido: inicialización, idempotencia, catálogos, restricciones, RLS e aislamiento';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_competition_catalogs_stage5a1_qa();

rollback;
