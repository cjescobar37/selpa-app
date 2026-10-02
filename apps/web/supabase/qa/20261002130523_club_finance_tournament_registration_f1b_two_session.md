# F1B · confirmación concurrente (base descartable)

Preparar y confirmar en la base local una inscripción **PENDING** con torneo de
precio positivo y pareja de dos jugadores. Guardar `club_id`, `tournament_id`,
`registration_id` y el `actor_id` de un admin con `registrations:manage`.
No usar una inscripción real ni producción. Las sesiones usan rol de servicio
solamente en esta base descartable; la RPC comprueba la capability del actor.

En dos sesiones SQL distintas, con el mismo registro:

```sql
-- Sesión A
begin isolation level repeatable read;
select public.transition_tournament_registration_finance_f1b(
  :'club_id'::uuid, :'tournament_id'::uuid, :'registration_id'::uuid,
  'CONFIRMED', :'actor_id'::uuid);
-- Mantener abierta hasta que B intente la misma transición.
commit;
```

```sql
-- Sesión B, iniciar antes de que A haga COMMIT.
begin isolation level repeatable read;
select public.transition_tournament_registration_finance_f1b(
  :'club_id'::uuid, :'tournament_id'::uuid, :'registration_id'::uuid,
  'CONFIRMED', :'actor_id'::uuid);
-- Debe esperar; luego puede recibir SQLSTATE 40001. Si ocurre, rollback.
rollback;
-- Reintentar en una transacción nueva: no debe crear otra obligación.
begin;
select public.transition_tournament_registration_finance_f1b(
  :'club_id'::uuid, :'tournament_id'::uuid, :'registration_id'::uuid,
  'CONFIRMED', :'actor_id'::uuid);
commit;
```

Verificar después:

```sql
select count(*) as obligations
from public.club_finance_obligations
where club_id = :'club_id'::uuid
  and source_type = 'TOURNAMENT_REGISTRATION'
  and source_id = :'registration_id'::uuid;
-- Exactamente 1.

select count(*) as created_journals
from public.club_finance_journals j
join public.club_finance_obligations o on o.id = j.obligation_id
where o.club_id = :'club_id'::uuid
  and o.source_id = :'registration_id'::uuid
  and j.event_type = 'OBLIGATION_CREATED';
-- Exactamente 1.
```

Descartar la base local completa al terminar. No hacer limpieza selectiva de
filas financieras, que son append-only y tienen FK restrictivas.
