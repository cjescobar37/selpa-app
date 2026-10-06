# Club Finance F1A–F1C

Club Finance registra dinero cuyo acreedor es el club. SELPA Billing (club → SELPA),
pagos administrativos de inscripción y puntos de Competition son dominios distintos.

- `club_finance_payments` significa dinero confirmado, no solicitud ni intento de checkout.
- El estado financiero y los saldos se derivan de obligaciones, allocations y pagos POSTED.
  `NO_CHARGE` representa ausencia de obligación; `REFUNDED` queda reservado hasta
  implementar una devolución real, y no se infiere de una reversión manual.
- Cada hecho económico crea un journal de dos postings balanceados. Journals,
  postings y allocations son append-only; una corrección genera un asiento
  compensatorio y conserva el original. Índices únicos por entidad/evento y
  constraint triggers diferidos exigen al COMMIT los journals de creación,
  cobro, reversión y cancelación, con patrón de cuentas y monto correctos.
- Los RPC usan una clave idempotente por club y operación. El lock de obligación
  serializa cobros concurrentes con claves diferentes. El orden canónico es
  command → obligation → payment. `revision` de la obligación se modifica para
  producir conflicto de escritura real incluso bajo `REPEATABLE READ`.
- El registro de pago incrementa `revision` antes de leer el saldo; el trigger
  de allocation la incrementa otra vez para proteger futuras rutas de inserción
  privilegiadas. La revisión es un token monotónico, no un contador de pagos.
- SQLSTATE `40001` es retryable: abortar la transacción y repetir el comando
  completo con la **misma** idempotency key. Con snapshot fresca, misma key y
  payload devuelven la respuesta original; payload distinto se rechaza.
- `service_role` no recibe grants directos en F1A. Helpers internos tampoco
  tienen `EXECUTE` para roles Data API.
- `club_receivables`, `club_receivable_payments`, `club_financial_transactions`,
  `tournament_payments` y `payments` siguen sin migración ni sincronización. En
  particular, `tournament_payments.APPROVED` no acredita efectivo recibido.

F1A está aplicada y validada en producción. Su QA SQL reversible y sus carreras
de dos sesiones están en `supabase/qa/20261001153611_club_finance_core_*`.

## F1B · inscripción de torneo

- El evento económico es la transición a `CONFIRMED` (incluida el alta manual
  confirmada mediante esa transición). La solicitud `PENDING` no genera deuda. Una
  inscripción histórica que ya estaba confirmada antes de F1B no se rellena.
- La obligación pertenece a la pareja (`debtor_type = TEAM`), referencia
  registration/tournament/team y tiene `source_id = registration_id`. El
  importe queda congelado al confirmar: `tournaments.price_per_player × 2`;
  los dos jugadores son obligatorios. Precio cero significa `NO_CHARGE`.
  No se infiere un vencimiento desde el cierre de inscripciones: `due_date`
  queda `NULL` hasta definir una política de cobro explícita. Por eso F1B
  proyecta `NO_CHARGE`, `PENDING`, `PARTIAL`, `PAID` o `CANCELLED`, pero no
  `OVERDUE` automático por fecha.
- F1B soporta exclusivamente ARS para inscripciones de torneos. La moneda no se
  deriva de `tournament_payments`. La futura configuración multi-moneda será
  una evolución explícita y no reinterpretará obligaciones históricas.
- La transición deportiva y el cargo se confirman en la misma transacción
  mediante el trigger. La unicidad
  F1A del source evita duplicados por retry. La baja `CANCELLED` cancela el
  cargo sin dinero POSTED; si queda dinero aplicado, falla explícitamente y
  exige resolución financiera previa. Una reversión no equivale a refund.
  `REJECTED` es estado de solicitud de pago, no del enum deportivo.
  Las rutas autentican al humano y una RPC exclusiva de `service_role` lleva
  su ID a la misma transacción. La base valida su capability activa para la
  acción; el trigger rechaza cargos sin actor autorizado. `created_by` de la
  obligación y `actor_id` del journal identifican a quien confirmó, nunca
  usan como fallback al creador de la inscripción. El contexto se borra antes
  de terminar la RPC.
- `tournament_registrations.status` sigue siendo deportivo. El estado
  financiero se proyecta de F1A, sin guardarse en `payment_status`.
  `tournament_payments` sigue siendo una solicitud operativa legacy:
  `tournament_payments.APPROVED` **no significa**
  `club_finance_payments.POSTED`. No hay conversión ni backfill de pagos.

## F1C · experiencia operativa

- `/club/contabilidad` conserva la URL de entrada pero muestra «Finanzas» con
  resumen, obligaciones y movimientos canónicos. `/club/finanzas` sigue como
  alias. La pantalla nueva no consulta `/api/clubs/finance` ni suma
  `club_receivables`, `club_receivable_payments`,
  `club_financial_transactions` o `tournament_payments`.
- La API `/api/clubs/finance/core` usa el JWT del usuario. Las tres lecturas
  F1C son batch, paginadas y requieren `finance:view`; el resumen suma sólo
  pagos `POSTED`, por lo que una reversión deja de contar como cobrado. Las
  obligaciones canceladas no cuentan como pendientes. Los nombres de parejas
  se resuelven con joins dentro del read model, sin consultas por jugador.
- Sólo `finance:manage` ve acciones de escritura. Registrar y revertir usan
  exclusivamente los RPC F1A y una clave idempotente estable por intento.
  Ante `40001`, el backend reintenta una vez con la misma clave en una nueva
  transacción. Journals, postings y allocations no se muestran ni se editan.
- La antigua API y sus tablas siguen disponibles físicamente para procesos
  anteriores, pero se retiraron de la experiencia principal. No se migran ni
  reinterpretan sus importes como efectivo real.
