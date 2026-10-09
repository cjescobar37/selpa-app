# SELPA — Reparación de experiencia del ranking

Fecha: 2026-10-09. App canónica: `apps/web`. Rama: `codex/club-admin-iphone-preview`. Base: `7ed491e88217e97f89013ffa74d1635769a1b5e2`.

## A. Causa de la regresión visual

El Bloque 1 sustituyó la presentación anterior por un índice de links y filas uniformes: el componente público dejó de distinguir líder/podio, desactivó encabezados y tabs de `RankingBoard` y su CSS impuso los mismos avatares/puntos/dimensiones a todas las filas. La integridad mejoró, pero se perdió jerarquía competitiva. Esta reparación separa presentación de la verdad deportiva; no revierte lectores, scoring ni privacy.

## B. Rutas y composición

- `/ranking` sin club: hero SELPA compacto, cards enteramente clickeables con logo/iniciales, club, categorías activas cuando el catálogo responde, estado “Ranking oficial” y CTA. No leaders, cifras ni clubes demo.
- `/ranking?clubId=...`: PageHeader integrado, filtros compactos, tabs Caballeros/Damas con conteos completos de la categoría/modalidad, líder, challengers y listado paginado de 25.
- `/ranking/caballeros` y `/ranking/damas` siguen delegando en el lector común; navegación pública y aliases privados continúan llegando a la URL canónica.
- Nuevas funciones puras de presentación no recalculan ni ordenan puntos. Cambiar rama limpia división/página previas y conserva club/temporada/categoría/búsqueda; modalidad busca su división canónica equivalente. Se evita un redirect loop para PAIRS sin categoría.

## C. Protagonista #1

Tarjeta navy con acento deportivo, avatar 64–76 px, anillo dorado, corona, “N°1 actual”, “El rival a vencer” y puntos protagonistas. Todas las filas con posición oficial 1 reciben la misma presentación; en empate se indica “Liderazgo compartido”. No se elige un campeón ficticio ni se rompe el empate por nombre.

## D. Fotos y fallback

URLs públicas reales del read model y logos existentes; `RankingPlayerAvatar` conserva `next/image` y ahora usa iniciales también si la imagen falla. Sin nuevas imágenes de producto, descargas ni identidades ficticias. Los fixtures de QA son opt-in/locales y usan únicamente assets ya existentes en `public/mock`/`public/brand`; esas imágenes nunca se sustituyen por fotos de usuarios reales ni se convierten en seed de producto.

## E. Challengers y clasificación

Puestos oficiales 2–5: acento lateral, avatar, puntos más fuertes y distancia respecto del líder del mismo ámbito cuando la lectura está disponible. Resto: filas compactas, puesto/avatar/nombre/categoría/puntos. Una búsqueda de #5 sólo muestra #5 como challenger; no lo asciende a #1. En página 2, el primer jugador conserva #26. Los empates comparten posición y pueden producir saltos; no se rellena un puesto ausente.

PAIRS muestra ambas identidades/avatares completos, sin superponer las caras o iniciales del líder, y `combined_points` una sola vez, nunca la suma de las carreras individuales. No se inventó una página pública de pareja inexistente.

## F. Vacío versus error

- Lectura exitosa sin filas: estado útil de categoría aún sin ranking, búsqueda sin coincidencias o página fuera de resultados. Permite quitar búsqueda/volver a la primera página cuando corresponde.
- Fallo: panel contextual con club, mensaje humano, reintento real mediante `router.refresh` y acceso al club. Conserva filtros/temporada cuando fueron leídos. No renderiza un leaderboard vacío, conteos cero ni paginación ficticia como éxito.
- Lectores/contexto/índice fallidos se aíslan: ya no hay consultas iniciales fuera del manejo de error que desemboquen en una página Next 500.
- `PGRST205`/`42P01` y RPC ausente se distinguen de error temporal. Se conserva sólo código saneado para diagnóstico; no mensajes SQL, stack ni datos privados en el cliente.

## G–H. Cristal: diagnóstico confirmado y dependencia

Proyecto efectivamente configurado: `nenupmpjrzdxfrnwsmkx`. Club `cristal padel club`, UUID `7c70723b-8244-4117-9a2e-b9a129f661a9`.

Consultas MCP en transacciones `READ ONLY`, timeout 5 s y `ROLLBACK`, más un único GET de Supabase con service role mantenida exclusivamente en servidor:

| Comprobación | Resultado |
| --- | --- |
| Club activo | Sí |
| Temporada activa | `2026`, UUID `38763b95-7450-4780-a984-99bc41ded6f0` |
| Divisiones INDIVIDUAL activas, sin segmento | 7 |
| Movimientos del ledger canónico en esa temporada | 310; no se descargaron sus filas ni datos personales |
| `competition_player_standings_read` | No existe |
| `competition_pair_standings_read` | No existe |
| `player_sports_eligible_read` y summary RPC | No existen |
| Migración `20261009100429` registrada | No |
| GET real del ranking de Cristal | HTTP 404, código `PGRST205`, no una respuesta vacía |

