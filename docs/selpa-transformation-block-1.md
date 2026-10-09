# SELPA — Transformation Block 1

Fecha: 2026-10-09. Aplicación: `apps/web`. Rama: `codex/club-admin-iphone-preview`. Base: `3faf4b0b2c9110d98fc82bd2c26bc0d117586cc9`.

Bloque 1 y Fase 0 cerrados en validación local. No es una certificación de funcionamiento en producción: requiere revisión de la migración de lectura, que **no fue aplicada**. Se preservaron los cambios locales ajenos. Costo de infraestructura: $0. No se comenzó el Bloque 2.

## A. Verdad deportiva

Persona = `profiles.user_id`; vínculo deportivo = `club_players.id` + `club_id`; ranking anual = temporada activa + división + rama/categoría + modalidad. Los nombres son display, nunca identidad. Un enlace antiguo con club-player resuelve la persona y su club; el enlace compartido usa usuario global y club explícito. Sin club solicitado, el contexto inicial es determinista por UUID, no un `.limit(1)` arbitrario.

Competition sigue siendo la autoridad. Individual: asignación ACTIVE, sin `valid_until`, división INDIVIDUAL activa sin segmento, ramas caballeros/damas y categorías legacy 1–7, como el lector anual existente. Puntos = suma SQL del ledger del ámbito, incluidos reversos. STAFF ≠ PLAYER se aplica antes de posicionar: se excluyen platform admins, propietarios y membresías staff no rechazadas; se requiere vínculo PLAYER aprobado y club activo.

Parejas: se reutiliza `competition_pair_ranking_projection` actual, con `pairs_division_id`. No se confunde esa división PAIRS con la división que acredita puntos individuales ni se suman las carreras de los compañeros. No se cambiaron RPCs, scoring, cálculo económico, roles ni RoleGate. La Fase 0 corrige exclusivamente la clasificación HTTP de fallos en el GET de Billing; su ruta de escritura y motor económico permanecen intactos.

## B. Demo eliminada

Se retiraron `demoRankingCategory`, `mergeDemoBranches`, nombres/puntos ficticios, “Vista demo”, sus estilos y la segunda pareja ficticia del líder individual. Un club con una sola rama muestra sólo esa rama. Vacío real y error de lectura son estados distintos; no hay fallback a legacy.

## C. Perfil público

`/jugadores/[id]` vive fuera de `(app)` y abre anónimamente. Identidad/foto/contexto salen primero; resumen, historial y recientes son lecturas independientes. Metadata específica title/description/canonical/OpenGraph textual, sólo pública. Compartir usa Web Share cuando existe o clipboard; URL global estable con club. No se agregó infraestructura OG ni QR.

## D. Perfil privado

`/perfil` dirige al jugador a `/player/carrera/[id]`. La misma presentación agrega edición y preferencias sólo allí. `/player/carrera/[id]/editar?own=1` reutiliza el editor de fotos/perfil/pareja dentro del namespace PLAYER: el enlace anterior a `/club/...` chocaba con el gate de staff. No se amplió ningún permiso.

El GET propio valida bearer y propietario antes de devolver datos privados; otro propietario recibe 403. El PATCH permanece idéntico al baseline. Al actualizar fotos, el frontend sólo mezcla identidad/preferencias, evitando que puntos legacy del DTO transicional sobrescriban el ranking canónico. Candidatos de pareja se solicitan al abrir esa función, no en la carga de carrera.

## E. Palmarés y estadísticas

- Carrera: todas las temporadas y categorías históricas del **club seleccionado**. Ranking superior: temporada activa, no un total histórico/global de puntos.
- Partido computable: PLAYED, dos equipos distintos, ganador perteneciente a esos equipos; sin BYE, WO o resolución administrativa. Un ganador nulo no es derrota.
- Victoria/derrota: comparación directa con el ganador, después del filtro computable. Efectividad = victorias / (victorias + derrotas); sin partidos, null, no un porcentaje inventado.
- Participación: homologación APPROVED vigente, no superseded; partido decidido válido o estado FINISHED con placement deportivo explícito de campeón/finalista/semifinalista. Inscripción por sí sola nunca cuenta; torneo cancelado queda fuera.
- Títulos: CHAMPION vigente. Finales incluyen títulos + RUNNER_UP; semifinalista = SEMIFINALIST como mejor tier alcanzado, no todas las rondas atravesadas.
- Un WO decidido puede sostener participación/placement oficial, pero no partidos, victorias o derrotas. NON_SCORING conserva logro deportivo; muestra cero puntos otorgados por política, no cero como fallback de un error.
- Reverso del ledger compensa puntos; no revoca un título deportivo válido por sí mismo. Homologación superseded no duplica palmarés.
- Mejor resultado disponible: rol/posición oficial vigente; sin datos, null. No mejor ranking histórico ni deltas.

