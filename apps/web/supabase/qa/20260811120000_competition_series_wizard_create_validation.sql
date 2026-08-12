begin;

-- Run only after 20260811120000_competition_series_wizard_create.sql.
-- All fixture writes are scoped to this transaction and are rolled back below.
create or replace function pg_temp.run_competition_series_wizard_qa()
returns table(qa_status text, qa_detail text)
language plpgsql as $$
declare
  v_owner uuid; v_player uuid; v_club uuid; v_other_club uuid; v_season uuid; v_other_season uuid;
  v_cab uuid; v_damas uuid; v_libres uuid; v_menores uuid; v_veteranos uuid; v_sixth uuid;
  v_free_division uuid; v_minor_division uuid; v_veteran_division uuid; v_scheme uuid;
  v_sub16 uuid; v_plus45 uuid; v_result jsonb; v_again jsonb; v_minor_result jsonb; v_veteran_result jsonb;
  v_count integer; v_failed boolean; v_series_id uuid; v_slug text;
begin
  select membership.user_id, membership.club_id into v_owner, v_club
  from public.club_memberships membership
  where membership.role in ('OWNER','ADMIN') and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  if v_owner is null then return query select 'FAIL','QA no ejecutable: falta OWNER o ADMIN aprobado'; return; end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  perform public.initialize_competition_catalogs_stage5a1(v_club);

  select season.id into v_season from public.competition_seasons season
  where season.club_id=v_club and season.status='ACTIVE' order by season.created_at limit 1;
  select scheme.id into v_scheme from public.points_schemes scheme
  where scheme.is_active and (scheme.is_global or scheme.club_id=v_club) order by scheme.created_at limit 1;
  select branch.id into v_cab from public.competition_branches branch where branch.club_id=v_club and branch.slug='caballeros' and branch.is_active;
  select branch.id into v_damas from public.competition_branches branch where branch.club_id=v_club and branch.slug='damas' and branch.is_active;
  select segment.id into v_libres from public.competition_segments segment where segment.club_id=v_club and segment.slug='libres' and segment.is_active;
  select segment.id into v_menores from public.competition_segments segment where segment.club_id=v_club and segment.slug='menores' and segment.is_active;
  select segment.id into v_veteranos from public.competition_segments segment where segment.club_id=v_club and segment.slug='veteranos' and segment.is_active;
  select category.id into v_sixth from public.competition_categories category where category.club_id=v_club and category.legacy_category_id=6 and category.is_active;
  select age.id into v_sub16 from public.competition_age_categories age where age.club_id=v_club and lower(age.code)='sub16' and age.is_active;
  select age.id into v_plus45 from public.competition_age_categories age where age.club_id=v_club and lower(age.code)='plus45' and age.is_active;
  if v_season is null or v_scheme is null or v_cab is null or v_damas is null or v_libres is null or v_menores is null or v_veteranos is null or v_sixth is null or v_sub16 is null or v_plus45 is null then
    return query select 'FAIL','QA no ejecutable: faltan catálogos activos Caballeros/Damas/Libres/Menores/Veteranos/6ta/Sub16/+45 o tabla de puntos'; return;
  end if;

  v_free_division := (public.ensure_competition_division(v_club,v_season,'INDIVIDUAL',v_cab,v_libres,v_sixth)).id;
  v_minor_division := (public.ensure_competition_division(v_club,v_season,'INDIVIDUAL',v_damas,v_menores,null)).id;
  v_veteran_division := (public.ensure_competition_division(v_club,v_season,'INDIVIDUAL',v_cab,v_veteranos,null)).id;

  v_result := public.create_competition_series_from_wizard(v_club,'qa-wizard-free-0001',jsonb_build_object('name','QA Wizard Libres 6ta','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme,'starts_on',current_date,'ends_on',current_date + 30,'planned_events_count',6,'accumulation_mode','ALL_RESULTS'));
  v_again := public.create_competition_series_from_wizard(v_club,'qa-wizard-free-0001',jsonb_build_object('name','QA Wizard Libres 6ta','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme,'starts_on',current_date,'ends_on',current_date + 30,'planned_events_count',6,'accumulation_mode','ALL_RESULTS'));
  if v_result->>'series_id' is distinct from v_again->>'series_id' then raise exception 'Idempotencia inválida'; end if;
  v_series_id := (v_result->>'series_id')::uuid;
  select count(*) into v_count from public.competition_series series where series.id=v_series_id and series.club_id=v_club;
  if v_count <> 1 then raise exception 'No se creó la serie'; end if;
  select count(*) into v_count from public.competition_series_divisions link where link.series_id=v_series_id and link.is_active;
  if v_count <> 1 then raise exception 'No se creó la división de la serie'; end if;
  select count(*) into v_count from public.competition_series_rules rule join public.competition_series_divisions link on link.id=rule.series_division_id where link.series_id=v_series_id and rule.status='ACTIVE' and rule.points_scheme_id=v_scheme;
  if v_count <> 1 then raise exception 'No se creó o activó la regla con la tabla de puntos'; end if;
  select count(*) into v_count from public.competition_series_eligibility eligibility join public.competition_series_rules rule on rule.id=eligibility.series_rule_id join public.competition_series_divisions link on link.id=rule.series_division_id where link.series_id=v_series_id;
  if v_count <> 1 then raise exception 'No se creó la elegibilidad'; end if;
  select count(*) into v_count from public.competition_series_events event where event.series_id=v_series_id;
  if v_count <> 0 then raise exception 'El wizard creó fechas'; end if;
  select count(*) into v_count from public.tournaments tournament
  where tournament.club_id=v_club and tournament.created_at >= transaction_timestamp();
  if v_count <> 0 then raise exception 'El wizard creó torneos'; end if;

  v_minor_result := public.create_competition_series_from_wizard(v_club,'qa-wizard-minor-0001',jsonb_build_object('name','QA Wizard Damas Sub16','season_id',v_season,'division_id',v_minor_division,'points_scheme_id',v_scheme,'age_category_id',v_sub16,'starts_on',current_date,'ends_on',current_date + 30));
  v_veteran_result := public.create_competition_series_from_wizard(v_club,'qa-wizard-veteran-0001',jsonb_build_object('name','QA Wizard Caballeros +45','season_id',v_season,'division_id',v_veteran_division,'points_scheme_id',v_scheme,'age_category_id',v_plus45,'starts_on',current_date,'ends_on',current_date + 30));
  if v_minor_result->>'series_id' is null or v_veteran_result->>'series_id' is null then raise exception 'No se crearon escenarios etarios válidos'; end if;

  foreach v_slug in array array['qa-wizard-minor-plus45-0001','qa-wizard-veteran-sub16-0001','qa-wizard-free-age-0001','qa-wizard-minor-no-age-0001','qa-wizard-veteran-no-age-0001'] loop
    v_failed := false;
    begin
      if v_slug='qa-wizard-minor-plus45-0001' then
        perform public.create_competition_series_from_wizard(v_club,v_slug,jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_minor_division,'points_scheme_id',v_scheme,'age_category_id',v_plus45));
      elsif v_slug='qa-wizard-veteran-sub16-0001' then
        perform public.create_competition_series_from_wizard(v_club,v_slug,jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_veteran_division,'points_scheme_id',v_scheme,'age_category_id',v_sub16));
      elsif v_slug='qa-wizard-free-age-0001' then
        perform public.create_competition_series_from_wizard(v_club,v_slug,jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme,'age_category_id',v_sub16));
      elsif v_slug='qa-wizard-minor-no-age-0001' then
        perform public.create_competition_series_from_wizard(v_club,v_slug,jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_minor_division,'points_scheme_id',v_scheme));
      else
        perform public.create_competition_series_from_wizard(v_club,v_slug,jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_veteran_division,'points_scheme_id',v_scheme));
      end if;
    exception when check_violation then v_failed := true; end;
    if not v_failed then raise exception 'La incompatibilidad etaria % fue aceptada', v_slug; end if;
  end loop;

  foreach v_slug in array array['branch_id','segment_id','category_id'] loop
    v_failed := false;
    begin
      if v_slug='branch_id' then perform public.create_competition_series_from_wizard(v_club,'qa-wizard-branch-0001',jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme,'branch_id',v_damas));
      elsif v_slug='segment_id' then perform public.create_competition_series_from_wizard(v_club,'qa-wizard-segment-0001',jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme,'segment_id',v_menores));
      else perform public.create_competition_series_from_wizard(v_club,'qa-wizard-category-0001',jsonb_build_object('name','QA invalid','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme,'category_id',v_sub16));
      end if;
    exception when check_violation then v_failed := true; end;
    if not v_failed then raise exception 'La inconsistencia % fue aceptada', v_slug; end if;
  end loop;

  v_failed := false;
  begin perform public.create_competition_series_from_wizard(v_club,'qa-wizard-free-0001',jsonb_build_object('name','QA distinto','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme)); exception when serialization_failure then v_failed := true; end;
  if not v_failed then raise exception 'La misma key con payload distinto no produjo conflicto'; end if;
  v_failed := false;
  begin perform public.create_competition_series_from_wizard(v_club,'qa-wizard-rollback-0001',jsonb_build_object('name','QA Wizard Rollback','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme,'accumulation_mode','BEST_N','best_results_count',0)); exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'El fallo parcial no fue rechazado'; end if;
  select count(*) into v_count from public.competition_series series where series.club_id=v_club and series.name='QA Wizard Rollback';
  if v_count <> 0 then raise exception 'El rollback dejó una serie residual'; end if;

  select membership.user_id into v_player from public.club_memberships membership where membership.club_id=v_club and membership.role='PLAYER' and membership.status='APPROVED' and membership.approved_at is not null limit 1;
  if v_player is null then return query select 'FAIL','QA no ejecutable: falta PLAYER aprobado para validar permisos'; return; end if;
  perform set_config('request.jwt.claim.sub',v_player::text,true);
  v_failed := false;
  begin perform public.create_competition_series_from_wizard(v_club,'qa-wizard-player-0001',jsonb_build_object('name','QA Player','season_id',v_season,'division_id',v_free_division,'points_scheme_id',v_scheme)); exception when insufficient_privilege then v_failed := true; end;
  if not v_failed then raise exception 'PLAYER obtuvo permiso de alta'; end if;

  reset role;
  insert into public.clubs(name,slug,is_active) values ('QA Wizard Cross Club ' || substr(gen_random_uuid()::text,1,8),'qa-wizard-' || substr(gen_random_uuid()::text,1,12),true) returning id into v_other_club;
  insert into public.club_memberships(club_id,user_id,role,status,approved_by,approved_at) values(v_other_club,v_owner,'OWNER','APPROVED',v_owner,now());
  insert into public.competition_seasons(club_id,name,starts_on,ends_on,status,created_by) values(v_other_club,'QA Wizard Cross Season',current_date,current_date + 30,'ACTIVE',v_owner) returning id into v_other_season;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); set local role authenticated;
  v_failed := false;
  begin perform public.create_competition_series_from_wizard(v_other_club,'qa-wizard-cross-club-0001',jsonb_build_object('name','QA Cross Club','season_id',v_other_season,'division_id',v_free_division,'points_scheme_id',v_scheme)); exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'La división cross-club fue aceptada'; end if;

  return query select 'PASS','Wizard: estructura, idempotencia, compatibilidad etaria, permisos y aislamiento válidos';
exception when others then
  reset role;
  return query select 'FAIL',sqlerrm;
end $$;

select qa_status || ' | ' || qa_detail as result from pg_temp.run_competition_series_wizard_qa();
rollback;
