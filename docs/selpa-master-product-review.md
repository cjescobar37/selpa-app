# SELPA — Master Product Review

Producto · UX · UI · performance · identidad deportiva · comunidad

Fecha: 8 de octubre de 2026. App canónica: `apps/web`. Rama: `codex/club-admin-iphone-preview`. HEAD inspeccionado: `3faf4b0b2c9110d98fc82bd2c26bc0d117586cc9` — `Complete SELPA final access hardening`.

## Alcance, método y límites

Esta es una revisión del producto que expresa el código actual, no otra auditoría de seguridad ni una implementación. Se siguieron páginas, componentes, servicios, consultas y migraciones locales de los recorridos públicos, Player, Club y Platform. La documentación anterior se usó como contraste, no como prueba de funcionamiento actual.

**Único entregable de esta revisión: este archivo.** No se modificaron código, SQL, configuración ni datos; no se ejecutaron migraciones, operaciones de Supabase, commit, push o deployment.

Convenciones de evidencia:

- **Comprobado en código:** estructura, condición, consulta, texto, CSS o dependencia local identificable. Las referencias `archivo:línea` corresponden al checkout inspeccionado; todas las rutas de código parten de `apps/web/`, salvo indicación contraria.
- **Inferencia de producto:** consecuencia razonable de esa implementación; no equivale a observación de una sesión real.
- **Pendiente de medir:** latencia, bytes transferidos, planes de consulta, comportamiento de navegador o impacto en usuarios. No se inventan mediciones.

No se inició la aplicación ni se navegó contra un backend. No hubo prueba visual renderizada, Lighthouse, captura de red, EXPLAIN, contraste medido ni Safari/iPhone nativo. Las observaciones visuales proceden del JSX y de sus reglas CSS, incluidas las sobrescrituras móviles; **no constituyen un PASS de QA UX**. Los viewports de aceptación se especifican para la implementación futura.

Se ejecutó ESLint sin `fix` y sin caché sobre `app`, `components`, `features` y `lib`: 611 archivos, 179 errores y 132 warnings. No es la misma cobertura que un lint global del repositorio; no demuestra una reducción respecto de los aproximadamente 192 errores del encargo. No se ejecutaron build ni TypeScript: no cambió código y no se buscó revalidar los passes anteriores.

Se preservó el estado local preexistente, incluido `apps/web/next-env.d.ts` y los directorios/archivos no versionados. Las carpetas no canónicas `web2` y `web3` no se usaron como base.

Validación del entregable: se comprobó la presencia de A–Y, las doce fichas P01–P12 y cuatro bloques de roadmap; sin whitespace sobrante ni caracteres de reemplazo. `git diff --check` y la comprobación del archivo nuevo con `git diff --no-index --check` no reportaron errores de whitespace. Git sólo añade este documento al estado previo; no hubo staging ni cambios de rama. No se crearon datos durante QA. El resultado de revisión documental es satisfactorio; runtime, UX renderizada y rendimiento medido permanecen expresamente sin certificar.

## A. EXECUTIVE DIAGNOSIS

### Qué es SELPA hoy

SELPA ya tiene una profundidad operativa considerable: pertenencia a clubes, parejas, inscripción, cobros, administración de competencia, homologación y publicación de puntos. El problema principal no es la falta de módulos. Es que **la experiencia del jugador no convierte todavía esa operación en una historia deportiva confiable, visible y fácil de recorrer**.

Hoy la app puede ayudarme a entrar a un torneo. Le cuesta responder, de manera consistente: «¿cuándo juego?», «¿qué pasó con mi resultado?», «¿qué cambió en mi ranking?» y «¿dónde está mi carrera?». La administración tiene mejores piezas móviles que algunas superficies públicas, pero su inicio no representa toda la carga de trabajo real.

### Qué impide que se sienta excepcional

1. **La verdad deportiva cambia de superficie.** El ranking usa Competition; Home y club público todavía leen `club_players.ranking_points`; el perfil muestra una posición textual provisoria. No son simplemente estilos distintos: pueden contar historias diferentes del mismo jugador.
2. **La promesa pública supera la información entregada.** `/envivo` invita a consultar cruces y resultados, pero el detalle público del torneo contiene casilleros fijos «A definir». El enlace al jugador desde el ranking termina dentro de un guard que requiere sesión.
3. **Hay datos de demostración en una superficie deportiva real.** `PublicClubHomeExperience.tsx:162–198,381–407` completa categorías incompletas con jugadores/puntos ficticios. La etiqueta «Vista demo» existe en JSX, pero `app/styles/public.css:7639` la oculta a ≤640 px. Es el hallazgo de confianza más urgente.
4. **La carga sigue la estructura técnica, no la prioridad humana.** Se bloquea la pantalla hasta resolver ranking completo, listados de potenciales parejas, publicidad o contadores secundarios.
5. **Se acumularon soluciones visuales locales.** Hay componentes buenos, pero no un contrato común suficientemente adoptado. Se alternan filas compactas, cards anidadas, cápsulas, héroes, márgenes negativos y reglas globales acumuladas.

La dirección recomendada no es «más social» ni un rediseño total: **hacer visible y explicable la competencia que ya existe, con una identidad estable y tiempos de espera proporcionados a la tarea**.

### Respuesta a la pregunta central

Abriría SELPA hoy para resolver mi próximo paso, saber cuándo juego o entender un resultado. Volvería mañana si puedo ver un cambio real de mi mundo deportivo sin buscarlo entre módulos. Si no ocurrió nada, SELPA debe decírmelo con honestidad y seguir siendo útil como agenda y archivo, no fabricar novedades.

## B. TOP 10 PROBLEMAS

El orden expresa daño al usuario, no facilidad de implementación. Las fichas P01–P12 desarrollan solución, dependencias y riesgos.

| # | Problema y evidencia concreta | Daño | Prioridad / propuesta |
|---|---|---|---|
| 1 | Ranking de club con ramas demo; etiqueta oculta en mobile. `components/public/PublicClubHomeExperience.tsx:162,189,403`; `app/styles/public.css:7639`. | Reconocimiento deportivo potencialmente ficticio; erosiona toda la confianza. | Muy alto — P01 |
| 2 | Tres lecturas distintas de puntos/posición: Home legacy, ranking Competition, perfil «A definir». `app/(app)/player/page.tsx:212,836`; `features/competition/ranking/competition-ranking.service.ts:4`; perfil de club `:426`. | No puedo explicar mi posición ni confiar en mi progreso. | Muy alto — P01/P03 |
| 3 | La ficha del torneo no consulta mi grupo/próximo partido y repite «A definir». `app/(app)/torneos/[id]/page.tsx:655–691`. | La app pierde utilidad justo cuando empieza el torneo. | Muy alto — P05 |
| 4 | Perfil público reutiliza la ficha administrativa y queda protegido por sesión. `app/(app)/jugadores/[id]/page.tsx:1`; `app/(app)/RoleGate.tsx:11,82`. | Compartir mi identidad no funciona como recorrido público. | Muy alto — P02 |
| 5 | Home espera consultas encadenadas y tres endpoints por club antes de liberar contenido. `app/(app)/player/page.tsx:323–441`. | Mucha espera para información que podría aparecer parcialmente. | Muy alto — P04/P12 |
| 6 | Historial público toma diez inscripciones sin orden, usa categoría actual, pareja genérica y puntos nulos; la lectura propia es más rica pero tampoco usa homologación como autoridad. APIs pública `:105–116` y propia `:314–330`. | La misma carrera cambia según cómo se consulta y no siempre demuestra lo que promete. | Muy alto — P01/P02 |
| 7 | Ranking público filtra antes de numerar y parte de 240 jugadores legacy antes de elegir club. `PublicRankingExperience.tsx:90–122`; `app/ranking/page.tsx`. | Buscar puede cambiar la posición mostrada; el universo de clubes puede quedar incompleto. | Muy alto — P03 |
| 8 | Inicio Club llama URGENTE a cierres sin evaluar proximidad y dice «No hay acciones pendientes» sin consultar cobros/mensajes/conciliaciones. `app/(app)/club/page.tsx:310–342`. | Falsa urgencia o falsa tranquilidad. | Alto — P07 |
| 9 | Noticias de mis clubes en Home son fallbacks fijos; Comunidad monta Home pública; Actividad combina inscripciones/notificaciones limitadas. `player/page.tsx:297,868`; `PublicHomeEmbed`; `PlayerAccountHub`. | Volver no aporta un resumen personal de lo sucedido. | Alto — P04/P10 |
| 10 | Ritmos visuales y targets inconsistentes: perfil monumental, solicitudes con acciones de 29 px, CSS público/navbar global extenso. | Más esfuerzo de lectura, toque y mantenimiento; sensación de productos distintos. | Alto — P08/P11 |

## C. TOP 10 FORTALEZAS

1. **Hay hechos deportivos trazables.** El ledger de Competition conserva origen, fecha efectiva y reversión; homologaciones y liquidaciones/versiones permiten explicar resultados. No es necesario inventar un motor deportivo nuevo.
2. **La separación STAFF ≠ PLAYER está explícita.** `RoleGate`, `accountRolePolicy`, permisos por capability y filtros de cuentas administrativas. La identidad deportiva no debe reabrir esa decisión.
3. **Mi ranking ya ofrece contexto personal.** `app/(app)/player/ranking/page.tsx` calcula mi entorno de posiciones y distancias. «Vos estás acá» no es una feature inexistente: hay que unificarla y abaratar su lectura.
4. **Finance del club y Billing SELPA están separados.** `club/contabilidad`, `features/finance`, `features/billing/BillingExperience`. Cobrar a jugadores no es pagar el servicio SELPA.
5. **Pagos del jugador tiene protecciones útiles.** Estado asociado al usuario, cancelación de requests, paginación, recuperación de checkout y verificación del retorno; no infiere éxito por la URL. `player/pagos/page.tsx`.
6. **El wizard de torneo protege el trabajo.** Borrador local, revisión, edición con retorno y mini-preview condicionado. `club/torneos/nuevo/page.tsx:520,561,910,1791`. Preservarlo, no sustituirlo por un formulario largo.
7. **Listados Club ya tienen composición móvil deliberada.** Torneos/jugadores usan filas compactas y filtros en sheets. No volver a flyers gigantes ni desktop apilado.
8. **Existen primitivas buenas.** `PageHeader`, `PageBackAction`, `PlayerStatePanel`, `humanizeUiError`, feedback y confirmación de acciones. Hay una base real para el Experience System.
9. **Hay trabajo previo de performance que debe conservarse.** `getCurrentSession()` deduplica lecturas simultáneas; `SessionProvider` deduplica refresh; navbar ya no recarga sus contadores por cada cambio de ruta (`:531–543`). No atribuirle regresiones que el código actual ya evita.
10. **La comunidad tiene una unidad natural: el club y su competencia.** Multi-club, parejas, noticias, circuitos y mensajes operativos permiten pertenencia sin construir una red social generalista.

## D. VISIÓN SELPA

«Mi pádel, ordenado. Mi historia, reconocida. Mi próximo paso, claro».

SELPA debería tener tres ritmos, con el mismo lenguaje visual:

- **Hoy:** información breve, contextual y accionable. Si juego esta tarde, eso vale más que un banner o la cantidad global de usuarios.
- **Mi carrera:** archivo estable, verificable y compartible. Se entiende dónde, cuándo y en qué categoría ocurrió cada resultado.
- **Mi club:** personas y competencia reales. Una final, un torneo abierto o una noticia relevante, no una sucesión infinita de contenido.

Para el administrador: «sé qué falta, puedo resolverlo y entiendo qué cambió». La potencia permanece detrás del contexto, no en veinte controles simultáneos.

### Recorridos, no páginas

| Experiencia | Qué ya está | Ruptura actual | Resultado deseado |
|---|---|---|---|
| Nuevo jugador | Descubrimiento, registro, perfil por pasos, ingreso a clubes, pareja e inscripción. | El enlace Login → Register pierde el `next`; la selección de club lleva a Home; completar datos puede preceder demasiado al primer valor. | Conservar la intención de torneo/club a través de registro, aprobación y regreso; pedir datos cuando son necesarios. |
| Jugador que compite | Equipos, inscripciones, pagos, partidos y puntos existen en el modelo. | La superficie pública no acompaña suficientemente el partido ni convierte su resultado en carrera. | Próximo partido → resultado → explicación de puntos → posición → historial. |
| Jugador que vuelve | Home, ranking, actividad, notificaciones. | Resúmenes parciales y contenidos repetidos o provisionales. | En cinco segundos: pendiente prioritario, cambio desde mi última visita verificable y acceso a mi carrera. |
| Club en jornada | Torneos, inscripciones, resultados, solicitudes, finanzas. | El inicio tiene heurísticas incompletas y acciones genéricas. | Cola por vencimiento/contexto con un enlace exacto a resolver cada caso. |
| Platform | Altas, clubes, usuarios, Billing, métricas operativas, logs. | Diagnóstico técnico y operación todavía se mezclan en algunos formularios. | Operación primero; herramientas de diagnóstico bajo demanda. |

No usar «retención» como sinónimo de tiempo dentro de la app. Medir resolución de tareas, comprensión de cambios y retorno asociado a actividad deportiva real. No hay instrumentación validada en esta revisión que permita afirmar tasas actuales.

## E. PLAYER HOME

### Diagnóstico del primer viewport y de la carga

`app/(app)/player/page.tsx` ofrece saludo, club activo, categoría/puntos/posición, prioridad, contadores, accesos, clubes, agenda, mis torneos, pareja, resumen deportivo y noticias. Hay material suficiente; sobra repetición y falta orden por relevancia.

