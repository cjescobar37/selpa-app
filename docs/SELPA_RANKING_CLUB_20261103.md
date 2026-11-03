# Ranking de Club — auditoría y decisiones, 03/11/2026

Implementación sobre codex/club-admin-overnight-20261102, base 5417dc2.
Checkout: D:\SELPA\output\selpa-full-integration-20261030. Checkpoint de código/documentación autorizado por el usuario; SHA y verificación de publicación en el informe de cierre y el historial Git. Sin deployment ni cambios compartidos.
Proyecto inspeccionado: nenupmpjrzdxfrnwsmkx. Solo catálogo/definiciones/permisos; ninguna consulta de jugadores, movimientos o credenciales en la base compartida.

## Fuentes y límites

Se leyeron AGENTS.md, SELPA_CONTINUIDAD.md, supabase_full.sql y schema-summary.md.
El dump/resumen legacy no contiene toda la evolución Competition; para esta área se contrastaron las migraciones con el catálogo instalado, sin asumir que el dump era actual.

Fuentes principales:

- 20261009100429_player_career_read_models.sql y 20261022135243_public_sports_visibility_reads.sql.
- 20260909120000_competition_pairs_ranking_pipeline_fix.sql.
- validate_competition_player_entry y validate_competition_series_ranking_division instalados.
- competition-ranking.repository.ts, player-career.repository.ts y la ruta anterior de Club Admin.

No se repitió una auditoría completa ni se modificaron migraciones, RLS, grants o datos compartidos.

## Reglas verificadas

| Área | Regla vigente |
| --- | --- |
| Individual | Entradas ACTIVE/vigentes; división INDIVIDUAL activa, sin segmento; categoría legacy 1–7; ramas caballeros/damas. Suma del ledger por entrada/club/temporada/división, incluyendo compensaciones. |
| Puestos | RANK por puntos dentro de club/temporada/división. Empates conservan el mismo puesto. ordinal determina paginación individual, no el puesto. |
| Parejas | Proyección de resultados publicados logrados juntos, una vez por equipo; reversos efectivos. Agrupación por pairs_division_id y pareja. Nunca sumar los totales individuales de compañeros actuales. |
| Elegibilidad | Jugadores y membresías aprobados; exclusión de STAFF/owners/platform en todo el perfil deportivo. Solo nombres/fotos de la proyección autorizada. |
| Publicación | Club activo; temporada pública ACTIVE/CLOSED; división, rama, categoría y segmento activos/visibles. Que una temporada tenga puntos no la hace pública. |
| Autorización | Los seis modelos de elegibilidad/contextos/standings inspeccionados mantienen SELECT exclusivo de service_role. anon y authenticated sin SELECT. Los cuatro catálogos tienen RLS habilitado. |
| Mixto | El catálogo y las entradas por rama existen; una serie PAIRS debe acreditar en INDIVIDUAL de la misma temporada/rama/categoría y sin segmento. El lector individual instalado y el adaptador legacy excluyen Mixto. No equivale a sumar M y F. |

Se encontró un filtro de frontend/backend que descartaba todas las divisiones PAIRS con segmento. Se retira ese descarte para parejas y se mantiene la separación de divisiones: selector secundario de grupo si una categoría tiene varios ámbitos. No se mezclan sus puntos.

La API antigua /api/clubs/[clubId]/ranking se conserva por compatibilidad; contiene el contrato legacy y reglas de acceso anteriores. La nueva UI no la consume. No se certifica en esta tarea que todos los consumidores legacy tengan el mismo contrato de publicación; su consolidación/retiro requiere una revisión específica, sin modificar accesos históricos por inferencia.

## Experiencia compartida

/ranking y /club/ranking usan PublicRankingExperience y RankingDiscovery.

- Parejas/Caballeros por defecto, dentro de la oferta disponible.
- Categorías reales en chips de un toque; temporada compacta; búsqueda secundaria.
- Puestos 1–3 grandes, 4–5 medianos y 6+ compactos, por puesto oficial (no índice del array). Los empates pueden mostrar más de cinco participantes en el Top 5.
- Fotografías existentes; iniciales ante ausencia/error. No se usan imágenes FIP ni fotos fabricadas.
- Visitante/jugador: exclusivamente proyecciones públicas. El marcador personal verifica sesión/identidad y solo consulta la cuenta autenticada en un contexto publicado.
- Puesto propio: mejor pareja oficial o entrada individual, incluso fuera de Top 5/página visible; paginación de parejas contempla empates y orden por pair key.
- Club Admin: lectura interna autorizada con ranking:view y prueba opaca de alcance por solicitud; no basta scope=club. Se diferencian temporada privada y ámbito no publicado en la misma UI. La inspección interna incluye ramas/divisiones/categorías/segmentos activos aunque estén ocultos al público, sin obligar a publicarlos.
- Cambios de cuenta, club, rol o estado de membresía invalidan el resultado interno en pantalla.
- OWNER/ADMIN y Platform Admin pueden administrar la bandera existente de publicación. OPERADOR conserva lectura, sin escritura de configuración; PLANILLERO/PLAYER/anon no obtienen lectura interna por esta ruta.
- Se preservan header, navbar, bottom nav y gutter de 8 px.

