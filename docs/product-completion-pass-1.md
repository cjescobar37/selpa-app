# SELPA — Product completion pass 1

Fecha: 7 oct 2026. App canónica: `apps/web`. Rama: `codex/club-admin-iphone-preview`.

Este cierre incluye implementación, contratos y QA de componentes con fixtures locales. No equivale a certificar E2E live de toda la app: no se contó con sesiones reales ni se accedió a Supabase. No se crearon datos reales. Competition y las semánticas Finance F1A–F1F/F2 se conservaron.

## A. Hallazgos y clasificación

| Experiencia | Antes | Cierre del pass / alcance |
|---|---|---|
| Público: calendario / en vivo | INCOMPLETE: fixtures o placeholder | CLOSED a nivel código: fuente real compartida, error distinto del vacío, siguiente acción. En vivo enlaza resultados existentes; no promete streaming. |
| Ranking Damas / Caballeros | MISSING / DUPLICATED: rutas faltantes y placeholders viejos | CLOSED a nivel rutas y filtros; mismos cálculos deportivos. |
| Búsqueda | INCOMPLETE: página sin búsqueda operativa; destinos privados indebidos según contexto | CLOSED local: búsqueda real, debounce, cancelación, retry, destinos públicos y filtros de publicación. |
| Auth | BROKEN en fallas de red / doble decode de error; controles pequeños | CLOSED para estos casos: mensaje humano, formulario desbloqueado, inputs conservados, tamaños táctiles. OAuth/email reales pendientes. |
| Player: perfil / selección de club | BROKEN: fallas confundidas con ausencia de membresías o carga indefinida | CLOSED para recuperación local; membresías y cambio de contexto existentes preservados. |
| Onboarding de club | BROKEN: faltaba `theme_key` obligatorio en el POST | CLOSED en integración local con el API existente; opcionales colapsables. Aprobación live pendiente. |
| Platform: solicitudes públicas | DEAD END: el alta pública no aparecía en la bandeja de clubes pendientes | CLOSED para lectura/revisión/aprobación explícita por el API existente. Separación entre solicitudes y clubes por habilitar. |
| Platform: home / analytics | LEGACY / INCOMPLETE: mezcla de ingresos legacy y placeholders | CLOSED para indicadores operativos reales. No se inventan métricas de uso, retención ni MRR. |
| Platform: clubes / usuarios / configuración / logs | FUNCTIONAL BUT OLD UI | Header/back normalizados; lógica existente conservada. Tablas/modales históricos no son una nueva certificación E2E. |
| Platform: pagos / liquidaciones | LEGACY | Fuera de navegación primaria; archivo identificado explícitamente, con enlace a Facturación F2 canónica. |
| Platform: moderación / reclamos | INCOMPLETE / MISSING | Moderación dirige a gestión de noticias existente. Reclamos informa la ausencia de tickets y ofrece destinos reales; no se inventó un backend. |
| Club: contenido | MISSING como ruta solicitada | Alias a noticias del club existentes. |
| Club: reportes | Inconsistencia de presentación financiera legacy | Reporte deportivo separado de dinero confirmado; Finanzas canónica accesible según capability. |
| Club: torneo / jugadores / configuración / Finanzas / Facturación; Player pagos | Funcionales con mejoras previamente aprobadas | Revisados por rutas, permisos y contratos relacionados; preservados, sin rehacer lógica ni diseño aprobado. E2E autenticado live pendiente. |
| Público: home / clubes / noticias | Flujos existentes | Se preservaron contenido y destinos reales; home carga fuentes independientes en paralelo. No se inventaron datos ni redes sociales. |

## B. Correcciones implementadas

