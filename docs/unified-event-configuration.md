# Configuración unificada de fecha

Se mantienen Tournament y Competition separados en persistencia.
La configuración vive en un único editor de fecha, con bloques colapsables.

| Campo | Antes | Fuente canónica |
| --- | --- | --- |
| Nombre, inicio/fin generales, sede, dirección, visibilidad, timezone | Editor de fecha | competition_series_events |
| Cierre de inscripciones | Editar torneo | tournaments.registration_deadline |
| Mínimo/máximo y precio por jugador | Editar torneo | tournaments.min_pairs/max_pairs/price_per_player |
| Sistema deportivo | Editar torneo | tournaments.rules_json.competition_system |
| Cronograma grupos/playoff y duración | Editar torneo | tournaments.rules_json.schedule_config |
| Canchas configuradas para planificación | Editar torneo | tournaments.rules_json.tournament_courts |
| División, nivel, puntos/sin puntos, esquema | Editor de fecha | competition_series_event_divisions y regla del circuito |

signup_deadline y rules son espejos legacy ya usados por la API existente, no
campos nuevos ni fuentes independientes en Competition. No se copiaron datos
de Tournament a competition_series_events.

## UX y permisos
Fecha abre lo esencial. Torneo resume sistema, cierre y parejas; sus parámetros
adicionales se agrupan en Más opciones. Competencia muestra la división real,
nivel/modalidad/esquema y distingue la herencia del circuito.
Guardar fecha y Guardar torneo son operaciones explícitas separadas.
No existe una transacción conjunta entre motores: no se simuló atomicidad.
Completar configuración sólo se usa cuando hay blockers persistidos;
sin ellos el CTA dice Configurar fecha.

## Guardas
La edición estructural completa sigue disponible sólo en DRAFT sin hitos.
El editor unificado refleja getTournamentEditableCapabilities, revalidado por
el backend a partir de status, snapshots, grupos, partidos e inscripciones.
OPEN sin hitos permite cierre, máximo, precio, canchas, cronograma y logística.
El mínimo de parejas y la configuración Competition siguen siendo estructurales.
Cambiar sistema en OPEN exige confirmación explícita; bajar el máximo por debajo
de las inscripciones confirmadas se rechaza con un mensaje humano.
Con seeds/grupos/partidos sólo siguen disponibles canchas, cronograma y logística;
timezone queda bloqueada al generar grupos/partidos. Los estados terminales no
permiten edición. Los campos bloqueados permanecen visibles con su explicación.
Un error al verificar bloquea la edición. El bloque operacional exige
expected_updated_at y condiciona el UPDATE al status y timestamp leídos.
No cambia flyer, points_config, identidades, vínculo al circuito o snapshots.
Los conflictos de concurrencia devuelven 412, sin guardar.

## Horarios y campos avanzados
Los dos editores convierten el cierre con los mismos helpers de timezone.
El editor del torneo obtiene timezone de la fecha vinculada a través del
contexto Competition existente; si falta, propone la del navegador.
La fecha general no se confunde con ventanas deportivas de grupos/playoff.
Flyer, descripción pública, identidad/categoría deportiva, desempates y
configuración legacy de puntos permanecen en el editor avanzado del torneo:
no se copiaron ciegamente al bloque operativo.
Las asignaciones físicas tournament_court_assignments son un modelo distinto
de las canchas declaradas en rules_json; este cambio no reemplaza asignaciones.

## Archivos
- apps/web/app/(app)/club/competition/EventTournamentConfiguration.tsx (nuevo).
- apps/web/app/(app)/club/competition/SeriesEventsAdmin.tsx y .module.css.
- apps/web/app/(app)/club/competition/EventOperationsDashboard.tsx.
- apps/web/app/(app)/club/torneos/[id]/editar/page.tsx.
- apps/web/lib/tournamentOperationalConfiguration.ts y Server.ts (nuevos).
- apps/web/app/api/clubs/[clubId]/tournaments/[tournamentId]/configuration/route.ts (GET nuevo).
- apps/web/app/api/clubs/[clubId]/tournaments/[tournamentId]/route.ts.
- apps/web/features/competition/events/competition-events.repository.ts y .types.ts.
- apps/web/lib/tournamentOperationalConfiguration.test.ts (nuevo).
- apps/web/lib/competitionEventEditorContract.test.ts.
- mobile-review/event-polish-qa.mjs (mocks y QA visual).

No SQL, migraciones, datos reales ni acciones deportivas/publicación durante QA.
Los tests estáticos y mocks no prueban persistencia PostgreSQL real.

## P0.1 — archivos de este ajuste

- lib/tournamentOperationalConfiguration.ts: matriz por campo y validaciones.
- lib/tournamentOperationalConfigurationServer.ts: hitos, inscripciones confirmadas y timezone vinculada.
- lib/tournamentOperationalConfiguration.test.ts: estados y cambios permitidos/rechazados.
- app/api/clubs/[clubId]/tournaments/[tournamentId]/configuration/route.ts: capacidades según rol.
- app/api/clubs/[clubId]/tournaments/[tournamentId]/route.ts: revalidación granular y actualización sólo de cambios.
- app/(app)/club/competition/EventTournamentConfiguration.tsx: permisos y confirmación de sistema.
- app/(app)/club/competition/SeriesEventsAdmin.tsx: permisos de fecha y Competencia.
- app/(app)/club/competition/SeriesEventsAdmin.module.css: razones legibles y estados disabled.
- app/(app)/club/competition/TimezoneSelector.tsx: bloqueo accesible.
- features/competition/events/competition-events.handlers.ts: revalida identidad, logística, configuración y vínculo.
- mobile-review/event-polish-qa.mjs: fixtures OPEN/seeds/grupos/partidos, guardado seguro y QA responsive.
- Esta documentación.

Validación local P0.1: 23 tests focales; TypeScript y ESLint focal PASS.
QA mock OPEN y seeds congelados en 375/390/430/1280; grupos y partidos en 390.
Se verificó guardado de cierre en OPEN y cronograma con universo deportivo bloqueado.
No se consultaron ni modificaron datos reales; el reintento real desde UI queda a cargo del usuario.
