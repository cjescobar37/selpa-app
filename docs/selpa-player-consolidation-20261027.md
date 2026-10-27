# SELPA — Consolidación PLAYER, 27/10/2026

## Entorno y alcance

Implementación exclusivamente en `D:\SELPA\output\pwa-universal-preview-20261015\apps\web`, rama `codex/selpa-mobile-experience-20261025`, base `5ec2b090791b34a14b0a02b957c292dececfc614`.

Se utilizó la instancia existente de Next.js del puerto 3000. URL: [SELPA local](http://10.4.21.30:3000/). No se creó otra instancia ni se cambió el puerto. No hubo push, deployment, cambios en main, dominios, migraciones ni datos compartidos.

`Start-SELPA.ps1` se conserva fuera del commit, con SHA256 `A7C425DBDD0529CCB73DEBABBA49304748B1D6B6459240EFEE724ADE990B3D50`. También permanecen fuera del commit los tres documentos de sprint que ya estaban sin seguimiento.

El adjunto disponible contenía el pedido en texto. Las imágenes de este informe son capturas nuevas del navegador local; no se presenta una comparación directa con cinco archivos originales de iPhone que no estaban disponibles en el adjunto.

## Antes y después

| Área | Antes | Resultado |
|---|---|---|
| Menú de usuario | Ocho entradas, varias repetidas en la barra inferior | Identidad que abre Perfil; Mi actividad, Mis pagos, Mi cuenta y Cerrar sesión. Filas de 50 px también en tablet y desktop |
| Cuenta | Datos, preferencias y seguridad dispersos | `/mi-cuenta` reúne los formularios y opciones existentes. `/mis-datos` conserva compatibilidad. Las cuentas administrativas conservan su formulario |
| Torneos | Listado único, tarjetas altas, errores de consulta confundidos con ausencia de registros | Agenda con Próximos, Pendientes e Historial; cada torneo aparece una vez. Fecha, club, categoría, rama, estado y detalle. Flyer pequeño solo si hay una imagen informativa |
| Ranking personal | Error genérico y ventana de vecinos | Estados específicos, exploración siempre disponible, categoría/temporada/posición/puntos oficiales cuando las lecturas funcionan; participantes públicos paginados y posición propia destacada |
| Inicio | Selector después del saludo y club repetido en varios bloques | Selector antes del saludo, integrado al bloque superior; acción próxima; agenda y progreso; clubes vinculados al final. Una sola invitación PWA después del hero |
| Detalles | Botón de resultados con estilo nativo; footer público en pantallas privadas; varias tarjetas de noticias vacías | Botón compartido SELPA; footer reservado a superficies públicas; noticias como acceso secundario compacto |

Mi actividad se conserva: es un historial cronológico de inscripciones y avisos, distinto de las próximas acciones de Inicio. Mensajes y notificaciones continúan en el navbar.

La navegación inferior aprobada sigue siendo **Inicio / Torneos / Mi ranking / Perfil**, con avatar. No se modificaron el perfil social ni su editor, ni se ocultó el indicador de desarrollo de Next.js.

## Agenda: criterio funcional

- La inscripción más reciente prevalece, incluso si cancela una confirmación anterior.
- Estados finales/cancelados, inscripción rechazada/cancelada o fechas ya terminadas van al Historial.
- Una inscripción que aún requiere confirmación va a Pendientes, siempre que el torneo no haya terminado.
- Cupos confirmados futuros, en juego o sin fecha definida van a Próximos. Los eventos en juego sin fecha final no se archivan solo por haber comenzado.
- Fechas civiles se comparan con el calendario de Buenos Aires; las tarjetas no desplazan un día las fechas sin hora.
- Una confirmación acredita el cupo. No acredita pago ni existencia de una deuda. No se añadieron lecturas financieras ni se inventaron estados de Mercado Pago.
- Los errores de Supabase se comprueban y permiten reintentar. No se muestran como una agenda vacía.

## Ranking: bloqueo real y auditoría

Se revisaron `supabase_full.sql`, `docs/schema-summary.md`, repositorio, handlers, ambas migraciones y metadatos del proyecto conectado `nenupmpjrzdxfrnwsmkx`. Solo se ejecutaron SELECT de catálogos y consultas de metadatos; no se leyeron filas personales para producir las capturas.

**Hallazgo confirmado:** no están instaladas ninguna de las diez vistas de ambas migraciones ni las RPC `read_player_career_summary` / `read_public_player_career_summary`. El historial de migraciones compartido termina en `20261008133156` (`20261008101837_product_write_flows_pass3`); no contiene las migraciones solicitadas del 09/10 y 22/10. No es evidencia de que falten puntos o resultados en el ledger.

Las relaciones base consultadas sí existen: inscripciones deportivas, divisiones, temporadas, ramas, categorías, segmentos, transacciones de puntos, homologaciones y participantes, series/divisiones/eventos, liquidaciones deportivas y premios, proyección de parejas y partidos. También existen las columnas de publicación/visibilidad requeridas en los catálogos consultados. Esto verifica dependencias de nombres y flags; no sustituye una aplicación y prueba completa sobre una copia del esquema real.

### Contrato y permisos

1. `20261009100429_player_career_read_models.sql` construye las lecturas privadas de elegibilidad, posiciones individuales, parejas, partidos, resultados y resumen. Excluye cuentas administrativas antes de calcular posiciones, exige vínculos deportivos aprobados, conserva empates y usa el ledger con reversas. Una inscripción en un torneo no demuestra participación ni victoria.
2. `20261022135243_public_sports_visibility_reads.sql` depende de la anterior. Publica solo contextos autorizados: temporada pública ACTIVE/CLOSED y catálogos visibles; resultados además requieren eventos/series públicos y homologación/finalización correspondientes. Una temporada activa por sí sola no habilita publicación.
3. Las vistas declaran `security_invoker=true`; los archivos revocan acceso de PUBLIC, anon y authenticated y conceden SELECT/EXECUTE exclusivamente a service_role. La service role permanece en backend. [La documentación de Supabase distingue la seguridad de las vistas y los permisos/RLS](https://supabase.com/docs/guides/database/postgres/row-level-security#views).
4. Los metadatos reales muestran RLS habilitado en las tablas deportivas auditadas. Las policies de lectura de temporadas, divisiones, entries y transacciones requieren administración de plataforma o `ranking:view`. No corresponde conceder SELECT general al jugador para solucionar este bloqueo.
5. `verifySelfCareer` y `assertCareerAccess` conservan la autorización propia y el contexto de club. Poseer una carrera privada no da acceso a competidores privados. Las consultas nuevas usan `public_player_standings_read` y verifican el contexto publicado antes de solicitar participantes.
6. La paginación usa los puestos del modelo oficial, nunca renumera el resultado. El resumen propio es independiente de la página; Inicio y el espacio del club conservan sus métricas aunque el jugador esté después del puesto 25.

El dump/resumen local no representan por sí solos todas las proyecciones posteriores del repositorio. La ausencia del modelo en el entorno compartido está confirmada por catálogo, además de esa diferencia documental.

### Estados implementados

`NO_OFFICIAL_RANKING`, `NO_SPORTS_ENTRY`, `PRIVATE_SEASON`, `MODEL_UNAVAILABLE`, `READ_UNAVAILABLE`, `NO_MEMBERSHIP`, `AUTH_REQUIRED` y `READY` se distinguen. Los errores no exponen mensajes SQL internos. Un fallo de permisos o transporte no se convierte en ranking vacío.

El explorador existente permite clubes y divisiones autorizados, ramas/modalidades disponibles y temporadas públicas activas o cerradas. Al cambiar temporada se limpian división/categoría/página; al cambiar rama se descarta la división anterior y solo se mantiene una categoría compatible.

La proyección individual actual limita su universo oficial a INDIVIDUAL sin segmento, ramas caballeros/damas y categorías legacy 1–7. No se amplió ese modelo desde frontend. Los contextos de parejas pueden incluir Mixto. Ampliar el universo individual requiere definición deportiva y revisión separada.

No se encontró un contrato de promoción en las lecturas ni tablas/columnas de ascenso en los metadatos consultados. Esto no prueba que no exista una política externa del club. La pantalla muestra diferencias de puntos dentro de la división cuando son públicas, y explica que no hay reglas verificables de ascenso para mostrar.

### Plan de habilitación, pendiente de autorización específica

1. Reconfirmar destino, snapshot, historial y firma de los dos archivos. Comparar columnas, tipos y funciones de cada dependencia con el esquema real completo.
2. Ensayar sobre una base aislada que represente el esquema actual: primero la migración del 09/10, después la del 22/10. No ejecutar las migraciones pendientes del repositorio en bloque.
3. Validar grants, RPC y RLS con roles reales: acceso directo denegado a anon/authenticated, exclusión de STAFF/OWNER, aislamiento entre clubes y temporadas, elegibilidad, empates, reversas y privacidad de series/eventos/divisiones. `security_invoker` no reemplaza los filtros de publicación del backend que usa service_role.
4. Revisar el resultado y solicitar autorización explícita para esos archivos y ese entorno antes de aplicarlos al Supabase compartido. No cambiar datos ni flags de publicación para obtener un ranking visible. Cualquier recarga de caché de PostgREST necesaria se informa y autoriza dentro de ese paso.
5. Después, contrastar API y pantalla con participantes, posiciones, puntos y resultados reales autorizados, incluyendo paginación y categorías vacías. Resolver temporadas ambiguas sin elegir una arbitrariamente.
6. Finalmente realizar la validación física en iPhone/PWA instalada. Sigue pendiente y no se reemplaza por emulación.

## Archivos y rutas

Rutas: `/player`, `/mi-cuenta`, `/mis-datos`, `/player/torneos`, `/player/ranking`, `/player/[clubId]`, `/ranking` y `/api/player/my-ranking`.

Componentes principales: `AppNavbarClient`, `PlayerUserMenu.module.css`, `AppShellClient`, `ModeSegmentedControl`, `HomeMobilePilot.module.css`, `PlayerAccountCenter`, `PlayerAgendaCard`, `PlayerRankingProgress`, `CareerRecentResults`, `RankingDiscovery` y `PublicRankingExperience`, con sus estilos locales. Se conservan los formularios y rutas anteriores.

Contratos/reglas: `playerAgenda.ts`, `my-ranking.state.ts`, repositorio de carrera, presentación de ranking público y contexto activo de navegación móvil. Pruebas añadidas: `playerAgenda.test.ts`, `playerConsolidation.test.ts`, `myRankingReadContract.test.mjs`; contratos existentes actualizados para paginación y el nuevo orden del selector.

## QA y evidencia

- 125 contratos aprobados: agenda, navegación, lectura personal real contra adaptador controlado, clasificación de errores, privacidad pública, SQL en PostgreSQL embebido, perfiles, sesión rápida y PWA.
- TypeScript sin errores. Build Webpack aprobado. `git diff --check` aprobado.
- Lint focal: cero errores y cero advertencias nuevas respecto de HEAD; permanecen 12 advertencias previas en componentes existentes. No se certifica lint global limpio.
- Navegador: 320, 375, 390, 430, 768 y 1280 px. Inicio/cuenta/agenda/ranking sin overflow; selector en ambos modos y persistencia tras recarga; menú compacto; tres páginas de participantes con puesto propio 53; estados de error y reintento; cambio de club con acento magenta; invitado conserva footer público.
- Navegación inferior y rutas reales del perfil y editores personal/deportivo verificadas sin guardar formularios. Accesos de Mensajes y Notificaciones del header verificados. Safe-area y modo standalone simulados; menú desktop también revisado.
- Cero errores JavaScript de página en las ejecuciones aprobadas. Las peticiones de escritura generadas por la UI durante QA se interceptaron con respuestas sintéticas, incluidas marcas de lectura y selección de club. No se crearon ni cambiaron datos reales.
- Capturas y logs en `D:\SELPA\output\player-consolidation-20261027`. `browser-report.json` y `extra-report.json` contienen el detalle de las comprobaciones.

Capturas representativas:

- [Inicio](D:/SELPA/output/player-consolidation-20261027/captures/after-home-390.png)
- [Menú](D:/SELPA/output/player-consolidation-20261027/captures/after-menu-390.png)
- [Mi cuenta](D:/SELPA/output/player-consolidation-20261027/captures/after-account-390.png)
- [Agenda](D:/SELPA/output/player-consolidation-20261027/captures/after-agenda-390.png)
- [Ranking con fixture oficial](D:/SELPA/output/player-consolidation-20261027/captures/after-ranking-official-fixture-390.png)
- [Estado equivalente al bloqueo confirmado](D:/SELPA/output/player-consolidation-20261027/captures/after-ranking-real-blocker-equivalent-390.png)
- [Safe-area simulado](D:/SELPA/output/player-consolidation-20261027/captures/after-home-safe-area-390.png)

Las capturas con nombre QA o posiciones/puntos usan datos sintéticos. No certifican lecturas deportivas reales, acreditación de pagos ni edición física desde el iPhone. La validación física y la habilitación del modelo deportivo continúan pendientes.
