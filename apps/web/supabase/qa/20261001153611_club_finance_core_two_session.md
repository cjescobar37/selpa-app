# F1A — QA real de concurrencia (sólo base descartable)

Pendiente de ejecutar. Usar dos conexiones `psql` a la **misma base descartable**
con la migration F1A aplicada. Nunca usar producción. Los bloques A y B se
ejecutan en terminales distintas; mantener A abierta donde se indica. Cada
escenario necesita una obligación nueva de ARS 20.000.

## Preparación para cada escenario

En una conexión de preparación, elegir un `OWNER` aprobado y crear la obligación.
`psql` imprime `qa_actor`, `qa_club` y `qa_obligation`; copiar esos tres UUID a A
y B con `\set qa_actor <uuid>`, `\set qa_club <uuid>` y
`\set qa_obligation <uuid>`. Repetir este bloque antes de R1, R2, R3 y R4.

```sql
select membership.user_id as actor, membership.club_id as club
from public.club_memberships membership
where membership.role = 'OWNER' and membership.status = 'APPROVED'
  and membership.approved_at is not null
order by membership.created_at limit 1
\gset qa_
select set_config('request.jwt.claim.sub', :'qa_actor', false);
select (public.create_club_finance_obligation(:'qa_club'::uuid,
  jsonb_build_object('debtor_type', 'USER', 'debtor_user_id', :'qa_actor'::uuid,
    'concept', 'QA concurrency F1A', 'currency_code', 'ARS', 'original_amount', 20000),
  'qa-f1a-fixture-' || replace(gen_random_uuid()::text, '-', ''))
  ->>'obligation_id') as obligation
\gset qa_
\echo actor=:qa_actor club=:qa_club obligation=:qa_obligation
```

En A y B, después de configurar los tres UUID:

```sql
select set_config('request.jwt.claim.sub', :'qa_actor', false);
```

## R1 — REPEATABLE READ, pago contra pago, claves distintas

A: ejecutar hasta el `SELECT` del pago y **no hacer COMMIT aún**.

```sql
begin isolation level repeatable read;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r1-payment-a');
-- mantener A abierta; después de iniciar B:
commit;
```

B: iniciar antes del COMMIT de A. Su RPC debe esperar; entonces confirmar A.

```sql
begin isolation level repeatable read;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r1-payment-b');
-- esperado: SQLSTATE 40001; terminar la transacción fallida
rollback;
```

En B, reintentar la key B en una transacción nueva: debe fallar por
`CLUB_FINANCE_OVER_ALLOCATION`, no crear un segundo pago.

```sql
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r1-payment-b');
```

## R2 — REPEATABLE READ, pago contra cancelación

Usar una obligación nueva. A registra el pago y mantiene abierta su transacción.

```sql
begin isolation level repeatable read;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r2-payment-a');
-- mantener A abierta; después de iniciar B:
commit;
```

B obtiene su snapshot antes del COMMIT de A, intenta cancelar y espera.

```sql
begin isolation level repeatable read;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.cancel_club_finance_obligation(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 'QA cancelación concurrente', 'qa-r2-cancel-b');
-- esperado: SQLSTATE 40001; luego, con snapshot nueva, cancelación bloqueada
rollback;
```

Tras A COMMIT debe cumplirse: `status = OPEN` y `allocated_net = 20000`.
Repetir invirtiendo el orden (cancelación primero) para verificar que el pago
posterior tampoco se confirma.

## R3 — REPEATABLE READ, misma idempotency key concurrente

Usar una obligación nueva. A y B usan el **mismo actor y payload**.

A:

```sql
begin isolation level repeatable read;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r3-same-key');
-- mantener A abierta; después de iniciar B:
commit;
```

B:

```sql
begin isolation level repeatable read;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r3-same-key');
-- 40001 es válido; jamás debe crear otro efecto económico
rollback;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r3-same-key');
-- el retry con snapshot nueva devuelve la respuesta exacta de A
```

## R4 — READ COMMITTED, pago contra pago

Usar una obligación nueva. A ejecuta y mantiene su transacción abierta:

```sql
begin isolation level read committed;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r4-payment-a');
-- mantener A abierta; después de iniciar B:
commit;
```

B debe esperar y luego recibir `CLUB_FINANCE_OVER_ALLOCATION` (no `40001`
en el caso normal):

```sql
begin isolation level read committed;
select revision from public.club_finance_obligations where id = :'qa_obligation'::uuid;
select public.register_club_finance_payment(:'qa_club'::uuid,
  :'qa_obligation'::uuid, 20000, 'ARS', 'CASH', 'qa-r4-payment-b');
rollback;
```

## Verificación final de cada escenario

Después de cerrar ambas transacciones, ejecutar con los mismos UUID:

```sql
select o.status, o.revision,
  (public.get_club_finance_obligation(:'qa_club'::uuid,
    :'qa_obligation'::uuid)->>'allocated_net')::numeric as allocated_net,
  count(distinct p.id) filter (where p.status = 'POSTED') as posted_payments,
  count(distinct j.id) filter (where j.event_type = 'PAYMENT_RECEIVED') as received_journals
from public.club_finance_obligations o
left join public.club_finance_allocations a on a.obligation_id = o.id and a.club_id = o.club_id
left join public.club_finance_payments p on p.id = a.payment_id and p.club_id = a.club_id
left join public.club_finance_journals j on j.payment_id = p.id and j.club_id = p.club_id
where o.id = :'qa_obligation'::uuid and o.club_id = :'qa_club'::uuid
group by o.id;
```

R1/R3/R4: exactamente un payment POSTED, un PAYMENT_RECEIVED journal y
`allocated_net = 20000`. R2: nunca `CANCELLED` con `allocated_net > 0`.
No marcar PASS hasta ejecutar ambas conexiones y registrar los resultados.