## Ramas publicadas

No se inventa una preferencia local ni una columna de clubes.
Se reutiliza competition_branches.is_visible, con permiso OWNER/ADMIN o Platform Admin, club/id/version explícitos y control de concurrencia updated_at.

Su alcance es publicación deportiva: afecta ranking y Carrera pública. El diálogo lo advierte antes de editar. No modifica is_active, reglas, entradas, puntos ni is_public de temporadas. Mixto público se muestra únicamente con rama activa/visible y división disponible en la temporada autorizada. Club Admin autorizado puede inspeccionar la rama activa aunque esté oculta; se muestra «Ámbito no publicado · Vista interna del club». Se conserva una acción de recarga que solo vuelve a leer.

La ruta nueva permite esa operación desde la app, pero NO se ejecutó ningún cambio en Supabase durante esta tarea. Las pruebas de escritura usaron únicamente PGlite local desechable.

## Perfil: reproducción y corrección adicional

La rama ya contenía las guardas de sesión/usuario, AbortSignal, snapshot por identidad, skeleton y retry HTTP 5xx. La auditoría encontró una brecha concreta **antes del GET**: un error transitorio de getCurrentSession() terminaba inmediatamente la carga, sin usar el presupuesto de reintentos.

- Reproducción con la clase real AuthRetryableFetchError del SDK instalado: el helper anterior falla 3 casos nuevos (18/21 PASS). No es una hipótesis de timing sin prueba.
- Corrección mínima en playerProfileRead.ts: reconocer isAuthRetryableFetchError y compartir el presupuesto máximo de dos reintentos (300/900 ms) con transporte/HTTP. No agregar otro bucle ni fabricar sesión.
- Helper corregido: **21/21 PASS**. Un error permanente 403 no reintenta; otra identidad nunca dispara el GET; 401 renueva una vez; fallo transitorio persistente termina de forma acotada.
- Navegador local: se armó una única lectura de membresía con HTTP 500, seguida de 200. El Perfil recuperó y abrió Carrera sin refresh manual; intentos/códigos registrados. Se usó 500 porque el SDK PostgREST instalado ya reintenta 503 internamente.
- Se conservan las guardas y el diseño aprobado del Perfil. El fallo histórico con la sesión real no tiene una traza que permita afirmar que esta es su causa única. Prueba física/autenticada real pendiente.

Evidencia: profile-auth-baseline.tap, profile-auth-fixed.tap, profile-api-recovery.log, profile-browser-recovery.json y perfil-recuperado-320.jpg en la carpeta de QA indicada abajo.

## Mixto individual: diferido por el usuario; propuesta NO instalada

El usuario eligió explícitamente dejar Mixto individual pendiente. No ejecutar el paquete ni volver a solicitarlo durante esta tarea.

No ampliar competition_player_standings_read: una persona puede tener recorridos M/F y Mixto independientes. Ampliar esa vista haría ambiguas las consultas de Carrera que esperan una sola entrada por club/temporada.

Propuesta local: docs/proposals/20261103-mixed-club-ranking.sql. **Excluida del checkpoint y de GitHub**: no se publica SQL ejecutable pendiente. Se conserva en esta PC, sin ejecutar. El hash siguiente identifica únicamente esa evidencia histórica local.

SHA-256: a1f7b7cd88d797d8361894a585e8ad11a3d9673ce500afd2c79f89a3215663a5

Solo crea:

1. competition_mixed_player_standings_read: misma fórmula canónica, limitada a la rama mixto existente.
2. public_mixed_player_standings_read: filtro de publicación mediante public_competition_contexts_read.

Una transacción; sin reemplazar vistas existentes, sin escrituras deportivas. SELECT únicamente service_role, nunca anon/authenticated. Requiere también comprobar exposición de estos dos objetos en Data API; no habilitar otros objetos.

Ensayo aislado PGlite: PASS. Dos entradas mixtas con 100 puntos y puesto compartido 1; sus lecturas M y F conservan 8000 y 500 puntos respectivamente. Las cuatro vistas originales comparadas permanecen idénticas; anon/authenticated denegados; service_role autorizado; temporada privada/rama oculta no publican filas.

Después de autorización e instalación hay que integrar la selección de esas dos vistas en los lectores de club/posición propia y verificar HTTP real. No crear entradas ni puntos para llenar la UI. No se habilita Mixto individual por inferencia mientras falte esta lectura.

Recuperación de aplicación: volver al lector existente y dejar Mixto individual pendiente. No eliminar objetos ni ejecutar rollback SQL automático. Esta propuesta no autoriza modificaciones de Tournament Engine ni nuevas reglas de elegibilidad.

## QA y evidencia

Evidencia local, ignorada por Git: output/club-ranking-20261103-iBDaZW. Las capturas usan datos/identidades **sintéticos** y fotos del fixture de prueba; no representan jugadores ni puntos del proyecto compartido. No se fabricaron datos de producción.

