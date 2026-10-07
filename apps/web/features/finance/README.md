# Club Finance F1A–F1E

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

## F1D · jugador / Mis pagos

- `/player/pagos` sigue la home global de jugador: reúne cargos visibles de todos
  sus clubes y los agrupa por club. El acceso está en «Mi espacio», móvil y desktop.
  No cambia el club activo ni exige membresía administrativa para consultar un
  cargo propio histórico. `/player/[clubId]` sigue siendo el espacio deportivo del club.
- Es sólo lectura. Cada RPC deriva `auth.uid()` del JWT: `USER` exige ser el deudor;
  `TEAM` exige ser player1 o player2 del `debtor_team_id`, con el mismo `club_id`.
  No acepta identidad de usuario ni selector de obligación arbitrario. Un filtro
  de club sólo reduce el conjunto autorizado. No requiere `finance:view`, no
  amplía las policies/grants F1A y no usa service_role para las consultas.
- La obligación TEAM es compartida: ambos integrantes ven el importe completo
  y los mismos cobros. No se divide automáticamente 50/50 ni se atribuye a cada
  jugador una mitad. La UI distingue «Pendiente de la pareja» de «Pendiente personal».
- «Pagado» suma allocations visibles de pagos `POSTED`; `REVERSED` conserva su
  historia y deja de contar como cobro neto. `CANCELLED` no aporta saldo pendiente.
  `open_obligations` exige `OPEN` y saldo neto > 0. F1D muestra ARS exclusivamente.
- La API `/api/player/finance` verifica el JWT y ejecuta tres RPC batch al inicio;
  las páginas siguientes usan una consulta. Nombres de club, torneo y pareja se
  resuelven dentro de DB. Cursors compuestos evitan perder filas con la misma fecha.
  Movimientos usan el ID de allocation como cursor y sólo muestran el importe
  aplicado a la obligación visible, sin revelar otras partes del pago.
- Legacy queda excluido: ningún `tournament_payments` histórico entra en el
  resumen o se convierte en dinero F1A. No hay backfill. F1D sólo lee; el checkout
  opcional posterior pertenece a F1E. No hay comprobantes legacy ni refunds.
- Migration: `20261006165334_20261006152334_player_finance_f1d_read_model.sql`. QA reversible:
  `supabase/qa/20261006152334_player_finance_f1d_read_model_validation.sql`.
  Las funciones y cuatro índices de lookup son aditivos; no cambian lifecycles
  ni las migrations aplicadas de F1A/F1B/F1C.

## F1E · Mercado Pago foundation (desactivado)

Migration local: `20261007004843_20261006170250_club_payment_provider_f1e_foundation.sql`.
QA reversible y carreras: `supabase/qa/20261006170250_club_payment_provider_f1e_*`.
Ledger informado tras aplicación live: `20261007004843`, nombre
`20261006170250_club_payment_provider_f1e_foundation`. Este checkpoint no ejecuta SQL.
El dump/resumen histórico no incluye F1A–F1E;
los contratos se basan en las migrations aplicadas de cada bloque.

- Marketplace Argentina / Split 1:1, Checkout Pro con token del vendedor obtenido
  vía OAuth. REST oficial centralizado en `MercadoPagoProvider`, sin SDK nuevo.
  `marketplace_fee` existe en el intent y adapter; la creación v1 fija 0 en DB.
  No hay comisión comercial configurada ni selector de moneda: sólo ARS.
- Cuentas por conexión histórica, intents separados de pagos F1A, inbox immutable
  y resultados append-only. No se copian secretos a `public`; sólo referencias.
  Todos los raw tables tienen RLS y cero grants Data API. RPCs de usuario derivan
  `auth.uid()`; OAuth requiere `finance:manage`. Consume/callback/checkout worker
  y reconciliación son service-only, con comprobaciones dentro de DB.
- OAuth: state aleatorio de 256 bits, binding de navegador en cookie HttpOnly,
  Secure, SameSite=Lax, hashes en DB, expiración 10 min y consumo único. PKCE S256;
  verifier temporal vive en Vault. Callback revalida la capability del
  actor original y jamás entrega tokens al navegador.