- Rutas canónicas `/ranking/damas`, `/ranking/caballeros`, `/en-vivo`, `/club/contenido`, `/platform/config`. Rutas de género antiguas redirigen; no duplican features.
- El guard de Platform cubre todo `/platform`, no sólo Facturación. El backend mantiene su autorización propia.
- Search excluye torneos no publicados y clubes inactivos, no envía a editores de otro club y no presenta una falla SQL como búsqueda vacía.
- AuthAlert humaniza errores y evita códigos SQL/UUID/secretos visibles; errores con semántica accesible. Password/OAuth recuperan controles tras fallas de red.
- Alta pública envía tema canónico; formulario conserva datos al fallar y no crea el club automáticamente. La bandeja ofrece revisión y aprobación explícita, nunca aprobación por navegar/focus.
- Solicitudes diferencia altas públicas de clubes pendientes, reduce duplicación, renderiza progresivamente y permite retry. Acciones de clubes liberan busy tras una falla de conexión y conservan la confirmación de éxito.
- Perfil/selección distinguen error de lectura de un estado legítimo sin club. Back circular integrado, sin cambiar roles o membresías.
- Headers de Platform reutilizan PageHeader y su back circular. Navegación de Inicio/Analytics/Facturación con underline verde; primarios oscuros con texto claro.
- No se mezclan aprobaciones legacy con dinero POSTED; reportes del club no suman `tournament_payments`.
- Footer deja de ofrecer cuatro enlaces sociales `#` sin destino configurado.

## C. Pendientes y límites explícitos

- **Validación live autenticada pendiente**: Club/Platform/Player, permisos RLS reales, OAuth, emails, aprobación de club y navegación después de mutaciones. No se pide al usuario una tarea manual ni se bloquea este pass por ello.
- QA visual local usa componentes/CSS reales y fixtures aisladas, con fuente de sistema. No sustituye Safari iOS, Next SSR completo, imágenes remotas ni todos los modales históricos autenticados.
- No se ejecutó build de producción ni SQL. No se repitió QA económico real ni se modificó su implementación.
- Calendario conserva sus controles compactos de siete columnas existentes; no se certifican como targets de 44 px. El QA de altura táctil los excluye explícitamente; no oculta overflow global.
- Public discovery mantiene límite server-side de 96 torneos; los controles Ver más paginan DOM, no constituyen paginación ilimitada de la base. Ranking y estadísticas secundarias de home todavía requieren optimización específica para volúmenes grandes.
- Solicitudes públicas tiene revisión/aprobación; no se añadió rechazo destructivo ni un nuevo lifecycle. El API de rechazo existente elimina físicamente la solicitud: no se amplió ese comportamiento en este pass.
- No hay backend de tickets de reclamos, streaming deportivo ni analytics de retención. Se ofrecen destinos existentes y copy verdadero, no funciones simuladas.
- Un navbar antiguo sin consumidores conserva referencias literales a `/club/ver`, `/club/info`, `/auth/login`; no pertenece al AppShell canónico. No se añadieron rutas falsas para ese código muerto.
- Quedan 21 warnings focales (imágenes y dependencias de hooks). Cero errores ESLint en los archivos evaluados; no se silencian los warnings globalmente.

## D. Rutas afectadas

Público/Auth: `/`, `/torneos`, `/torneos/calendario`, `/torneos/reglamento`, `/envivo`, `/en-vivo`, `/ranking`, `/ranking/damas`, `/ranking/caballeros`, `/ranking/femenino`, `/ranking/masculino`, `/buscar`, `/unir-mi-club`, `/login`, `/register`, `/reset-password`, `/update-password`.

Player/Club: `/perfil`, `/seleccionar-club`, `/club/reportes`, `/club/contenido`; guard, mensajes y navegación compartidos alcanzan rutas consumidoras sin alterar sus motores.

Platform: `/platform`, `/platform/analytics`, `/platform/solicitudes`, `/platform/clubs`, `/platform/clubs/nuevo`, `/platform/usuarios`, `/platform/config`, `/platform/configuracion`, `/platform/logs`, `/platform/pagos`, `/platform/liquidaciones`, `/platform/moderacion`, `/platform/reclamos`; headers compartidos alcanzan módulos de contenido.

API: `/api/platform/summary`, `/api/search`. Onboarding/revisión reutilizan APIs existentes sin modificarlas.

## E. Performance

