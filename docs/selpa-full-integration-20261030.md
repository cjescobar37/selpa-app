# SELPA — Integración y QA, 30/10/2026

Rama: codex/selpa-full-integration-20261030. Base: 8d919e6709d676da25f83834d3b390fe0209f7dc. App canónica: apps/web.

## Integración y preservación

Se inventariaron 77 entradas pendientes de los dos entornos. La integración comparó el ancestro 2fb0628, la base móvil 8d919e6 y cada modificación local; 24 conflictos se resolvieron conservando los contratos y las composiciones posteriores de la base móvil. El inventario adyacente contiene las rutas y decisiones individuales.

Los dos originales conservan su HEAD, status y diff binario exactos. Los hashes de los 73 archivos inventariados del checkout antiguo y los cuatro del worktree móvil coinciden. Los parches y las copias de evidencia permanecen fuera de este worktree en D:/SELPA/output/full-integration-evidence-20261030. No se usaron reset, clean ni stashes.

Se incorporaron el launcher local y la documentación pendiente, las mejoras de presentación de bajas/cancelaciones de inscripción y los pasos compactos del wizard. Se conservan las lecturas deportivas oficiales, la separación entre perfil propio y público, las capacidades verificadas por request, la paginación y las mejoras aprobadas de PWA, navbar y barra inferior.

## Correcciones comprobadas durante QA

- Ranking público: Reintentar vuelve a solicitar la misma URL completa mediante recarga; conserva filtros y recupera la lectura tras los errores inyectados. En el build optimizado la transición anterior quedaba pendiente en ese caso.
- Inscripción: se eliminó la resta adicional de 22 px en la regla responsive original. El contenido vuelve a usar el único gutter de 8 px del shell.
- Edición personal/deportiva: se eliminó padding heredado de la card transparente. El hero y el formulario se alinean con el shell; inputs de 16 px y áreas táctiles se conservan.
- ESLint: se corrigieron 174 errores previos sin desactivar reglas. Se tiparon datos y errores, se retiraron casts redundantes y se corrigieron efectos/previews y componentes anidados. Las previews de imágenes administrativas se probaron con archivos locales, sin subirlos ni guardar contenido.
- Tests: runner reproducible con resolución TypeScript/aliases, dependencia PGlite declarada y bloqueo de conexiones externas. Se conservan las verificaciones deportivas existentes y se corrigió una extracción de fuente obsoleta usando el AST.

## Cambios descartados y exclusiones

- Versiones locales anteriores que quitaban controles de acceso deportivo, publicación de temporadas, aislamiento, paginación o readiness financiero: sustituidas por los equivalentes posteriores de 8d919e6.
- Perfil, navegación y PWA anteriores que regresaban la composición social, safe-area o apertura aprobadas: conservada la base móvil posterior.
- Estilos sin uso de la tarjeta antigua de Ranking: excluidos; se mantiene PublishedRankingClubCard.
- app/(app)/AppNavbarClient.tsx: duplicado obsoleto sin referencias, retirado; components/navbar/AppNavbarClient.tsx es la navegación canónica y se conserva.
- api/dev/qa-e2e-players y la página QA de torneo: excluidos. local-runtime responde 404 en producción antes de invocar git. Las rutas deportivas DEMO quedan deshabilitadas para esta rama.
- Archivos generados, .temp, ZIP, evidencias y metadatos temporales de Next/TypeScript: excluidos de la entrega. Los originales siguen disponibles.

## QA ejecutada

Node 24.22.1, Next.js 16.1.4. Resultados JSON y logs completos fuera del repositorio.

| Control | Resultado |
| --- | --- |
| Tests y contratos Node | 874/874 PASS; 0 fallos, 0 omitidos |
| ESLint | PASS, 0 errores y 128 advertencias conservadas |
| TypeScript y build final | PASS; compilación optimizada final exit 0 y validación TypeScript sin errores |
| PLAYER, pagos, facturación, cuenta y roles | 69 mediciones PASS |
| Ranking público, parejas, ramas, categorías, empates, paginación, búsqueda y reintentos | 78 mediciones PASS |
| Perfil público y estados/etapas de inscripción | 72 mediciones PASS |
| Carrera pública/propia, resumen, historial, estadísticas y autorización | 18 mediciones PASS más controles HTTP |
| Inicio, Comunidad, perfil propio, fotos, edición y temporada privada | 38 mediciones PASS más controles HTTP |
| Noticias y campañas: previews locales sin guardar/subir | 10 mediciones PASS |
| PWA | PASS: manifiesto, iconos, 22 launch images, sesión, deep links, Back/logout, no cache de lecturas privadas y safe-area simulada |
| Instalabilidad Chrome, perfil temporal no incógnito | PASS; no se instaló una app del sistema |

Viewports: 320, 375, 390, 430, 768 y 1280 px; editores administrativos también en 320, 375, 390, 430 y 1280. Se inspeccionaron capturas reales del navegador. Sin errores JavaScript ni escrituras de negocio en estas suites. Los errores HTTP de lectura se inyectaron únicamente en el servidor sintético para comprobar su manejo y recuperación.

La barra inferior PLAYER conserva Inicio, Torneos, Mi ranking y Perfil con avatar. Mensajes permanece en el header; se verificó el acceso. Los fondos de Mi espacio/Comunidad y los heroes full bleed son los aprobados; sus controles y contenido respetan el gutter exterior.

## Deportes y privacidad

El usuario confirmó resuelto el incidente del proyecto nenupmpjrzdxfrnwsmkx: migración 20261029104356 instalada, diez vistas y dos RPC HTTP 200 con service_role. No se repitieron migraciones ni notificaciones, ni se cambiaron permisos, RLS, configuración o datos compartidos.

La temporada real ACTIVE permanece privada. En el fixture aislado se comprobó que Mi ranking conserva #5 y 9.410 puntos del propietario con PRIVATE_SEASON, oculta los demás participantes y permite su Carrera privada. La lectura pública del contexto privado devuelve 404; el ranking público no revela posiciones. Se deniegan anon, STAFF y la Carrera privada de otro jugador; un userId inyectado no cambia la identidad verificada por el backend.

Las cifras anteriores son exclusivamente del fixture y no reemplazan los datos oficiales del proyecto. La verificación HTTP de la nueva Preview y su SHA exacto se registra en la evidencia de despliegue y en la entrega al usuario.

## Alcance y preparación para producción

No se ejecutó SQL ni se alteró Supabase, ledger, puntos, partidos, homologaciones o temporadas. Solo se crearon fixtures en memoria y archivos locales de QA. No se ejercieron cobros, reembolsos, liquidaciones ni operaciones de Mercado Pago.

La integración está destinada a una Preview separada. No se hace merge a main, promoción a Production ni cambios de dominios. La autorización de despliegue corresponde exclusivamente a esta rama nueva.

La certificación física de la PWA instalada en iPhone continúa pendiente, al igual que la comprobación final autenticada con la sesión real en esta Preview, incluida persistencia de fotos/ediciones. Mercado Pago no queda certificado por pruebas de lectura ni por fixtures; faltan las condiciones de proveedor/configuración para certificar cobros reales. Por ello no se declara GO de producción.