- **Secret store: Supabase Vault.** La migration existente exige Vault instalado;
  no crea otra migration ni usa pgsodium/cifrado propio. Account guarda sólo
  `access_token_secret_id`, `refresh_token_secret_id` UUID y `token_expires_at`;
  state guarda `pkce_verifier_secret_id`, hash/binding/actor/expiración. Los valores
  se crean con `vault.create_secret`, se rotan con `vault.update_secret` y el runtime
  los lee exclusivamente mediante helpers SECURITY DEFINER con search_path fijo,
  EXECUTE service-only. Se protege Vault frente a PUBLIC/anon/authenticated.
  `service_role` es el backend completamente confiable, server-only, y conserva
  privilegios Vault administrados por Supabase. La migration no intenta revocarlos
  ni alterar grantor/roles/ownership del extension. Código normal de SELPA usa sólo
  VaultProviderSecretStore + RPCs acotadas, nunca consultas Vault directas; ni tokens
  ni service_role llegan al browser.
- `VaultProviderSecretStore` es la única frontera de secretos: OAuth por state
  válido, credentials por account + purpose CHECKOUT/WEBHOOK, nunca un RPC genérico
  por UUID de secret. El actor de inicio se obtiene del JWT en backend y DB vuelve
  a validar finance:manage; authenticated no puede invocar esa escritura Vault.
  Callback consume/elimina PKCE en una transacción; luego crea ambos secrets y
  CONNECTED juntos en otra. Error Vault revierte ambos y no conecta ni deja huérfanos.
- Refresh: claim persistente bajo row lock corto, sin red dentro de la transacción.
  Un segundo worker recibe BUSY; después lee el mismo access actualizado. Respuesta
  completa debe conservar vendedor/modo. Ambos secrets + expires_at se actualizan
  atómicamente con CAS del claim. Sólo revocación/401/403/invalid_grant exige reconexión;
  429 permite retry con credenciales intactas. Timeout/5xx/respuesta incompleta/crash
  o fallo DB tras respuesta pueden haber rotado remotamente: conservan secrets y
  claim, señalan REFRESH_UNCERTAIN y bloquean una rotación ciega. Claim abandonado
  se detecta a los 30 segundos. Resolver mediante nueva autorización, no sobrescribir
  tokens a mano; no confundir rechazo temporal con revocación.
- Cleanup acotado (100 filas, SKIP LOCKED) en start/consume/completion/disconnect y
  RPC service-only `cleanup_payment_provider_secrets_f1e` para mantenimiento. Un
  verifier vencido nunca se puede consumir; se elimina en el próximo cleanup aunque
  no haya callback. No se configura cron en este bloque: antes de activar, definir
  la ejecución periódica de esa RPC para una eliminación puntual de expirados.
  Desconectar bloquea nuevos checkouts sin borrar intents/eventos/F1A. Sin actividad
  pendiente borra tokens y refs en la misma transacción; para evidencia/pagos en
  tránsito conserva refs server-only, accesibles sólo por WEBHOOK, y una ventana
  de 30 días para notificaciones tardías. Cleanup purga al resolverse/expirar la
  retención; evidencia sin resolver prolonga retención intencionalmente.
- El monto sale de la proyección F1A bajo lock de obligación: saldo completo neto
  POSTED. USER sólo debtor; TEAM ambos integrantes, una sola obligación compartida.
  `payer_user_id` conserva al iniciador SELPA, no acredita identidad del pagador
  de Mercado Pago ni divide el saldo. El cuerpo del checkout no admite monto/moneda.
- Índice parcial garantiza un intent activo por obligation/provider; el claim
  transaccional permite un solo POST externo. Un retry listo reutiliza URL.
  Saldo cambiado expira el anterior; antes del nuevo POST se invalida la preferencia
  antigua. Timeout/crash ambiguo o pago en proceso bloquea otra preferencia y exige
  conciliación. Claims abandonados se detectan después de dos minutos al reintentar.
