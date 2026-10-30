# SELPA — Recuperación premium y diagnóstico real

Fecha: 2026-10-09. Rama: `codex/club-admin-iphone-preview`.
Base: `2fb0628db8566e5d48e5e8b86faca84f6b4170bb`.

## Estado de entrega

**NO CERRADO funcionalmente.** Se conservaron cambios seguros de presentación y diagnóstico. El destino real de localhost carece de los read models deportivos; no hubo autorización para aplicar la migración. Mercado Pago no está habilitado/configurado y no se pudo certificar checkout sandbox. Finanzas respondió a lecturas SQL con identidad/rol existentes, pero falta el recorrido HTTP/browser con JWT firmado real. Preview y Safari/iPhone nativo no fueron probados.

No se aplicaron migraciones, no se escribieron datos económicos reales, no hubo cargos, commit, push, despliegue manual ni infraestructura paga. No se inició Bloque 2. Los fixtures y capturas se generaron exclusivamente en memoria/local.

## A. Diseños recuperados y referencias

Antes de editar se revisaron `docs/selpa-master-product-review.md`, `docs/selpa-transformation-block-1.md`, `docs/selpa-ranking-experience-repair.md`, el dump `supabase_full.sql`, `docs/schema-summary.md` y Git de los componentes afectados.

- Cards: `PublicRankingClubCard.tsx` en `83a11e9`; superficie clara, escalones 4–1 y trazados originales de flecha ascendente, identidad del club y CTA inferior derecha. El componente histórico también contenía overrides mobile posteriores que escondían el logo/reemplazaban el motivo. Se recuperó la composición con estilos acotados nuevos, sin alterar las cards usadas por otras pantallas.
- Perfil: composición `playerProfileV3` del HEAD anterior al Bloque 1, `3faf4b0b2c9110d98fc82bd2c26bc0d117586cc9`: portada + fotografía circular superpuesta + nombre/contexto. Se recuperó esa estructura, no sus formularios ni números legacy.
- Se conservó la presentación canónica de líderes/perseguidores incorporada en `2fb0628`, conectada al repositorio compartido.

## B. Ranking público y categoría predeterminada

El índice recupera logo visible, gris claro, motivo deportivo, bordes cyan/magenta, detalles del club y enlace completo. Grid: una columna mobile, dos desde 768 px y tres desde 1100 px. Los fixtures tienen dos clubes; se comprobó el grid de tres tracks desktop, no se inventó un tercer club real.

Se distingue **categorías configuradas** de publicación deportiva. El índice no garantiza “ranking oficial” por conocer sólo la configuración. Los errores no muestran líderes, paginación ni ceros ficticios.

La apertura automática cuenta el universo de las proyecciones canónicas por `club_id`, `season_id`, `division_id` y modalidad. Se elige la división publicada con mayor población dentro del contexto solicitado. Empates de población: UUID de división ascendente. No se elige por número/nombre de categoría, ni por preferencia masculina. Una categoría/división explícita válida conserva su selección aunque esté vacía. Sin división con filas publicadas, el estado es vacío, no una clasificación inventada.

Las consultas de conteo descargan como máximo un UUID por división, en lotes concurrentes de cuatro; no roster ni ledger. Se evitó HEAD: la versión instalada de PostgREST convierte un HEAD 404 sin cuerpo en 204, perdiendo el diagnóstico de objeto ausente. GET con count exacto y limit 1 conserva `PGRST205`.

Descubrimiento: tabs Caballeros cyan / Damas magenta; categoría en `dialog` nativo con bottom sheet mobile, conteo y estado; modalidad visible sólo si existe más de una; búsqueda secundaria desplegable con limpiar y controles de 44 px. Cambios mantienen URL completa y reinician página/contexto incompatible. No hay botón Aplicar grande.

## C. Liderazgo, empates, perseguidores y fotos

Liderazgo #1 con foto prioritaria, nombre, club, categoría y puntos. Si hay varios #1, todos tienen la misma composición y “Liderazgo compartido”; no se presenta un líder exclusivo. Perseguidores conservan posición canónica, foto/avatar y distancia en puntos dentro de la misma división. PAIRS utiliza el premio combinado canónico una sola vez, nunca la suma de carreras individuales.