Historial conserva categoría del torneo/división histórica y nombre de compañero del snapshot homologado, no categoría/pareja actual. Puntos sólo de awards publicados de esa homologación, netos de reversos; si no se publicaron, null. Fechas = programación deportiva o inicio del torneo; no `created_at`. No existe un `played_at` certificado en el modelo revisado.

## F. Ranking

Sin semilla de 240 club-players. SQL calcula posiciones sobre el universo completo del ámbito **antes** de búsqueda/rango. Empates por puntos comparten posición (`rank`, con saltos); el ordinal de navegación tiene orden estable por puntos/nombre/UUID y no cambia el puesto. La búsqueda no crea un ranking nuevo.

`/ranking`, `/ranking/damas`, `/ranking/caballeros` comparten lector. URLs canónicas incluyen `clubId`, `season`, `division`, `gender`, `category`, `modality`. Búsqueda/páginas server-side: 25 filas; catálogo de clubes paginado de 40, club seleccionado leído por UUID. PAIRS usa su división real. Los aliases privados `/player/ranking/club` y `/todos` conducen a este mismo lector; se eliminó también su renumeración client-side y descarga administrativa.

## G. Mi ranking

`/api/player/my-ranking` deriva el usuario del bearer verificado, no de un parámetro manipulable. Devuelve posición propia, hasta siete vecinos por ordinal, líder y siguiente puesto superior del mismo ámbito. `/player/ranking` no descarga el pipeline administrativo ni recalcula posiciones. “Vos” aparece también como texto en la fila propia, no sólo por color. Las distancias son de puntos actuales, no progreso histórico.

## H. Club público

`/clubs/[clubId]` consume líderes del mismo read model: una consulta de preview, hasta 12 divisiones, con población calculada en SQL. Sin consultas por cada categoría/serie, sin puntos legacy ni relleno de ramas. Se compactó la presentación de líder individual para no dejar media pareja vacía. Las lecturas previas de agenda/noticias y contadores generales del club no se reescribieron en este bloque.

## I. Home

`/player` y `/player/[clubId]` leen posición/puntos del endpoint acotado. No hay fallback deportivo a `club_players.ranking_points`; un fallo muestra ausencia de lectura. Se retiraron consultas de partidos crudos y su cálculo ingenuo de derrotas/recientes; `CareerRecentResults` carga el contrato C al abrirlo. No se rediseñó Home ni se convirtieron inscripciones en torneos jugados.

## J. Performance estructural

| Superficie | Antes | Después |
| --- | --- | --- |
| Perfil público | Ficha/editor y lectura de equipos/inscripciones/partidos | Identidad allowlist + agregado; editor fuera de la carga pública |
| Historial/recientes | Colecciones completas ligadas al perfil | Lazy, 10 filas + una de control `hasMore`, filtrado en SQL |
| Ranking público | 240 registros elegidos por puntos legacy | Universo SQL completo; 25 filas por página |
| Mi ranking/Home | Pipeline administrativo y partidos crudos | Hasta 7 vecinos + 2 referencias; recientes lazy |
| Preview club | Ranking legacy/falso | Una consulta pequeña de líderes; sin N+1 por división |

DTOs medidos en fixture local: resumen 1.816 bytes; historial 1.284; recientes 777; mi-ranking 6.789 con siete vecinos. No son benchmarks de producción ni estimaciones de mejora de LCP. El backend valida roles/vínculos y catálogos pequeños; no descarga ledger, padrón completo, matches ni fan-out de series para estos lectores. Home conserva sus otras lecturas funcionales fuera del alcance.

## K. Cache y loading

API deportiva `no-store`, endpoint propio `private, no-store`, páginas públicas dinámicas. React `cache` sólo deduplica identidad dentro del render/metadata del request, no entre usuarios. No hay caché persistente que invalide mal una corrección: la siguiente lectura obtiene el estado actual. No se promete actualización push de una pantalla ya abierta. Identidad sobrevive a falla de estadísticas; skeletons sin números ficticios, historial/recientes separados y requests abortables.

## L. Privacidad

