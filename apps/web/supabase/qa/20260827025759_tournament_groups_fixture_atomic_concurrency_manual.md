# QA manual multi-sesión — grupos y fixture atómicos

Usar un torneo `DRAFT` u `OPEN` con al menos seis parejas y su seed snapshot canónico. Ambas sesiones deben usar el mismo JWT OWNER/ADMIN y exactamente los mismos IDs.

## Sesión A

```sql
begin;
select public.generate_tournament_groups_and_fixture_atomic(
  '<club_id>'::uuid,
  '<tournament_id>'::uuid,
  false
);
-- Mantener la transacción abierta hasta iniciar la sesión B.
```

## Sesión B

```sql
begin;
select public.generate_tournament_groups_and_fixture_atomic(
  '<club_id>'::uuid,
  '<tournament_id>'::uuid,
  false
);
```

La sesión B debe esperar el lock del torneo. Luego hacer `commit` en A. B debe devolver `ALREADY_GENERATED`, con el mismo `seed_hash`, `group_count`, `teams_assigned` y `matches_created`.

## Verificación (sesión B)

```sql
select count(*) as groups
from public.tournament_groups
where tournament_id = '<tournament_id>'::uuid;

select count(*) as assignments, count(distinct team_id) as distinct_teams
from public.tournament_group_teams
where tournament_id = '<tournament_id>'::uuid;

select count(*) as matches,
       count(distinct (group_id, least(team1_id, team2_id), greatest(team1_id, team2_id))) as distinct_matches
from public.tournament_matches
where tournament_id = '<tournament_id>'::uuid and phase::text = 'GROUP';

rollback;
```

Finalmente ejecutar `rollback` en A si todavía está abierta. Esta prueba queda pendiente hasta ejecutarse con dos conexiones reales; no debe declararse PASS por inspección estática.

## Ejecución remota registrada — 2026-08-27

La prueba se ejecutó contra el proyecto Supabase SELPA con dos solicitudes SQL
independientes, ambas con los claims de un OWNER del club del fixture. La sesión A
abrió una transacción, llamó a la RPC y mantuvo el lock de la fila del torneo cinco
segundos antes de `COMMIT`. La sesión B se inició 700 ms después y llamó a la misma
RPC con el mismo `club_id`, `tournament_id` y `p_regenerate = false`.

La sesión B devolvió `ALREADY_GENERATED` al liberarse el lock. La verificación
posterior confirmó 2 grupos, 8 asignaciones de equipos distintos y 12 partidos de
grupo con 12 pares lógicos distintos. No se generaron estructuras duplicadas.