- Home: fuentes independientes de contenido y torneos en `Promise.all`, sin cambiar criterios deportivos.
- Platform summary: 13 `count: exact, head: true` paralelos, más seis clubes recientes. Evita descargar padrones para contar y el falso techo de 1000 filas.
- Discovery/calendar/live: misma fuente; clubes e inscripciones por batch paralelo, no por torneo. Render inicial limitado y Ver más; partidos/motores no se tocaron.
- Search: debounce 300 ms y AbortController, consultas acotadas y enriquecimiento por batch.
- Solicitudes: primeras cinco altas / ocho clubes, ampliación explícita; detalles sólo al revisar. Sin duplicar últimas solicitudes en una segunda lista.
- No se afirman mediciones de latencia de producción ni se considera resuelto todo N+1 del repositorio.

## F. QA UX local

Edge headless con red externa bloqueada: 320, 375, 390, 430, 768 y 1280 px.

13 composiciones: Platform, Analytics, altas públicas, Solicitudes completa, onboarding, búsqueda, calendario, en vivo, descubrimiento, ranking, login, selección de club y perfil. Navbar en visitante/Player/Club/Platform.

Comprobaciones: no overflow global, formularios/acciones legibles, alturas de controles fuera de calendario, render progresivo, Damas sin mezclar Caballeros, no aprobación por focus, errores sin detalles técnicos, reintento limpia alertas stale, onboarding conserva entradas, login vuelve a habilitarse. Screenshots revisadas mobile y desktop; el panel de clubes recientes no se estira creando espacio vacío.

Sólo fixtures locales: ninguna obligación, pago, membresía, club o torneo real fue creado.

## G. QA técnica

- 123 tests focales PASS: F1A/F1B/F1C/F1D/F1E/F1F/F2, PageHeader/Finance UI, Product Completion (19), Session Authorization y Club Admin eligibility.
- TypeScript: `tsc --noEmit --incremental false` PASS.
- ESLint focal: 53 archivos TS/TSX, cero errores, 21 warnings; comparación con HEAD sin nuevos errores.
- `git diff --check` PASS; staged diff check se verifica antes del commit.
- Inventario estático: 106 rutas de página. No se presenta como navegación HTTP autenticada live.
- Node 23 necesitó loader TS con resolución de imports sin extensión y precarga CommonJS de React. Los errores iniciales de runner no se corrigieron cambiando lógica ni tests de Finance; ejecución final completa PASS.

## H. Archivos y exclusiones

Los paths exactos del checkpoint quedan en el commit; comprende páginas/aliases mencionados, guard, dos APIs, componentes Auth/Footer/Platform/Player/Public/Product, helpers presentation/public load/nav/auth, contrato Product/F2, Finance README, esta documentación y el rename SQL F2. No se modificaron otras apps.

Migration final: `apps/web/supabase/migrations/20261007131222_20261007100803_platform_billing_f2_core.sql`.

SHA-256 antes y después: `CCEAD657DBA6D297FF3D01DD7C53706B1877BFEAFD434BCA46D3F830E9732731`. SQL byte-for-byte idéntico; sólo se ajustaron nombre y referencias.

Se excluyen y preservan `next-env.d.ts`, `qa-e2e-open-octubre/`, `app/api/dev/`, `supabase/.temp/`, ZIPs/SQL de QA previos, `mobile-review/`, `output/` y el patch de scheduling. El harness local queda sólo en `output/product-pass-1/`, nunca en el checkpoint.

La skill Supabase orientó a preservar autorización/JWT/capabilities y reutilizar APIs/esquema existentes; no autorizó ni provocó acceso remoto o cambios de DB.

### Manifiesto exacto del checkpoint (58 archivos)

