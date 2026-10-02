# Club Finance F1A

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

La migration F1A es local hasta aprobación explícita. El QA SQL está diseñado
para una base descartable y hace rollback; los escenarios de carrera reales
exigen dos sesiones, están detallados en
`supabase/qa/20261001153611_club_finance_core_two_session.md` y todavía no se
han ejecutado.
