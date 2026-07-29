-- Control administrativo Stage 4. No modifica schema ni crea entradas competitivas.
-- Para ejecutar realmente el backfill, cambiar dry_run a false después de revisar el resultado.
with config as (
  select true::boolean as dry_run, null::uuid as club_id, null::uuid as season_id
), targets as (
  select season.club_id, season.id as season_id, config.dry_run
  from public.competition_seasons season
  cross join config
  where season.status = 'ACTIVE'
    and (config.club_id is null or season.club_id = config.club_id)
    and (config.season_id is null or season.id = config.season_id)
  order by season.club_id, season.id
)
select target.club_id, target.season_id,
       public.backfill_competition_opening_balances(target.club_id, target.season_id, target.dry_run) as result
from targets target;
