begin;

create or replace function pg_temp.run_competition_series_prizes_display_name_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_club uuid;
  v_other_club uuid;
  v_owner uuid;
  v_player uuid;
  v_season uuid;
  v_series public.competition_series;
  v_scheme public.points_schemes;
  v_revision integer;
  v_count integer;
  v_step text := 'fixtures';
begin
  select membership.club_id,
    (array_agg(membership.user_id order by membership.user_id) filter (where membership.role = 'OWNER'))[1],
    (array_agg(membership.user_id order by membership.user_id) filter (where membership.role = 'PLAYER'))[1]
  into v_club, v_owner, v_player
  from public.club_memberships membership
  where membership.status = 'APPROVED' and membership.approved_at is not null
    and exists (
      select 1 from public.competition_seasons season
      where season.club_id = membership.club_id and season.status = 'ACTIVE'
    )
  group by membership.club_id
  having count(*) filter (where membership.role = 'OWNER') > 0
  order by membership.club_id
  limit 1;
  select season.id into v_season
  from public.competition_seasons season
  where season.club_id = v_club and season.status = 'ACTIVE'
  order by season.created_at limit 1;
  select club.id into v_other_club from public.clubs club where club.id <> v_club order by club.id limit 1;
  if v_club is null or v_owner is null or v_player is null or v_season is null or v_other_club is null then
    return query select 'FAIL', 'QA no ejecutable: se requieren OWNER, PLAYER, temporada ACTIVE y dos clubes';
    return;
  end if;

  v_step := 'display_name backfill';
  if exists (select 1 from public.points_schemes where display_name is null or btrim(display_name) = '') then
    raise exception 'DISPLAY_NAME_BACKFILL_INCOMPLETE';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  if auth.uid() is distinct from v_owner then raise exception 'AUTH_CONTEXT_INVALID'; end if;

  v_step := 'display_name create and update';
  v_scheme := public.create_points_scheme(v_club, 'QA Points Internal Name', 'QA transaccional');
  if v_scheme.display_name <> v_scheme.name then raise exception 'DISPLAY_NAME_DEFAULT_INVALID'; end if;
  v_scheme := public.set_points_scheme_display_name(v_club, v_scheme.id, v_scheme.revision, 'Tabla Apertura');
  if v_scheme.display_name <> 'Tabla Apertura' or v_scheme.name <> 'QA Points Internal Name' or v_scheme.revision <> 2 then
    raise exception 'DISPLAY_NAME_UPDATE_INVALID';
  end if;
  begin
    perform public.set_points_scheme_display_name(v_club, v_scheme.id, 1, 'Stale');
    raise exception 'DISPLAY_NAME_STALE_ALLOWED';
  exception when serialization_failure then null;
  end;
  begin
    update public.points_schemes set display_name = 'DML directo' where id = v_scheme.id;
    raise exception 'DISPLAY_NAME_DIRECT_DML_ALLOWED';
  exception when insufficient_privilege then null;
  end;

  v_step := 'series fixture';
  v_series := public.create_competition_series(v_club, v_season, 'QA Premios Circuito');
  v_revision := v_series.revision;

  v_step := 'replace prizes';
  select count(*) into v_count
  from public.replace_competition_series_prizes(
    v_club,
    v_series.id,
    v_revision,
    '[
      {"position_from":1,"position_to":1,"title":"Campeón","description":"Premio principal","prize_type":"CASH","amount":100000,"currency_code":"ARS","sort_order":0,"is_active":true},
      {"position_from":2,"position_to":2,"title":"Finalista","prize_type":"TROPHY","sort_order":1,"is_active":true},
      {"position_from":3,"position_to":4,"title":"Semifinalistas","prize_type":"GOODS","sort_order":2,"is_active":true}
    ]'::jsonb
  );
  if v_count <> 3 then raise exception 'PRIZE_COUNT_INVALID'; end if;
  select revision into v_revision from public.competition_series where id = v_series.id;
  if v_revision <> 2 then raise exception 'SERIES_REVISION_NOT_INCREMENTED'; end if;
  if not exists (
    select 1 from public.competition_series_prizes
    where series_id = v_series.id and position_from = 3 and position_to = 4
      and title = 'Semifinalistas' and prize_type = 'GOODS' and is_active
  ) then raise exception 'PRIZE_RANGE_NOT_PERSISTED'; end if;

  v_step := 'overlap rollback';
  begin
    perform public.replace_competition_series_prizes(
      v_club, v_series.id, v_revision,
      '[
        {"position_from":1,"position_to":2,"title":"Primero","prize_type":"OTHER"},
        {"position_from":2,"position_to":3,"title":"Segundo","prize_type":"OTHER"}
      ]'::jsonb
    );
    raise exception 'OVERLAPPING_RANGES_ALLOWED';
  exception when check_violation then null;
  end;
  select count(*) into v_count from public.competition_series_prizes where series_id = v_series.id;
  if v_count <> 3 then raise exception 'OVERLAP_LEFT_PARTIAL_STATE'; end if;

  v_step := 'invalid shapes';
  begin
    perform public.replace_competition_series_prizes(v_club, v_series.id, v_revision, '[{"position_from":0,"title":"Inválido"}]'::jsonb);
    raise exception 'INVALID_POSITION_ALLOWED';
  exception when check_violation then null;
  end;
  begin
    perform public.replace_competition_series_prizes(v_club, v_series.id, v_revision, '[{"position_from":1,"title":"Monto","amount":10}]'::jsonb);
    raise exception 'AMOUNT_WITHOUT_CURRENCY_ALLOWED';
  exception when check_violation then null;
  end;
  begin
    perform public.replace_competition_series_prizes(v_club, v_series.id, v_revision, '[{"position_from":1,"title":"Extra","unknown":true}]'::jsonb);
    raise exception 'UNKNOWN_KEY_ALLOWED';
  exception when invalid_parameter_value then null;
  end;

  v_step := 'stale revision';
  begin
    perform public.replace_competition_series_prizes(v_club, v_series.id, 1, '[]'::jsonb);
    raise exception 'STALE_REVISION_ALLOWED';
  exception when serialization_failure then null;
  end;

  v_step := 'cross club';
  begin
    perform public.replace_competition_series_prizes(v_other_club, v_series.id, v_revision, '[]'::jsonb);
    raise exception 'CROSS_CLUB_ALLOWED';
  exception when insufficient_privilege or no_data_found then null;
  end;

  v_step := 'direct DML';
  begin
    delete from public.competition_series_prizes where series_id = v_series.id;
    raise exception 'PRIZE_DIRECT_DML_ALLOWED';
  exception when insufficient_privilege then null;
  end;

  reset role;
  v_step := 'player permissions';
  perform set_config('request.jwt.claim.sub', v_player::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    perform public.replace_competition_series_prizes(v_club, v_series.id, v_revision, '[]'::jsonb);
    raise exception 'PLAYER_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;

  reset role;
  return query select 'PASS', 'Premios normalizados, rangos, atomicidad, revisión, tenant scope, permisos y display_name válidos; rollback final';
exception when others then
  reset role;
  return query select 'FAIL', v_step || ' | ' || sqlstate || ' | ' || sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_competition_series_prizes_display_name_qa();

rollback;