- Webhook valida HMAC oficial (`data.id`, x-request-id, ts), persiste inbox mínimo,
  obtiene el pago por REST con token del vendedor, y comprueba en DB ID, collector,
  referencia opaca UUID, importe, ARS, modo y captura. No conserva body completo,
  emails/tarjetas ni registra tokens en logs. Respondemos 2xx sólo tras procesamiento
  durable; API/DB temporal falla con 503 para reintentos MP y resultado RETRY.
- APPROVED llama exclusivamente `register_club_finance_payment`, con key por
  provider payment. Command → obligation → intent respeta el orden F1A. La llamada
  y enlace del intent son atómicos; un fallo revierte payment/allocation/journal.
  El bridge atribuye el journal al admin que autorizó la conexión OAuth, revalida
  `finance:manage` y restaura claims al salir. Es una delegación automática
  documentada, no suplantación del jugador. Revocada la capability, exige revisión.
  F1A conserva exactamente sus métodos/grants; OTHER se presenta como Mercado Pago
  sólo cuando hay un intent canónico vinculado al payment (nunca por texto libre).
- Cobro manual concurrente, diferencia de importe/moneda, seller inválido,
  intento vencido, refund/chargeback o segundo cobro externo conserva evidencia y
  entra en RECONCILIATION_REQUIRED. No se sobreasigna, no se borra historial y no
  hay refund/reversal automático. SQLSTATE 40001/40P01 aborta para retry completo.
- Finanzas → Configuración muestra conexión y alerta de revisión. Desconectar
  impide nuevos checkouts. La limpieza sigue la política Vault anterior; no implica
  revocar autorización en MP ni borrar historia contable.
- Mis pagos muestra CTA sólo con eligibility server-side y flag listo. El retorno
  consulta estado autorizado; no acepta amount/status del navegador ni crea dinero.
  Hace cuatro lecturas acotadas y ofrece Actualizar estado. Las consultas F1C/F1D
  permanecen iguales con F1E desactivado; la metadata adicional usa RPCs batch.

Variables server-side necesarias (sin valores reales):

```dotenv
PAYMENTS_MERCADO_PAGO_ENABLED=false
PAYMENTS_MERCADO_PAGO_LIVE_MODE=false
PAYMENTS_PUBLIC_ORIGIN=https://your-sandbox-host.example
MERCADO_PAGO_CLIENT_ID=
MERCADO_PAGO_CLIENT_SECRET=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_REDIRECT_URI=https://your-sandbox-host.example/api/payments/mercado-pago/oauth/callback
```

La flag exige `true`, todas las env y HTTPS/origin fijo; SQL falla cerrado si Vault
o credenciales no están disponibles. Ni instalar la migration ni Vault habilita pagos.
No editar `.env.local` desde este bloque.
Antes de dinero real: QA PostgreSQL reversible + carreras + grants Vault,
OAuth/refresh/webhooks/Checkout Pro con cuentas sandbox, revisión de autorización
marketplace, mantenimiento cleanup, observabilidad/replay del inbox y procedimiento
humano de conciliación. RPCs secretos transmiten valores sólo backend→DB por TLS;
sus respuestas nunca se reutilizan como JSON de API cliente. No loggear request bodies
ni argumentos RPC; verificar redacción/log_parameter_max_length(_on_error), pgaudit
y APM en QA antes de credenciales reales. No hay errores con valores de tokens.
No se configura cron ni se crea movimiento económico durante tests locales.