- La posición principal es `'-'` (`:212`). Los puntos visibles provienen de `club_players`, aunque se descarga el endpoint de ranking por club.
- `nextTournament` sale de próximos torneos del club: no representa necesariamente mi inscripción, mi categoría ni mi partido.
- `pendingInvites` agrupa invitaciones pendientes; la prioridad debe distinguir «me toca responder» de «estoy esperando respuesta».
- El contador de mis torneos usa una colección recortada; un preview no puede presentarse como total de carrera.
- «Calendario» entre accesos lleva a `/torneos` (`:605` en adelante), no a una agenda personal.
- El resumen reciente etiqueta todo partido `PLAYED` no ganado como perdido (`:853`); un resultado sin ganador válido no debe convertirse automáticamente en derrota.
- Las noticias por club (`:297,868–880`) son textos fallback construidos, no una consulta a noticias publicadas. No significa que los clubes carezcan de noticias: significa que Home no las lee.
- El cambio a Comunidad monta `PublicHomeEmbed`, que trae `/api/public/home` con `no-store`. Es exploración global, no «mi comunidad». Al desmontar/remontar se vuelve a pedir.

### Composición recomendada

| Orden | Contenido | Regla |
|---|---|---|
| 1. Necesito hacer | Próximo partido con hora/sede/cancha; invitación recibida; inscripción o pago que requiere mi acción. | Un protagonista; hasta dos pendientes secundarios. Hora y estado explícitos. Nunca mostrar deuda en la vista pública. |
| 2. Cambió | Resultado confirmado, puntos publicados, cambio de pareja o de inscripción. | Últimos cambios relevantes, con fecha y enlace a la fuente. No inventar variación de ranking. |
| 3. Mi progreso | Posición en un ámbito definido, puntos y último resultado verificable. | Tres datos útiles; entrar a Mi carrera. Sin hero adicional ni gráfico decorativo vacío. |
| 4. Mi mundo | Torneos elegibles, noticia publicada de mis clubes, actividad competitiva reciente. | Relevancia por pertenencia y competencia; explorar otros clubes como salida secundaria. |

Cuando no tengo club: explicación breve, buscar club, explorar torneos. Cuando tengo solicitud pendiente: estado y siguiente paso, sin repetir el formulario. Cuando no hay novedades: conservar agenda/carrera y decir «No hay cambios nuevos», no poblar con tarjetas vacías.

### P04 — Home que decide qué importa

- **Problema/evidencia/ruta/archivo:** los puntos anteriores en `/player`, `app/(app)/player/page.tsx:206–441,560–880`, `components/public/PublicHomeEmbed.tsx`.
- **Solución:** resumen personal pequeño con pendientes tipados por acción/fecha, último cambio y progreso canónico. Separar lectura crítica de pareja ampliada, otras comunidades y noticias. Mantener club activo como contexto, no como obligación de repetir toda la información por club.
- **Impacto usuario:** muy alto; responde por qué entrar hoy y evita buscar un partido o pendiente dentro de módulos.
- **Performance:** quitar el ranking administrativo completo del camino crítico y el fan-out de tres endpoints por cada club; refrescar sólo el dato afectado al responder invitaciones.
- **Complejidad:** alta por composición entre dominios, no por diseño de cards.
- **Dependencias:** P01, estados canónicos de partido/inscripción/Finance, P12 para carga parcial. No requiere un modelo nuevo de roles.
- **Riesgo:** ordenar mal una obligación, mostrar un pago ya conciliado o mezclar contextos. Revalidar al actuar; no declarar pagos confirmados de forma optimista.

## F. PLAYER IDENTITY

### La unidad de identidad

El perfil global es la persona; `club_players` es su vínculo deportivo con un club. No son intercambiables. Una carrera puede reunir participaciones de varios clubes, pero **sus puntos no se suman entre rankings incompatibles**.

La API pública (`app/api/players/[playerId]/public-profile/route.ts:41`) admite `id` o `user_id`, filtra aprobado y aplica `limit(1)` sin orden. Con un `user_id` multi-club puede elegir un contexto distinto al esperado. Con un `club_player_id` la URL queda ligada a ese vínculo. Resolver identidad y contexto debe ser una decisión explícita antes de agregar un slug bonito.

### Inventario de datos — clasificación obligatoria

«Ya existe» indica datos/lectura presente, **no certificación de calidad de producción**. «Derivable» requiere una proyección de lectura o lógica, pero no necesariamente tablas nuevas. «Backend nuevo» señala un contrato o persistencia histórica no identificado de forma suficiente en la experiencia actual. La matriz separa disponibilidad de datos y calidad de presentación.

| Dato | Clasificación | Fuente disponible y condición para mostrarlo |
|---|---|---|
| Foto | YA EXISTE | `profiles.avatar_url`, flujo de assets; no bloquear carrera si falta. |
| Portada | YA EXISTE | `profiles.cover_url`; migración `20260718000001_profile_contact_and_cover.sql`. Opcional y subordinada al contenido. |
| Nombre | YA EXISTE | Nombre global/perfil y display del club; definir precedencia, no tres nombres públicos distintos. |
| Club | YA EXISTE | Membership aprobada y vínculo deportivo; mostrar varios clubes cuando corresponda, con contexto activo explícito. |
| Categoría actual | YA EXISTE | `club_players.category` y divisiones; es contextual al club/competencia, no una categoría universal. |
| Categoría histórica | DERIVABLE | Torneo/división y snapshots de homologación/participantes. No sustituir por categoría actual. |
| Ranking actual | YA EXISTE | Servicio Competition y proyecciones de circuito. Perfil todavía no lo presenta correctamente. Incluir temporada, rama, categoría y modalidad. |
| Puntos | YA EXISTE | Ledger y proyecciones vigentes; `ranking_points` legacy no debe actuar como alternativa silenciosa. |
| Variación de ranking | REQUIERE BACKEND NUEVO | No se identificó contrato de snapshots comparables de posición publicada para Player. El ledger permite investigar replay, no certificar «subí 3» por sí solo. |
| Partidos | YA EXISTE | `tournament_matches` y conteos homologados; definir jugado vs bye/WO/administrativo. La API actual cuenta `PLAYED`. |
| Victorias | YA EXISTE | `winner_team_id` y conteos homologados. Exigir ganador válido y participación real. |
| Derrotas | YA EXISTE | Las APIs calculan `partidos - victorias`; corregir denominador si incluye registros incompletos/no deportivos. |
| Win rate | YA EXISTE | Calculado en stats; mostrar denominador y ámbito. Cero partidos significa «sin partidos», no 0% de rendimiento. |
| Torneos jugados | DERIVABLE | Participación deportiva efectiva u homologada. Inscripción pendiente/cancelada no significa haber jugado; la API actual cuenta inscripciones distintas. |
| Títulos | YA EXISTE | Resultado `CHAMPION` en homologación/proyección; conteo actual del perfil basado sólo en fase `FINAL` es insuficiente para todos los formatos. |
| Finales | YA EXISTE | `RUNNER_UP`, `CHAMPION`, posiciones y proyecciones. Acordar si «finales» incluye títulos y explicarlo. |
| Semifinales | DERIVABLE | Placements/homologaciones y proyecciones de circuito ya contemplan `SEMIFINALIST`; falta exponer carrera consolidada. |
| Mejor resultado | DERIVABLE | Mejor placement válido por temporada/ámbito; no deducir por puntos, que dependen de reglas y multiplicadores. |
| Historial | YA EXISTE, PARCIAL | La API propia añade categoría del torneo, pareja y resultado inferido; la pública es una lista de inscripciones. Derivar versión oficial desde participante → resultado aprobado → publicación/corrección. |
| Resultados recientes | YA EXISTE, PARCIAL | La API propia entrega ocho partidos con rival/pareja; la pública devuelve `recent_matches: []`. Unificar y ordenar por fecha deportiva confiable. |
| Pareja actual | YA EXISTE | Active partnerships por club; no necesariamente la pareja de todos los torneos. |
| Compañeros frecuentes | YA EXISTE, PARCIAL | La API propia calcula frecuencia desde equipos/partidos; la pública devuelve `frequent_partner: null`. Ajustar a participaciones efectivas y período definido. |
| Evolución de puntos | DERIVABLE | Ledger `effective_at`, origen, reversión y publicación. Distinguir evolución reconstruida de «lo publicado entonces». |
| Evolución de posiciones | REQUIERE BACKEND NUEVO | Snapshot/versionado de ranking comparable o replay probado con universo y reglas históricas. No basta restar puntos. |
| Rachas deportivas | DERIVABLE | Secuencia de partidos computables con orden verificable. No usar `created_at` como fecha de juego ni comparar circuitos sin explicitarlo. Si faltan datos, no mostrar. |
| Palmarés | DERIVABLE | Resultados deportivos aprobados/vigentes, incluso eventos no puntuables. No usar sólo movimientos de puntos: existen resultados con cero puntos. |
| Temporada | YA EXISTE | `competition_seasons` y relación de eventos/ledger. Un año calendario no equivale necesariamente a una temporada. |
| Logros factuales | DERIVABLE | Primer torneo efectivo, primera final/título, diez partidos; con fecha y evidencia. Correcciones pueden retirar el logro. |
| Mejor ranking histórico | REQUIERE BACKEND NUEVO | Mismo problema de snapshots comparables; el perfil hoy reutiliza una etiqueta provisoria, no una marca histórica. |

Fuentes principales: API pública de perfil `:69–180`; migraciones `20260718000000_global_sports_profile.sql`, `20260729_competition_points_ledger_stage4.sql:29–100`, `20260802150000_competition_event_homologation_stage5a4.sql:12–100`, `20260903120000_competition_homologation_full_placements.sql`, `20260929113440_competition_canonical_playoff_placements.sql`; proyección `features/competition/series/competition-series.point-history.ts` y migración `20260912190000_competition_series_reversal_aware_ranking.sql`.

Contraste importante: `app/api/clubs/[clubId]/players/[playerId]/profile/route.ts:298–402` ya calcula compañeros frecuentes, historial con pareja/categoría y partidos recientes; no hay que construirlos desde cero. Sin embargo, cuenta como torneos jugados inscripciones no canceladas y calcula el mejor resultado recorriendo partidos sin filtrar `PLAYED` en ese tramo (`:318–321`). Una fase asignada no equivale a un resultado logrado. La lectura pública y la propia necesitan el mismo contrato deportivo, con distinta exposición de campos, no dos algoritmos paralelos.

### P01 — Una verdad deportiva visible

- **Problema:** la UI combina datos legacy, inscripciones, placeholders y resultados oficiales sin distinguirlos.
- **Evidencia/rutas/archivos:** `/player`, `/perfil`, `/jugadores/[id]`, `/ranking`, `/clubs/[clubId]`; Home `:212,836`, API pública `:90–116`, club público `app/clubs/[clubId]/page.tsx:115–145`, rama demo del componente público.
- **Solución:** contrato de lectura de carrera con identidad estable, ámbito competitivo, procedencia, fecha de actualización y cobertura. Adaptar los modelos existentes; retirar datos demo del recorrido real; conservar compatibilidad sin usar fuentes viejas como fallback oculto.
- **Impacto usuario:** muy alto; hace creíbles ranking, palmarés y reconocimiento.
- **Performance:** resumen agregado/versionado evita recalcular toda la carrera en cada consumidor. No crear una API gigantesca que repita el problema.
- **Complejidad:** alta. **Dependencias:** catálogo de definiciones anterior, muestras de fixtures por formato, comprobación futura de cobertura de migraciones/datos.
- **Riesgo:** doble conteo de homologaciones corregidas, juntar puntos de ámbitos diferentes, borrar historia al excluir un vínculo actual. No hacer backfills ni cambios de reglas como efecto secundario.

## G. PUBLIC PLAYER PROFILE

### Lo que hay y lo que comunica

`/perfil` actúa como entrada a la ficha de un vínculo deportivo; `/jugadores/[id]` reexporta `club/jugadores/[id]/page.tsx`. La API pública permite lectura anónima, pero la página cae dentro de `RoleGate`: un visitante no recibe una identidad compartible directa.

La ficha presenta portada, avatar, datos físicos, resumen, historial, estadísticas y logros. En mobile la portada es 164 px y el avatar 148 px (`:692–700`); hay información de mano/posición/altura antes de parte de la carrera. Los tabs cambian estado y hacen `scrollIntoView`, pero las secciones siguen montadas (`:408`): son navegación por anclas con apariencia de tabs, no vistas independientes.

El modo propio dispone de más detalle deportivo que el público —parejas frecuentes y partidos recientes—, aunque conserva inferencias que necesitan corrección. La oportunidad es compartir una base confiable y preservar ese trabajo, no reemplazarlo por una ficha nueva que pierda funciones.

«Pareja registrada», puntos nulos y «Mejor ranking: A definir» no deben ocupar el mismo estatus visual que un título comprobado. La privacidad también necesita coherencia de producto: `PlayerAccountHub` habla de compartir información en espacios de participación, mientras la API es pública. No publicar más campos sólo porque estén disponibles en un perfil.

### Perfil deseado

Cabecera compacta: nombre, foto, clubes, ámbito seleccionado y una acción Compartir. Debajo: posición/puntos de ese ámbito, último resultado y palmarés. Navegación: Resumen · Torneos · Estadísticas, con temporada/club visibles y persistentes. Datos personales/deportivos editables secundarios en «Mi información», no como protagonista público.

Una tarjeta compartible debería decir algo verdadero y concreto: nombre, club/contexto, temporada y resultado verificable. No incluir teléfono, email, fecha de nacimiento, pagos ni solicitudes. Considerar especialmente visibilidad de menores antes de ampliar exposición.

### P02 — Mi carrera, privada para gestionar y pública para compartir

- **Problema/evidencia:** enlace público con guard, componente administrativo reutilizado y ausencia de metadata específica. Rutas `/perfil`, `/jugadores/[id]`; archivos anteriores y `app/layout.tsx` con metadata genérica.
- **Solución:** separar lectura pública de controles privados, conservando identidad y vínculos; URL canónica estable (ID opaco primero, slug opcional con resolución unívoca), metadata por perfil y share card server-rendered desde datos públicos. QR sólo como otro acceso a esa misma URL; no es un sistema nuevo.
- **Impacto usuario:** muy alto: «mirá mi carrera» en vez de «mirá mi panel». **Performance:** identidad y resumen en la primera respuesta; historial paginado; gestión de pareja/fotos carga al abrirse.
- **Complejidad:** alta. **Dependencias:** P01, política explícita de visibilidad, URL/canonical/OG y contrato público sin datos privados.
- **Riesgo:** caché pública de información privada, confundir identidad global con vínculo de club, compartir una marca desactualizada. Nunca ampliar el guard administrativo completo para resolver el enlace.

