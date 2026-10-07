# SELPA — Product Completion Pass 2

Rama: `codex/club-admin-iphone-preview`. Base: `0bf7487c758c458b724c8722eb56d465f5a6dc53`.
Alcance: recorridos y runtime sobre Pass 1. No se reauditaron ni modificaron los engines Competition/Finance, sus fórmulas, permisos o lifecycles. Sin Supabase CLI/MCP, escrituras live, datos nuevos, main ni deploy manual.

## A. Recorridos por rol

Separar evidencia: Guest se probó en Next local `apps/web`, con contexto sin sesión y todas las escrituras HTTP bloqueadas. PLAYER/OWNER/ADMIN/PLANILLERO/PLATFORM se probaron secuencialmente con componentes reales, RoleGate/navbar reales y backend/session fixtures. No es E2E autenticado live.

| Rol | Landing | Recorrido de integración | Bloqueos comprobados |
| --- | --- | --- | --- |
| GUEST | `/` | Torneos → calendario → ranking/Damas/Caballeros → en vivo → clubes → noticias → buscar → register/login | Pagos/Finanzas/Billing privados → login; cuatro APIs financieras 401 |
| PLAYER | `/player` | Club activo → perfil → ranking → torneos → inscripción/pareja hasta revisión → actividad → pagos | Club administrativo y Platform; finanzas Club/Billing 403 antes de RPC |
| OWNER/ADMIN | `/club` | Administración → torneos → jugadores → finanzas → Billing → estadísticas → reportes → mensajes → configuración → perfil público → datos/preferencias | Player/perfil deportivo/actividad/inscripción → `/club`, antes de montar contenido |
| PLANILLERO | `/club` | Torneos → datos personales → preferencias; acceso operativo según capabilities existentes | Finanzas/Billing/jugadores/configuración; ningún fetch de módulo prohibido; no menú Player |
| PLATFORM | `/platform` | Solicitudes → clubes → usuarios → Billing → analytics → configuración → logs | Player/inscripción → `/platform`; Billing F2 separado de legacy |

La matriz contractual ejecuta el RoleGate real: seis roles × 26 rutas = 156 casos. Los contratos API ejercitan handlers reales con identidad/permisos de fixture y RPCs controladas; no sustituyen una comprobación RLS live.

## B–C. Bugs reproducidos y correcciones

- Inicio Player: `hasLoadedData` era dependencia del efecto que lo cambiaba; duplicaba la carga completa. Depende ahora de contexto y reintento explícito, no del resultado de su propia carga.
- Finanzas Club: cada cambio de tab recargaba dashboard aun con consulta idéntica. Dependencias basadas en filtro/búsqueda/método efectivos; se conserva recarga al cambiar la consulta y fallback F1C ya existente.
- Pagos Player, Finanzas y Billing mostraban texto técnico proveniente de errores de API. Mensajes humanos y reintento, sin transformar un fallo en un resumen ficticio de $0.
- Club, Torneos, Jugadores, Estadísticas, Mensajes y Perfil público también mostraban errores técnicos; varias lecturas no ofrecían reintento ni recuperaban fallos de red. Recuperación focal y sanitización, usando el panel existente. Torneos/Jugadores presentan error de lectura en vez de contar una lectura fallida como vacío válido.
- Diagnóstico Player Finance/Billing: operación y código técnico seguros, sin JWT, cookies, identidad, argumentos RPC, detalles ni hints de DB. JWT verificado y guards existentes se preservan.

No se modificaron layouts normales, headers aprobados, tabs, datos financieros/deportivos ni relaciones históricas.

## D. Onboarding

Contrato de destinos canónicos: sin sesión → login; Player incompleto → completar perfil; Player completo → `/player`; staff sin club aprobado → seleccionar club; staff aprobado → `/club`; Platform → `/platform`.
Register/login y sus entradas públicas se recorrieron sin submit. Se conservan solicitud de club, revisión Platform y destinos existentes de Pass 1. Aprobación/rechazo y alta con una sesión real quedan pendientes: no se crearon usuarios, clubes o membresías para QA.

## E. Player

Recorrido deportivo preservado. Inscripción con pareja de fixture → disponibilidad → método → revisión → volver → actividad/pagos, sin pulsar CONFIRMAR INSCRIPCIÓN ni escribir datos. Se recorrió en los seis tamaños. El borrador entre casos se reinició sólo en el contexto de navegador fixture.
Pagos sin cargos/movimientos: resumen $0 y vacío válido. Error técnico inyectado → mensaje humano → Reintentar → carga válida, sin error stale.

## F. Club

OWNER/ADMIN conservan las acciones administrativas; PLANILLERO mantiene sólo las capabilities canónicas. Menú y URLs Player bloqueados. Lecturas fallidas pueden recuperarse sin refresh de página, con handlers de consulta existentes. No se ejecutaron cobros, cancelaciones, altas, publicaciones o cambios de configuración.

## G. Platform