**Cristal no podrá mostrar el nuevo ranking mientras falten los lectores.** El frontend no puede crear estos objetos ni habilitarlos con retry. Es una dependencia de la migración pendiente `apps/web/supabase/migrations/20261009100429_player_career_read_models.sql`, no ausencia de competencia ni solución por datos legacy. La reparación mejora y aísla ese estado, pero no afirma resolver la infraestructura live.

La migración no se modificó ni aplicó. Revisión/aplicación con autorización explícita es otra tarea: verificar catálogo/prerrequisitos, grants, consultas/EXPLAIN y muestras canónicas del destino antes de ejecutar. El dump/schema-summary son anteriores al módulo Competition; se contrastaron los objetos actuales sin asumir que el dump describe live. No se hizo reload de schema cache, cambio de RLS ni escritura económica.

## I. QA y performance

- Contratos: 390 pertinentes previos + 6 homologación/avatares + 14 carrera/SQL PGlite + 11 nuevos = **421 PASS**. No equivale a toda la suite del repositorio.
- QA real Chrome, con Next/API y PostgreSQL sintético localhost: **320, 375, 390, 430, 768, 1280**. Matriz de 78 estados/layouts: índice, club, página 2, Damas, búsqueda, sin coincidencias, categoría vacía, PAIRS, empate #1, modelo ausente, fallo temporal, catálogo de contexto fallido e índice fallido. Ramas, aliases, posiciones, fotografías y fallback por foto 404, reintento que recupera resultados, error distinto de vacío y no cero falso.
- Interacciones adicionales en seis tamaños: submit real de búsqueda → #5, quitar búsqueda, submit real de modalidad → división PAIRS correcta/award 10 una sola vez, reintento del índice. Se verifican también los últimos ajustes visuales de búsqueda.
- Regresión real del Bloque 1 reejecutada con fixture basal: carrera anónima y propia, privacidad, stats/history/recent, editor PLAYER, ranking personal, preview de club, Home y alias privado conservando #5. Sin errores JavaScript ni requests exteriores; payloads deportivos conservados (resumen 1.816 bytes, historial 1.284, recientes 777, siete vecinos 6.789).
- Gutter único: x=8 y ancho viewport−16, padding interior=0 en 320–430; sin overflow horizontal ni ocultarlo con CSS. Tablet/desktop revisados visualmente. Controles de 44 px mínimo; inputs de 16 px. Capturas inspeccionadas, no sólo medidas de ancho.
- Cero errores JavaScript y cero requests externos/escrituras en la QA de ranking. El 404 de la foto fallida y los errores de lectura son inyecciones deliberadas de QA, no un PASS que ignore errores inesperados.
- TypeScript sin emit PASS; ESLint focal 0 errores/0 warnings; build PASS (144 páginas estáticas), y diff-check PASS. El warning de catálogo Browserslist antiguo se conserva sin actualizar dependencias ajenas. Build y QA usan localhost/claves ficticias, no servicios live.

Paginación server-side y cálculo de posiciones SQL permanecen intactos. Índice: máximo 40 clubes, dos catálogos pequeños por lote, sin un query por club. Ranking: 25 filas, dos conteos HEAD y una fila de puntos del líder, todos en el mismo ámbito; búsqueda no afecta el denominador ni distancia al líder. Sin descarga del ledger/padrón completo ni fan-out por series. No hay benchmark live ni promesa de costo SQL constante: los planes reales requieren los objetos actualmente ausentes.

Reproducción local: iniciar `scripts/qa/block1-server.mjs` con `SELPA_QA_RANKING=true`; iniciar `block1-web.mjs` con Supabase localhost y claves ficticias. Ejecutar `ranking-experience-browser.mjs`, luego `ranking-experience-interactions.mjs`. Nunca apuntar fixtures al proyecto real. Capturas: `output/ranking-repair-qa/`; primer viewport: `club-mobile-first-viewport.png`.

## J. Archivos y entrega

Código intervenido:

- `apps/web/app/ranking/page.tsx`
- `apps/web/components/public/PublicRankingExperience.tsx`
- `apps/web/components/public/PublicRankingExperience.module.css`
- `apps/web/components/ranking/RankingPlayerAvatar.tsx`
- `apps/web/components/ranking/RankingRetryButton.tsx` (nuevo)
- `apps/web/features/player-career/player-career.repository.ts`
- `apps/web/features/player-career/public-ranking.presentation.ts` (nuevo)

Contratos/QA: `lib/publicRankingExperienceContract.test.mjs`, `scripts/qa/ranking-experience-{fixture,browser,interactions}.mjs` nuevos; `block1-server.mjs` añade escenarios de fallo y opt-in sintético, y `block1-browser.mjs` actualiza sólo selectores del DOM público sin relajar invariantes. Este informe es nuevo; el informe histórico del Bloque 1 no se reescribe.

Entrega sólo en rama preview, sin tocar main, deploy manual ni infraestructura paga. Sin datos reales creados/modificados: únicamente lecturas live acotadas para diagnóstico y fixtures locales descartables. Sin aprobación Safari/iOS nativo, teclado/Web Share de dispositivo, producción visual live o proveedor de pagos. Cambios preexistentes, ZIPs, stashes y artefactos ajenos excluidos; configuración/tsbuildinfo generados por QA se restauran y `next-env.d.ts` mantiene el estado preexistente del usuario. Hash y confirmación de push se reportan al finalizar.
