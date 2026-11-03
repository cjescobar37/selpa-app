# SELPA — Sprint Club Admin, 02/11/2026

## Base y autorizaciones

Checkout C:\SELPA; rama nocturna codex/club-admin-overnight-20261102 desde d1bbaf9016b830d07a5c6d8f5d867ea5fcb3b73f. Consolidación PLAYER publicada con autorización del pedido adjunto y comprobada directamente con ls-remote. Integración remota 9c28abc e integración local aa9cfac intactas. Stashes vacíos. El usuario autoriza checkpoints propios en rama nocturna, sin merge ni deployment ni datos reales.

## Implementación del primer hito

- Torneos: búsqueda sobre todo el catálogo cargado, no solo últimos cinco. Normalización sin acentos. RUNNING/LIVE/PAUSED siguen activos aunque la fecha de inicio ya pasó. No cambia Engine ni puntos. Catálogo remoto sigue acotado a 100 por contrato previo: paginación server-side pendiente.
- Flyers: resuelve poster manual real con el mismo helper canónico de PLAYER; conserva composición administrativa compacta existente.
- Fechas: fechas de negocio YYYY-MM-DD se interpretan al mediodía para impedir el corrimiento al día/mes anterior por UTC. Aplicado al listado, agrupación y agenda del dashboard. Fechas inválidas en listado muestran Sin fecha.
- Dashboard: crear torneo/circuito, gestión de jugadores y solicitudes usan capacidades canónicas del rol; no se ampliaron permisos. Cierres urgentes solo si no vencieron y ocurren dentro de 48 horas. Métrica de resumen renombrada En agenda porque representa la lista acotada devuelta por la API, no total exhaustivo.
- Aislamiento: Torneos y Estadísticas remontan su contenido al cambiar club/usuario/rol; filtros, filas y resultados anteriores no viajan al siguiente club. Estadísticas descarta respuesta abortada. No se cambiaron consultas ni datos reales.
- Fixture existente permite persona STAFF explícita mediante SELPA_QA_CLUB_ROLE (solo OWNER/ADMIN/OPERADOR/PLANILLERO), sin alterar default PLAYER. Relaciones sintéticas vacías para lecturas de grupos/circuitos y categorías QA. Ningún forward o escritura administrativa.

## Validación y alcance

- QA inicial: 902 tests, TypeScript y build PASS. Lint 0 errores/129 avisos; identificó import no conectado al filtro activo, corregido antes de la versión final. Durante revisión visual se detectaron fechas un día antes y falso urgente vencido; corregidos y agregados tests. QA final se registra al cerrar abajo.
- IAB con ADMIN ficticio: carga de catálogo administrativo y dashboard, búsqueda juego encuentra el evento fuera de los cinco recientes; flyer manual visible. Menú aprobado verificado: Administración del club, Mi cuenta, Ver página pública, Facturación SELPA y Cerrar sesión. No se abrió ningún submit o acción financiera.
- Dashboard medido en 320/375/390/430/768/1280 sin overflow; screenshot real del catálogo a 390. La primera captura detectó el corrimiento de fechas y no se presenta como imagen final correcta. Falta validación física iPhone y sesiones reales.
- PLAYER se conserva desde d1bbaf9 y sus 900 pruebas previas están incluidas en suite nocturna. No se rehace diseño aprobado.

## Áreas revisadas, pendientes y límites

- B1/B2: implementación anterior. API summary limita muestra a 30 y agenda a cinco; puede omitir RUNNING en su consulta actual. No certificar total de torneos del club mediante esa muestra. Pendiente conteo/consulta exhaustiva como hito backend de solo lectura con tests específicos.
- B3: menú, capacidades y equipo/roles inspeccionados; tests existentes incluidos. No se certificó gestión real de solicitudes ni invitaciones ni cambios de rol. No se ampliaron permisos para arreglar UI.
- B4: contabilidad/facturación inspeccionadas en código; existen guards y estados de errores/reintento. Ningún pago, reverso, cierre ni settlement ejecutado. Ledger real y facturación integral quedan pendientes.
- Creación/edición de torneos, pareja/cupos, publicación y resultados deportivos reales requieren recorrido autorizado; sin seeds o escrituras. Circuitos y homologación intactos.
- Estadísticas con fechas y permisos reales y carrera de cambio rápido de club requieren QA específica adicional; el aislamiento por key está implementado y compila, no se presenta como ensayo físico o con multi-club real.

## ESTADO PARA CHATGPT / recuperación en banco

La rama nocturna contiene la consolidada; no hace falta mezclar manualmente casa/banco. Después de verificar el SHA remoto del checkpoint, en el worktree canónico del banco comprobar ruta, status, índice, HEAD, remoto y stashes. Con trabajo pendiente protegerlo; no hacer switch ni pull que lo arrastre.

Con checkout limpio: git fetch origin; git switch --track -c codex/club-admin-overnight-20261102 origin/codex/club-admin-overnight-20261102. Si ya existe inspeccionar divergencia y solo permitir pull --ff-only compatible. Comparar SHA recibido con informe y exigir divergencia 0/0; leer AGENTS.md y SELPA_CONTINUIDAD.md antes de seguir en apps/web. No copiar .env ni chats. Ningún merge a integración/main.

Próximos tres objetivos: (1) conteos y estados fiables del summary de dashboard, (2) QA de cambios rápidos de club/rol y lecturas de estadísticas/finanzas con fixtures completos, (3) recorrido mobile de creación/edición/inscripciones sin submit real y validación física de iPhone.

## Cierre validado del checkpoint

- Suite final: 904/904 PASS, 0 fallos/omitidos (124,7 s). TypeScript final código 0; ESLint final 0 errores/128 advertencias. Build final PASS, 166 páginas y compilación 17,0 s. Build intermedio se reejecutó porque QA encontró fechas/urgencias incorrectas; no se hereda su PASS a la versión corregida.
- HTTP sintético actual: summary y tournaments verificados cada uno guest401 / ADMIN200 / otro club403 (seis comprobaciones). QA visual final: 1 nov–1 dic permanece en noviembre, cierre vencido ya no aparece urgente, búsqueda encuentra evento fuera de cinco; dashboard y catálogo sin overflow en 320/375/390/430, dashboard además 768/1280. Menú cuenta aprobado preservado.
- Fixture de RUNNING sin partidos devuelve summary operativo INSCRIPCIONES y la card administrativa conserva ese badge. No se inventa fase deportiva; falta revisar coherencia raw-status/summary con fixtures deportivos completos antes de certificar estados operativos. Engine intacto.
- Todos los logs permanecen ignorados en output/club-overnight-*.log. No se incluyen entornos ni tokens reales. Archivos de producto: club/page.tsx, club/torneos/page.tsx y club/estadisticas/page.tsx; helper/test clubTournamentCatalog y fixture block2-server; continuidad y este informe. No se modifican PLAYER, APIs de datos ni esquema.
- Se autoriza este checkpoint únicamente en codex/club-admin-overnight-20261102. SHA resultante y presencia remota se informan al cerrar; el documento no intenta contener su propio hash. Sin deployment manual, sin main ni integración. iPhone, sesión real y operaciones administrativas siguen pendientes.