Allowlist pública: nombre, fotos públicas, IDs/contexto de club, rama/categoría y hechos deportivos. No contactos, cumpleaños, pagos, solicitudes, mensajes, settings ni acciones staff. Comprobado en JSON, HTML inicial/props y metadata anónimos. Datos privados sólo en GET propio autorizado. Nuevas views `security_invoker`; SELECT/EXECUTE revocados a public/anon/authenticated y concedidos sólo a service_role. No se cambiaron políticas RLS ni se hizo público JSON administrativo.

## M. Mobile y UX

Chrome real local: 320, 375, 390, 430, 768, 1280 para perfil, ranking y club; capturas inspeccionadas, no sólo CSS. Sin scroll horizontal. Identidad compacta con avatar 64, contexto explícito, cifras tempranas; tabs underline verde con teclado; controles nuevos >=44px e inputs 16px. Filas de ranking compactadas, sin metadata repetida; labels y foco visibles. También revisados propios, editor y estado de fallo a 390.

Capturas: `output/block1-qa/screens/`. QA UX aprobada para las superficies deportivas intervenidas, no para toda la Home/club: los heroes y placeholders editoriales preexistentes siguen pendientes del master review. Safari/iOS nativo, Web Share del dispositivo, teclado virtual y upload/envío real de pareja no se certificaron. No se enviaron formularios ni se crearon datos reales.

## N. Tests y QA técnica

- `node --test lib/playerCareerContract.test.mjs`: 14/14, contra PostgreSQL embebido PGlite ejecutando la migración real. Multi-club, nombres/clubes repetidos, cero partidos, winner null, BYE/WO/admin, inscripción cancelada, non-scoring, campeón/finalista/semi, superseded/reversal, categoría/pareja histórica, temporadas cerradas y paginación; 310 jugadores y ledger adicional de 1.501 movimientos, sin truncamiento.
- Chrome/Playwright contra rutas Next reales + Data API PostgreSQL sintética localhost: búsqueda #5 permanece #5 en seis viewports, PAIRS en división 21 con award conjunto una vez, aliases, perfil sin login, ausencia de campos privados, staff 404, bearer inválido 401, propietario ajeno 403, loading/error sin borrar identidad, copiar URL pública, acceso a editor PLAYER, Home con 9410/55 separados. Sin errores JavaScript ni requests externos en la última corrida.
- Contratos pertinentes: 390/390 en extended tiers, pipeline, series-pairs, snapshot-consistency, Product Completion Pass 1/2/3, account-role, Player Finance F1D, Platform Billing F2, PageHeader Finance UI y session authorization. Homologation review + ranking avatars: 6/6 con el runner nativo de Node. Más carrera: 14/14. Total: **410/410**. No se presenta como corrida de todos los tests del repositorio.
- TypeScript sin emit: pasa. ESLint focal: 0 errores, 16 advertencias preexistentes (4 dependencies de hooks y 12 imágenes, incluyendo navbar y cuenta STAFF ahora dentro del alcance). Next production build: pasa, 144 páginas estáticas; Supabase apuntó sólo a localhost con claves ficticias y pagos de proveedor deshabilitados. `git diff --check`: pasa; advertencias LF/CRLF no son errores de whitespace. Browserslist informó que su catálogo local tiene seis meses; no se actualizó una dependencia ajena al pedido.

Los dos contratos heredados están resueltos y todos los checks pertinentes pasan. Intentos de QA que detectaron el enlace staff y un conflicto temporal de cache Next se corrigieron y rerunearon. El servidor dev propio usa dist aislado bajo `.next/dev/`; no se detuvo el servidor del usuario. Los dos procesos locales propios de QA se detuvieron al finalizar.

Reproducción: instalar PGlite/tsx sólo en carpeta QA descartable (no dependencias del producto), o configurar `SELPA_QA_MODULES`. Ejecutar `scripts/qa/block1-server.mjs`, luego `block1-web.mjs` con URL `http://127.0.0.1:45432` y claves ficticias; `block1-browser.mjs` usa Chrome/Playwright configurables mediante `SELPA_QA_BROWSER` y `SELPA_PLAYWRIGHT_PACKAGE`. Nunca ejecutar estos fixtures contra Supabase real.

## O. Migración pendiente

`apps/web/supabase/migrations/20261009100429_player_career_read_models.sql`: cinco views de lectura (`player_sports_eligible_read`, `competition_player_standings_read`, `player_career_matches_read`, `player_career_results_read`, `competition_pair_standings_read`) y un agregado `read_player_career_summary`.