No priorizar diseño de QR o un generador de flyers personales antes de que el enlace abra sin sesión y el palmarés sea correcto. El orgullo viene del resultado y su contexto, no de la ornamentación.

## H. PROGRESS / PALMARÉS / STATS

### Progreso que merece existir

Primera participación efectiva, primera semifinal/final/título, resultado reciente, puntos publicados y próximo objetivo competitivo. Todos deben abrir una prueba deportiva: torneo, resultado y regla aplicable. Evitar «racha» sin especificar si es de partidos, torneos, temporada o club.

La API actual calcula títulos/finales mirando `phase === 'FINAL'`; el modelo más rico ya conserva homologaciones, participantes, posiciones y correcciones. La proyección de historial de circuito explica puntos y reversos, pero **no debe reutilizarse sin adaptación como palmarés universal**: filtra awards sin puntos efectivos (`competition-series.point-history.ts:80`), por lo que puede omitir logros no puntuables.

### Contrato de confianza para P01/P02/P03

| Afirmación | Evidencia necesaria | Qué mostrar si falta |
|---|---|---|
| «Ganaste» | Partido válido finalizado o resultado homologado vigente. | Resultado pendiente de confirmación. |
| «Campeón» | Placement aprobado vigente para ese evento/división, no sólo puntos altos. | No otorgar título por inferencia. |
| «Sumaste 120 puntos» | Publicación efectiva del ledger y vínculo al evento; considerar reversos. | Resultado registrado, puntos pendientes, si ese estado está demostrado. |
| «Subiste 3 posiciones» | Dos posiciones comparables: mismo club/circuito, temporada, división, modalidad, regla y corte. | Posición actual, sin flecha ni delta. |
| «Nuevo mejor ranking» | Serie histórica completa y comparable desde una fecha declarada. | Omitir la marca. |
| «Jugaste 8 torneos» | Ocho participaciones deportivas deduplicadas, no ocho inscripciones. | Inscripciones: 8, si ése es el dato real. |

Primero lanzar progreso factual con los datos existentes; después habilitar comparaciones temporales donde pueda demostrarse integridad. Un replay del ledger puede reconstruir puntos, pero la posición histórica requiere también el universo de competidores, elegibilidad, reglas y cortes. `created_at` y `effective_at` responden preguntas distintas: cuándo se registró/publicó y a qué fecha deportiva aplica.

Las correcciones deben ser normales y comprensibles: «Resultado actualizado por el club» y fuente vigente. No duplicar título, conservar un logro revocado ni reenviar el mismo festejo tras cada recálculo.

Visualmente: palmarés en filas compactas con insignia del resultado, torneo, categoría, pareja y fecha; un título puede destacarse sin convertir cada participación en una card gigante. Gráfico sólo con serie suficiente, ejes/intervalo claros y alternativa textual; tres puntos sin contexto no justifican una gráfica de progreso.

## I. COMMUNITY / ACTIVITY

### Actividad actual

`/actividad` usa `components/player/PlayerAccountHub.tsx`. Consulta equipos → hasta doce inscripciones → torneos → hasta ocho notificaciones, luego mezcla y recorta a diez elementos. Las notificaciones podrían cargarse independientemente. Los contadores derivados de esas muestras no representan totales generales.

Una inscripción confirmada se fecha mediante `created_at` de la inscripción, no necesariamente por el momento de confirmación. La colección no tiene un modelo común de evento deportivo ni deduplicación entre la notificación y el objeto que originó esa notificación. Sirve como historial reciente de gestiones, pero todavía no como «lo que pasó en mi pádel».

### Reparto de responsabilidades

| Superficie | Pregunta | Contenido y caducidad |
|---|---|---|
| Home | ¿Qué necesito saber/hacer ahora? | Resumen pequeño; pendiente desaparece al resolverlo, resultado reciente deja lugar al siguiente. |
| Actividad | ¿Qué cambió y cuándo? | Cronología filtrable de hechos deportivos/gestiones propios; conserva contexto e historial. |
| Notificaciones | ¿Qué requiere mi atención? | Invitación recibida, reprogramación, decisión sobre inscripción/pago, publicación relevante. Lectura no equivale a acción resuelta. |
| Noticias | ¿Qué quiere comunicar el club/SELPA? | Contenido editorial publicado: crónica, anuncio, información útil. No duplicar cada movimiento de ranking. |
| Club público | ¿Qué está pasando acá? | Próxima competencia, último resultado/campeones, ranking por ámbito y noticias reales. |
| Mensajes | ¿Qué necesito conversar para resolver un caso? | Hilos con club vinculados a torneo/pago/baja. No un chat generalista. |

El mismo hecho puede resumirse en Home y existir en Actividad, pero tiene un solo identificador y fuente. Una notificación es una entrega de ese hecho, no otro hecho. Publicar una crónica editorial sobre una final no obliga a notificar también cada partido, el título y cada punto por separado.

### P10 — Comunidad de hechos, no feed de relleno

- **Problema/evidencia/rutas:** `/actividad`, `/player`, `/clubs/[clubId]`, `/notificaciones`; `PlayerAccountHub`, fallbacks de Home, `PublicHomeEmbed`, `PublicClubHomeExperience`.
- **Solución:** proyección de eventos normalizada (`tipo`, entidad/origen, ámbito, actor público cuando corresponda, fecha deportiva y fecha de publicación, versión, destino, visibilidad). Empezar con resultados/puntos publicados, inscripciones y noticias ya existentes. Agrupar cambios de un mismo torneo y paginar por cursor.
- **Impacto usuario:** alto: pertenencia y regreso por novedades reales. **Performance:** evitar reconstruir toda la cronología desde tablas completas en cada visita; lectura acotada y paralela al resumen de Home.
- **Complejidad:** alta para un stream persistente; media para una primera lectura agregada sin notificaciones nuevas.
- **Dependencias:** P01, contratos de publicación/corrección y audiencia; estados financieros siempre privados. Para «desde tu última visita» persistente entre dispositivos, hace falta un watermark confiable; no usar un flag local como verdad global.
- **Riesgo:** duplicados, ruido, novedades fuera de ámbito, filtración de gestiones privadas. No implementar push masivo como requisito de esta propuesta.

Sin actividad deportiva no debe haber un feed artificialmente poblado. Mostrar próximo torneo, explorar el club o explicar que aún no hubo resultados publicados es más valioso que una actividad genérica repetida.

## J. RANKING

### La velocidad importa, pero primero importa qué significa el número

`app/ranking/page.tsx` obtiene hasta 240 `club_players` ordenados por puntos legacy antes de resolver el ranking canónico. Esa semilla determina clubes y parte de los cruces de identidad. Si un club o jugador no entra allí, el filtro posterior no lo recupera. Además, un mapa por usuario no representa correctamente todas las combinaciones usuario-club.

`PublicRankingExperience.tsx:90–122` filtra por búsqueda y después llama `withRankingPositions`. `lib/ranking.ts:49` numera la colección que recibe. Caso reproducible por inspección: buscar sólo a un jugador que estaba quinto puede mostrarlo primero. Filtrar nombres debe reducir filas visibles, no redefinir su posición deportiva.

Los clubes se seleccionan por nombre (`:64–99`) en vez de ID; nombres iguales no son una identidad suficiente. El estado inicial usa query params, pero hace falta un contrato de URL completo para compartir exactamente club, temporada, división y modalidad.

`/player/ranking` ya destaca mi posición y vecinos; hoy descarga el endpoint administrativo completo. `/ranking/damas` y `/ranking/caballeros` son entradas al mismo ranking, no productos separados. Mantener sus URLs y consolidar comportamiento; no generar rankings paralelos con reglas distintas.

### P03 — Ranking contextual, estable y rápido

- **Problema:** posición sensible a búsqueda, lectura acotada por una semilla legacy y endpoint excesivo para ver mi puesto.
- **Evidencia/rutas/archivos:** `/ranking`, `/ranking/damas`, `/ranking/caballeros`, `/player/ranking`; `app/ranking/page.tsx`, `PublicRankingExperience.tsx:64–132`, `lib/ranking.ts:49`, API `clubs/[clubId]/ranking/route.ts`.
- **Solución:** calcular posición en el universo competitivo completo y filtrado por ámbito, luego buscar/paginar manteniendo esa posición. Identificar club por ID. Dar una lectura pública de ranking y otra pequeña de «mi posición + vecinos», ambas con las mismas reglas; distinguir individual/pareja/circuito y temporada. Conservar las proyecciones de circuito y sus desempates, no reemplazarlas por orden alfabético genérico.
- **Impacto usuario:** muy alto; encuentro mi lugar y entiendo con quién me comparo. **Performance:** evita descargar pipeline administrativo, todos los partidos y todos los clubes para una consulta contextual.
- **Complejidad:** alta. **Dependencias:** P01, empates/cortes/paginación definidos, contrato de búsqueda y ámbitos. Deltas dependen del backend histórico de F, no bloquean esta mejora.
- **Riesgo:** cambiar reglas deportivas al unificar presentación; excluir jugadores por límite de API; confundir ranking global exploratorio con una competencia oficial.

Fila móvil recomendada: posición, avatar, nombre, puntos; debajo sólo el contexto necesario. Resaltar mi fila con texto «Vos», no sólo color. Títulos y variación son secundarios y sólo cuando están certificados. Un acceso «Ir a mi posición» es más útil que un podium enorme. En 320 px no debe ser necesario deslizar una tabla para saber puesto y puntos.

## K. TOURNAMENTS

### Antes de inscribirse

Las cards y la ficha ya incluyen club, categoría, rama, estado, fechas, cupos y precio. `TournamentPublicCard` reutiliza flyer y una superficie clickeable con nombre accesible; hay una variante `compactAgenda` que conviene preservar. El problema no es ausencia total de información, sino jerarquía y consistencia de estado.

`lib/publicTournamentItems.ts` trae hasta 96 torneos ordenados ascendentemente, excluye draft/cancelado/archivado pero incluye finalizados y luego filtra en cliente. Los históricos viejos pueden consumir la ventana antes de que se busque un torneo nuevo. Trae registros de inscripción para contar en JavaScript y reglas completas para cards que sólo requieren una proyección corta.

En el detalle (`app/(app)/torneos/[id]/page.tsx`) se repiten cupos, formato y llamados a inscribirse; un bloque «Tu torneo» ocupa espacio aun para quien no se inscribió. `formatMoney` convierte cero y ausencia en «A confirmar» (`:151`): no distingue torneo gratuito de precio no informado. `availableSlots` puede caer a cero cuando no hay capacidad definida (`:440`): desconocido no es agotado.

El CTA está condicionado por plazo/pausa en el bloque inspeccionado (`:615–645`); su presentación debería derivarse del estado operativo completo, capacidad y situación del visitante. La API sigue siendo autoridad para admitir el write; esta propuesta es claridad, no otro hardening.

### Después de inscribirse y jugar

El tablero personal muestra grupo, próximo partido y posición como literales «A definir», incluso con una inscripción válida (`:662–679`). Su DTO público no trae esos campos deportivos. `/envivo` filtra torneos en juego; no es un marcador en vivo ni consulta resultados por partido. Su copy promete cruces/agenda/resultados al entrar al torneo (`PublicAgenda.tsx:17`), pero ese destino no materializa esa promesa en el código inspeccionado.

Éste es un corte central del recorrido: la competencia existe para el organizador, pero no vuelve suficientemente al participante/espectador. «En vivo» debería significar seguimiento de datos publicados, no sólo estado RUNNING; tampoco prometer actualización segundo a segundo sin un mecanismo real.

### P05 — El torneo acompaña toda la competencia

- **Problema/evidencia:** fichas centradas en captación y casilleros posteriores sin datos; listado limitado antes de filtrar. Rutas `/torneos`, `/torneos/calendario`, `/envivo`, `/torneos/[id]`, `/player/torneos`; archivos anteriores, `api/tournaments/[tournamentId]/public-detail/route.ts` y `player/torneos/TournamentsPlayerView.tsx`.
- **Solución:** ficha por fase. Abierto: datos de decisión y una inscripción clara. Inscripto: pareja, pago/confirmación y próximo paso. En juego: agenda/mi partido, resultados publicados y cuadro accesible. Finalizado: campeón, resultado propio, puntos y acceso a carrera. Reutilizar lecturas de partidos/competencia con DTO público explícito; no exponer el panel administrativo entero.
- **Impacto usuario:** muy alto; SELPA pasa de formulario de entrada a compañera del torneo. **Performance:** separar ficha pública cacheable de situación privada y agenda actual; listas paginadas en servidor con filtros antes del límite.
- **Complejidad:** alta. **Dependencias:** estados de publicación, formato/placements, vínculos equipo-jugador, fuente autorizada de agenda/sedes, P01/P12.
- **Riesgo:** mostrar agenda provisional como confirmada; ubicar al jugador en el club organizador cuando juega en otra sede; contar una bye como victoria deportiva. No asumir todas las canchas propias: consumir relaciones de sedes/canchas existentes, verificar cobertura por formato.

En cinco segundos se debe poder contestar: torneo, club, fecha, categoría/rama, estado, cupos, precio por jugador o pareja y próximo paso. Reglas/puntos detallados/sistema de desempate van en disclosure, sin desaparecer para quien los necesita.

### P06 — Conservar la intención durante acceso e inscripción

- **Problema/evidencia:** Login preserva `next` (`login/LoginPageClient.tsx:36–45,147`), pero el link a `/register` (`:216`) no lo conserva; Register termina en `/register/success?email=...` (`register/page.tsx:142`). La selección de club navega a `/player` o `/club`, no al contexto de origen. Registro y perfil son pasos válidos; el hilo conductor se corta.
- **Rutas/archivos:** `/login`, `/register`, `/register/success`, `/completar-perfil`, `/seleccionar-club`, `/clubs`, `/torneos/[id]/inscripcion`; `app/completar-perfil/page.tsx`, `app/(app)/seleccionar-club/page.tsx` y páginas auth.
- **Solución:** intención de retorno validada y conservada a través de email/OAuth/onboarding/solicitud; explicar «Para inscribirte en este torneo necesitás…». Datos deportivos opcionales después del mínimo necesario; no eliminar requisitos de elegibilidad sin decisión de negocio. Al esperar aprobación, conservar torneo favorito/intención sin generar inscripción ficticia.
- **Impacto usuario:** alto; menos pérdida de contexto y abandono. **Performance:** reutilizar sesión/contexto ya resuelto, no encadenar lecturas repetidas de membresías al avanzar.
- **Complejidad:** media. **Dependencias:** contrato seguro de destino interno, estado de perfil/membership actual, validaciones ya existentes.
- **Riesgo:** volver a una ruta incompatible con rol/estado o reejecutar una acción. Regresar a la pantalla no equivale a autoinscribir.

