# Stage 5A.8 — QA manual de concurrencia

Pendiente de ejecución. Requiere dos conexiones PostgreSQL reales y simultáneas con el mismo JWT de un OWNER/ADMIN autorizado. No puede declararse PASS mediante REST ni con dos pestañas del SQL Editor.

## Preparación

Obtener mediante `get_competition_date_creation_context` un circuito `SCHEDULED`/`ACTIVE`, su revisión, una Series Division y su regla ACTIVE. Preparar exactamente los mismos valores para ambas sesiones:

- `:club_id`, `:series_id`, `:series_revision`;
- `:series_division_id`, `:rule_id`, `:rule_revision`;
- `:idempotency_key` (8–200 caracteres);
- `:event_payload` y `:tournament_payload` idénticos y válidos.

## Session A

```sql
begin;
select set_config('request.jwt.claim.sub', :'actor_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.create_competition_date_tournament_atomic(
  :'club_id'::uuid, :'series_id'::uuid, :'series_revision'::integer,
  :'series_division_id'::uuid, :'rule_id'::uuid, :'rule_revision'::integer,
  :'idempotency_key', :'event_payload'::jsonb, :'tournament_payload'::jsonb
)::text as result_a \gset
-- Mantener abierta hasta que Session B haya iniciado la misma llamada.
commit;
```

## Session B

Ejecutar mientras Session A mantiene la transacción abierta:

```sql
begin;
select set_config('request.jwt.claim.sub', :'actor_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.create_competition_date_tournament_atomic(
  :'club_id'::uuid, :'series_id'::uuid, :'series_revision'::integer,
  :'series_division_id'::uuid, :'rule_id'::uuid, :'rule_revision'::integer,
  :'idempotency_key', :'event_payload'::jsonb, :'tournament_payload'::jsonb
)::text as result_b \gset
commit;
```

Session B debe esperar el conflicto UNIQUE de la command row, releer la fila confirmada y devolver exactamente los mismos cuatro IDs que Session A. También es aceptable un rechazo controlado de operación en curso; un segundo conjunto de recursos nunca lo es.

Después del `commit`, cada sesión compara su variable local (`result_a` o `result_b`) con la única respuesta persistida. En Session A:

```sql
select :'result_a'::jsonb = command.response_payload as same_response
from public.competition_date_creation_commands command
where command.club_id=:'club_id'::uuid and command.actor_id=:'actor_id'::uuid
  and command.idempotency_key=:'idempotency_key';
```

En Session B ejecutar la misma consulta sustituyendo `result_a` por `result_b`. Ambas deben devolver `true`; por transitividad, los cuatro IDs son idénticos.

## Verificación

Ejecutar con los IDs devueltos y la misma clave:

```sql
select count(*) as completed_commands
from public.competition_date_creation_commands command
where command.club_id = :'club_id'::uuid
  and command.actor_id = auth.uid()
  and command.idempotency_key = :'idempotency_key'
  and command.completed_at is not null
  and command.response_payload is not null;

select
  (select count(*) from public.tournaments tournament
   where tournament.id = (:'result_a'::jsonb ->> 'tournament_id')::uuid) as tournaments,
  (select count(*) from public.competition_series_events event
   where event.id = (:'result_a'::jsonb ->> 'event_id')::uuid) as events,
  (select count(*) from public.competition_series_event_divisions division
   where division.id = (:'result_a'::jsonb ->> 'event_division_id')::uuid) as event_divisions,
  (select count(*) from public.competition_series_event_tournament_links link
   where link.id = (:'result_a'::jsonb ->> 'link_id')::uuid and link.status = 'ACTIVE') as active_links;
```

Criterio de aprobación: `completed_commands=1`, todos los conteos de recursos son `1`, `result_a=result_b` cuando ambas operaciones retornan, y no existen IDs alternativos para la misma creación. Repetir finalmente la misma key con payload distinto: debe devolver `IDEMPOTENCY_CONFLICT` sin filas nuevas.

**Estado actual: PENDIENTE, no PASS.**