+- `apps/web/app/(app)/RoleGate.tsx`
- `apps/web/app/(app)/club/contenido/page.tsx`
- `apps/web/app/(app)/club/reportes/page.tsx`
- `apps/web/app/(app)/perfil/page.tsx`
- `apps/web/app/(app)/platform/analytics/page.tsx`
- `apps/web/app/(app)/platform/clubs/nuevo/page.tsx`
- `apps/web/app/(app)/platform/clubs/page.tsx`
- `apps/web/app/(app)/platform/config/page.tsx`
- `apps/web/app/(app)/platform/configuracion/page.tsx`
- `apps/web/app/(app)/platform/liquidaciones/page.tsx`
- `apps/web/app/(app)/platform/logs/page.tsx`
- `apps/web/app/(app)/platform/moderacion/page.tsx`
- `apps/web/app/(app)/platform/page.tsx`
- `apps/web/app/(app)/platform/pagos/page.tsx`
- `apps/web/app/(app)/platform/reclamos/page.tsx`
- `apps/web/app/(app)/platform/solicitudes/page.tsx`
- `apps/web/app/(app)/platform/usuarios/page.tsx`
- `apps/web/app/(app)/seleccionar-club/page.tsx`
- `apps/web/app/api/platform/summary/route.ts`
- `apps/web/app/api/search/route.ts`
- `apps/web/app/buscar/page.tsx`
- `apps/web/app/en-vivo/page.tsx`
- `apps/web/app/envivo/page.tsx`
- `apps/web/app/login/LoginPageClient.tsx`
- `apps/web/app/ranking/caballeros/page.tsx`
- `apps/web/app/ranking/damas/page.tsx`
- `apps/web/app/ranking/femenino/page.tsx`
- `apps/web/app/ranking/masculino/page.tsx`
- `apps/web/app/ranking/page.tsx`
- `apps/web/app/register/page.tsx`
- `apps/web/app/reset-password/page.tsx`
- `apps/web/app/torneos/calendario/page.tsx`
- `apps/web/app/torneos/page.tsx`
- `apps/web/app/torneos/reglamento/page.tsx`
- `apps/web/app/unir-mi-club/page.tsx`
- `apps/web/app/update-password/page.tsx`
- `apps/web/components/AuthAlert.tsx`
- `apps/web/components/Footer.tsx`
- `apps/web/components/auth/AuthControls.module.css`
- `apps/web/components/platform/PlatformModuleShell.tsx`
- `apps/web/components/platform/PlatformOverview.tsx`
- `apps/web/components/platform/PublicClubRequests.tsx`
- `apps/web/components/player/PlayerStatePanel.tsx`
- `apps/web/components/product/ProductFlow.module.css`
- `apps/web/components/product/PublicAgenda.tsx`
- `apps/web/components/product/ReadFailure.tsx`
- `apps/web/components/public/PublicRankingExperience.tsx`
- `apps/web/components/public/PublicTournamentsExperience.tsx`
- `apps/web/features/finance/README.md`
- `apps/web/lib/navConfig.ts`
- `apps/web/lib/platformApiAuth.ts`
- `apps/web/lib/platformBillingF2Contract.test.ts`
- `apps/web/lib/productCompletionPass1Contract.test.ts`
- `apps/web/lib/productPresentation.ts`
- `apps/web/lib/publicHomeData.ts`
- `apps/web/lib/publicTournamentItems.ts`
- `apps/web/supabase/migrations/20261007131222_20261007100803_platform_billing_f2_core.sql`
- `docs/product-completion-pass-1.md`

## I. Checkpoint

Un único commit: `Complete SELPA product flows pass 1`.

Destino autorizado: `origin/codex/club-admin-iphone-preview`. Sin main, merge, PR, tag, Supabase ni deploy manual. Hash y confirmación de push se entregan tras ejecutar Git; no se presume una URL de Preview.

## J. Continuación del mismo pass: separación STAFF / PLAYER

Esta ampliación fue solicitada después del checkpoint `d32a2790c69d2dcdc58a0a5737b2f01b02a226ef`. Se integra en este informe sin abrir otro dominio ni hacer amend. Los resultados anteriores corresponden a ese checkpoint; los siguientes corresponden a la ampliación STAFF/PLAYER, cuyo cierre Git fue autorizado explícitamente después de la entrega local.

### Regla y sesión