La inscripción ya tiene cuatro pasos, búsqueda de pareja, disponibilidad, pago y borrador local identificado por torneo/usuario (`inscripcion/page.tsx:148,403–455`). Preservar esas protecciones. El envío de inscripción seguido de solicitud de pago es una secuencia real, no un único resultado instantáneo: en una interrupción, mostrar qué quedó registrado y qué falta. No optimizarla con una confirmación falsa.

## L. CLUB PUBLIC

`/clubs/[clubId]` ofrece torneos, ranking y noticias. Es mejor base para una comunidad deportiva que una web institucional vacía, pero hoy mezcla fuentes y puede completar ausencias con demo. La home consulta `clubs`, no el DTO completo de perfil institucional publicado; no utiliza portada, instalaciones y relato de forma integral en el camino inspeccionado (`app/clubs/[clubId]/page.tsx:151–158,285–305`).

El ranking del club se construye con `club_players.ranking_points` (`:115–145`), distinto de `/ranking`. El contador de torneos usa la ventana de hasta 96, no necesariamente un total histórico. Noticias/publicidad se consultan después de resolver torneos y circuitos aunque parte de su lectura es independiente. Errores de estas consultas se omiten y parecen ausencia de contenido.

Aplicar P01/P10/P11 con este orden:

1. Nombre, ubicación y pertenencia; acción Entrar/solicitar ingreso según contexto, sin mezclar alta de un club con ingreso como jugador.
2. Próximo torneo o jornada en curso; acceso directo a calendario.
3. Últimos resultados publicados/campeones reales; fecha y categoría.
4. Ranking contextual y jugadores, sin ramas ficticias ni puntos legacy como segunda verdad.
5. Noticias reales; ubicación, contacto, instalaciones y horarios en información útil desplegable.

Si el club no tiene competencia publicada, mostrarlo claramente. Si tiene sólo Damas, mostrar sólo esa rama: no simetrizar con Caballeros demo. La ausencia de una rama es información válida.

La página institucional/edición de perfil del club debe servir a este mismo destino público. No crear una tercera portada corporativa competidora. Patrocinio subordinado a la jornada, con identificación comercial y sin carrusel que desplace la tarea principal.

## M. CLUB ADMIN

### La home promete más cobertura de la que consulta

`api/clubs/[clubId]/summary/route.ts` reúne club, conteos de jugadores/membresías, hasta 30 torneos y grupos/staff. No es una bandeja completa de operación. `club/page.tsx:310–315` toma un torneo con grupos generados y dos con fecha de cierre, marca URGENTE por existencia de fecha y recorta a tres prioridades.

Además, muestra creación de torneo/circuito de forma general (`:349–350`), mientras `RoleGate` controla capabilities al entrar. Para un rol que no puede crear, eso puede ser un callejón de navegación, no necesariamente un bypass de permisos. Corregir la visibilidad por las capabilities existentes, sin rediseñarlas.

### Auditoría del trabajo cotidiano

| Trabajo | Estado real | Simplificación recomendada |
|---|---|---|
| Solicitudes | `club/solicitudes/ClubRequestsPage` agrupa altas, bajas y pagos; altas también se revisan desde jugadores. | Una cola y un detalle; accesos contextuales al mismo caso, no dos versiones del estado. |
| Torneos | Listado móvil compacto con filtros en sheet; wizard con revisión/borrador. | Preservar composición. Home debe abrir torneo y tarea exactos, no siempre listado general. |
| Inscripciones | Gestión de parejas, pagos, seed y grupos en `club/inscripciones/page.tsx`. | Traducir «seed» a «orden inicial» con ayuda; separar tarea de cobro de generación competitiva, manteniendo confirmación en operaciones que congelan estado. |
| Partidos/resultados | Operación distribuida entre torneo/partidos/Competition. | Cola de partidos por resolver con destino concreto; diferenciar cargar, confirmar resultado y publicar puntos. |
| Jugadores | Búsqueda, filtros por categoría/estado/tipo, página y solicitudes; toda la lista se carga antes de paginar visualmente. | Conservar filas/sheet; paginación/búsqueda server-side al crecer y mantener filtros al volver. |
| Cobros | Finance canónico tiene obligaciones, movimientos, reportes y conciliaciones. | Home resume pendientes/importe/contexto sólo si el rol puede verlos; abrir la obligación, no repetir el motor contable. |
| Conciliaciones | Módulo específico existente. | Separar «falta registrar» de «hay diferencia por revisar»; no igualar saldo pendiente con error de caja. |
| Mensajes | `PampraxInbox` por scope, hilos operativos. | Mostrar pendientes relevantes vinculados al caso; historial no bloquea listado inicial. |
| Estadísticas/reportes | `club/estadisticas` usa analytics por período; `club/reportes` consulta conteos generales y métricas propias. | Un destino de análisis con período/definiciones; no confundir inscripciones/torneos con conversión de personas. Reportes financieros permanecen en Finance. |
| Contenido/configuración | Noticias/publicidad y configuración en módulos separados; configuración vuelve a cargar datos/branding tras guardar. | Agrupar por tarea: identidad pública, operación y equipo. Formularios opcionales bajo disclosure; refrescar sólo lo afectado. |

### P07 — Centro operativo APB

- **Problema:** prioridades incompletas, urgencia sin umbral, creación sin filtrado contextual y duplicación de destinos.
- **Evidencia/rutas/archivos:** `/club`, `/club/solicitudes`, `/club/inscripciones`, `/club/contabilidad`, `/club/mensajes`; `club/page.tsx:309–352`, `api/clubs/[clubId]/summary/route.ts`, `ClubRequestsPage`, `PampraxInbox`.
- **Solución:** resumen operativo por capability y horizonte temporal; cada elemento tiene entidad, motivo, fecha, gravedad y CTA exacto. Orden: jornada de hoy, solicitudes que bloquean participación, cobros/conciliaciones por revisar, mensajes operativos. Separar «sin pendientes consultados» de «no pudimos consultar» y de «no tenés acceso».
- **Impacto usuario:** muy alto para Club; reduce clicks y errores por falsa tranquilidad. **Performance:** consultar conteos/previews acotados, no descargar cada módulo; carga independiente por bloque y actualización local confirmada.
- **Complejidad:** alta. **Dependencias:** contratos de lectura de módulos existentes, deadlines/timezone, permisos canónicos y enlaces de foco.
- **Riesgo:** mostrar importes a roles sin capability, sumar pendientes duplicados, transformar «urgente» en ruido. No implementar decisiones masivas ni nuevas facultades por comodidad.

APB no significa eliminar toda confirmación. Una aprobación rutinaria puede tener feedback directo; una baja, reversión, suspensión o congelamiento deportivo necesita un resumen concreto de alcance y consecuencia. «¿Estás seguro?» sin explicar qué cambia no aporta control.

## N. PLATFORM

`components/platform/PlatformOverview.tsx` ya distingue overview de analytics, aclara que sus métricas no representan uso/retención y agrupa el archivo financiero legacy en un disclosure. Es una buena decisión a preservar.

`PublicClubRequests` tiene revisión expandible, motivo de rechazo y retiro local de la fila tras éxito. `platform/solicitudes` también maneja clubes `PENDING_APPROVAL`: son entidades distintas, pero el operador necesita una sola lectura de «altas por revisar» con origen y estado claros.

Clubes/usuarios tienen tabla desktop y composición móvil, además de interacción de teclado en filas; no corresponde clasificarlos enteramente como desktop sin adaptación. Sí mantienen lógica/formularios locales extensos y recargan listados después de cambios. Los loaders de esas páginas, configuración y logs no tienen una protección de red uniforme.

`platform/configuracion` expone primero comisión legacy en bps/moneda, aclarando que no configura planes Billing. `platform/logs` presenta seis filtros, hasta 120 registros y metadata técnica; sus filas tienen `onClick` sin control equivalente de teclado en el fragmento inspeccionado. Logs es un lugar legítimo para diagnóstico, pero no debe dominar operación cotidiana.

### P09 — Plataforma operacional con diagnóstico bajo demanda

- **Problema/evidencia/rutas:** `/platform`, `/platform/solicitudes`, `/platform/clubs`, `/platform/usuarios`, `/platform/facturacion`, `/platform/analytics`, `/platform/configuracion`, `/platform/logs`; `PlatformOverview`, `PublicClubRequests` y sus páginas.
- **Solución:** mantener tres destinos conceptuales: Operación, Facturación SELPA y Diagnóstico. Altas unificadas visualmente por origen sin fusionar entidades; definición visible de métricas; configuración legacy secundaria; logs paginados con detalle accesible y filtros avanzados plegables.
- **Impacto usuario:** medio en la experiencia global, alto para el operador habitual. **Performance:** listas/diagnóstico acotados, refetch sólo del caso afectado y recuperación de errores de red.
- **Complejidad:** media. **Dependencias:** P08, destinos canónicos existentes. Billing no se mezcla con Finance Club.
- **Riesgo:** esconder información necesaria para soporte o perder trazabilidad. Mantener acceso experto y enlaces profundos; no borrar archivo legacy ni reescribir roles.

No convertir Analytics en un dashboard de métricas de vanidad. Cantidad de perfiles no es jugadores activos; clubes registrados no es clubes con torneos operados. Cualquier nueva métrica de producto debe tener evento, denominador, ventana temporal y finalidad explícitos.

## O. PUBLIC EXPERIENCE

### Evaluación de entradas

| Entrada | Qué aporta hoy | Problema / decisión |
|---|---|---|
| `/` | Torneos, noticias, clubes, llamados a participar y patrocinio. | Espera datos globales amplios; varios tratamientos visuales compiten. Primero mostrar actividad real y la siguiente acción, no crecimiento global. |
| `/torneos` | Descubrimiento por cards/filtros. | Filtros sobre una ventana limitada; separar próximos/en juego/históricos en la consulta. |
| `/torneos/calendario` | Calendario reutilizable. | Debe compartir filtros y selección al regresar del detalle; en mobile lista por día como alternativa al mes. |
| `/ranking`, Damas/Caballeros | Identidad competitiva y enlaces a jugadores. | Corregir ámbito, numeración y destino público antes de decorarlo. |
| `/envivo`, alias `/en-vivo` | Torneos cuyo estado está en juego. | No confundir listado de torneos con seguimiento de partidos en vivo. |
| `/clubes` | Directorio público de clubes activos. | Lee agregados desde listas amplias de jugadores/torneos; añadir descubrimiento por ubicación/nombre desde datos existentes, sin geolocalización obligatoria. |
| `/clubs/[clubId]` | Vida deportiva de club. | P01: no demo; unificar con datos públicos publicados y ranking canónico. |
| `/noticias`, `/noticias/[slug]` | Editorial de SELPA/clubes. | Listado pide contenido comercial que no usa; cards reciben cuerpo completo; detalle no tiene metadata específica en la ruta inspeccionada. |
| `/buscar` | Búsqueda autenticada por tipos con debounce/abort/reintento. | Al visitante le ofrece links públicos, no búsqueda global; no prometer búsqueda pública de personas sin definir visibilidad. |
| `/unir-mi-club` | Solicitud de alta con confirmación de estado. | Debe decir «Registrar mi club en SELPA», no confundirse con «Quiero jugar en este club». |

### P11 — Descubrimiento público liviano y coherente

- **Problema:** exceso de lecturas globales, contenido secundario bloqueante, imágenes grandes sin política uniforme y promesas de navegación no siempre cumplidas.
- **Evidencia/rutas/archivos:** `/`, `/torneos`, `/clubes`, `/noticias`, `/clubs/[clubId]`; `lib/publicHomeData.ts`, `lib/publicTournamentItems.ts`, `lib/platformContent.ts:78`, `PublicHomeExperience`, `PublicNewsExperience`, `TournamentPublicCard`.
- **Solución:** proyecciones pequeñas por sección, noticias sin body en listados, contenido comercial separado, caché pública con invalidación, filtro/paginación server-side, política de imágenes por uso. Mantener un CTA principal según intención; publicidad no bloquea lectura deportiva.
- **Impacto usuario:** alto en descubrimiento; menos espera y menos ruido. **Performance:** menor trabajo backend, payload/hidratación e imágenes fuera de viewport.
- **Complejidad:** alta. **Dependencias:** P08/P12, estados públicos, política de assets/URLs e invalidación editorial.
- **Riesgo:** servir torneos cerrados o publicidad vencida por caché mal definida; perder filtros al cambiar página. Separar datos de decisión vivos de contenido editorial cacheable.

Auth/reset/update-password ya tienen componentes de contraseña y feedback. Preservar validaciones y recuperación, pero homogeneizar errores humanos: `reset-password/page.tsx:48` todavía puede mostrar `error.message` del proveedor. En completar perfil, los campos personales requeridos son numerosos —celular, nacimiento, rama, país, provincia, localidad—; explicar su finalidad y revisar qué es imprescindible para competir, sin cambiar requisitos legales/de negocio durante una tarea visual. La edición personal/deportiva ya vuelve a Mis datos: no romper esa salida corta.

## P. NAVIGATION

La navegación debe conservar los roles cerrados y reducir destinos mentales. Fuente principal: `lib/navConfig.ts`, `components/navbar/AppNavbarClient.tsx`, `app/(app)/RoleGate.tsx`.