Búsqueda de un #5 sigue mostrando #5; paginación conserva puestos oficiales. El enlace abre identidad pública con contexto de club. Fallos de imagen usan iniciales; no se mostraron datos privados. No se modificaron fórmulas, ledger, homologación, BYE/WO, tiers ni premios deportivos.

## D. Perfil público restaurado

`CareerIdentityHero` recupera portada, fotografía superpuesta, nombre y contexto con Compartir accesible. En el primer viewport mobile se ven identidad, club/categoría y métricas canónicas de posición/puntos cuando la lectura existe. El loading usa la misma geometría de portada/avatar.

El perfil público permanece anónimo, compartible y separado de los controles privados. El propio conserva acceso al editor de foto/portada, datos y pareja. Carrera, torneos, palmarés y últimos resultados siguen siendo progresivos y basados en homologaciones; no se agregaron estadísticas ficticias. Trayectoria y ranking anual no se suman entre clubes.

Sin club deportivo activo se conserva nombre/foto/portada global, sin categoría, puesto ni puntos inventados. Una URL con club explícito inaccesible no cambia silenciosamente a otro club. STAFF sigue excluido por las tablas autoritativas. El endpoint nuevo de carrera devuelve contexto `GLOBAL_WITHOUT_CLUB` sin consultar proyecciones deportivas; se conserva 400 para sección inválida.

El fallback de Compartir por clipboard fue probado en Chrome. Web Share nativo/iOS no fue probado.

## E. Causa real del ranking y Mi ranking

Destino de `.env.local`: `https://nenupmpjrzdxfrnwsmkx.supabase.co`. Se comprobó presencia de URL, anon key y service key, sin imprimir valores. **No se confirmó si este proyecto es desarrollo o producción**, por lo que no se ejecutó DDL.

Cristal Padel Club: `7c70723b-8244-4117-9a2e-b9a129f661a9`, activo. Temporada 2026: `38763b95-7450-4780-a984-99bc41ded6f0`, activa.

| Lectura real | Resultado | Interpretación |
| --- | --- | --- |
| REST `competition_player_standings_read` con cliente server-only | HTTP 404, `PGRST205` | Objeto ausente, no “cero jugadores”. |
| REST `competition_pair_standings_read` con cliente server-only | HTTP 404, `PGRST205` | Objeto ausente, no “cero parejas”. |
| GET localhost `/ranking?clubId=…` | HTML HTTP 200 con `MODEL_UNAVAILABLE` | Página accesible; lectura deportiva fallida. HTTP 200 no certifica ranking operativo. |
| GET `/api/player/my-ranking` sin JWT | HTTP 401, “Sesión inválida.” | Denegación esperada; no prueba de una sesión PLAYER válida. |
| Catálogo PostgreSQL destino | Cinco views y RPC summary ausentes; versión de migración no registrada | Causa comprobada del ranking público; dependencia bloqueante también para Mi ranking/carrera con contexto. |

Recorridos: `/ranking` server → `readRankingContexts`/conteos/standings; `/player/ranking` client → Bearer `/api/player/my-ranking?clubId=…` → `auth.getUser` → exclusión STAFF → identidad/contexto → resumen y ventana canónica. El handler personal ahora distingue objeto ausente de fallo de lectura; el cliente ya no reemplaza toda respuesta segura por un supuesto error de conexión.

Durante la última QA se detectó además que el resumen de carrera absorbía el error original para conservar la identidad; Mi ranking perdía por eso la categoría del fallo. Ahora el resumen conserva únicamente `readIssue` seguro y Mi ranking lo propaga. Se verificó missing-model y recuperación mediante API/DOM locales, sin revelar mensajes SQL.

No se obtuvo un JWT real PLAYER para reproducir el HTTP autenticado contra ese destino. Por eso la causa del ranking público está comprobada directamente; la dependencia de Mi ranking está comprobada en código/catálogo, pero **no se afirma haber observado su respuesta real con sesión válida**.

Preview: no se inspeccionaron sus variables ni se ejecutó un recorrido; no se afirma igualdad con localhost ni aprobación live.