Identidad administrativa a nivel de cuenta: OWNER, ADMIN, PLANILLERO y el OPERADOR existente, en cualquier club; también Platform Admin y propietario registrado sin membership. No depende del club activo ni de metadata enviada por cliente. PENDING/BANNED administrativos reservan la identidad, pero no conceden capabilities. REJECTED por sí solo no reserva identidad. Para competir se requiere otra cuenta/email PLAYER.

`accountRolePolicy` centraliza la regla de presentación; `accountRoleServer` consulta memberships, platform_admins y propietarios mediante la cuenta verificada. Fallos de lectura son 503, nunca Player implícito ni empty state. SessionProvider conserva platform/club/player, valida contexto administrativo elegible y evita volver a Player al cambiar club o usar autorización anticipada.

### Pantallas, rutas y menú

- OWNER/ADMIN: Administración del club, Mi cuenta, Preferencias, Seguridad, página pública del club, Facturación SELPA y logout. PLANILLERO/OPERADOR: cuenta/seguridad y administración con las capabilities existentes; sin Facturación. Platform conserva su contexto y añade cuenta/seguridad, sin experiencia Player.
- `/mis-datos`: staff sólo Datos personales y Cuenta/seguridad. Perfil deportivo no existe en su render. PLAYER conserva su enlace deportivo.
- `/mi-cuenta`: nombre, apellido, teléfono y avatar opcional; ninguna categoría, altura, mano, posición ni portada. Reutiliza el guard y API existentes, con una rama personal que no modifica campos deportivos históricos.
- `/preferencias` es alias de `/ajustes`: Mis datos, administración/contexto actual, notificaciones y seguridad para staff. Sin Mi perfil.
- `/completar-perfil` redirige staff a Mi cuenta antes de montar el wizard deportivo.
- RoleGate deniega `/player`, sus subrutas —incluyendo pagos—, `/perfil`, `/actividad`, `/pareja`, `/mis-torneos`, `/mi-ranking` e inscripción privada de torneo antes de montar hijos/loaders deportivos. Staff vuelve a `/club`; Platform a `/platform`.
- Home y detalle público de torneo dejan de mostrar hero/inscripción personal de jugador a staff de cualquier club. No se finge que administra el club organizador.

### Backend y preservación del dominio

Guards 403 en inscripciones, selección de compañero, solicitud legacy, cambios personales de inscripción, Player Finance y checkout habilitado, perfil deportivo y altas de jugadores. Se valida también la identidad de ambos participantes, incluida inscripción manual. Staff con `players:manage` conserva la administración de parejas de otros jugadores; no puede participar personalmente.

Listados, búsqueda, perfiles públicos, parejas/invitaciones y rankings públicos/de club/de circuito excluyen identidades administrativas en su presentación. No se borran filas, no se renumeran posiciones canónicas ni se recalculan puntos. Detalle de ranking de una cuenta administrativa no expone perfil deportivo. Tournament/Competition, awards, ledger, standings y resultados no cambian.

Alta OWNER, invitación/aceptación de staff, aprobación de membresías y cambio entre clases de rol rechazan mezclas con mensajes humanos. Se retiró la promoción Player→staff de candidatos/UI; se conserva invitación por email. Cambios staff→staff y gestión administrativa de otros usuarios mantienen capabilities/lifecycle existentes. No se crea automáticamente un `club_player` para OWNER/staff.

### Protección DB local, no aplicada

Nueva migration: `apps/web/supabase/migrations/20261007155811_account_staff_player_separation.sql`.

Triggers de identidad en memberships, propietarios, platform_admins, invitaciones administrativas, club_players, campos deportivos de profiles, equipos, inscripciones, invitaciones deportivas y parejas. Cambios rutinarios que no crean/activan identidad preservan históricos; cancelación/rechazo siguen disponibles. Helpers INTERNAL, search_path fijo, sin EXECUTE público/anon/authenticated/service_role ni ampliación de grants económicos.

Una fila privada de epoch por cuenta serializa nuevas asignaciones entre clubes; orden UUID determinista. La skill PostgreSQL orientó esa prevención de races, sin intervenir en concurrencia Finance. QA descartable documenta READ COMMITTED y REPEATABLE READ; **no fueron ejecutados en DB en este pass**.