| Rol | Centro de gravedad recomendado | Qué preservar / corregir |
|---|---|---|
| Guest | Torneos, ranking, clubes; registro contextual. | Perfil/torneo compartidos abren directamente. Noticias secundarias. No exigir cuenta para descubrir contenido público. |
| Player | Hoy, Torneos, Mi carrera; ranking accesible desde carrera/Home. | Pagos, actividad y mensajes deben tener acceso reconocible, no depender de conocer el avatar como menú. Club activo no debe ocultar identidad multi-club. |
| Owner | Jornada/pendientes y administración completa según capabilities actuales. | Equipo, Finance, Billing y configuración agrupados; diferencias de dinero explícitas. |
| Admin | Operación y administración autorizada. | Misma estructura que Owner, sólo acciones permitidas; no prometer gestión de ownership donde no aplica. |
| Operador | Torneos, jugadores, solicitudes y tareas que sus capabilities habilitan. | No copiar el menú de Owner ni inferir permisos financieros por nombre del rol. |
| Planillero | Partidos, agenda y carga de resultados autorizada. | No mostrar creación como CTA principal si será rechazada por el guard. Acceso al partido concreto. |
| Platform Admin | Altas/clubes/usuarios, Billing SELPA, diagnóstico. | No activar experiencia Player; perfil de cuenta administrativa independiente de carrera. |

No propongo una bottom navigation nueva como requisito. Primero probar si el header/menú actual, más accesos contextuales visibles, resuelve las tres tareas frecuentes. Si se agrega navegación inferior en el futuro, necesita espacio y coordinación con acciones sticky, teclado y safe area; no superponer dos barras.

### Destinos que pueden consolidarse sin romper enlaces

- `/preferencias` ya redirige a `/ajustes`: presentar un único nombre al usuario.
- `/mensajes` es alias de `/player/mensajes`: conservar compatibilidad y scope correcto, no dos bandejas.
- `/en-vivo` y `/envivo`, masculino/femenino y caballeros/damas: conservar aliases, un destino canónico por experiencia.
- «Estadísticas» y «Reportes» Club necesitan una arquitectura de información común; no borrar reportes financieros ni confundir ventanas de cálculo.
- «Mi club» (`/player/[clubId]`) y club público deben compartir hechos, pero la primera agrega contexto privado. Reutilizar proyecciones, no redirigir ciegamente ni duplicar pantallas completas.

El navbar actual tiene gestión de overlays, labels, focus y tamaños móviles específicos. La propuesta es auditar casos extremos y consolidar estilo, no reemplazarlo entero. Con nombres largos, varios clubes, badges y cambio de rol, verificar 320–430 px después del login.

## Q. SELPA EXPERIENCE SYSTEM

### P08 — Un contrato visual y de interacción, adoptado por recorridos

- **Problema:** componentes locales vuelven a decidir tamaños, estados, tabs, errores y modales; CSS global acumula excepciones.
- **Evidencia/rutas/archivos:** perfil, solicitudes, público y Platform; `components/navigation/PageHeader*`, `PlayerSectionHero`, `PampraxHero`, `ProductFlow.module.css`, `app/styles/public.css`, `navbar.css`, estilos locales de páginas.
- **Solución:** documentar y extender las primitivas existentes con variantes limitadas; probarlas en carrera/Home/torneo antes de expandir. Sustituir CSS local/global sólo en componentes intervenidos, sin reescritura general ni cambio de branding.
- **Impacto usuario:** alto: el aprendizaje de una pantalla sirve en las demás. **Performance:** menos estilos duplicados y composición JS innecesaria; medir bytes reales, no prometer ahorro por número de líneas.
- **Complejidad:** alta. **Dependencias:** inventario R, escenarios móviles y estados reales. **Riesgo:** uniformar tanto que se pierda densidad, contexto de club o mejoras aprobadas. No convertir toda UI en cards idénticas.

### Especificación operativa

| Patrón | Contrato SELPA recomendado | Base y control |
|---|---|---|
| Page header | Back circular integrado, título 24–30 px móvil, descripción sólo útil, una acción primaria. | `PageHeader`/`PageBackAction`; back real con destino/contexto conservado. |
| Section header | Título 18–22 px, contador opcional y acción discreta. | No duplicar kicker, título y subtítulo que dicen lo mismo. |
| Hero Player | Identidad compacta, ámbito y dato significativo; saludo no ocupa una pantalla. | Variación de header, no otro sistema tipográfico. |
| Hero Club | Identidad/estado y jornada; contraste seguro con tema del club. | El color del club es acento, no reescritura total de controles. |
| Cards / compact cards | Una entidad o decisión por superficie; radio/borde/sombra coherentes. | No card dentro de card salvo agrupación con función clara. |
| List rows | Nombre, dos datos de decisión, estado arriba-derecha y acción contextual. | Torneos/jugadores Club como referencia; altura por contenido, no flyer. |
| Ranking rows | Posición estable, avatar, nombre, puntos; contexto secundario y «Vos». | Sin scroll horizontal para información esencial. |
| Stat blocks | Dato + definición/ámbito; máximo tres o cuatro juntos si aportan. | Cero, desconocido y no aplicable son diferentes. |
| Badges | Etiqueta textual, tono semántico y ubicación estable. | No usar sólo color; urgencia exige regla temporal. |
| Forms | Campos necesarios primero, grupos y opciones avanzadas plegables. | Label persistente, ayuda puntual, error junto al campo. |
| Inputs / selects | Normalmente 44–52 px; texto ≥16 px móvil; native cuando aporta fiabilidad. | Probar Safari, fechas, hora y color. No desactivar zoom. |
| Tabs | Horizontales compactas, transparentes, underline verde activo. | Distinguir navegación de enlaces, pestañas de panel y anclas; semántica adecuada a cada caso. |
| Filters | Búsqueda principal visible y resumen de filtros; sheet móvil, fila desktop. | URL/estado al volver; limpiar explícito. No cinco selects abiertos arriba del listado móvil. |
| Bottom sheet | Acción/tarea corta, encabezado y cierre; altura `dvh`, contenido desplazable y safe area. | Foco inicial, trap, Escape, retorno de foco y scroll lock probado. |
| Dialog | Decisión acotada; en mobile composición de sheet si mejora uso. | No modal gigante para navegación o listas infinitas. |
| Alerts | Qué ocurrió, qué se conservó y qué puedo hacer. | `humanizeUiError`/feedback existentes; detalles técnicos fuera del copy público. |
| Empty | Diferenciar inicio sin datos, filtro sin resultados y pendiente de publicación. | Una salida útil; no prometer datos inexistentes. |
| Error | Estado recuperable por bloque; reintentar sin borrar selección. | No convertir fallo en lista vacía ni cero. |
| Success | Confirmación específica de entidad y siguiente paso. | No sólo toast si el resultado necesita referencia durable. |
| Skeleton | Misma geometría del contenido crítico; no simular un resultado. | `aria-busy`/status discreto y reduced motion. |
| CTAs | Una primaria de 46–52 px; secundarias discretas; área táctil cómoda. | No cuatro botones grandes equivalentes ni acciones minúsculas para ganar densidad. |
| Destructive | Alcance, consecuencia y reversibilidad visibles; confirmar cuando corresponde. | Confirmación contextual, no diálogo genérico repetido. |
| Avatars | Tamaño según contexto, iniciales de fallback, no layout shift. | Carrera mayor que fila, pero no eclipsa logros. |
| Flyers | Apoyo de identidad; miniatura en administración, expansión voluntaria. | Preview único o mini-preview alternado, no dos copias simultáneas. |
| Tables | Desktop para comparación real; en mobile filas/cards semánticas o región desplazable justificada. | Columnas esenciales primero; header y navegación teclado. |

Ritmo: márgenes móviles útiles aproximadamente 12–14 px donde el contenedor ya los aporta; gaps 8–14 px; targets de al menos 44 px para acciones relevantes. No sumar el gutter del shell y el de cada página. No usar tipografía diminuta como sustituto de progressive disclosure. Pesos 500/600 para lectura, 650/750 para jerarquía; reservar los pesos más altos, no aplicarlos a cada metadata.

El criterio no es «todos los valores iguales», sino que igual función tenga igual comportamiento. Un resultado deportivo puede tener más personalidad que una conciliación sin parecer otro producto.

## R. LEGACY UI INVENTORY

Clasificación de severidad de producto, no condena de todo el archivo. Los patrones recomendados se ejecutan mediante P01–P12; no son una lista adicional de tickets.

| Nivel | Ruta | Archivo / ancla | Problema y patrón actual | Patrón SELPA recomendado |
|---|---|---|---|---|
| CRÍTICO | `/clubs/[clubId]` | `PublicClubHomeExperience.tsx:162,403`; `public.css:7639` | Demo insertada en ranking real; su aviso se oculta en móvil. | Ausencia honesta y rankings reales por ámbito. |
| CRÍTICO | `/torneos/[id]` | `app/(app)/torneos/[id]/page.tsx:655` | Tablero postinscripción con casilleros fijos sin lectura deportiva. | Estado de jornada y próximo partido/resultado real. |
| CRÍTICO | `/jugadores/[id]` | Alias de página y `RoleGate:11` | Promesa pública sobre una ficha administrativa protegida. | Perfil público independiente, gestión privada contextual. |
| ALTO | `/perfil`, `/jugadores/[id]` | `club/jugadores/[id]/page.tsx:690–730` | Avatar 148 px, portada/identidad centrada, datos físicos y muchas cards antes de carrera; acciones 28–40 px. | Header de identidad compacto, carrera primero, edición secundaria con área táctil suficiente. |
| ALTO | `/player` | `player/page.tsx:521–880` | Club/accesos repetidos, posición vacía, noticias siempre fallback. | Hoy → cambios → progreso → comunidad. |
| ALTO | `/ranking` | `PublicRankingExperience.tsx:64–132` | Filtros reconstruyen posición y ámbito por nombre. | Ranking estable, contexto explícito y búsqueda que no renumera. |
| ALTO | `/club` | `club/page.tsx:310–352` | Dashboard genérico bajo una franja de prioridades incompleta. | Cola operativa contextual por rol y fecha. |
| ALTO | `/club/solicitudes` | `ClubRequestsPage.tsx:191,197` | Tabs en cápsulas sólidas; mobile baja acciones a 29 px y tabs a 34 px. | Underline verde, fila compacta y targets cómodos; densidad por jerarquía, no por encoger botones. |
| ALTO | `/`, `/noticias`, club público | `PublicHomeExperience`, `PublicNewsExperience`, `app/styles/public.css` | Tratamientos locales de degradados, bordes, sombras, pesos altos y bloques editoriales grandes. | Identidad común, una jerarquía y contenido deportivo antes de promoción. Validar composición renderizada. |
| MEDIO | `/perfil` sin vínculo | `app/(app)/perfil/page.tsx` | Fallback de perfil con layout distinto y viewport completo/márgenes compensatorios. | Misma identidad global con estado «sin club», no una versión visual paralela. |
| MEDIO | `/actividad`, `/ajustes`, `/mis-datos` | `PlayerAccountHub`, páginas de cuenta | Resúmenes/links parecidos distribuidos; actividad sin semántica deportiva. | Cuenta separada de carrera; stream factual y un destino de preferencias. |
| MEDIO | `/club/reportes` | `club/reportes/page.tsx` | Tarjetas de conteos all-time compiten con estadísticas por período. | Un análisis con definiciones y filtros persistentes. |
| MEDIO | `/platform/configuracion` | `platform/configuracion/page.tsx` | Legacy financiero/bps primero; información técnica visible por defecto. | Configuración vigente primero; avanzado/legacy plegado. |
| MEDIO | `/platform/logs` | `platform/logs/page.tsx` | Tabla clickeable, seis filtros y JSON técnico sin progressive disclosure suficiente. | Filtro básico + avanzado; botón de detalle accesible, paginación. |
| MEDIO | `/club/configuracion` | `club/configuracion/page.tsx`, `_components` | Múltiples secciones de identidad/operación y recargas de branding locales. | Agrupación por tarea y guardado localizado, preservando campos existentes. |
| PULIDO | Varias | `club/page.tsx:349–352` y componentes locales | Emojis/glifos conviven con Lucide; nomenclatura Pamprax/SELPA interna. | Iconografía coherente al intervenir; no renombrar todo el repositorio por estética. |

Hallazgo transversal: `AppShellClient` ya aporta `.px-wrap`, mientras páginas como Club y ficha de jugador vuelven a incluirla, algunas con márgenes negativos. Es evidencia de composición frágil; **el valor final de doble padding depende de la cascada y debe medirse**, no se afirma un overflow observado. La solución es propiedad explícita del gutter, no otro `overflow-x: hidden` global.

## S. PERFORMANCE

### Diagnóstico de arquitectura, sin tiempos inventados

Stack local: Next 16.1.4 y React 19.2.3 según `package.json`. La app combina páginas servidor públicas con grandes componentes cliente, páginas privadas que consultan desde effects, APIs agregadoras y lecturas directas del navegador. No se identificó SWR/TanStack Query como dependencia: no existe una política uniforme de caché de consultas de pantalla.

`AppShellClient` monta proveedores de sesión/tema/navbar en la raíz. Esto agrega trabajo cliente transversal, pero **no convierte automáticamente todos sus `children` servidor en Client Components**. Tampoco una llamada a `getSession()` implica siempre un round-trip de red: sí hay repetición de lecturas/locks y secuencias de efectos; `getUser(token)` del servidor tiene otra función de validación y no debe eliminarse para ganar velocidad.

`SessionProvider` ya tiene refresh compartido y autorización temprana antes del enriquecimiento de clubes. La Home depende de `session.clubs`: puede recomenzar la carga al llegar esa colección. Medir la frecuencia con transiciones reales; no atribuir cada render a una consulta nueva sin traza.

### Caminos críticos comprobados

**Home Player:** contexto → jugadores → torneos → equipos → inscripciones/partidos en paralelo → torneos faltantes → lectura de sesión → tres endpoints por club → estado final. El bloque final hace `3 × cantidad de clubes` requests HTTP, además de las consultas anteriores y del trabajo interno de cada endpoint. Para tres clubes son nueve requests en ese bloque, no una medición de nueve round-trips secuenciales: están paralelizados, pero todos participan de la espera final. Una respuesta lenta o costosa puede retrasar la pantalla completa.