Recorrido por rutas `/platform/...` reales, incluyendo alias `/platform/config` en la matriz. Sin planes/facturas es válido; no mezcla F2 con archivo financiero legacy. No se enviaron acciones administrativas live.

## H. Público

12 rutas × 6 viewports en Next local: HTTP 200, sin overflow ni errores JS observados. Datos públicos reales existentes o vacío; no fixtures agregados al producto. Guest en Buscar ve el acceso a login y alternativas públicas, no un campo de búsqueda privada.

## I. Finanzas runtime

Club: pendiente $0, cobrado $0, cero abiertas, cero movimientos y conciliaciones; sin alerta roja.
Player: pendiente/pagado $0 y sin cargos; sin alerta roja.
Billing: club sin suscripción/facturas y Platform sin planes cargan normalmente.
Los contratos prueban que fallos RPC no se convierten en ese estado vacío; 401/403 detienen lecturas no autorizadas. Verificación live autenticada pendiente.

## J. Performance

Medido en componentes de producción con fixture, sin StrictMode: inicio Player pasó de dos lecturas de cada tabla deportiva inicial a una. Cinco cambios de tab con filtros iguales pasaron de cinco consultas redundantes del dashboard a cero. Filtros, reintento, paginación y actualización tras operación conservan su comportamiento.
No se introdujeron caches de autorización, nuevos estados financieros o optimizaciones especulativas de queries/listas.

## K. Mobile y QA UX

320/375/390/430/768/1280. 240 combinaciones de recorridos de roles, menús y redirects en fixture; además 72 rutas públicas y seis recorridos de inscripción hasta revisión. Sin overflow global ni errores JS. Inspección visual de estados vacíos/administración en 320/390 y desktop; se conserva el diseño aprobado. Edge con viewport emulado; Safari/iOS nativo no probado.
Seis módulos Club probados con error técnico y fallo de red, cada uno con reintento y recuperación. Los estados de error son diferentes de un vacío válido.

## L. Checks

- 357 tests focales PASS (Pass 1, roles, Pass 2, contratos F1A–F2 y elegibilidad administrativa).
- TypeScript: `tsc --noEmit --incremental false`, PASS.
- ESLint focal: cero errores; ocho warnings preexistentes en las pantallas tocadas, sin errores nuevos.
- `git diff --check`, PASS; revisar también staging antes del commit.
- QA sin datos nuevos; mocks/harness/capturas sólo en `output/`, excluido del checkpoint.

## M. Pendientes reales

Validación live autenticada pendiente para los cinco roles internos, aprobación/rechazo de solicitudes, inscripción efectiva y acciones económicas. No se dispuso de una sesión real y no se la emuló con credenciales privilegiadas. No bloquea el cierre local solicitado. No se declara QA real de escritura ni Safari nativo.
El conflicto histórico STAFF/PLAYER previamente registrado se preservó sin borrarlo/corregirlo.

## N. Ledger y checkpoint

Migration definitiva: `apps/web/supabase/migrations/20261007164510_20261007155811_account_staff_player_separation.sql`.
Rename únicamente; SQL byte-for-byte idéntico. SHA-256 antes/después:
`E9E1EDC2BD65D40F6A55C3C0AD917093561EE5B58235B7ACC6039D294CA63885`.
Contrato y documentación referencian el nombre alineado. QA SQL conserva su nombre original. No nueva migration ni aplicación a DB.

Checkpoint solicitado: `Complete SELPA role journeys pass 2`, sólo esta rama y archivos del bloque. Hash/push se informan después de comprobarlos, no se presupone éxito.
Fuera: `next-env.d.ts`, QA/dev endpoints ajenos, `.temp`, ZIPs, `mobile-review`, `output`, SQL exportado y patch preexistente. Sin modificar stashes ni borrar artefactos.

## Archivos del checkpoint

20 archivos lógicos, contando la migration como rename:

- `apps/web/app/(app)/club/contabilidad/page.tsx`
- `apps/web/app/(app)/club/estadisticas/page.tsx`
- `apps/web/app/(app)/club/jugadores/page.tsx`
- `apps/web/app/(app)/club/page.tsx`
- `apps/web/app/(app)/club/perfil/page.tsx`
- `apps/web/app/(app)/club/torneos/page.tsx`
- `apps/web/app/(app)/player/page.tsx`
- `apps/web/app/(app)/player/pagos/page.tsx`
- `apps/web/app/api/player/finance/route.ts`
- `apps/web/components/messages/PampraxInbox.tsx`
- `apps/web/components/player/PlayerStatePanel.tsx`
- `apps/web/features/billing/BillingExperience.tsx`
- `apps/web/lib/accountRoleContract.test.ts`
- `apps/web/lib/platformBillingF2Server.ts`
- `apps/web/lib/productPresentation.ts`
- `apps/web/lib/productCompletionPass2Contract.test.ts`
- `apps/web/supabase/migrations/20261007164510_20261007155811_account_staff_player_separation.sql`
- `docs/product-completion-pass-1.md`
- `docs/product-completion-pass-2.md`
- `docs/schema-summary.md`