`is_club_player` conserva checks de aprobación/lifecycle y añade exclusión administrativa. El helper INTERNAL de visibilidad F1D añade sólo el límite de autorización; el contrato verifica que su selección económica `return query` permanece idéntica a F1D. No cambia importe, moneda, idempotencia, journal, settlement, ranking ni lógica de pagos. La skill Supabase orientó a verificar identidad server-side y mantener los helpers fuera de Data API.

El cierre de escrituras directas/RPC concurrentes requiere aplicar y validar esta migration en un entorno autorizado. **No se declara protección live nueva mientras la migration sea local.** Ninguna migration previamente aplicada fue reescrita.

### Conflictos históricos

Auditoría read-only del dump local: 3 cuentas administrativas; **1 fila `club_players` vinculada a cuenta administrativa**, 0 memberships PLAYER mixtas, 0 equipos y 0 inscripciones con participantes administrativos. No se imprimieron identidades ni se corrigió/eliminó esa fila. Este resultado sustituye el conteo preliminar informado durante el trabajo.

El dump no contiene las tablas actuales de partnerships/invites ni el ledger Competition: esos conflictos son **desconocidos**, no cero. No se consultó producción. El QA SQL incluye una consulta de cantidades para memberships/club_players/teams/registrations/partnerships/invites/ledger, sin datos personales. La auditoría live autenticada está pendiente.

### QA de esta ampliación

- **178 tests focales PASS**, incluidos 55 de Account Role: roles STAFF/Platform/PLAYER, active-club/stale role, fallos fail-closed, asignaciones en ambos sentidos, handlers reales 403 antes de leer/escribir deporte/Finance, checkout GET/POST, guards antes de montar hijos y filtrado de ranking sin cambiar puntos/posiciones. Regresión F1A–F1F/F2 y contratos previos preservados.
- **TypeScript PASS**: `tsc --noEmit --incremental false`.
- **ESLint focal, 51 archivos:** 52 errores preexistentes frente a 52 en HEAD, **0 nuevos**; 20 warnings. No se informa cero errores globales ni se amplió el bloque para limpiar legacy ajeno.
- **git diff --check PASS**; staging inicialmente vacío y revisión focal del diff sin cambios ajenos a la ampliación. Advertencias CRLF/LF no implican errores de diff y no motivaron cambios de formato.
- **QA visual real con fixtures locales:** 114 combinaciones pantalla/rol/viewport, OWNER/ADMIN/PLANILLERO/OPERADOR/Platform/PLAYER, en 320/375/390/430/768/1280. Menús staff sin Player, Facturación sólo OWNER/ADMIN, campos personales táctiles >=44 px y fuente >=16 px, sin overflow global ni errores runtime. Screenshots mobile 320/390 y desktop 1280 inspeccionadas: se conserva el diseño aprobado, no se añadió rediseño.
- Sin sesión Club Admin live: validación E2E autenticada pendiente. Sin ejecución PostgreSQL de migration/QA, sin Advisors ni Supabase. Ningún dato real creado, borrado o modificado. Harness y screenshots sólo en `output/product-pass-1/`, excluidos.

### Archivos de la ampliación

Nuevos:

- `apps/web/lib/accountRolePolicy.ts`
- `apps/web/lib/accountRoleServer.ts`
- `apps/web/lib/accountRoleContract.test.ts`
- `apps/web/app/api/auth/account-role/route.ts`
- `apps/web/app/(app)/mi-cuenta/page.tsx`
- `apps/web/app/(app)/preferencias/page.tsx`
- `apps/web/supabase/migrations/20261007155811_account_staff_player_separation.sql`
- `apps/web/supabase/qa/20261007155811_account_staff_player_separation_validation.sql`

Modificados, todos de esta separación (además de este informe y `docs/schema-summary.md`):