## F. Migración pendiente, seguridad y procedimiento

`apps/web/supabase/migrations/20261009100429_player_career_read_models.sql` sigue pendiente, sin cambios y **sin aplicar**.

Objetos: `player_sports_eligible_read`, `competition_player_standings_read`, `player_career_matches_read`, `player_career_results_read`, `competition_pair_standings_read`; RPC `read_player_career_summary(uuid,uuid)`.

Dependencias reales existentes: perfiles/vínculos, entradas deportivas, ledger, homologaciones/participantes, divisiones/fechas, liquidaciones/premios, parejas y proyección PAIRS con `pairs_division_id`. No se detectó necesidad de migrar datos económicos para esta lectura.

Seguridad: cinco views `security_invoker=true`; RPC SQL STABLE SECURITY INVOKER con `search_path=''` y relaciones calificadas. Se revoca PUBLIC/anon/authenticated y se permite sólo service_role. No se amplía RLS, no hay triggers, backfill ni DML. La API server-only publica un DTO acotado; una llave service_role nunca llega al navegador.

Validación de compatibilidad: la migración compiló en PostgreSQL embebido con 14 invariantes y revocación efectiva a roles anon/authenticated. En el destino real se expandieron sus cinco SELECT como CTEs dentro de **BEGIN READ ONLY / ROLLBACK**, bajo service_role, sin crear objetos. EXPLAIN ANALYZE BUFFERS del ranking Cristal/temporada, orden y límite 25: planificación 45.405 ms y ejecución 50.737 ms, una sola muestra. Se devolvieron 25 filas de un universo de 36 elegibles del club/temporada. Esto comprueba compatibilidad de esos SELECT e índice del ledger; no certifica views instaladas ni latencia de todos los RPCs.

Se observó `competition_point_transactions_aggregate_idx` y los índices de entradas/perfiles/vínculos. Hay scans de catálogos pequeños y materialización del CTE de elegibles; no se agregaron índices especulativos. Repetir planes de standings, conteos y carrera una vez instalada en un destino autorizado y con volumen representativo.

Procedimiento pendiente, **no ejecutado**:

1. Confirmar que el project ref es el destino de desarrollo/Preview autorizado. Para producción, revisión y autorización específicas antes de cualquier DDL.
2. Revisar el archivo y dependencias/grants contra ese destino, respaldo y migraciones previas; evitar `db push` global que aplique otras migraciones pendientes.
3. Aplicar exclusivamente este archivo mediante el procedimiento de migraciones aprobado, registrando la versión. No tocar ledger ni datos económicos.
4. Refrescar/verificar catálogo REST y ACL; confirmar los cinco objetos/RPC, acceso service y denegación directa anon/authenticated.
5. Repetir GET público de Cristal, Mi ranking/carrera con JWT PLAYER real, clubs/divisiones/temporadas, casos vacíos y EXPLAIN. Sólo entonces declarar la lectura real resuelta.

## G. Mercado Pago: estado real

**NO OPERATIVO EN LOCALHOST; sandbox no ejecutado.** Las variables de habilitación, client ID/secret, webhook secret, origin y OAuth redirect no están presentes en `.env.local`; el flag sólo habilita con `true` explícito. Cristal no tiene una cuenta cobradora conectada en `club_payment_provider_accounts`. No se imprimieron tokens/secretos ni se cambió el flag.

Existe una base F1E real: OAuth del club, Vault server-only, intents, checkout, retorno de consulta, inbox/webhook y reconciliación. Las funciones `prepare_club_payment_checkout_f1e` y `reconcile_payment_provider_event_f1e` existen en el destino. F1D/F2 también existen; no se afirma que todo el sistema esté ausente.

Contrato conservado: Checkout Pro marketplace 1:1 Argentina/ARS; el club vendedor recibe el dinero. `marketplace_fee=0` en DB v1. Facturación SELPA club→plataforma F2 es independiente; no se inventó retención/distribución nueva. Importe calculado server-side desde saldo de obligación, no del navegador. El precio visible del fixture es por jugador y total de pareja = ×2; no se realizó un cargo para certificar importes reales.