Necesaria para rankear/agregar antes de paginar y no descargar ledger/rosters ni depender del límite del proveedor. No inserta/actualiza datos, crea triggers, cambia RLS ni reemplaza el engine. Backfill: ninguno. Costos: ninguno. Requiere las migrations actuales de Competition, full placements y la proyección PAIRS que incluye `pairs_division_id`. El dump/schema-summary revisados son anteriores a esa evolución; no se asumió que el dump describe el estado live. Verificar catálogo/prerrequisitos y planes reales antes de aplicar manualmente en otra tarea autorizada. Mientras falten estos objetos, la app conserva identidad y presenta “lectura pendiente”, no números legacy.

## P. Pendientes y límites

Revisión/aplicación autorizada de SQL y comparación read-only con datos/planes del entorno destino; validar índices existentes y EXPLAIN para volumen real. No afirmar que payload pequeño equivale a costo SQL constante. No se añadieron infraestructura, materializaciones ni índices especulativos.

Esta entrega expone ranking anual activo; no mezcla circuitos ni inventa un ranking global. Las lecturas/snapshots específicos de circuitos y temporadas cerradas de Competition siguen intactos, sin selector público nuevo ni spoof de autorización. La carrera sí incluye temporadas cerradas. No hay backfill de torneos legacy sin homologación, ni fecha efectiva de juego certificada; el fallback histórico usa el torneo/división, nunca categoría actual del jugador. Los contratos heredados se corrigieron preservando las invariantes y sin alterar el engine.

La fixture de Data API no implementa endpoints auxiliares de partners/publicidad/noticias completos: pueden responder errores controlados, y eso no acredita los flujos de envío/upload. La lectura canónica de pareja/resumen se prueba; las escrituras existentes se preservan pero no se ejecutaron.

## Q. Archivos y Git / commit / push

Lectores nuevos: `apps/web/features/player-career/{types,rules,repository,compat}` (archivos con prefijo `player-career.`). Componentes nuevos: `CareerExperience.tsx/.module.css`, `CareerRecentResults.tsx`, `PublicRankingExperience.module.css`. Se actualizan los dos componentes públicos y `PairRankingBoard`, más los estilos públicos estrictamente de ranking/demo.

Rutas: nueva pública `app/jugadores/[id]` + loading (se elimina alias dentro de `(app)`); privadas `player/carrera/[id]` y `/editar`; `perfil`, ambos Home, ranking personal y adapter ranking-club; ranking/club públicos; API career, my-ranking y adaptadores public-profile/GET propio. Tests/QA: `lib/playerCareerContract.test.mjs`, cuatro scripts `scripts/qa/block1-*.mjs`, migración indicada y este reporte. Master review sólo recibe nota de estado; su auditoría se conserva.

Fase 0 también modifica `AppNavbarClient.tsx`, `mis-datos/page.tsx`, `mi-cuenta/page.tsx`, `PlayerAccountHub.tsx`, `ProductFlow.module.css`, `BillingExperience.module.css` y el GET de `platformBillingF2Server.ts`. Actualiza los contratos de cuenta, errores de Billing y los dos contratos heredados; agrega `phase0-finance-fixture.mjs` y `phase0-browser.mjs`. Las páginas y el API de pagos existentes no necesitaron cambios funcionales.

Entrega autorizada únicamente en `codex/club-admin-iphone-preview`, con mensaje de commit `Build trusted player career and ranking`; hash y resultado del push se informan en la entrega y el historial Git. Sin merge/main, deployment manual ni cambios Supabase reales. Artefactos automáticos de tsconfig/tsbuildinfo se restauran; `next-env.d.ts` conserva el cambio preexistente del usuario. Untracked ajenos, archivos QA previos, ZIPs, stashes y trabajo local no se incluyen ni borran. Sólo se crearon datos sintéticos descartables y capturas QA locales. La auditoría master previamente local se incorpora conservando su contenido y actualizando sólo su nota de estado.

## R. Cierre solicitado: contratos heredados y Fase 0

### A. Dos contratos heredados

Ambos fallos se reprodujeron antes de editar los tests. `git diff --exit-code HEAD --` sobre ambos contratos y el endpoint dio cero: el código que fallaba era idéntico al HEAD base `3faf4b0`, no una regresión del Bloque 1.