**Perfil:** `/perfil` resuelve membresías/destino; ficha cliente obtiene sesión y API; modo propio consulta además parejas, invitaciones y **padrón completo del club** antes de `setData` (`club/jugadores/[id]/page.tsx:218–290`). El padrón sólo debería ser necesario al buscar compañero. La API pública lee jugador → exclusión de cuenta administrativa → perfil/club → equipos → inscripciones/partidos/torneos → pareja y sus datos → standings del club. Solicita un ranking de todos para devolver puntos de uno.

**Ranking administrativo reutilizado por Player:** `api/clubs/[clubId]/ranking/route.ts` solicita pipeline de circuitos y luego padrón/categorías/perfiles/equipos/inscripciones/partidos/Competition/parejas. `getRankingPipeline` llama `listEvents` por cada serie. `competition-events.repository.ts:95–114` no hace una consulta simple: agrega divisiones, vínculos, torneos, finales y contextos; estos contextos vuelven a recorrer relaciones. Es un fan-out por serie con trabajo anidado, no sólo una tabla sin índice.

**Ranking Competition:** `competition-ranking.repository.ts` encadena temporada → divisiones → ramas/categorías/entries → jugadores → perfiles → ledger. `competition-points.repository.ts:12–31` descarga movimientos del club/temporada y suma en JavaScript. Existe SQL de agregación en la cadena de migraciones (`20260729_competition_points_ledger_stage4_functions.sql`); evaluar reutilización/contrato antes de crear otra función, sin asumir que una RPC es intrínsecamente rápida.

**Detalle de torneo:** después de la hidratación, sesión → `/public-detail`; API torneo → club → conteo de inscriptos → viewer. El viewer vuelve a resolver cuenta, membresía, equipo, inscripción, perfiles, pago, cambios y pareja según ramas. La identidad pública queda bloqueada por información privada secundaria. El mismo endpoint vuelve a pedirse al entrar a inscripción.

**Noticias/Home pública:** `getPublicHomeData` espera contenido y torneos; después registros para contar; después conteos exactos globales, clubes y colecciones amplias para estadísticas. `PublicHomeExperience` recibe `metrics` que no usa. `listPublishedContent` consulta noticias, campañas y sponsors con `select('*')`; `/noticias` reutiliza todo aunque sólo necesite noticias. La ficha editorial consulta noticia y luego tema de club. No se debe hacer esperar el texto a toda la portada comercial.

### Matriz por pantalla — orden de carga y frescura

| Pantalla y fuente | Qué bloquea hoy | Primero | Puede esperar | Cacheable / actualización obligatoria |
|---|---|---|---|---|
| Home pública — `app/page.tsx`, `lib/publicHomeData.ts` | `force-dynamic` y espera agregada de contenido, torneos, registros y estadísticas globales. | Header y torneo/actividad principal con proyección corta. | Publicidad, sponsors, estadísticas agregadas, más noticias. | Editorial/clubes/proyecciones públicas con TTL e invalidación; cupos/plazo revalidar al decidir inscripción. No usar caché de viewer. |
| Home Player — `player/page.tsx` | Cadena de lecturas + `3*C` endpoints y loader global. | Próximo compromiso/pendiente y contexto de usuario. | Parejas de todos los clubes, exploración, noticias. | Caché privada en memoria por usuario/club/ámbito, revalidación focal; pagos/invitaciones/agenda deben comprobarse al actuar. |
| Perfil — `/perfil`, `/jugadores/[id]`, API pública | Redirect/membresías, hidratación, API extensa y extras de pareja en modo propio. | Identidad, ámbito, resumen deportivo certificado. | Historial paginado, gráfico, editor, búsqueda de compañero. | DTO público versionado por identidad/ámbito; invalidar por foto/resultado/corrección/visibilidad. Controles y datos privados nunca en esa caché. |
| Ranking — `app/ranking/page.tsx`, API Club y repositorios | Semilla legacy, múltiples clubes y pipelines administrativos; ledger completo. | Ámbito seleccionado y filas con posición estable; mi fila/vecinos. | Otros clubes, estadísticas ampliadas, historial de puntos. | Proyección por club/circuito/temporada/división/modalidad/versión; invalidar tras publicación/corrección, no cronómetro de cada visita. |
| Listado torneos — `lib/publicTournamentItems.ts` | Hasta 96 torneos + registros de todos para contar, filtros posteriores. | Primera página filtrada con datos de decisión. | Flyer grande, reglas, histórico y páginas siguientes. | Metadatos públicos con frescura corta/invalidación; conteo como referencia, capacidad validada en servidor al inscribir. |
| Detalle torneo — página cliente y `/public-detail` | Hidratación + sesión + datos públicos/privados en serie. | Nombre/club/estado/fecha/categoría/precio; luego próximo partido o CTA contextual. | Reglamento completo, mensajes, pareja potencial, estadísticas. | Ficha pública separada del viewer; agenda/resultados con mecanismo explícito de actualización; inscripción/pago privados y revalidados. |
| Noticias — `platformContent`, `PublicNewsExperience`, artículo | `select('*')`, cuerpo de noticias a listado, campañas/sponsors no usados, tema posterior. | Título/extracto/imagen apropiada o texto del artículo. | Archivo paginado, relacionadas, patrocinio. | Editorial por slug/listado con invalidación al publicar/editar/retirar; vigencia comercial independiente. |
| Home Club — `club/page.tsx`, `/summary` | Sesión → resumen → tema adicional y espera de enriquecimiento. | Pendientes autorizados y jornada de hoy. | Histórico, estadísticas, branding adicional, recomendaciones. | Snapshot privado breve por actor/club/capabilities; invalidar al resolver; no mantener permisos/deuda como datos públicos o permanentes. |

Estos son contratos de diseño de caché, no TTLs implementados. Elegir valores luego de medir frecuencia de cambio y coste; siempre mostrar actualización conocida en información sensible al tiempo.

### Consultas, cardinalidad e índices

- Hay límites explícitos problemáticos: 240 jugadores antes del ámbito, 96 torneos antes del filtro y 30 torneos en summary. Una lista de preview puede estar limitada; un total o un ranking completo no puede heredar ese límite silenciosamente.
- Hay consultas `.in(...)` y listados sin paginación para ledger, jugadores, equipos y registros. Es necesario comprobar el límite de respuesta configurado y la cardinalidad real: **no se comprobó truncamiento en producción ni se asume un límite concreto**. Las pruebas deben cubrir más filas que una página del proveedor.
- Conteos por club/torneo deben agregarse cerca de la fuente o usar proyecciones existentes, no transferir todas las filas a cada servidor/browser para recomputar. Un `count exact` global tampoco es gratis; si es decorativo, salir del camino crítico.
- La cadena local ya crea índices para torneos/partidos, pagos, y ledger por `(club_id, season_id, division_id, player_entry_id)` y `(club_id, club_player_id, effective_at desc)`. **No corresponde recomendar «agregar índices a todo» ni afirmar que no existen.**
- Candidatos a revisar con plan real: filtro por jugador en ambos slots de equipos, partidos por team1/team2 con estado/fecha, inscripciones por equipo/torneo/estado, contenido publicado por club/fecha y consulta paginada de torneos. Primero verificar índices actuales, selectividad y orden del predicado; sólo después proponer índice compuesto/parcial.
- `OR` entre dos slots puede requerir dos accesos combinados o una proyección; no reestructurar todo el modelo de equipos sólo por una sospecha de lentitud.
- La relación de campañas/sponsors y los DTOs grandes son candidatos de payload, pero no se puede afirmar «join costoso» sin plan. Lo mismo vale para RPCs de competencia: profundidad funcional no prueba lentitud de ejecución.

La guía local de Postgres influyó en esta revisión al separar optimización demostrable del recorrido de lecturas de propuestas de índices que exigen EXPLAIN. Ninguna consulta de diagnóstico se ejecutó contra Supabase.

### Cliente, bundles y CSS

`PublicHomeExperience`, `PublicNewsExperience`, ficha de torneo y perfil son grandes componentes cliente. Recibir cuerpos completos de noticias y reglas grandes para listados aumenta la serialización/hidratación potencial. Recomiendo separar contenido servidor estable de islas interactivas de filtros/acciones, **sin convertir toda la app ni trasladar controles privados a HTML público**.

Medidas de fuente, no bytes de red: `public.css` tiene 7.793 líneas / 196.823 bytes; `navbar.css`, 3.665 / 81.261; ambos se importan globalmente desde `globals.css`. El wizard de torneo tiene 2.446 líneas. Estos tamaños prueban complejidad/mantenimiento, no un LCP concreto ni el tamaño gzip de un bundle. Analizar producción antes de asignar porcentajes de mejora.

El layout declara Inter y otras tres familias para identidad/flyers. Medir qué archivos/preloads se descargan realmente por ruta; cargar fuentes específicas de edición donde se usan si el análisis confirma coste. No eliminar branding aprobado a ciegas. La exportación Excel identificada usa `write-excel-file/node`; no culpar a dependencias de exportación por el bundle cliente sin trazar imports. Una dependencia en `package.json` no prueba transferencia al visitante.

### Imágenes: dónde importan los warnings

| Uso | Evidencia | Acción recomendada |
|---|---|---|
| Portada de perfil | Dos `Image` con `sizes="1200px"` y `priority`, una capa de fondo no visible en mobile; ficha `:481–482`. | Un visual adecuado a viewport, `sizes` real y prioridad sólo si es el LCP. Dos instancias no prueban dos transferencias del mismo recurso; sí hay una selección de tamaño poco sensible al móvil. |
| Avatar perfil | `sizes` fijo no acompaña todos los tamaños visuales. | Variantes 40/48/80/etc. según uso; reserva de caja y fallback. |
| Flyer en listado | `TournamentPublicCard.tsx:179` usa `<img>` sin `loading` en ese elemento. | Miniatura optimizada, ratio reservado, lazy fuera del primer viewport; no descargar flyers originales para cada fila. |
| Noticias | `PublicNewsExperience.tsx:111,126,149` usa imágenes sin lazy explícito. | Primera imagen relevante con prioridad medida; resto lazy/decoding, tamaños responsive y thumb en archivo. |
| Logos/avatares pequeños | Numerosos `<img>` en navbar/listados. | Prioridad menor que flyers/portadas; resolver dimensiones, errores y caché. No sustituir SVG local o preview blob sólo por callar lint. |
| Storage proxy | `clubAssets.ts:58`; `/api/storage/object` descarga objeto completo, `arrayBuffer`, respuesta `private, max-age=3600`. | Ya existe caché privada de assets; no afirmar «sin caché de imágenes». Evaluar resize/CDN para assets realmente públicos y política separada para privados. Nunca volver público todo el proxy. |

`next.config.ts` permite remote images de Unsplash y `player-assets`; otros buckets no quedan automáticamente cubiertos. Una migración masiva a `Image` sin política de dominios/rutas rompería recursos. Priorizar LCP y descarga fuera de viewport, no el conteo de warnings. JPG/WebP/AVIF, calidad y tamaños necesitan muestras visuales de texto en flyers: una compresión agresiva puede volver ilegible la información.

## T. PERCEIVED PERFORMANCE

### P12 — Mostrar valor antes y no empezar de cero al volver

- **Problema:** cargas monolíticas, pérdida de estado de consulta, repetición de endpoints y errores secundarios que bloquean contenido útil.
- **Evidencia/rutas/archivos:** matriz S; `player/page.tsx:497`, perfil `:218–290`, detalle torneo `:363–405`, `publicHomeData`, `platformContent`, `PlayerStatePanel`. No se encontraron `loading.tsx`/`error.tsx` de ruta en el árbol app inspeccionado; sí hay loaders/errores locales.
- **Solución:** carga por prioridad, boundaries por sección donde realmente permiten streaming, skeletons de geometría estable, dedupe de consultas, caché privada acotada y restauración de filtros/scroll al regresar. Mantener datos previos con «Actualizando» cuando siguen siendo utilizables; separar error de refresh de error inicial.
- **Impacto usuario:** muy alto y transversal; menos esperas vacías y menos desorientación. **Performance:** reduce trabajo repetido y longitud del camino crítico, aunque cada mejora debe medirse por separado.
- **Complejidad:** alta. **Dependencias:** límites público/privado, claves de ámbito y política de invalidación. Puede comenzar en el primer bloque sin esperar nuevos módulos.
- **Riesgo:** datos obsoletos, caché cruzada entre usuarios/clubes y confirmación de writes no completados. Limpiar al logout/cambio de cuenta; invalidar al cambiar permisos; nunca cachear credenciales ni respuestas privadas en una caché pública.

### Reglas de implementación futura

1. Skeleton inicial sólo para lo que está cargando. Si falta ranking, no bloquear nombre y próximo partido. Si falla publicidad, no borrar torneos.
2. Volver al listado conserva búsqueda, filtros, página y posición. Una caché de datos de pantalla no es lo mismo que el Router Cache de Next; hay que comprobar ambos recorridos.
3. Para lecturas, reutilizar requests en vuelo con clave completa de usuario/club/ámbito/filtros. No quitar la validación de permisos en servidor. No se exige incorporar una librería nueva si una solución focal satisface el contrato.
4. Prefetch de destinos probables y payload pequeño; no prefetchear historiales completos ni todos los clubes desde el primer viewport.
5. Tras una acción confirmada, actualizar la entidad local e invalidar sus dependencias. Optimismo sólo en acciones reversibles de bajo riesgo, con rollback; no en pagos, resultados oficiales o aprobaciones de acceso.
6. Cargas abortables, protección frente a respuesta de club anterior y errores de red humanos. No sustituir `useEffect` defectuoso por `setTimeout(0)` únicamente para ocultar lint.
7. «En vivo» tendrá timestamp y actualización declarada —polling acotado al foreground o canal existente validado—, no una etiqueta permanente sin refresco. Elegir mecanismo por volumen y necesidad, no Realtime por moda.