El código mantiene token de seller server-only, intent/idempotencia, locks, HMAC previo al inbox, consulta autoritativa del pago al proveedor, validación de collector/reference/importe/moneda, reconciliación idempotente y reintentos/manual review. El retorno no marca pago aprobado. Estas son garantías auditadas en código/contratos, **no una certificación sandbox**.

Hay además una brecha de integración concreta: el wizard de torneo conserva Mercado Pago “Próximamente” deshabilitado y sólo acepta pago en el predio; no está conectado a checkout F1E como método de nueva inscripción. No alcanza con cambiar un flag.

Para completar: credenciales/test buyer sandbox autorizados, seller OAuth de prueba, HTTPS origin/callback/webhook accesibles y sin infraestructura paga; conectar la obligación canónica de inscripción al checkout existente; probar pendiente/aprobado/rechazado/cancelado, retorno sin webhook, webhook repetido, firma inválida, reconciliación y reintentos. No habilitar el método hasta ese end-to-end. No hubo cargos ni escrituras de QA al proveedor/base real.

## H. Facturación y Pagos: backend real vs mocks

GET localhost sin sesión: `/api/clubs/billing?clubId=…` y `/api/player/finance` devolvieron 401. Los endpoints existen. No equivale a validar un usuario autorizado.

Se comprobaron en destino las funciones F2 `get_platform_billing_overview_f2`, `list_platform_billing_f2` y F1D `get_player_finance_overview_f1d`, `list_player_finance_obligations_f1d`, `list_player_finance_movements_f1d`. Lecturas STABLE SECURITY DEFINER con guards `auth.uid()`/club/rol y search_path fijo; grants authenticated, sin execute anon ni exposición de helpers internos.

Lecturas reales READ ONLY / ROLLBACK con subject de usuarios existentes, claims locales y rol authenticated:

- OWNER aprobado de Cristal: overview JSON válido; lista invoices=0 y payments=0.
- PLAYER aprobado no STAFF: overview JSON válido; obligations=0 y movements=0.

**Clasificación de esa evidencia: SQL_CLAIMS_NOT_SIGNED_JWT.** Ejecutó los RPCs reales y verificó vacíos, sin descargar datos financieros personales ni mutar movimientos. No es autenticación HTTP ni prueba de navegador con JWT firmado. No se certifican las pantallas reales con login, datos controlados live ni retry real. Se solicitó sesión de prueba PLAYER y OWNER/ADMIN, sin pedir contraseñas/tokens por chat; no se recibió acceso utilizable.

Cambios acotados de errores de lectura: 403 FORBIDDEN, 400 INVALID_FILTER, 503 READ_MODEL_MISSING, NETWORK_UNAVAILABLE, CONFIGURATION_MISSING y DATABASE_UNAVAILABLE. Mensajes allowlist, sin SQL/JWT. Vacío legítimo conserva 200 y listas vacías; no se cambió ninguna operación económica.

## I. Inscripción y wizard

Se eliminó “YA ESTÁS DENTRO” para PENDING. Sólo registrationStatus=CONFIRMED anuncia inscripción confirmada. Pago APPROVED/PAID con inscripción PENDING muestra pago validado + aprobación del club pendiente, no cupo confirmado. Regresar de checkout o solicitar efectivo nunca confirma una plaza.

Una solicitud pendiente ofrece “Solicitar cancelación de la solicitud”; una confirmada, “Solicitar baja del torneo”. Los modales aclaran que el club debe revisar y que enviar el pedido no cancela automáticamente ni confirma reintegro. El backend existente de solicitudes de cambio no fue modificado.

Sin cuadro publicado, el tablero explica la próxima acción y muestra pareja; se quitaron los grandes slots zona/partido/cancha “A definir” del jugador inscripto. No se alteraron reglas de cupo/registro/pago.

Wizard: cuatro pasos con labels compactos mobile y nombres completos accesibles, targets ≥44 px, gutters únicos de 8 px. Se corrigió `width:100%-22px` que acumulaba otros 11 px por lado. Se ajustó wrapping de acciones para que el texto de cancelación no salga del control. No se pulsó Submit ni se generaron inscripciones reales. Registro/envío real de solicitud y header con teclado/scroll de iPhone físico quedan pendientes.

