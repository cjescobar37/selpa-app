# Product Completion Pass 3 — write flows

App canónica: `apps/web`. Base: `6d3522799b38125adaec58a2d5e28db5875068ba`.
Rama: `codex/club-admin-iphone-preview`. Sin cambios en engines Finance/Competition,
STAFF≠PLAYER aplicado, diseños aprobados, dependencias ni datos productivos.

## Alcance y evidencia

| Área | Cierre implementado | Validación disponible |
| --- | --- | --- |
| A. Onboarding | Solicitud con clave estable; aprobación/rechazo atómicos; solicitud conservada/resuelta; club, OWNER y contexto juntos; cuenta OWNER obligatoria | Handler real con fixtures, contratos SQL y QA reversible |
| B. Player membership | Join/reintento; rechazo/reingreso; aprobación delegada al helper deportivo existente; notificaciones en la transacción | Matriz STAFF/PLAYER, contratos y QA reversible |
| C. Staff | Guard síncrono en invitación, cancelación, roles, baja y transferencia; conserva OWNER/capabilities y validaciones existentes | Handler real con fallo/doble submit; invitación browser fixture; contratos STAFF≠PLAYER |
| D. Tournament entry | Wizard persiste clave antes de enviar y conserva ID creado al recuperar; inscripción recupera pareja exacta antes de validar cupo; aprobación legacy y baja delegan a F1B en una transacción | Handler real/reintento con cupo lleno; contratos precio cero/ARS×2/deadline; QA SQL con fault injection |
| E. Partnerships | Accept/decline/cancel en una transacción; retry terminal; bloqueo de pareja consigo mismo y solapamientos; acciones Player y actualización focal | Contratos/QA SQL; sin limpieza de parejas históricas |
| F. Club Finance | UUID válido corregido en API; guard y receipt original conservados tras respuesta perdida/refresh; pago/reversión no duplicados | Handler real + fixtures cash parcial, transfer completo, saldo cero y reversión |
| G. SELPA Billing | Intento económico inmutable y recuperable; cambio futuro de plan sin alterar invoice; Club Admin sólo lectura | Seis handlers de operación y browser fixture plan/subscription/período/pagos/reversión/cambio futuro |
| H. Club config | Guards en save/tema/uploads; feedback tras ack, refetch/contexto focal; elimina reload de branding | Fallo de red en handler; horario guardado y recuperado tras refresh en fixture |
| I. Contenido/mensajes | Guard en save/status/delete de noticias/publicidad; mensajes con ID estable, retry y refresh; marcado de notificación espera ack y ownership | Superficies de contenido; helper real de mensajes; browser perdido/refresh/retry; handler notificación |
| J. Platform | Guards en solicitudes/clubs/users/settings; aprobaciones atómicas; confirmaciones críticas existentes preservadas | Matriz de permisos, handlers de aprobación y contratos |
| K. Auth | Guard en register/login/reset/update/logout; validaciones, redirect post-login; no borra contexto si falla logout | Validaciones/doble submit/fallo logout; superficies auth con fixture, sin envío de mail |
| L. Recovery | No auto retry; fallos desconocidos conservan comando y clave; errores humanos sin SQL/RPC/diagnósticos privados | Tests guard/storage/receipt/cross-actor/rollback contract |
| M. Mobile | Foco atrapado/restaurado y scroll locking en sheets; inputs existentes ≥16 px y safe-area preservada; sin rediseño | Chromium/Edge 320/375/390/430/768/1280; capturas revisadas 320/390/1280; sin overflow global ni pageerror |

## Checks locales

- 396 tests focales PASS (14 archivos: account roles, session, Pass 1/2/3,
  Finance F1A–F1F, Billing F2, headers/Finance UI y elegibilidad de admin).
- TypeScript `tsc --noEmit --incremental false`: PASS.
- ESLint focal comparado con HEAD: 0 errores nuevos en 48 archivos TS/TSX.
  Persisten 35 errores legacy en GETs/tipos `any` de memberships, messages y
  users-admin; no se afirma ESLint absoluto limpio. También hay warnings legacy.
- `git diff --check` y staged diff check se verifican al cerrar el checkpoint.
- Fixtures browser sólo en memoria, servidor loopback y bloqueo de TODO tráfico
  externo. Precios QA $100/$200 no son decisiones comerciales. No se crearon
  cuentas, emails, pagos ni movimientos en servicios reales.
- Evidencia local reproducida durante este trabajo en `output/product-pass-3/`;
  ese directorio sigue excluido del commit. El contrato focal queda en el repo.

## Nueva migration y QA pendientes

`apps/web/supabase/migrations/20261008101837_product_write_flows_pass3.sql`
es una migration nueva, **NO aplicada**. Agrega cinco columnas de resolución/
fingerprint a `club_requests`, siete RPCs y un helper/trigger INTERNAL para
solapamientos de partnerships. No reemplaza constraints STAFF≠PLAYER, no cambia
RLS ni motores financieros, ni reescribe migrations aplicadas.

Backend RPCs sólo `service_role`, con actor humano verificado en ruta y capability
validada en DB. La resolución Player es sólo `authenticated` y usa `auth.uid()`.
`guard_active_partnership_pass3` no tiene Data API execute. Los guards históricos
de identidad siguen activos; no se corrige ni elimina el conflicto previo.

QA: `apps/web/supabase/qa/20261008101837_product_write_flows_pass3_validation.sql`.
Usa BEGIN/ROLLBACK, identidades propias `.invalid`, fault injection y comprobación
de ACL, aprobación/rechazo/retry, parejas, inscripción precio cero/positivo,
actor F1B, atomicidad de decisión/baja y cash/transfer/reverse F1A. **No ejecutado
en PostgreSQL real en este Pass** por ausencia de runtime local disponible.