Para Next 16.1.4, revisar el modelo de caché compatible con la configuración actual; `cacheComponents` no está habilitado. Render dinámico, Data Cache y caché de navegación son capas diferentes. No basta quitar `force-dynamic` ni asumir que una consulta SDK queda cacheada automáticamente: definir la caché explícita del dato y su invalidación. Referencia primaria de contraste: [Next.js — caching sin Cache Components](https://nextjs.org/docs/app/guides/caching-without-cache-components). La documentación consultada es la vigente y puede describir una versión posterior; no es una propuesta de actualización de framework.

La convención `loading.tsx` ofrece una frontera de Suspense para navegación/streaming; no acorta por sí misma una cadena de consultas que sigue esperando dentro del mismo bloque. Hay que separar trabajo y boundaries deliberadamente. Referencia: [Next.js — loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading).

`Image` necesita dimensiones o contenedor estable y `sizes` adecuado para imágenes responsive; decidir prioridad según el contenido realmente visible. Referencia: [Next.js — Image](https://nextjs.org/docs/app/api-reference/components/image). No se propone reemplazo mecánico de todos los `<img>`.

### Medición y aceptación propuestas, no resultados obtenidos

Antes/después en build de producción y entorno autorizado: entrada fría, navegación caliente, volver atrás, cambio de club, sesión caducada y error de una dependencia. Registrar request count, bytes JSON/imagen/JS/CSS, camino crítico, TTFB, LCP, INP, CLS, primer contenido útil y tiempo hasta poder resolver la tarea. Separar red/servidor/render y medir percentiles, no una captura afortunada.

Metas de producto: al tocar una acción, feedback inmediato; no reiniciar toda la página por refrescar un módulo; ningún dato secundario bloquea identidad/acción principal; volver preserva contexto. Los presupuestos numéricos finales deben fijarse con una línea base y un dispositivo/red de referencia, no prometer «carga en 1 s» sin evidencia.

## U. MOBILE / IPHONE

### Hallazgos por código

- Hay una defensa real frente a autozoom: `app/styles/base.css:126–139` fuerza 16 px en inputs/selects/textarea a ≤768 px. No corresponde afirmar que todos los inputs locales de 12–14 px harán zoom: la cascada global los sobrescribe. Probar date/time/color, controles custom y estados de foco.
- Navbar usa safe area superior y menús con máximo basado en `100dvh` (`navbar.css:878,1035`). También persisten reglas `100vh` (`:1751`). Su coexistencia exige probar selector/estado final; no implica por sí sola un bug observado.
- Sheets de filtros Club tienen `max-height:84dvh` y padding de safe area. Son mejores bases que modales de altura fija.
- Inscripción conserva modal con `calc(100vh - 34px)` en CSS local; teclado, rotación y barra de Safari son escenarios prioritarios. `aria-modal` no resuelve altura, foco ni scroll.
- Perfil usa margen negativo y composición portada/avatar; puede ser visualmente intencional, pero consume espacio antes del resultado y complica alineación con shell. Simplificar composición, no esconder overflow.
- Solicitudes reduce acciones a 29 px en mobile, ficha de perfil a 28–40 px. Son riesgos concretos de precisión táctil; aumentar hit area sin volver enormes todas las cards.
- Tabs horizontales deben permitir desplazamiento local si hace falta, sin causar scroll horizontal del documento; el activo tiene que permanecer visible y no depender sólo de color.
- La barra de acción de un wizard debe tener reserva de espacio y safe area; el teclado no puede tapar el campo ni ocultar Guardar/Cancelar. Preservar la vuelta directa a revisión.

### Matriz de QA exigible por bloque

| Viewport | Foco de revisión visual real |
|---|---|
| 320 px | Nombre largo, filtros, estados y acciones sin recortes; título más badge; controles accesibles sin microtipografía. |
| 375 px | Primer viewport de Home/carrera/torneo; CTA alcanzable; menú autenticado y sheet con teclado. |
| 390 px | Referencia principal: jerarquía, densidad, cantidad de filas útiles, esfuerzo a una mano y retorno contextual. |
| 430 px | Evitar espacios muertos o expansión decorativa; mismos patrones/estados que a 390. |
| 768 px | Breakpoints intermedios, columnas/tablet y formularios; ninguna zona de layout sin dueño. |
| 1280 px | Comparación/listados/formularios aprovechados; no degradar desktop a una columna móvil enorme. |

En Safari/iPhone nativo: expandir/contraer barra del navegador, teclado, orientación, safe area, scroll de modal y restauración al cerrar, focus de select/date/time/color, back/forward, carga/retorno de checkout. **Todo esto queda pendiente; esta revisión no certifica prueba nativa.**

Criterio de cinco segundos: dónde estoy, qué importa y qué puedo hacer. No basta ausencia de overflow. Revisar textos reales largos, sin datos, error, muchos torneos, muchos clubes y usuario nuevo, no sólo la captura ideal.

## V. ACCESSIBILITY

Hay buenas bases: labels/errores por campo en registro/completar perfil, focus visible en back/navbar, `PlayerStatePanel` con alert y reintento, enlaces de cards con nombre accesible, reducción global de animaciones por `prefers-reduced-motion`. No describir la app como carente de accesibilidad.

Prioridades prácticas dentro de P08 y del recorrido intervenido:

| Riesgo | Evidencia | Acción / prueba |
|---|---|---|
| Acciones pequeñas | Solicitudes mobile `:197`, perfil `:697–720`. | Área táctil ≥44 px; separar acciones destructivas de aprobación. |
| Fila sólo clickeable | `platform/logs/page.tsx`, `<tr onClick>`. | Botón/enlace de detalle y operación completa por teclado. No extrapolar a usuarios/clubs, que ya tienen manejo adicional. |
| Modal semántico incompleto | Modales locales de torneo/perfil y sheets dispersos. | Verificar foco inicial, trap, Escape, retorno, fondo no operable y scroll lock; `role=dialog` solo no lo garantiza. |
| Tabs que son anclas | Perfil `setProfileTab` + `scrollIntoView`. | Usar enlaces a secciones con estado coherente o tabs reales con panel; evitar semántica contradictoria. |
| Edición de imagen | Labels de inputs file ocultos en ficha. | Control de activación accesible por teclado, label claro y feedback de carga/error. |
| Estado comunicado por color | Badges, ranking, curvas, filtros activos. | Texto/icono significativo; «Vos», «Confirmado», «Subió» sólo si demostrado. |
| Lectura sobre fotografía/tema de club | Heroes, flyers y tarjetas temáticas. | Medir contraste por combinación real y usar superficie/overlay legible; no afirmar ratios no medidos. |
| Transición/feedback | Cargas locales y toasts. | Anuncio discreto de error/éxito, foco en campo inválido; evitar anunciar cada actualización de polling. |

Densidad no significa texto de 9 px para decisiones, ni hover como única forma de revelar una acción. Probar zoom y tamaño de fuente del sistema además del ancho del viewport.

## W. TECH DEBT

### Clasificación del lint actual, sin proyecto «arreglar ESLint»

Resultado de lectura estática ejecutada: 179 errores / 132 warnings en 611 archivos de `app`, `components`, `features`, `lib`. Las reglas suman 311 hallazgos en esa cobertura. No todo hallazgo es un bug ni toda deuda de UX aparece en lint.

| Clase | Hallazgos y ejemplos | Tratamiento dentro del producto |
|---|---|---|
| BUG / RUNTIME RISK | 18 `set-state-in-effect`, 18 `exhaustive-deps`, 6 `refs`, 2 `static-components`, 1 `immutability`, 1 `purity` tienen riesgos distintos. Ejemplos: `club/inscripciones/page.tsx:445,453,473`; `completar-perfil/page.tsx:377`; `PublicHomeExperience.tsx:391`. | Revisar render/efectos, stale data y cambios de contexto al intervenir inscripción, Home u onboarding. Dependencias incompletas no prueban un error sin analizar el caso. |
| PERFORMANCE | 83 `no-img-element`; algunos efectos encadenan renders; queries amplias no aparecen en lint. | Primero portadas/flyers/noticias y camino crítico; no priorizar un SVG pequeño antes de una carga de ranking completa. |
| ACCESSIBILITY | Targets, teclado de logs, foco/modal y semántica no están representados por una cifra fiable de estas reglas. | QA manual por teclado/lector y revisión de componentes; no usar lint limpio como certificado. |
| MAINTAINABILITY | 151 `no-explicit-any`; tipos/DTO duplicados, páginas largas y CSS global. | Tipar contratos de lectura al separar público/privado y crear adaptadores de carrera; no convertir `any` en casts para ocultar warnings. |
| COSMETIC / CÓDIGO SIN USO | 31 `no-unused-vars`, nombres legacy, estilos acumulados. | Retirar lo realmente no usado en los archivos tocados. `metrics` no usado en Home además conecta con lecturas innecesarias: no todo unused es cosmético. |

`app/(app)/AppNavbarClient.tsx` concentra algunos hallazgos de componente legacy, pero el shell inspeccionado importa `components/navbar/AppNavbarClient.tsx`. Antes de asignar impacto de runtime a un archivo, confirmar que entra en el árbol servido. No rediseñar un navbar que no se monta por el mero número de errores.

### Deuda de lectura más importante que el número

Contratos deportivos duplicados, identidad global/vínculo mezcladas, estado de inscripción confundido con resultado, limitación de datos presentada como universo completo, diferencias entre error y vacío, y publicación/corrección no reflejada uniformemente. Resolver esto mejora producto y elimina deuda naturalmente.

No usar los passes anteriores como garantía de UX actual ni abrir un nuevo security pass. Las inconsistencias de guard público y CTA por rol se documentan por su impacto en el recorrido; la autorización del servidor se preserva.

Una precisión para no fabricar deuda: aunque la variable de `club/reportes` se llama `conversionRate`, su etiqueta visible es «Inscripciones por torneo» (`:164–165`), que sí describe la división calculada. Consolidar definiciones y destinos no implica denunciar una conversión mal rotulada que la UI actual no afirma.

### Documentación de esquema

`supabase_full.sql` y `docs/schema-summary.md` se revisaron como referencia local; el resumen aún abre con nomenclatura Pamprax y mezcla capas históricas con adiciones recientes. La cadena de migraciones tiene ledger, homologaciones, correcciones, placements, proyecciones y finanzas posteriores al dump base. No se verificó cuál está aplicada en producción durante esta revisión.

Al terminar los bloques de implementación, regenerar dump/resumen contra un entorno autorizado y documentar fuentes canónicas, estados, aliases y proyecciones de lectura. **No ahora.** No inventar un backend faltante sólo porque no aparezca en el dump viejo, ni dar una migration local como prueba de datos ya poblados.

## X. DIFFERENTIATION

La diferenciación más fuerte de SELPA está en unir tres hechos que normalmente quedan separados: **con quién jugué, qué ocurrió y qué significa en mi carrera dentro de una comunidad real**.

Cinco ventajas potenciales apoyadas en datos propios:

1. Carrera explicable: del punto al torneo, resultado, categoría, pareja y regla; no una cifra misteriosa.
2. Identidad multi-club sin perder contexto: puedo pertenecer a varios espacios, con historias relacionadas y rankings no mezclados.
3. Torneo que sigue conmigo: inscripción, agenda, resultado y recuerdo en el mismo hilo, sin buscar capturas en chats.
4. Reconocimiento merecido: campeón/primera final/temporada con evidencia y tratamiento sobrio, no recompensas por abrir la app.
5. Club que opera con confianza: el jugador ve el resultado de una administración sencilla; el club recibe menos consultas «¿cuándo juego?» o «¿se confirmó mi pago?».

Esto no requiere inventar un mercado nuevo. Requiere proyectar bien Competition, Finance, parejas, clubes y noticias hacia las tareas cotidianas. La comunidad es consecuencia de esas conexiones, no un feed añadido al final.

## Y. WHAT NOT TO BUILD

- Likes, seguidores, comentarios generales y feed infinito antes de resolver carrera/agenda. No aportan por sí mismos valor deportivo.
- Coins, XP por visitar, racha diaria de login, recompensas por invitar usuarios o badges sin evidencia.
- Ranking universal que suma puntos de clubes/categorías/reglas incompatibles.
- Deltas y récords históricos deducidos de dos números sin mismo universo ni cortes verificables.
- Jugadores, campeones, actividad o estadísticas demo mezclados con datos reales para que una pantalla «se vea viva».
- Chat generalista, marketplace de productos/clases o reservas de todo tipo sin un problema de pádel validado.
- ERP/contabilidad integral: ampliar Finance sólo si resuelve cobros/conciliación de la operación deportiva, no para imitar un sistema fiscal.
- Un motor nuevo de resultados/ranking por comodidad del frontend; los existentes ya contienen reglas y trazabilidad.
- Una reescritura global de roles, auth, CSS o framework como precondición para mejorar Home.
- Un bloque independiente para bajar el contador de ESLint sin relación con experiencia/riesgo.
- Gráficos, heroes y flyers grandes que reemplazan información útil del primer viewport.
- Push para todo, carouseles automáticos como mecanismo de retención, cuenta obligatoria para ver lo público o confirmaciones repetidas sin consecuencia real.

Regla de descarte: si la función no reduce fricción ni mejora identidad, competencia, progreso o pertenencia verificable, no entra al roadmap.

## Roadmap de ejecución — cuatro bloques entregables

Ordenado por impacto real. El sistema visual y la performance se entregan con los recorridos, no como proyectos de infraestructura que postergan el valor. Cada bloque puede convertirse en un encargo para GPT-6.1 Sol con alcance, contratos y gates explícitos. Los cambios de datos o deploy requieren autorización propia; este documento no los ejecuta ni los autoriza por sí solo.

### Bloque 1 — Carrera y ranking que merecen confianza

**Objetivo:** que identidad, puntos, posiciones e historial no se contradigan, y que un perfil compartido pueda entenderse sin iniciar sesión.

**Por qué ahora:** cualquier capa de progreso/comunidad amplifica los errores si la historia deportiva no es fiable. Eliminar demo y numeración por búsqueda precede a embellecer el ranking. Propuestas: P01, P02 y P03, con el primer corte de P08/P12.

**Rutas:** `/perfil`, `/jugadores/[id]`, `/ranking`, Damas/Caballeros, `/player/ranking`; ajustes puntuales de consistencia en `/player` y `/clubs/[clubId]`.

**Componentes/servicios:** perfil de jugador hoy compartido con Club; `PublicRankingExperience`, tableros de ranking, repositorio/servicio Competition, APIs de perfil propia/pública, `PageHeader`/back, primitivas de fila/estado.

**Backend:** definir y construir lecturas de identidad/carrera/posición por ámbito, usando homologaciones, resultados, ledger y proyecciones existentes. Datos privados y públicos en contratos separados. Búsqueda/paginación después de calcular posiciones; quitar semilla legacy limitante. Primera versión: puntos, resultados y logros demostrables; variaciones históricas no son requisito para lanzar.

**Migrations:** no asumir necesidad para foto, historial, pareja o títulos: existen fuentes. Sólo si el diseño aprobado requiere snapshots públicos de posición/visibilidad/identidad que el modelo no soporte; especificarlas y autorizarlas aparte. No hacer backfill automático de historia no demostrable.

**Dependencias:** definición de participación válida, empates, formato/placements, temporada, público/privado y resolución estable de persona/vínculo. Confirmar la cadena aplicada en un entorno autorizado durante implementación, no en esta revisión.

**Riesgos:** mezclar clubs/divisiones, doble conteo por corrección, perder participaciones no puntuables, exponer datos privados en OG, abrir páginas administrativas al visitante.

**QA técnica:** fixtures para multi-club, cambio de categoría, empates, cero partidos, ganador ausente, bye/WO, final pendiente, torneo no puntuable, resultado corregido/superseded, ledger revertido y más de una página de filas. Buscar a quien está quinto conserva quinto. URL pública abre sin sesión y datos privados quedan fuera de HTML/API/metadata. TypeScript, lint de archivos intervenidos, tests de contrato, build y diff check en el entorno de implementación autorizado.

**QA UX/performance:** 320/375/390/430/768/1280; carrera reconocible en cinco segundos, sin avatar dominando la historia; volver conserva ámbito. Comparar traza fría/caliente del perfil/ranking; búsqueda de compañero no bloquea identidad. Safari real para navegación/compartir cuando esté disponible, reportando cualquier limitación.

**Definición de terminado:** un mismo resultado/punto/posición tiene el mismo significado en perfil, ranking y previews; no hay personas demo en producción; perfil compartible con fuente/ámbito; cifras no disponibles se explican sin inventarse; primera lectura no espera todo el club. No se da por cerrado sólo por compilar.

### Bloque 2 — Hoy sé qué hacer y mi torneo sigue conmigo

**Objetivo:** completar el recorrido del jugador desde intención de inscripción hasta próximo partido, resultado y siguiente paso, con una Home rápida.

**Por qué ahora:** después de poder confiar en su carrera, el usuario necesita utilidad cotidiana. Es la respuesta directa a «¿por qué abriría SELPA hoy?». Propuestas P04, P05 y P06; P12 y patrones P08 aplicados al recorrido.

**Rutas:** `/player`, `/player/torneos` y calendario/explorar, `/torneos`, `/torneos/calendario`, `/torneos/[id]`, inscripción, `/envivo`; continuidad de `/login`, `/register`, perfil inicial y selección/ingreso a club; enlace a `/player/pagos` sin reescribir su motor.

**Componentes/servicios:** Home Player, `TournamentsPlayerView`, `TournamentPublicCard`, `PublicAgenda`, DTO de detalle y viewer, inscripción por pasos, contexto/retorno auth y endpoints de resumen personal.

**Backend:** lectura pequeña de pendientes/agenda; separación ficha pública, situación privada y resultados publicados; consultas de listas paginadas. Reutilizar Finance para obligaciones y Competition para datos deportivos, nunca recalcular sus estados desde la UI.

**Migrations:** por defecto ninguna para exponer datos existentes. Si falta persistencia de intención cross-device o contrato de publicación de agenda, justificar solución mínima antes de proponer tablas. No crear registros reales de torneo para un borrador local.

**Dependencias:** Bloque 1 para puntos/identidad; contratos de agenda, estados de torneo/registro/pago, permisos existentes y sedes/canchas. Un estado no publicado no puede aparecer como definitivo.

**Riesgos:** CTA de inscripción incorrecto, agenda provisional, pago obsoleto, acciones repetidas tras retorno de auth, solicitud enviada confundida con aceptada, caché de usuario anterior.

**QA técnica:** visitante → torneo → registro → verificación → perfil → club → regreso a torneo; ya inscripto, rechazado, pago pendiente/aprobado, cupo agotado, plazo vencido y torneo pausado/finalizado. Caída entre inscripción y pago sin duplicados. Cambio de club durante request y logout. No writes reales para QA sin autorización; usar fixtures/mocks y sandbox autorizado.

**QA UX/performance:** primer viewport responde qué/club/cuándo/categoría/estado/precio/próximo paso; agenda mobile a una mano; Home no espera ranking completo ni todos los clubes; volver del detalle restaura lista/filtros; fallo de noticias no bloquea partido. Medir consulta fría/caliente e imágenes. Modal/teclado/safe area en los seis anchos y Safari nativo cuando corresponda.

**Definición de terminado:** un jugador puede ubicar su próximo compromiso y acción pendiente sin navegar por módulos; después de jugar encuentra resultado y carrera; «En vivo» describe exactamente su actualización; no quedan casilleros ficticios ni confirmaciones falsas; borrador y retorno contextual se conservan.

### Bloque 3 — Operación Club sencilla, Platform ordenada

**Objetivo:** abrir Club y saber qué resolver; que cada tarea llegue a su caso concreto, con controles consistentes y permisos ya existentes.

**Por qué ahora:** la calidad de la experiencia Player depende de que el club publique/gestione a tiempo; además, los avances móviles administrativos merecen consolidación, no reemplazo. Propuestas P07 y P09, expansión de P08/P12.

**Rutas:** `/club`, solicitudes/jugadores/inscripciones/partidos, torneos, contabilidad, estadísticas/reportes, mensajes/configuración; `/platform`, solicitudes/clubs/usuarios/Billing/analytics/configuración/logs.

**Componentes/servicios:** summary Club, cola de solicitudes, filtros/sheets de listados, enlaces de foco al detalle, `PampraxInbox`, hubs de administración, `PlatformOverview`, `PublicClubRequests`, componentes Finance/Billing existentes.

**Backend:** resumen por capability, conteos/preview paginados y motivo de prioridad. Reutilizar contratos de Finance/Billing/Competition, sin fusionarlos. Optimizar lecturas redundantes de branding y recargas de todo el listado tras resolver un caso.

**Migrations:** no previstas para el corte UX/lecturas. Un índice se propone sólo con plan y volumen de entorno autorizado. No tocar roles, RLS, triggers ni reglas de cobro como efecto de un cambio visual.

**Dependencias:** capacidades existentes, reglas de vencimiento y timezone, enlaces de foco y cola deduplicada. No depende de construir un feed social.

**Riesgos:** falsa urgencia, pendientes ocultos por límites, información financiera fuera de rol, perder trazabilidad/confirmaciones, devolver accidentalmente una acción a staff sin permiso.

**QA técnica:** Owner/Admin/Operador/Planillero/Platform con sus capabilities reales; cola vacía vs consulta fallida; cierre futuro vs hoy vs vencido; pago/conciliación/mensaje tratados una sola vez; acciones locales reflejadas tras confirmación. Preservar contratos de idempotencia/recuperación existentes. Pruebas de teclado en logs y modales.

**QA UX/performance:** resolver tres tareas frecuentes desde Home sin búsqueda manual del caso; back vuelve al filtro original; una mano y targets cómodos a 375/390; desktop mantiene comparación. Nunca «Todo al día» si un módulo no se pudo consultar. Medir summary sin descargar todos los módulos y sin tema como bloqueo adicional.

**Definición de terminado:** urgencias explicables, estados honestos, acciones acordes al rol, Finance y Billing inequívocos, sin regresión del wizard/listados ya optimizados; análisis con período/definición, diagnóstico técnico bajo demanda.

### Bloque 4 — Comunidad real y descubrimiento que se siente liviano

**Objetivo:** hacer visible la vida deportiva alrededor de cada club y conectar hechos con noticias sin duplicación ni ruido.

**Por qué ahora:** con identidad, jornada y operación confiables, tiene sentido distribuir cambios. Antes sólo se distribuirían estados parciales o contradictorios. Propuestas P10 y P11; cierre transversal de P08/P12.

**Rutas:** `/actividad`, `/notificaciones`, zona Mi mundo de `/player`, `/`, `/clubes`, `/clubs/[clubId]`, `/noticias`, artículo, `/buscar` y solicitud pública de alta.

**Componentes/servicios:** `PlayerAccountHub`/stream de hechos, `PublicHomeEmbed`, `PublicHomeExperience`, `PublicClubHomeExperience`, noticias, proyecciones de portada, política de imágenes/metadata y componentes de estado.

**Backend:** agregación de hechos existentes y reglas de audiencia/dedupe; publicación/retiro/corrección consistente; consultas editoriales acotadas. Iniciar sin nuevos canales de notificación ni seguimiento social. Una primera versión puede derivar lecturas sin tabla de feed permanente.

**Migrations:** sólo si se necesita persistencia de eventos/versiones/watermark para semántica «desde mi última visita» entre dispositivos; diseñar retención, privacidad e idempotencia antes. No cambiar preferencias de notificación de todos los usuarios por defecto.

**Dependencias:** eventos deportivos confiables del bloque 1, próximos pasos del 2, operación/publicación del 3; perfil público/visibilidad resueltos. Definir noticias vs actividad antes de generar contenido automático.

**Riesgos:** repetir resultado/notificación/noticia tres veces, exponer gestiones privadas, actividad falsa, caché de editorial retirado o anuncios vencidos y mayor JS por sumar widgets.

**QA técnica:** evento corregido/republicado no duplica reconocimiento; noticia de otro club no entra como propia; vacío y error diferenciados; paginación estable; invalidación por retiro; metadata pública sin campos privados. Contrastar tamaño de payload y waterfall con línea base.

**QA UX/performance:** Home no se convierte en feed infinito; actividad tiene fechas y destinos; club sin rama/competencia no se rellena; first viewport útil en los seis anchos, imágenes dimensionadas, historial recuperable al volver. Contraste y reduced motion reales.

**Definición de terminado:** el jugador entiende qué cambió y por qué le importa, sin novedades inventadas ni duplicación; el club público se siente vivo cuando tiene actividad y honesto cuando no; noticias/publicidad no bloquean deporte; patrones visuales comunes ya demostrados en Player/Club/Público.

### Gates compartidos de los cuatro bloques

- Cada entrega declara archivos/rutas, origen de datos, cambios de contrato y límites; no altera trabajo local ajeno.
- QA técnica y QA UX se reportan por separado; no llamar PASS visual a lint/build o ausencia de overflow.
- Versiones de datos/caché y filtros se prueban al cambiar usuario, club y rol; no ampliar permisos para acelerar.
- No crear datos reales en QA sin autorización explícita. Registrar si hubo fixtures, mocks, datos de sandbox o writes.
- Commit/push/deployment sólo si el siguiente encargo los autoriza. Preview no significa autorización de Production.
- Si una métrica no puede demostrarse, queda fuera de la UI con explicación; no retrasa el resto del valor verificable.

## Cierre — solamente cinco cambios para cada usuario

### Cinco cambios para que un jugador ame SELPA

1. **Una carrera que pueda mostrar con orgullo:** perfil público que abre, palmarés/historial reales y la misma verdad deportiva en todas las pantallas.
2. **Saber cuándo juego y qué sigue:** torneo con mi agenda, pareja, confirmación/pago, resultado y puntos, también después de inscribirme.
3. **Una Home que me entienda en cinco segundos:** mi pendiente, mi próximo partido y lo que cambió; sin tarjetas vacías ni noticias ficticiamente ausentes.
4. **Un ranking rápido y confiable:** mi posición y vecinos, ámbito claro, búsqueda que no cambia el puesto y explicación de puntos; deltas sólo cuando puedan probarse.
5. **Volver y encontrar mi mundo, sin empezar de cero:** contexto conservado, cargas parciales y novedades reales de mis clubes, sin ruido ni gamificación artificial.

### Cinco cambios para que un administrador de club ame SELPA

1. **Una bandeja real de lo que necesita atención hoy**, con urgencias justificadas y cobertura visible, no un dashboard que adivina.
2. **Resolver cada pendiente en su contexto:** solicitud, inscripción, partido, cobro o mensaje con un enlace exacto y retorno al listado filtrado.
3. **Operación móvil consistente y cómoda:** filas compactas, filtros en sheet, targets adecuados, back integrado y una acción principal; preservar wizard y borradores.
4. **Finanzas claras sin expandirse a un ERP:** distinguir cobros a jugadores, conciliación y facturación SELPA; resumir y enlazar a los motores existentes.
5. **Publicar una vez y que la información llegue bien al jugador:** agenda, resultados y puntos coherentes con perfil/ranking/club público, con cargas rápidas y menos consultas repetidas al administrador.

La prioridad final no es agregar pantallas. Es cerrar el circuito entre jugar, entender, recordar y pertenecer, con menos esfuerzo en cada paso.

## Estado posterior — Bloque 1, 2026-10-09

Implementación local de carrera/perfil público y ranking canónico preparada: sin demo deportivo ni semilla legacy de 240; búsqueda conserva puestos; perfil público fuera de RoleGate, contrato separado de resumen/historial/recientes y lectura personal acotada. Home sólo recibió consistencia deportiva mínima, no su rediseño.

Detalle, definiciones, QA, archivos y limitaciones en `docs/selpa-transformation-block-1.md`. Los dos contratos heredados se corrigieron con evidencia del HEAD base e invariantes preservadas: 410 contratos pertinentes pasan. Fase 0 completada y verificada localmente: gutter exterior único de 8 px, Mi cuenta STAFF central, facturación/pagos con datos/vacíos/errores y permisos, seis viewports Chrome. TypeScript, lint sin errores, build y diff-check pasan; hay 16 warnings de lint preexistentes. Entrega autorizada sólo en `codex/club-admin-iphone-preview`; la migración de lectura permanece sin aplicar, no se certifica Safari/iOS nativo ni producción live y no hay deploy manual. Bloque 2 no iniciado. Esta nota no reemplaza ni reescribe la auditoría anterior.
