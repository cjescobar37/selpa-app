-- Diagnóstico de solo lectura. Cambiar únicamente el UUID para comparar otro club.
with params as (
  select '7c70723b-8244-4117-9a2e-b9a129f661a9'::uuid as club_id
), active_season as (
  select season.id from public.competition_seasons season join params on params.club_id=season.club_id
  where season.status='ACTIVE' order by season.id limit 1
), legacy_base as (
  select player.id as player_id,player.user_id,
    coalesce(nullif(profile.display_name,''),nullif(btrim(concat_ws(' ',profile.first_name,profile.last_name)),''),player.display_name,'Jugador') as player_name,
    player.category,upper(player.gender) as gender,coalesce(player.ranking_points,0)::numeric as points
  from public.club_players player join params on params.club_id=player.club_id
  left join public.profiles profile on profile.user_id=player.user_id
  where player.approved_at is not null
), competition_base as (
  select player.id as player_id,player.user_id,
    coalesce(nullif(profile.display_name,''),nullif(btrim(concat_ws(' ',profile.first_name,profile.last_name)),''),player.display_name,'Jugador') as player_name,
    category.legacy_category_id as category,
    case branch.slug when 'caballeros' then 'M' when 'damas' then 'F' end as gender,
    coalesce(player.ranking_points,0)::numeric as points
  from public.competition_player_entries entry
  join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id
  join active_season on active_season.id=division.season_id
  join params on params.club_id=entry.club_id
  join public.competition_branches branch on branch.id=division.branch_id and branch.club_id=division.club_id
  join public.competition_categories category on category.id=division.category_id and category.club_id=division.club_id
  join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id
  left join public.profiles profile on profile.user_id=player.user_id
  where entry.status='ACTIVE' and entry.valid_until is null and division.is_active
    and division.modality='INDIVIDUAL' and division.segment_id is null
    and branch.slug in ('caballeros','damas') and category.legacy_category_id between 1 and 7
), legacy as (
  select legacy_base.*,rank() over(order by points desc) as position,
    row_number() over(order by points desc,player_name,player_id) as deterministic_order
  from legacy_base
), competition as (
  select competition_base.*,rank() over(order by points desc) as position,
    row_number() over(order by points desc,player_name,player_id) as deterministic_order
  from competition_base
), compared as (
  select coalesce(legacy.player_id,competition.player_id) as player_id,
    legacy.player_name as legacy_name,competition.player_name as competition_name,
    legacy.points as legacy_points,competition.points as competition_points,
    legacy.position as legacy_position,competition.position as competition_position,
    legacy.category as legacy_category,competition.category as competition_category,
    legacy.gender as legacy_gender,competition.gender as competition_gender,
    legacy.deterministic_order as legacy_order,competition.deterministic_order as competition_order
  from legacy full join competition using(player_id)
)
select jsonb_build_object(
  'legacy_count',(select count(*) from legacy),
  'competition_count',(select count(*) from competition),
  'matching_players',(select count(*) from compared where legacy_name is not null and competition_name is not null),
  'missing_in_competition',(select count(*) from compared where competition_name is null),
  'extra_in_competition',(select count(*) from compared where legacy_name is null),
  'name_mismatch',(select count(*) from compared where legacy_name is distinct from competition_name),
  'points_mismatch',(select count(*) from compared where legacy_points is distinct from competition_points),
  'position_mismatch',(select count(*) from compared where legacy_position is distinct from competition_position),
  'category_mismatch',(select count(*) from compared where legacy_category is distinct from competition_category),
  'gender_mismatch',(select count(*) from compared where legacy_gender is distinct from competition_gender),
  'order_mismatch',(select count(*) from compared where legacy_order is distinct from competition_order),
  'legacy_duplicates',(select count(*)-count(distinct player_id) from legacy),
  'competition_duplicates',(select count(*)-count(distinct player_id) from competition)
) as summary;

-- Detalle de diferencias. Debe devolver cero filas para una migración equivalente.
with params as (
  select '7c70723b-8244-4117-9a2e-b9a129f661a9'::uuid as club_id
)
select 'Ejecutá primero la consulta resumen; para detalle reutilizá sus CTE legacy/competition y filtrá con IS DISTINCT FROM.' as diagnostic_note;