## J. QA separada por evidencia

| Validación | Resultado real |
| --- | --- |
| Presentación y handlers de recuperación | 17/17 contratos. Incluye default poblacional, empate, categoría explícita vacía, privacidad global, diagnóstico personal y registro/pago independientes. |
| PostgreSQL embebido carrera | 14/14, incluido universo 310 y ledger >1500 filas, PAIRS, reversos, STAFF, BYE/WO y permisos. |
| Contratos TypeScript ampliados | 495 ejecutados con tsx: 494 PASS, 1 fallo heredado. MultiDate se ejecuta separado con Node type stripping: 10/10. |
| Homologación/fotos | 6/6 con ejecutor Node compatible con top-level await. |
| Sesión y score deportivo | 10/10 contratos adicionales; login/logout/contexto y super tie-break, sin cambiar reglas. |
| Dos contratos heredados del cierre previo | Snapshot consistency 8/8; SeriesPairRanking 12/12, incluidos en suite ampliada. Sin cambiar sus invariantes ahora. |
| TypeScript | PASS (`tsc --noEmit --incremental false`). |
| Build | PASS; configuración local sintética y pagos deshabilitados. No deploy. Warning Browserslist heredado. |
| ESLint archivos intervenidos | PASS, 0 errores/0 warnings. |
| ESLint global app/components/features/lib | FAIL: 178 errores y 131 warnings heredados. Todos los archivos con errores se compararon con HEAD: idénticos. No se hizo refactor ajeno ni se desactivaron reglas. |
| Diff-check | PASS; warnings de normalización CRLF no son errores de diff. |
| Ranking Chrome | 78 estados en 320/375/390/430/768/1280: índice, club, page2, Damas, búsqueda, vacío, PAIRS, empate, missing/network/permission/context y retry. 0 pageerrors/escrituras/conexiones externas. |
| Interacciones ranking Chrome | Seis tamaños: search submit conserva #5, limpiar, cambio a PAIRS, recuperación de error del directorio. PASS. |
| Recorrido jugador/club Chrome | PASS con fixture base: carrera pública y club en seis anchos, historial/estadísticas, own→editor sin submit, home del club/jugador, Mi ranking #5, error MODEL_UNAVAILABLE y recuperación por retry. Auth/Data API sintéticos. |
| Perfil/inscripción Chrome | 72 estados en seis tamaños: perfil con club/global, clipboard, pendientes/pago aprobado/confirmación y cuatro pasos. Datos sintéticos; 0 pageerrors/escrituras/conexiones externas. |
| Fase 0 Chrome | 69 mediciones y menús STAFF. OWNER/ADMIN billing 200; STAFF player finance 403; PLAYER billing 403; anónimo/invalid JWT 401. Vacíos/data/error/retry y hub Mi cuenta. RPCs/auth sintéticos, no certificación live. |
| Integración real | Diagnóstico REST/catálogo deportivos y lecturas SQL financieras realizadas; sesión HTTP válida/recorridos completos pendientes. |
| Mercado Pago sandbox | NO EJECUTADO por configuración, seller y wiring faltantes. |
| Safari/iPhone real, Preview, producción | NO PROBADOS. No se declaran aprobados. |

Fallo ampliado: `competitionEventEditorContract.test.ts`, “operation warnings are globally deduplicated and the primary setup CTA is explicit”. Busca `/dateConfigurationCta\(blockerIssues\)/`, ausente en el código actual que utiliza `getCompetitionConfigurationAction`. Se archivaron únicamente test y sus cuatro fuentes desde HEAD en `output/premium-head-baseline/` y se repitió: 4 PASS / mismo 1 FAIL. No es regresión de este trabajo; se conserva sin modificar para no obtener PASS mediante una regex más débil. Queda revisión conductual del contrato actual de edición como pendiente separado.

Los dos fallos históricos del Bloque 1 siguen resueltos: snapshot referenciaba archivos inexistentes y el test de parejas una forma vieja del retorno; sus ocho/doce invariantes pasan. El fallo ampliado anterior es distinto.