Vault: [documentación oficial](https://supabase.com/docs/guides/database/vault).

Referencias oficiales revisadas: [Split 1:1](https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace),
[OAuth/PKCE](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation),
[webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).

### Activación sandbox · checklist operativo

Plantilla sin secretos: [mercado-pago.env.example](./mercado-pago.env.example).
Los siete nombres anteriores son la única convención del runtime; no requiere
Public Key de MP ni un Access Token estático. Client ID/Secret son de la aplicación
OAuth del integrador, no `TEST_ACCESS_TOKEN` de un vendedor. El token del vendedor
se obtiene por OAuth y se almacena en Vault. Las variables Supabase ya existentes
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
siguen siendo necesarias; service role y las credenciales MP son sólo server-side.

Usar un host HTTPS estable para la prueba. `PAYMENTS_PUBLIC_ORIGIN` es únicamente
el origin, sin path/query/hash; `MERCADO_PAGO_REDIRECT_URI` debe coincidir con ese
host y el callback exacto. No se toma el host del request ni se usa localhost.

| Ruta real | Vercel Preview | Producción (referencia, no activar) |
| --- | --- | --- |
| OAuth callback GET | `https://<preview-host>/api/payments/mercado-pago/oauth/callback` | `https://selpa.com.ar/api/payments/mercado-pago/oauth/callback` |
| Webhook POST | `https://<preview-host>/api/payments/mercado-pago/webhook?account=<account_uuid>` | `https://selpa.com.ar/api/payments/mercado-pago/webhook?account=<account_uuid>` |
| Retorno success/pending/failure | `https://<preview-host>/player/pagos?paymentReturn=<reference_uuid>` | `https://selpa.com.ar/player/pagos?paymentReturn=<reference_uuid>` |

Los tres estados vuelven a la misma página: el retorno GET sólo lee estado;
ningún parámetro del browser confirma ni contabiliza un cobro. `account_uuid`
es el ID de conexión SELPA (no User ID de MP); la preferencia genera automáticamente
su `notification_url` con ese parámetro. La URL base del panel Webhooks no lleva
un UUID inventado: después de conectar, usar la URL específica de esa conexión
para el simulador. Notificaciones sin `account` válido se rechazan, nunca se
resuelve el vendedor desde datos no autenticados.

Precondiciones: Preview accesible públicamente por callback/webhook (Deployment
Protection puede bloquear a MP) y DB de QA aislada con F1A–F1E/Vault instalados.
**Un Preview no aísla los datos automáticamente**: no usar el proyecto Supabase
productivo para crear obligaciones/pagos de prueba. No se modifica la protección
Vercel ni se crea una DB desde este bloque. Mantener flag OFF en producción.

Pasos para el operador, sin credenciales ni movimientos reales en este checkpoint:

1. Entrar a [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app)
   del integrador; Crear aplicación, Pagos online → Checkout Pro, modelo Marketplace
   / Split 1:1 cuando esté disponible. Completar las validaciones que solicite MP;
   si no ofrece ese modelo, confirmar habilitación con MP antes de continuar.
2. Abrir Detalles de aplicación / Producción → Credenciales de producción y obtener
   Client ID (número de aplicación) y Client Secret para OAuth. Si pide activarlas,
   completar industria, sitio y términos del panel; obtener estas claves no habilita
   por sí solo pagos reales en SELPA. Guardarlas sólo en configuración segura
   del servidor del Preview; no pegarlos en tickets, README ni Git.
3. Detalles → Editar datos → Configuraciones avanzadas: registrar el callback HTTPS
   exacto, habilitar flujo de autorización con PKCE y permisos lectura/escritura/
   acceso offline necesarios. No añadir parámetros al redirect URI registrado.
4. Webhooks → Configurar notificaciones: seleccionar modo pruebas, URL base del
   Preview y evento **Pagos (`payment`)**; no Orders API ni merchant_order.
5. Guardar y revelar la clave secreta de Webhooks de esa aplicación/configuración;
   guardarla como `MERCADO_PAGO_WEBHOOK_SECRET`. No confundirla con Client Secret.
6. Pruebas → Cuentas de prueba → Crear cuenta: Argentina, vendedor y comprador
   distintos; usar integrador de prueba si el esquema Marketplace lo requiere.
   Guardar usuario/contraseña/código de verificación privadamente. Para pagar usar
   sólo saldo ficticio o [tarjetas de prueba oficiales](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases).
7. Configurar las siete variables en el entorno **Preview** (sin activar Production),
   LIVE_MODE=false y ENABLED=true sólo cuando estén completas. Requiere que el
   deployment tome esas env. Este bloque no cambia env reales ni dispara deploy.
   En SELPA, admin con finance:manage → Finanzas → Configuración → Conectar Mercado
   Pago. Autorizar con el vendedor de prueba, en navegador separado del comprador.
   Callback debe regresar a Finanzas y mostrar Conectado; Vault sólo guarda refs.
   Si OAuth devuelve modo distinto del configurado, falla cerrado: revisar con MP;
   no poner LIVE_MODE=true como atajo para pruebas ni conectar un vendedor real.
8. En la DB aislada, crear una inscripción confirmada/obligación ARS de prueba
   mediante el flujo canónico. Ejemplo: cargo 100, pago manual previo 20, saldo 80.
9. Jugador autorizado → Mis pagos → Pagar con Mercado Pago. Verificar preferencia
   por 80 ARS y marketplace_fee=0; pagar como comprador de prueba en incógnito.
10. En Webhooks, usar la URL específica con account_uuid para el simulador y revisar
    los envíos del pago real de prueba. La simulación sin un payment API verificable
    no acredita dinero. Firma inválida → 401 antes de inbox/ledger; fallo temporal
    API/DB → 503 para retry. Sin sesión SELPA. Consultas externas tienen timeout 6s,
    handler presupuesto 20s; ACK sólo después de evidencia durable, no fire-and-forget.
11. Verificar con QA autorizado exactamente un payment POSTED F1A + PAYMENT_RECEIVED,
    vínculo del intent APPROVED y saldo 0. Replay del mismo evento no duplica ledger.
    Si hubo cobro manual concurrente: RECONCILIATION_REQUIRED, sin doble asignación.
12. Comprobar UI club/player: Mercado Pago, saldo pagado, resumen actualizado.
    Retorno pendiente permite Actualizar estado sin registrar dinero. Al terminar,
    apagar flag en Preview y seguir la política de cleanup/conciliación existente.

OFF o enabled con configuración incompleta → runtime null, sin CTA player ni
Conectar del club; panel No disponible, sin crash ni nombres de env en errores.
OAuth start/callback, checkout GET/POST, webhook y disconnect responden 503 antes
de acciones; reads F1C/F1D siguen funcionando. La instalación SQL no activa pagos.
State hash + binding HttpOnly/Secure + PKCE + expiración/one-time y capability
siguen iguales. Callback sólo devuelve redirect y checkout sólo `{ checkoutUrl }`.

Observabilidad mínima: logs server `[finance:F1E]` con códigos fijos OAUTH_FAILURE,
REFRESH_FAILURE, CHECKOUT_FAILURE, WEBHOOK_INVALID, PROVIDER_API_UNAVAILABLE y
RECONCILIATION_REQUIRED. Correlacionar con request/timestamp en logs Vercel y estado
durable del inbox/intents; no hay plataforma nueva ni payload/error crudo en logs.
No registrar query completa del callback (authorization code), headers/body/RPC args,
tokens, Client Secret, webhook secret ni PKCE. Revisar redacción del hosting/APM.
Esta preparación valida guards y mocks locales; OAuth/MP real y entrega de Webhooks
quedan pendientes de credenciales, host accesible y QA aislado. No se cambió SQL.

Guías de panel: [Detalles/PKCE](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/application-details),
[Cuentas de prueba](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/accounts),
[Webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).

## F1F · Reportes, exports y conciliación administrativa

Migration aditiva: `20261007013543_club_finance_f1f_reports_reconciliation.sql`.
QA descartable con rollback: `supabase/qa/20261007013543_club_finance_f1f_validation.sql`.
No modifica SQL, lifecycles, permisos ni datos existentes F1A–F1E; no habilita MP.

- Lecturas exclusivamente F1A y vínculos canónicos F1E/F1B, ARS. Tres views
  internas `security_invoker`, sin grants Data API; RPCs con search_path fijo,
  auth.uid + finance:view y club scoping. Las pantallas reciben aggregates y
  páginas keyset de 20 filas, no el ledger entero. La clasificación MP funciona
  aunque el flag esté OFF: sólo un intent enlazado a finance_payment_id acredita
  el método, nunca texto libre ni solicitudes legacy.
- Período inclusivo de fechas Argentina: cobrado neto = pagos con paid_at dentro
  del rango que actualmente siguen POSTED. Revertir excluye ese pago del neto;
  no se reconstruye un balance histórico. Pendiente, counts, aging y Obligaciones
  exportadas son la cartera actual completa, sin restringirla por creación.
  Por torneo asigna el neto de allocations POSTED del período y el saldo actual.
  Se explicita este alcance en UI y workbook; no confundirlo con flujo de caja
  histórico. Movimientos exporta los journals PAYMENT_RECEIVED/PAYMENT_REVERSED,
  con signo y fecha de cobro/reversión; su suma por período puede diferir del
  neto de pagos de ese período si una reversión corresponde a un cobro anterior.
- Aging sólo usa due_date financiera explícita, con fecha actual Argentina.
  F1B due_date=NULL permanece «Sin vencimiento»; no inventa mora deportiva.
- Exports backend JWT + finance:view (DB lo revalida), sin service_role para leer.
  Pagina en lotes de 500, aborta ante errores y nunca entrega archivos truncados.
  Máximo 367 días inclusivos y 20.000 filas por conjunto por seguridad de memoria;
  un rango/conjunto mayor requiere export masivo futuro, no un download parcial.
  No son snapshots transaccionales entre páginas: reflejan estado actual durante
  la extracción. Para conciliaciones de cierre, exportar sin actividad concurrente.
  CSV UTF-8 BOM, separador `;`, decimal `,`, texto protegido contra fórmulas.
  XLSX real: Resumen/Obligaciones/Pagos/Movimientos/Por torneo; fechas locales,
  números, headers navy, widths útiles y primera fila fija. `write-excel-file`
  4.1.1 (sólo servidor, dependencia fflate) evita añadir un SDK de planillas al móvil.
- Conciliaciones incluyen intents y últimos resultados de eventos F1E que necesitan
  revisión, deduplicando eventos representados por un intent pendiente. Sin secretos,
  Vault refs ni payloads; sólo importe/moneda allowlisted de evidencia verificada
  para eventos no vinculados. IDs y motivo técnico están únicamente en detalle.
- Historial nuevo append-only, raw RLS sin grants. finance:manage deriva el actor
  de auth.uid; NOTE/REVIEWED/RESOLVED requieren nota, origen real del mismo club,
  source_version vigente e idempotency key. Una nota no reabre; REVIEWED sigue
  requiriendo atención y RESOLVED deja de contar. Un nuevo updated_at del intent
  reabre una nueva versión del caso. Historial administrativo y evidencia F1E
  permanecen intactos; no hay refund, revisión de payment, journal o webhook.
  RPCs sólo aceptan los parámetros administrativos explícitos, nunca actor_id.
  Ver detalle/historial y las acciones administrativas exigen finance:manage;
  el listado de atención, reportes y exports requieren finance:view.
- Índices nuevos: lookup parcial del vínculo intent→finance_payment_id y dos
  índices del historial para latest disposition/case detail. Reutiliza índices
  de fechas/club de F1A–F1E, sin agregar índices especulativos por cada filtro.

Antes de producción: instalar y ejecutar QA F1F en PostgreSQL/Supabase descartable;
verificar ACL/RLS con roles reales, transición F1E posterior a resolución, carreras
de review/idempotency y EXPLAIN ANALYZE con volumen representativo (agregados,
búsquedas y exports). QA local de componentes usa datos ficticios, sin DB ni MP.
La revisión de dependencia usa [write-excel-file](https://gitlab.com/catamphetamine/write-excel-file);
los guards RPC siguen la [guía de functions](https://supabase.com/docs/guides/database/functions).
Si falta la migration F1F (PGRST202), el Preview conserva las lecturas/acciones F1C
y muestra las pestañas nuevas deshabilitadas. Otros errores no se ocultan con fallback.
