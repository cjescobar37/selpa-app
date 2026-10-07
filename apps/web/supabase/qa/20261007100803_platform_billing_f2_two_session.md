# F2: pruebas de concurrencia (DB descartable)

Aplicar migrations hasta F2 en un entorno descartable. Nunca producción. Crear fixtures de QA y usar un Platform Admin real en `request.jwt.claim.sub` con rol authenticated. Anotar subscription/invoice/club UUID. No keys reales ni proveedor. Borrar el entorno al terminar; las transacciones que prueban bloqueos requieren COMMIT.

## R1: dos pagos sobre la misma factura

Factura emitida $100, saldo $100. A y B llaman `execute_platform_billing_f2('REGISTER_PAYMENT', <keys distintas>, <payload>)` por $80, misma factura. Payload: `club_id`, `amount:80`, `method:CASH`, `paid_at:now`, `allocations:[{invoice_id,amount:80}]`.

1. A: BEGIN; ejecutar RPC; dejar sin commit.
2. B: BEGIN ISOLATION LEVEL READ COMMITTED; ejecutar RPC. Debe bloquear esperando invoice.
3. A: COMMIT. B: debe fallar `BILLING_OVER_ALLOCATION`; ROLLBACK.
4. Exactamente un payment POSTED, saldo $20, un journal y dos postings balanceados.

Repetir con B REPEATABLE READ y una lectura inicial antes de A. Esperado `40001`, nunca dos cobros. Reintento completo con la misma key, snapshot nuevo: OVER_ALLOCATION.

## R2: pago contra VOID / reversión

A registra pago y retiene lock; B intenta VOID. Tras commit A, VOID falla `BILLING_REVERSE_PAYMENTS_BEFORE_VOID`. Dirección inversa: A hace VOID y retiene lock; B paga; tras commit A, B falla `BILLING_PAYABLE_INVOICE_REQUIRED` (o 40001 en RR). No cobro aplicado a VOID.

Reversión y otro pago lockean facturas en UUID ascendente antes de tocar payment. Probar payment distribuido entre dos facturas y reversal concurrente invirtiendo el orden de allocations del payload. Sin deadlock por orden invertido; saldo final coincide con payments POSTED. Repetir RR: conflicto de revision debe producir 40001.

## R3: misma key concurrente

A y B: mismo actor, operation, key y payload exacto; A retiene command lock. B espera y luego recibe response idéntica (READ COMMITTED) o 40001 (RR). Un payment/journal. Misma key con payload diferente: `BILLING_IDEMPOTENCY_CONFLICT`.

## R4: período / asignación

Dos sesiones generan misma subscription + period_start con keys diferentes. Una espera el lock subscription; luego encuentra período existente. Un período y una invoice, mismos invoice UUID. RR: 40001 permitido; reintentar transacción completa.

Dos sesiones asignan plan al mismo club sin subscription: lock club + unique parcial. Una sola vigente, la segunda recibe CURRENT_SUBSCRIPTION_EXISTS o 40001/23505 (reintentar para diagnóstico canónico).

## R5: catálogo y cambio de plan

Generar período y editar precio de plan concurrentemente. El lock SHARE/UPDATE del plan impide snapshots mezclados: total/line/snapshot deben compartir precio íntegro anterior o nuevo. Cambiar plan exige revision; nunca reescribe un comprobante histórico. Cambio next-plan sólo consume al siguiente período; un cambio previo a la primera emisión debe mantenerse pendiente.

Al terminar, ejecutar `SET CONSTRAINTS ALL IMMEDIATE` y comprobar journales: exactamente dos postings y suma cero; sum allocations = amount; ningún net allocated > total; un solo período por subscription/start; un solo current subscription por club. Ninguna tabla F1A–F1F/legacy modificada.