Capturas locales: `output/ranking-repair-qa/`, `output/premium-recovery-qa/`, `output/block1-qa/phase0/`, `output/block1-qa/screens/`. Se inspeccionaron imágenes reales de Chrome, no sólo overflow: 320/390 y desktop, portada/avatar, líderes empatados, cards recuperadas y estados de inscripción. El indicador Next dev en las capturas no es un elemento de producción.

Reproducción: servidor aislado `scripts/qa/block1-web.mjs` (3011) + `block1-server.mjs` (45432), con env Supabase sintético y pagos false. `SELPA_QA_RANKING=true` agrega sólo fixtures de recuperación. Ejecutar los scripts de browser **en serie**, porque comparten modos de error del fixture; no considerar PASS una corrida interferida por otro script. `career-read-plan.mjs` sólo imprime SQL read-only; no instala nada.

## K. Bloqueos y próximos pasos necesarios

1. Confirmar destino Supabase desarrollo/producción y autorizar explícitamente la migración de lectura revisada en el entorno correcto. Hasta entonces Cristal no es consultable por el nuevo lector.
2. Sesiones reales de prueba PLAYER y OWNER/ADMIN: repetir HTTP y pantallas con los RPCs instalados, sin compartir tokens/contraseñas ni crear movimientos reales.
3. Credenciales y seller sandbox/HTTPS para MP, más conexión wizard→obligación→checkout. Luego end-to-end sin cargos reales.
4. Comparar Preview con localhost y validar Safari/iPhone físico, teclado, sticky header/scroll y Web Share.
5. Revisar el contrato heredado ampliado y deuda de lint global; no se certifica suite global verde.

Estos bloqueos impiden declarar todo el producto validado. Por la condición del pedido **no hubo commit/push**. No se infirió permiso para aplicar la migración en el proyecto actual.

## L. Archivos intervenidos y regresiones

Sólo `apps/web` canónica y este reporte. No se modificaron web2/web3, main, migraciones, RLS, triggers, credenciales o datos reales.

- Ranking: `app/ranking/page.tsx`; `components/public/{PublicRankingExperience.tsx,PublicRankingExperience.module.css,PublishedRankingClubCard.tsx}`; `components/ranking/{RankingDiscovery.tsx,RankingDiscovery.module.css}`; `features/player-career/{player-career.repository.ts,player-career.types.ts,public-ranking.presentation.ts}`.
- Perfil: `components/player/{CareerExperience.tsx,CareerExperience.module.css,CareerIdentityHero.tsx}`; `app/jugadores/[id]/{page.tsx,loading.tsx}`; `app/api/players/[playerId]/career/route.ts`.
- Mi ranking: `app/(app)/player/ranking/page.tsx`, `app/api/player/my-ranking/route.ts`.
- Inscripción: `app/(app)/torneos/[id]/page.tsx`, `app/(app)/torneos/[id]/inscripcion/page.tsx`, `lib/registrationPresentation.ts`.
- Errores financieros: `app/api/player/finance/route.ts`, `lib/{financeReadError.ts,platformBillingF2Server.ts}`. Sin cambios a escrituras/contrato de importes.
- Contratos/harness: `lib/{publicRankingExperienceContract.test.mjs,productCompletionPass2Contract.test.ts,platformBillingF2Contract.test.ts}`; scripts QA `block1-browser`, `phase0-browser`, `ranking-experience-browser`, `ranking-experience-interactions`, `ranking-experience-fixture`, `premium-recovery-browser`, `career-read-plan`. Los loaders incorporan el helper nuevo; assertions previas no se eliminan para forzar PASS.

Se preservó trabajo local ajeno, stashes y servidor del usuario en puerto 3000. Archivos generados de TypeScript/Next por QA se devuelven al estado previo; `next-env.d.ts` conserva la variante dev preexistente del usuario. `PublicRankingClubCard.tsx` queda con contenido original: la recuperación usa un componente acotado nuevo para no provocar regresiones en otras superficies.

Descartadas en QA local: renumeración al buscar/paginar, líder único en empate, duplicación de puntos PAIRS, exposición de contactos/finanzas en perfil público, ingreso STAFF a experiencia PLAYER, pérdida del editor propio y falso vacío cuando fallan lecturas. No se presenta esta lista como garantía de producción.
