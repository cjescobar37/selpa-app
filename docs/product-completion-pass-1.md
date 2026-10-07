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