| Contrato | Causa y corrección válida | Resultado |
| --- | --- | --- |
| `competitionPointsSchemeSnapshotConsistencyContract.test.ts` | Dos referencias inexistentes en HEAD: migración `20260930161656...` y QA `noviembre_master_published_settlement_correction_plan.sql`. Se usa la migración real `20261001105639...` y el QA histórico read-only `noviembre_master_published_settlement_validation.sql`. Se conservan las ocho invariantes: esquema congelado exacto de siete tiers, ledger, reversión y refresh; se comprueba una reversión y neto cero. No se ejecutó otra corrección histórica ni se modificó SQL. | 8/8 |
| `competitionSeriesPairRankingContract.test.ts` | Regex de un retorno anterior al enriquecimiento y exclusión STAFF, ya existente en base. Se reemplaza esa comprobación de formato por ejecución del handler y su presentación real: abierto/cerrado, PAIRS opt-in, puestos/puntos sin renumerar, STAFF excluido, ámbito club/serie, snapshots sin RPC y autorización antes de leer. Las invariantes deportivas SQL originales permanecen. Endpoint productivo sin cambios. | 12/12 |

### B. Fase 0 transversal

La Fase 0 **no estaba completa** en la entrega anterior: el shell ya tenía 8 px, pero había padding adicional en carrera/ranking, Billing y formularios; STAFF aún ofrecía accesos paralelos a preferencias/seguridad; Billing confundía fallos inesperados con solicitudes inválidas. Se completó ahora.

| Componente | Estado real y evidencia local |
| --- | --- |
| Gutter exterior | Un único gutter de 8 px en 320/375/390/430. Root/header x=8 y ancho viewport−16; shell padding=8 e interior=0. Sin esconder overflow. Tablet/desktop preservados. |
| STAFF / Mi cuenta | OWNER, ADMIN, OPERADOR, PLANILLERO y PLATFORM tienen Mi cuenta como centro único. Datos personales, Preferencias y Seguridad accesibles dentro del hub; no enlaces duplicados a ajustes/reset en menú. PLAYER mantiene su navegación deportiva. |
| `/club/facturacion` | OWNER/ADMIN: resumen, facturas y pagos con/sin movimientos. Sin plan ni movimientos muestra vacío real. Errores de resumen/listado muestran fallo y reintento, no balance cero ficticio; 503 inesperado, 403 permisos, 400 entrada inválida; `private, no-store`. |
| `/player/pagos` | Vacío, pendientes parciales, pagados/cancelados, TEAM y reversos, listado vacío, error de resumen/listado y recuperación por reintento comprobados. No se generaron cobros ni se disparó checkout. |
| Permisos | JWT verificado en APIs reales contra auth sintético. STAFF→player finance 403; PLAYER→200; anónimo/token inválido→401. Billing OWNER/ADMIN propio→200, club ajeno/PLAYER/OPERADOR/PLANILLERO/PLATFORM sin membresía→403. Gates de páginas redirigen antes de montar la superficie restringida. No se ampliaron capacidades. |
| Error ≠ vacío | Comprobado en DOM y API; fallos inyectados nunca presentan “sin movimientos” o cifras inventadas como si la lectura fuera exitosa. Reintento recupera los datos. |

### C. QA final

410 contratos pertinentes, TypeScript, build y diff-check pasan. Lint: cero errores y 16 warnings heredados. Chrome real: 320, 375, 390, 430, 768 y 1280; revisión visual de capturas. Fase 0 midió 69 estados/layouts (11 superficies en seis tamaños y tres errores), más menús STAFF mobile/desktop. Sin overflow ni errores JavaScript; cero escrituras económicas. Carrera/ranking/club también se reejecutaron en seis tamaños.

Reproducción Fase 0: mismos `block1-server.mjs` y `block1-web.mjs`; ejecutar `scripts/qa/phase0-browser.mjs`. Capturas: `output/block1-qa/phase0/`. Los cinco RPCs financieros de lectura usan respuestas sintéticas; la autorización y rutas Next/API son reales, pero esto **no valida ejecución del motor financiero en una base live**. El browser bloquea toda conexión exterior y escritura financiera; dos intentos de iconos legacy de login en svgrepo quedaron bloqueados, no hubo llamada a un proveedor de pagos.

### D–E. Límites y migración

No se certifican Safari/iOS nativo, teclado/Web Share de dispositivo, producción live, checkout/proveedor ni upload/envío real de pareja. No se ejecutaron los endpoints auxiliares legacy completos del club ni toda la suite del repositorio. No hubo datos reales, costo de infraestructura, aplicación de migraciones ni deploy manual. Migración de lectura pendiente y justificación: sección O; necesaria para que los lectores nuevos existan en el destino y para posiciones/agregados completos antes de paginar, sin cambiar semántica deportiva ni datos económicos.
