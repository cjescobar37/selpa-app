# SELPA — DEMO aislada de Ranking 2.3, 05/11/2026

Estado: **Preview READY**, deployment **dpl_128wfDScHnJmwuFQZVz24VNWHbqZ**. URL: **https://selpa-6mw48eueu-selpaapp-2619s-projects.vercel.app/preview/demo**.

## Uso

- Parejas/Caballeros por defecto: 12 parejas, Top 5 y clasificación hasta #12, dos fotografías ilustrativas preexistentes, nombres largos y fallback de iniciales. Individual Caballeros: 10 jugadores. Se usa PublicRankingExperience real, sin modificar su CSS.
- Damas conserva el fixture histórico: 3 parejas y 6 individuales. Mixto conserva una pareja del fixture QA y muestra Individual mixto pendiente; no se simula una capacidad deportiva inexistente.
- Categorías, búsqueda por nombre sin renumerar puestos, temporada y grupos usan los controles existentes. Libres contiene las parejas; General y 7ª Individual sirven para probar vacío. Al volver de Individual a Parejas, la compatibilidad de grupo del componente real puede seleccionar General: elegir Libres para recuperar el listado. No se cambió esa regla del producto durante una tarea de DEMO.
- Aviso visible DEMO · DATOS FICTICIOS y pie sintético. Los destinos de perfiles se desactivan solo en este ranking DEMO; no conducen a datos reales.

## Aislamiento

- Guard servidor **VERCEL_ENV === preview**, antes de leer parámetros. No depende de rama Git ni de un query manipulable. En Production/Development la ruta devuelve 404. La ruta/API histórica de Carrera mantiene su guard de rama anterior; no se amplió su alcance.
- Los filtros permanecen en /preview/demo. rankingSearchParams del ranking real sigue ignorando demo/scope; no se cambió ninguna API deportiva. Los IDs de clubes/temporadas recibidos por la DEMO se reemplazan por IDs de fixture, sin lectores deportivos, SDK ni SQL en su loader.
- Snapshot de output/ranking23-c-20261104-zEaFrr/qa-data.json, más fixtures históricos Damas y Mixto. No hay puntos individuales de pareja inventados: solo total de la dupla; los campos de contribución quedan en cero y no se muestran.
- El shell real recibe, solo en esta ruta y con flag servidor Preview, un contexto invitado estático. SessionContext se separó del resolver vivo, que conserva idéntico cuerpo de implementación y reexports compatibles. El resolver no se monta dentro de DEMO, aunque haya una sesión guardada.
- Se diferió la carga del SDK de Navbar/clubAssets hasta acciones reales fuera de DEMO; los helpers de iniciales y URLs permanecen puros. El buscador global no consulta cuentas en DEMO; la búsqueda de ranking sí funciona. Prefetch de navbar/bottom nav desactivado en este contexto para evitar cargas ajenas. Salir de DEMO hace navegación explícita a la app real.
- Sin cambios en Supabase, temporadas, permisos, publicación, cálculo, Carrera, SQL ni diseño. El CSS canónico conserva SHA-256 **95993c93e477ba5cf55c76ab9937593a8aab5240c2a9ab20f9e2e69b6f949e89**.

## QA ejecutada

- **76/76 tests focales PASS**, incluyendo entorno/guard previo a parámetros, ruta real, contratos, normalización, búsqueda, capacidades, sesión y Perfil.
- **TypeScript PASS**, lint sin errores. Los 8 warnings de Navbar (2 hooks y 6 img) coinciden con la fuente previa; no se añadieron warnings. Build local y remoto **167/167**, funciones y salida Next reales. Diff check PASS.
- **13 capturas locales** en browser real, 320/375/390/430; cambios de modos/ramas/categoría, grupos, búsqueda y clasificación. Sin overflow ni fotografías fallidas. Individual revisado en 390. **3 capturas remotas en 390**, pares/individual y Top 5.
- Receptor sintético loopback: **0 llamadas** durante la DEMO invitada y **0 llamadas** tras guardar una sesión ficticia y usar modos/búsqueda. La preparación de login y cierre se hizo contra el receptor local; ninguna cuenta real fue utilizada. La sesión de QA fue cerrada por la UI.
- Mismo build con entorno Production **local**: 4 casos 404, aun con query de habilitación, sin fixtures en la respuesta; /ranking?demo=1 responde sin datos sintéticos. No se desplegó Production.
- En Preview real: **10 combinaciones HTTP200** con conteos esperados 12/10/3/6/1/0, búsqueda conserva #2, categoría/vacío/IDs ajenos sin escape; 2 JPEG HTTP200. Cache-Control privado/no-store. No se inició sesión ni se guardaron datos durante QA remota.
- Un solo deploy Preview. Siete archivos fuente clave coinciden por hash remoto. Manifiesto SHA-256 **e3bc2c921e294ab78e076ff8ba4eab0ac918533080b4e2359c11eaa9e86d4118**, 840 archivos / 39.786.724 bytes; .env/SQL/evidencias/scripts internos excluidos.
- Production selpa-app.vercel.app sigue en **dpl_EhpxrmcQVzr2eWzAVywaJqdwi4BY**. Configuración de protección Preview comparada antes/después y sin cambios. No se crearon enlaces de bypass ni se desactivó protección.

## Archivos de esta tarea

- apps/web/app/layout.tsx
- apps/web/app/preview/demo/page.tsx
- apps/web/components/ActiveClubThemeProvider.tsx
- apps/web/components/AppShellClient.tsx
- apps/web/components/navbar/AppNavbarClient.tsx
- apps/web/components/navigation/MobileBottomNav.tsx
- apps/web/components/public/PreviewSportsNotice.tsx
- apps/web/components/public/PublicRankingExperience.tsx
- apps/web/components/ranking/RankingEntryFrame.tsx
- apps/web/components/session/SessionProvider.tsx
- apps/web/components/session/SessionContext.tsx
- apps/web/lib/clubAssets.ts
- apps/web/features/preview-sports-demo/ranking-demo-data.ts
- apps/web/features/preview-sports-demo/ranking-qa-fixture.json
- apps/web/lib/previewSportsDemoContract.test.mjs
- apps/web/lib/previewRankingDemoContract.test.mjs
- docs/SELPA_CONTINUIDAD.md y este informe.

Los otros cambios pendientes de Ranking 2.1/2.2/2.3 se preservan. Rama **codex/club-admin-overnight-20261102**, HEAD base **e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71**, remoto coincidente verificado esta sesión. Índice y stash preservados. **Sin commit/push/merge**; snapshot local en Preview, todavía no transferible por GitHub a otra PC.

Evidencia local ignorada por Git: output/ranking23-demo-preview-20261105-DIQazz (tests, build, producción local, contadores de red, capturas y pruebas HTTP remotas). next-env/tsconfig generados fueron restaurados; servidores sintéticos propios cerrados. Pendiente: prueba física en Safari/iPhone/PWA y aprobación visual del usuario; Mixto individual y SQL siguen pendientes.