- Suite final: **921/921 PASS**, incluidos los 21 casos de Perfil y el control rama oculta pública / lectura interna autorizada.
- QA HTTP sintético: **12 escenarios PASS**. OWNER/ADMIN/OPERADOR/Platform con lectura autorizada; PLANILLERO/PLAYER/anon denegados a la API interna. Publicación solo OWNER/ADMIN/Platform; CAS 409; campos extra no cambian puntos/temporada/club.
- Una rama oculta desaparece del navegador público, conserva el ranking interno y se marca no publicada. Una temporada privada no publica participantes ni posición propia. Modelo ausente sigue siendo error, no vacío ni puntos legacy.
- TypeScript sin emisión: PASS. ESLint de los archivos de esta tarea: PASS, sin advertencias. Build local optimizado desde apps/web: PASS, 167/167. Una invocación desde la raíz falló por resolver un asset contra el cwd incorrecto; no requirió modificar producto.
- Navegador: 320/375/390/430, tablet 768 y desktop 1280 px. Sin overflow horizontal; gutter móvil de 8 px; controles de filtros >=44 px. El IAB usa scrollbar clásico de 15 px: se distinguen viewport y clientWidth en measurements.json. Safari físico no certificado.
- Parejas/individual, Damas con empates, categorías configuradas vacías, Mixto parejas oficial, Mixto individual pendiente, búsqueda/limpieza, paginación sin promover puestos, salto al puesto propio, visitante y Club Admin. La limpieza de búsqueda también vacía el input; se corrigió el valor no controlado que persistía después de limpiar la URL.
- Top 3 en tres columnas desde tablet; Top 4–5 en dos, lista compacta. En móvil una columna con fotos/posición/puntos legibles. Se mantienen header/nav/bottom nav aprobados.
- Las pruebas de permisos y cambio de publicación se ejecutaron solo en PGlite desechable; no se escribieron datos reales.
- No se certifican Safari físico, un deployment nuevo, configuración efectiva nueva en Data API ni lectura de este código con sesión real en Supabase. No hubo push/deploy ni cambios del proyecto compartido.

Capturas destacadas: parejas-390.jpg, parejas-320.jpg, lista-390.jpg, individual-375.jpg, damas-430.jpg, mixto-parejas-320.jpg, mixto-individual-pendiente-430.jpg, admin-publicacion-320.jpg, admin-tablet-768.jpg e invitado-desktop-1280.jpg.

## Archivos de esta tarea

- Rutas de UI: apps/web/app/ranking/page.tsx; apps/web/app/(app)/player/ranking/club/page.tsx; apps/web/app/(app)/club/ranking/page.tsx.
- UI compartida y estilos: components/public/PublicRankingExperience; components/ranking/RankingDiscovery, RankingEntryFrame, OwnRankingPosition y RankingVisibilitySettings (incluyendo sus módulos CSS).
- Backend autorizado: app/api/clubs/[clubId]/ranking/official/route.ts, ranking/visibility/route.ts, app/api/player/club-ranking-position/route.ts; features/player-career/club-ranking.access.ts, player-career.repository.ts, player-career.types.ts y public-ranking.presentation.ts.
- Perfil: lib/playerProfileRead.ts y playerProfileRead.test.mjs.
- Contratos: lib/clubRankingReadContract.test.mjs, myRankingReadContract.test.mjs y publicRankingExperienceContract.test.mjs.
- QA local: lib/testHelpers/sportsPrivacyFixture.mjs; scripts/qa/block1-server.mjs, ranking-experience-fixture.mjs y club-ranking-http.mjs. El nuevo script HTTP solo admite loopback y comprueba el marcador sintético; no carga .env.
- Documentación publicada: este informe y SELPA_CONTINUIDAD.md. La propuesta SQL diferida en docs/proposals se conserva solo local y queda excluida de la entrega. Los cambios generados por Next en tsconfig.json/next-env.d.ts se excluyen del cierre.

## Próximos controles

1. Cerrar el checkpoint autorizado exclusivamente en la rama actual; verificar igualdad del SHA local con GitHub. Preparar después la revisión visual sin modificar el diseño.
2. Probar con sesión real invitado/jugador/administrador en una ejecución autorizada: oferta del club, puntos/puestos oficiales, visibilidad privada, login → Perfil → Carrera e iPhone/PWA. No crear puntos o entradas para llenar rankings.
3. Mantener Mixto individual pendiente por decisión expresa del usuario. No ejecutar su propuesta ni ampliar Carrera.
4. Mantener separada la eventual consolidación del endpoint legacy: esta tarea no modifica su contrato histórico.

Cierre: base GitHub comprobada en 5417dc2, índice vacío/stash conservado, diff --check PASS. Sin procesos sintéticos escuchando en 3000/45432. Advertencias del navegador: recuperación controlada de Perfil y avisos LCP de imágenes del fixture; ningún error nuevo de ranking observado.

Checkpoint Ranking 2.0: 31 archivos revisados, 30 incluidos, propuesta SQL excluida; suite 921/921 reejecutada. Capturas posteriores al push en output/ranking2-checkpoint-20261103-E2MDO5, solo locales e identificadas QA. Sin merge, deployment ni Supabase.