- `apps/web/app/(app)/RoleGate.tsx`
- `apps/web/app/(app)/club/usuarios/page.tsx`
- `apps/web/app/(app)/mis-datos/page.tsx`
- `apps/web/app/(app)/torneos/[id]/page.tsx`
- `apps/web/app/completar-perfil/page.tsx`
- `apps/web/app/clubs/[clubId]/page.tsx`
- `apps/web/app/ranking/page.tsx`
- `apps/web/components/session/SessionProvider.tsx`
- `apps/web/components/navbar/AppNavbarClient.tsx`
- `apps/web/components/player/PlayerAccountHub.tsx`
- `apps/web/components/public/PublicHomeExperience.tsx`
- `apps/web/lib/sessionFastAuthorization.ts`
- `apps/web/lib/clubMembershipServer.ts`
- `apps/web/lib/playerPartnerships.ts`
- `apps/web/lib/clubTeamInviteErrors.ts`
- `apps/web/lib/clubTeamMemberErrors.ts`
- `apps/web/lib/clubAdminTournamentEligibility.test.ts`
- `apps/web/lib/productCompletionPass1Contract.test.ts`
- `apps/web/app/api/auth/complete-profile/route.ts`
- `apps/web/app/api/club-requests/[id]/route.ts`
- `apps/web/app/api/clubs/memberships/route.ts`
- `apps/web/app/api/clubs/request-join/route.ts`
- `apps/web/app/api/clubs/internal-users/route.ts`
- `apps/web/app/api/clubs/internal-users/candidates/route.ts`
- `apps/web/app/api/clubs/internal-users/invites/[inviteId]/accept/route.ts`
- `apps/web/app/api/clubs/[clubId]/players/route.ts`
- `apps/web/app/api/clubs/[clubId]/players/[playerId]/profile/route.ts`
- `apps/web/app/api/clubs/[clubId]/ranking/route.ts`
- `apps/web/app/api/clubs/[clubId]/competition/series/[seriesId]/ranking/route.ts`
- `apps/web/app/api/clubs/[clubId]/competition/series/[seriesId]/ranking/detail/route.ts`
- `apps/web/app/api/clubs/[clubId]/partner-invites/route.ts`
- `apps/web/app/api/clubs/[clubId]/partner-invites/[id]/accept/route.ts`
- `apps/web/app/api/clubs/[clubId]/active-partnerships/route.ts`
- `apps/web/app/api/clubs/[clubId]/tournaments/[tournamentId]/registrations/manual/route.ts`
- `apps/web/app/api/platform/create-club/route.ts`
- `apps/web/app/api/platform/users-admin/route.ts`
- `apps/web/app/api/player/finance/route.ts`
- `apps/web/app/api/player/finance/checkout/route.ts`
- `apps/web/app/api/players/[playerId]/public-profile/route.ts`
- `apps/web/app/api/search/route.ts`
- `apps/web/app/api/tournaments/[tournamentId]/public-detail/route.ts`
- `apps/web/app/api/tournaments/[tournamentId]/registration/submit/route.ts`
- `apps/web/app/api/tournaments/[tournamentId]/registration/partners/route.ts`
- `apps/web/app/api/tournaments/[tournamentId]/payments/request/route.ts`
- `apps/web/app/api/tournaments/[tournamentId]/registration-change-requests/route.ts`

### Git y límites

Rama `codex/club-admin-iphone-preview`. Cierre autorizado con commit `Enforce staff and player role separation` y destino exclusivo `origin/codex/club-admin-iphone-preview`, sin amend del checkpoint previo. Allowlist: únicamente los 55 archivos de esta ampliación enumerados arriba (incluidos este informe y el resumen de esquema). `next-env.d.ts` y todos los artefactos ajenos preexistentes quedan excluidos e intactos. Sin tocar main, Supabase, datos live ni deploy manual. SHA y resultado de push se verifican y entregan tras ejecutar Git.

Checks finales repetidos para el checkpoint: 178 tests focales PASS; TypeScript PASS; ESLint focal sin nuevos errores (52 legacy, 20 warnings); diff check PASS. No se repitió auditoría de otro dominio ni se alteró SQL/código al preparar el cierre. QA DB y E2E live autenticada siguen pendientes; la migration no se aplica como efecto de commit/push.