En una DB descartable con TODAS las migrations instaladas, ejecutar exclusivamente
el QA en una conexión fresca con `psql -v ON_ERROR_STOP=1 -f <QA-path>`. Su rollback
no autoriza correrlo en producción. Antes de despliegue operativo se necesita QA
SQL real y aplicación explícitamente autorizada de la migration. Las rutas nuevas
necesitan esas RPCs: sin migration responden indisponibilidad, nunca éxito falso.

Pendientes live: onboarding/OWNER, join/aprobación Player, aceptación staff/mail,
partnerships, torneo publicar/inscribir/confirmar/baja, uploads/perfil público,
publicación de contenido, mensajes/notificaciones y writes Platform con sesiones
reales. Contratos/fixtures no equivalen a una prueba autenticada contra Supabase.
No se probó Safari/iOS nativo; revisión por código y Chromium responsive solamente.
No hubo aplicación de SQL, DB connect ni deploy manual.

## Límites de recuperación

Finance/Billing/mensajes conservan datos del comando (incluidas notas/textos) en
`sessionStorage`, separados por usuario/contexto. Nunca guardan token, cookie,
credenciales ni claves externas. El receipt se elimina sólo tras ack o rechazo
transaccional conocido; un estado desconocido bloquea un comando distinto.
Refresh en la misma pestaña conserva el intento; cerrar la pestaña puede perder
ese recovery. No es persistencia durable ni conciliación cross-device.

El wizard conserva borrador/clave/ID en su almacenamiento local existente.
Cambiar datos de una creación ya enviada no crea una clave nueva silenciosamente:
el contrato idempotente del backend debe rechazar un payload incompatible.
Fallos de notificación secundaria tras un write confirmado no producen un falso
fallo del write principal; sólo código técnico `DELIVERY_PENDING`, sin payload.
La entrega real de esa notificación no se garantiza ni se añade una cola nueva.

## Exclusiones del checkpoint

Se incluyen sólo archivos de este Pass (rutas/UI listadas, cinco helpers/contracts,
migration, QA y este informe). Se preservan fuera: `next-env.d.ts`, QA/dev routes,
`supabase/.temp`, ZIPs, SQL exportado F1A, `mobile-review`, `output` y patch histórico.
No stashes, cleanup destructivo, main, production, merge ni deploy manual.

### Manifiesto de archivos del checkpoint (51)

```text
apps/web/app/(app)/club/configuracion/page.tsx
apps/web/app/(app)/club/contabilidad/page.tsx
apps/web/app/(app)/club/jugadores/[id]/page.tsx
apps/web/app/(app)/club/noticias/page.tsx
apps/web/app/(app)/club/publicidad/page.tsx
apps/web/app/(app)/club/solicitudes/ClubRequestsPage.tsx
apps/web/app/(app)/club/torneos/nuevo/page.tsx
apps/web/app/(app)/club/usuarios/page.tsx
apps/web/app/(app)/platform/clubs/page.tsx
apps/web/app/(app)/platform/configuracion/page.tsx
apps/web/app/(app)/platform/solicitudes/page.tsx
apps/web/app/(app)/platform/usuarios/page.tsx
apps/web/app/(app)/player/page.tsx
apps/web/app/(app)/torneos/[id]/inscripcion/page.tsx
apps/web/app/api/club-requests/[id]/route.ts
apps/web/app/api/club-requests/route.ts
apps/web/app/api/clubs/[clubId]/partner-invites/[id]/accept/route.ts
apps/web/app/api/clubs/[clubId]/partner-invites/[id]/cancel/route.ts
apps/web/app/api/clubs/[clubId]/partner-invites/[id]/decline/route.ts
apps/web/app/api/clubs/[clubId]/partner-invites/route.ts
apps/web/app/api/clubs/[clubId]/payments/[paymentId]/route.ts
apps/web/app/api/clubs/[clubId]/registration-change-requests/[requestId]/route.ts
apps/web/app/api/clubs/finance/core/route.ts
apps/web/app/api/clubs/memberships/route.ts
apps/web/app/api/clubs/request-join/route.ts
apps/web/app/api/message-threads/[threadId]/messages/route.ts
apps/web/app/api/message-threads/route.ts
apps/web/app/api/platform/users-admin/route.ts
apps/web/app/api/tournaments/[tournamentId]/registration/submit/route.ts
apps/web/app/login/LoginPageClient.tsx
apps/web/app/register/page.tsx
apps/web/app/reset-password/page.tsx
apps/web/app/unir-mi-club/page.tsx
apps/web/app/update-password/page.tsx
apps/web/components/messages/PampraxInbox.tsx
apps/web/components/navbar/AppNavbarClient.tsx
apps/web/components/platform/PublicClubRequests.tsx
apps/web/components/session/SessionProvider.tsx
apps/web/features/billing/BillingExperience.tsx
apps/web/lib/clubFinanceTournamentRegistrationContract.test.ts
apps/web/lib/platformBillingF2Server.ts
apps/web/lib/productCompletionPass1Contract.test.ts
apps/web/lib/productPresentation.ts
apps/web/lib/messageWriteServer.ts
apps/web/lib/productCompletionPass3Contract.test.ts
apps/web/lib/useWriteGuard.ts
apps/web/lib/writeFlowServer.ts
apps/web/lib/writeIntentRecovery.ts
apps/web/supabase/migrations/20261008101837_product_write_flows_pass3.sql
apps/web/supabase/qa/20261008101837_product_write_flows_pass3_validation.sql
docs/product-completion-pass-3.md
```
