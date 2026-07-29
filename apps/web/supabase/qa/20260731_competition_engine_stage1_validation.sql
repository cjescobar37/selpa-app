begin;

create or replace function pg_temp.run_competition_engine_stage1_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_club_a uuid;
  v_club_b uuid;
  v_owner uuid;
  v_admin uuid;
  v_season_a uuid;
  v_branch_a uuid;
  v_branch_b uuid;
  v_segment_a uuid;
  v_category_a uuid;
  v_division uuid;
  v_before_players bigint;
  v_after_players bigint;
  v_before_categories bigint;
  v_after_categories bigint;
  v_before_points numeric;
  v_after_points numeric;
  v_before_divisions bigint;
  v_after_divisions bigint;
  v_after_second_template bigint;
  v_failed boolean;
  v_slug text := 'qa-stage1-' || replace(gen_random_uuid()::text, '-', '');
begin
  if to_regclass('public.competition_seasons') is null
     or to_regclass('public.competition_branches') is null
     or to_regclass('public.competition_segments') is null
     or to_regclass('public.competition_categories') is null
     or to_regclass('public.competition_divisions') is null
     or to_regprocedure('public.create_default_competition_structure(uuid,text)') is null then
    return query select 'FAIL', 'QA no ejecutable: primero aplicá 20260731_competition_engine_stage1.sql';
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'club_players'
      and column_info.column_name = 'ranking_points'
  ) then
    return query select 'FAIL', 'QA no ejecutable: club_players.ranking_points no existe en la base activa';
    return;
  end if;

  select membership.club_id, membership.user_id
  into v_club_a, v_owner
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  select club.id into v_club_b
  from public.clubs club
  where club.id <> v_club_a
  order by club.created_at
  limit 1;

  select auth_user.id into v_admin
  from auth.users auth_user
  where auth_user.id <> v_owner
    and not exists (
      select 1 from public.club_memberships membership
      where membership.club_id = v_club_a and membership.user_id = auth_user.id
    )
    and not exists (
      select 1 from public.platform_admins platform_admin
      where platform_admin.user_id = auth_user.id
    )
  order by auth_user.created_at
  limit 1;

  if v_club_a is null or v_owner is null or v_club_b is null or v_admin is null then
    return query select 'FAIL', 'QA no ejecutable: se requieren OWNER aprobado, dos clubes y un usuario adicional sin membership';
    return;
  end if;

  select count(*) into v_before_players from public.club_players;
  select count(*) into v_before_categories from public.club_categories;
  select coalesce(sum((to_jsonb(player)->>'ranking_points')::numeric), 0)
  into v_before_points
  from public.club_players player
  where (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$';

  v_failed := false;
  begin
    insert into public.competition_seasons (club_id, name, starts_on, ends_on, status)
    values (v_club_a, 'QA fechas inválidas', current_date, current_date - 1, 'DRAFT');
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'se aceptó una temporada con fechas inválidas'; end if;

  select season.id into v_season_a
  from public.competition_seasons season
  where season.club_id = v_club_a and season.status = 'ACTIVE'
  limit 1;

  if v_season_a is null then
    insert into public.competition_seasons (club_id, name, starts_on, ends_on, status, created_by)
    values (v_club_a, 'QA activa principal ' || v_slug, current_date, current_date + 30, 'ACTIVE', v_owner)
    returning id into v_season_a;
  end if;

  v_failed := false;
  begin
    insert into public.competition_seasons (club_id, name, starts_on, ends_on, status, created_by)
    values (v_club_a, 'QA activa duplicada ' || v_slug, current_date, current_date + 60, 'ACTIVE', v_owner);
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'se permitieron dos temporadas ACTIVE en el mismo club'; end if;

  insert into public.competition_branches (club_id, name, slug)
  values (v_club_a, 'QA rama A', v_slug)
  returning id into v_branch_a;

  v_failed := false;
  begin
    insert into public.competition_branches (club_id, name, slug)
    values (v_club_a, 'QA rama duplicada', v_slug);
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'se duplicó un slug de rama dentro del club'; end if;

  insert into public.competition_branches (club_id, name, slug)
  values (v_club_b, 'QA rama B', v_slug)
  returning id into v_branch_b;

  insert into public.competition_segments (club_id, name, slug)
  values (v_club_a, 'QA segmento', v_slug)
  returning id into v_segment_a;

  insert into public.competition_categories (club_id, name, short_label, slug)
  values (v_club_a, 'QA categoría', 'QA', v_slug)
  returning id into v_category_a;

  v_failed := false;
  begin
    insert into public.competition_divisions (
      club_id, season_id, modality, branch_id, segment_id, category_id
    ) values (
      v_club_a, v_season_a, 'INDIVIDUAL', v_branch_b, null, null
    );
  exception when foreign_key_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'una división mezcló entidades de clubes distintos'; end if;

  insert into public.competition_divisions (
    club_id, season_id, modality, branch_id, segment_id, category_id
  ) values (
    v_club_a, v_season_a, 'INDIVIDUAL', v_branch_a, null, null
  ) returning id into v_division;

  insert into public.competition_divisions (
    club_id, season_id, modality, branch_id, segment_id, category_id
  ) values (
    v_club_a, v_season_a, 'PAIRS', v_branch_a, v_segment_a, null
  );

  insert into public.competition_divisions (
    club_id, season_id, modality, branch_id, segment_id, category_id
  ) values (
    v_club_a, v_season_a, 'PAIRS', v_branch_a, null, v_category_a
  );

  v_failed := false;
  begin
    insert into public.competition_divisions (
      club_id, season_id, modality, branch_id, segment_id, category_id
    ) values (
      v_club_a, v_season_a, 'INDIVIDUAL', v_branch_a, null, null
    );
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'se duplicó una división equivalente con NULL'; end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  v_failed := false;
  begin
    insert into public.competition_categories (club_id, name, short_label, slug)
    values (v_club_a, 'QA sin permiso', 'NO', v_slug || '-denied');
  exception when insufficient_privilege then
    v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'RLS permitió escritura sin membership ni capability'; end if;

  insert into public.club_memberships (
    club_id, user_id, role, status, approved_by, approved_at
  ) values (
    v_club_a, v_admin, 'ADMIN', 'APPROVED', v_owner, now()
  );

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  insert into public.competition_segments (club_id, name, slug)
  values (v_club_a, 'QA admin permitido', v_slug || '-admin');
  reset role;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  perform public.create_default_competition_structure(v_club_a, 'PADEL_TRADITIONAL');
  select count(*) into v_after_divisions
  from public.competition_divisions division
  where division.club_id = v_club_a;

  select count(*) into v_before_divisions
  from (
    select branch.id from public.competition_branches branch
    where branch.club_id = v_club_a and branch.slug in ('caballeros', 'damas', 'mixto')
    union all
    select segment.id from public.competition_segments segment
    where segment.club_id = v_club_a and segment.slug in ('libres', 'veteranos', 'menores')
    union all
    select category.id from public.competition_categories category
    where category.club_id = v_club_a and category.slug in ('1a', '2a', '3a', '4a', '5a', '6a', '7a')
  ) template_items;

  if v_before_divisions <> 13 then
    raise exception 'la plantilla no creó exactamente 3 ramas, 3 segmentos y 7 categorías';
  end if;

  perform public.create_default_competition_structure(v_club_a, 'PADEL_TRADITIONAL');

  select count(*) into v_after_second_template
  from (
    select branch.id from public.competition_branches branch
    where branch.club_id = v_club_a and branch.slug in ('caballeros', 'damas', 'mixto')
    union all
    select segment.id from public.competition_segments segment
    where segment.club_id = v_club_a and segment.slug in ('libres', 'veteranos', 'menores')
    union all
    select category.id from public.competition_categories category
    where category.club_id = v_club_a and category.slug in ('1a', '2a', '3a', '4a', '5a', '6a', '7a')
  ) template_items;
  reset role;

  if v_after_second_template <> 13 then raise exception 'la plantilla no fue idempotente'; end if;

  if (select count(*) from public.competition_divisions division where division.club_id = v_club_a) <> v_after_divisions then
    raise exception 'la plantilla creó divisiones cartesianas';
  end if;

  select count(*) into v_after_players from public.club_players;
  select count(*) into v_after_categories from public.club_categories;
  select coalesce(sum((to_jsonb(player)->>'ranking_points')::numeric), 0)
  into v_after_points
  from public.club_players player
  where (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$';

  if v_before_players <> v_after_players then raise exception 'club_players fue alterada'; end if;
  if v_before_categories <> v_after_categories then raise exception 'club_categories fue alterada'; end if;
  if v_before_points <> v_after_points then raise exception 'ranking_points fue alterado'; end if;

  if to_regclass('public.club_players') is null
     or to_regclass('public.club_categories') is null
     or to_regclass('public.tournaments') is null then
    raise exception 'faltan relaciones legacy requeridas por el endpoint actual';
  end if;

  return query select 'PASS', 'Etapa 1 válida: temporadas, catálogos, divisiones, plantilla, RLS y compatibilidad legacy';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa.qa_status || ' | ' || qa.qa_detail as result
from pg_temp.run_competition_engine_stage1_qa() qa;

rollback;
