# SELPA — Ranking 2.3: propuestas A/B/C, 04/11/2026

## Actualización: C elegida e integrada localmente — 04/11/2026

El usuario eligió oficialmente C y autorizó su integración real, con clasificación normal de Parejas de 68–74 px. Se implementó en apps/web: 72 px normales, crecimiento natural con nombres largos, una base común para guest/PLAYER/Admin e Individual consistente. **Pendiente de revisión visual final; sin commit/push/deployment.** Ver [informe integrado y comparativa real con 2.2](SELPA_RANKING_23_INTEGRACION_20261104.md). Los conteos del prototipo de abajo se conservan como evidencia histórica y no son los del shell integrado.

## Histórico: Propuesta C aislada, antes de su elección — 04/11/2026

El usuario no aprobó A ni B como versión final. Pidió una nueva C con jerarquía conceptual de B, sin integrar globalmente. Se prepararon **C Parejas e Individual en un prototipo aislado**. Ningún archivo de apps/web cambió; Ranking 2.1/2.2 y A/B permanecen conservados.

### Composición C

- Parejas: posición grande a la izquierda, dos filas alineadas con avatar circular y nombre completo a izquierda, bloque separado de **Total pareja** a la derecha. No se centran nombres ni puntos. El #1 usa navy, cian y un acento magenta pequeño; #2–#5 mantienen retratos de buen tamaño y #6+ conserva ambas identidades.
- Se mantienen únicamente totales de pareja: la limitación del lector respecto de player1_points/player2_points, documentada abajo, sigue vigente. No se añadió ciudad, club de jugador ni contribución individual sin contrato confiable. No se repitió la auditoría SQL ni se consultó Supabase.
- Individual: una foto circular visible, posición, nombre a izquierda y puntos a derecha. Mismo lenguaje de color/radios/jerarquía, con una fila bastante más compacta que Parejas.
- Los datos siguen siendo sintéticos. Las dos fotos ilustrativas conservan la misma identidad QA entre modalidades. En clasificación, Mateo/Nicolás aparecen con otros compañeros sintéticos para comprobar fotos y pareja como unidad; nunca se duplican como ambos miembros de una misma dupla.

### Medidas actuales de C

| Medida | 390 px | 320 px |
|---|---:|---:|
| Parejas #1 | 138 px; fotos 56 | 138 px; fotos 56 |
| Parejas #2–#5 normal | 110 px; fotos 48 | 106 px; fotos 46 |
| Parejas #2, dos nombres largos | 110 px | 114,03 px |
| Parejas clasificación normal | 82 px; fotos 36 | 78 px; fotos 34 |
| Individual #1 | 92 px; foto 56 | 92 px; foto 56 |
| Individual #2–#5 | 70 px; fotos 48 | 70 px; fotos 48 |
| Individual clasificación | 58 px; fotos 38 | 58 px; fotos 38 |

En el lienzo QA común (header 132, pie 36, primera card y=174, viewport de altura 844), C muestra los **cinco puestos completos** en ambos anchos y **siete filas de parejas desde #6**. Individual muestra ocho posiciones completas en la vista con Top 5. Los conteos son del prototipo, no de la integración en headers/nav reales de SELPA, que permanecen intactos.

Frente a A: conserva cinco posiciones y fotos mayores en #2–#5 y clasificación, con #1 navy. Frente a B: #1 baja de 169 a 138 px; clasificación de 94 a 82 px con fotos mayores (30 → 36), total independiente a la derecha y sin escalonar nombres. A/B conservan sus capturas históricas; no están aprobadas.

### QA ejecutada para C

- **Ocho capturas nuevas, doce vistas:** cuatro comparativas 390/320 (Parejas Top 5, Parejas clasificación, Individual Top 5 y clasificación) y cuatro capturas adicionales 375/430 para ambos modos.
- DOM: sin overflow, nombres completos sin colisión con fotos o total, todos los puntajes dentro de su zona y fotografías cargadas. Se detectó/corrigió una columna demasiado estrecha de puntos de Individual antes de las capturas finales. No se validó éxito solamente por ausencia de overflow: se inspeccionó la composición real en navegador.
- Doce rutas estáticas HTTP 200, validación de datos sintéticos/fotos coherentes y sintaxis del servidor PASS; git diff --check PASS. Páginas sin scripts, CSP sin conexiones salientes y recursos locales.
- No se ejecutaron TypeScript, lint ni build de la app: **no hubo cambios de código de aplicación**. Los resultados de tareas anteriores no son nuevas pruebas de C.
- Prototipos/capturas en output/ranking23-c-20261104-zEaFrr. [Galería](../output/ranking23-c-20261104-zEaFrr/REVISION_VISUAL.html), [Parejas Top 5](../output/ranking23-c-20261104-zEaFrr/C-parejas-top5-390-320.jpg), [Parejas clasificación](../output/ranking23-c-20261104-zEaFrr/C-parejas-clasificacion-390-320.jpg), [Individual](../output/ranking23-c-20261104-zEaFrr/C-individual-top5-390-320.jpg), [medidas](../output/ranking23-c-20261104-zEaFrr/measurements.json), [HTTP](../output/ranking23-c-20261104-zEaFrr/http-checks.json). Output no viaja por GitHub.
- Rama codex/club-admin-overnight-20261102, HEAD e8a110d; remoto coincidente verificado al inicio, índice vacío y stash intacto. Once archivos pendientes inventariados antes de C. Solo se actualizan este informe y continuidad; sin commit/push/deploy/merge, Supabase, SQL, Carrera, permisos o puntos. Mixto individual sigue pendiente.
- **Próximo paso actual:** evaluar C y su Individual compañero. No integrar globalmente ni declarar una dirección definitiva sin la respuesta del usuario. El paso A/B al final del apartado histórico queda reemplazado por esta instrucción.

## Histórico: A/B, no aprobadas

Se prepararon dos composiciones distintas por pedido del usuario. **No se seleccionó ni integró ninguna.** Ranking 2.2 centrado fue rechazado visualmente y se conserva como trabajo local previo; no equivale a una aprobación ni debe publicarse como definitivo.

Rama codex/club-admin-overnight-20261102, HEAD e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71; remoto comprobado coincidente al inicio. Índice vacío y stash histórico preservado. Diez archivos pendientes inventariados por SHA-256 antes del trabajo. Ningún archivo de apps/web se modificó para estas propuestas.

## Puntos individuales: verificación del contrato actual

- PairRankingRow tiene player1_points y player2_points en su forma TypeScript, pero eso no acredita su significado deportivo.
- readPairRankingPage selecciona solamente combined_points, posición e identidades/fotos desde las proyecciones oficiales pública/interna. Al adaptar la fila, copia combined_points en ambos campos individuales. Por lo tanto, **no son aportes individuales verificables para mostrar o sumar**.
- La vista competition_pair_standings_read agrupa total_points de competition_pair_ranking_projection por club/temporada/división/pareja. El comentario de la definición advierte que no se deben sumar los totales individuales de compañeros actuales.
- Ambas propuestas muestran únicamente el total recibido como puntaje de pareja. No lo dividen ni fabrican una contribución por jugador; los datos del prototipo son explícitamente sintéticos.
- Fuentes locales: [PairRankingRow](../apps/web/components/ranking/PairRankingBoard.tsx), [readPairRankingPage](../apps/web/features/player-career/player-career.repository.ts), [proyección oficial, desde línea 130](../apps/web/supabase/migrations/20261009100429_player_career_read_models.sql), [auditoría deportiva aprobada](SELPA_RANKING_CLUB_20261103.md). No se consultó ni modificó Supabase para esta verificación.

## A — Dupla editorial

- Posición grande y estable a la izquierda.
- Dos filas alineadas: foto circular + nombre completo, con separación leve entre jugadores.
- Columna propia de puntaje total a la derecha; #1 con bloque navy y acento cian/magenta.
- Ventaja: mejor comparación entre parejas y mayor densidad. La columna del total reduce ancho de nombres; los largos crecen por líneas completas.
- Avatares #1: 56 px en 390, 52 en 320; #2–3: 46/44; #4–5: 40; #6+: 32.

## B — Dupla deportiva

- Posición protagonista; #1 navy con acentos SELPA.
- Dos jugadores apilados con el segundo retrato desplazado; lectura izquierda a derecha y nombres completos.
- Franja inferior propia de total de pareja, con número a la derecha.
- Ventaja: más ancho para nombres y protagonismo deportivo. Consume más altura que A; no se oculta esa diferencia.
- Avatares #1: 54 px en 390, 52 en 320; #2–3: 44; #4–5: 38; #6+: 30.

## Medidas reales de navegador

Mismos datos, encabezado QA de 132 px, pie de 36 px, primera card en y=174 y viewport interior 844 px de alto. Estos conteos **no certifican todavía el shell real de SELPA**, que sigue intacto. Gutter de cada propuesta: 8 px.

| Medida | A | B |
|---|---:|---:|
| #1, 390 / 320 px | 141 / 133 px | 169,39 / 165,39 px |
| #2 con dos nombres largos, 390 / 320 | 123 / 131 px | 141,19 / 141,19 px |
| #3, 390 / 320 | 115 / 111 px | 141,19 / 141,19 px |
| #4 y #5 | 101 px | 123,09 px |
| #6+ normal, 390 | 81 px | 94 px |
| Puestos completos en vista Top 5, 390×844 | 5 | 4 |
| Puestos completos en vista Top 5, 320×844 | 5 | 4 |
| Filas completas desde #6, 390×844 | 7 (#6–12) | 6 (#6–11) |

Nombres cortos en #1; ambos largos en #2; iniciales cuando no hay foto. No se recortan nombres. Posiciones y totales sintéticos idénticos entre A/B, sin suma individual.

## QA ejecutada en esta tarea

- Capturas reales del navegador: comparativas lado a lado a 390 y 320 px, más clasificación 390. Cuatro capturas adicionales a 375/430 px. **Siete imágenes nuevas, diez vistas internas.**
- Mediciones DOM: nombres contenidos y sin colisión con fotos; ausencia de overflow; fotografías cargadas. Verificación específica de los 12 totales por propuesta en 390 y 320: todos dentro de su zona, sin recorte.
- Revisión visual: se corrigió un ancho insuficiente del total A y se afinó la altura de B antes de tomar las capturas finales. No se eligió una propuesta por esa corrección.
- Once rutas estáticas HTTP 200, CSP sin conexiones salientes, assets locales; node --check del servidor estático PASS. No se ejecutan scripts en las páginas ni consultas a servicios externos.
- TypeScript/lint/build y pruebas de la app: **no ejecutados en esta tarea**, dado que no se modificó código de aplicación. Los PASS anteriores siguen siendo históricos, no nueva certificación.
- Sin Supabase, SQL, Data API, Carrera, permisos, publicación, cálculo, puntos ni datos reales. Mixto individual continúa diferido. No commit/push/deploy/merge.

## Archivos y evidencia

- Prototipos, CSS, datos sintéticos, servidor loopback temporal y capturas en output/ranking23-proposals-20261104-tGjiGu; todo ignorado por Git y separado de apps/web. Sin dependencias nuevas ni archivos .env.
- [Galería completa](../output/ranking23-proposals-20261104-tGjiGu/REVISION_VISUAL.html), [390](../output/ranking23-proposals-20261104-tGjiGu/AB-390-top5.jpg), [320](../output/ranking23-proposals-20261104-tGjiGu/AB-320-top5.jpg), [clasificación](../output/ranking23-proposals-20261104-tGjiGu/AB-390-clasificacion.jpg), [medidas](../output/ranking23-proposals-20261104-tGjiGu/measurements.json), [totales](../output/ranking23-proposals-20261104-tGjiGu/score-checks.json), [HTTP](../output/ranking23-proposals-20261104-tGjiGu/http-checks.json).
- Documentación versionable modificada: este informe nuevo y docs/SELPA_CONTINUIDAD.md. Los archivos locales anteriores de Ranking 2.1/2.2 y el SQL pendiente permanecen intactos.
- El servidor QA se cierra al terminar; los HTML y las capturas permanecen disponibles localmente. Output no viaja por GitHub.

## Próximo paso histórico A/B (reemplazado por C)

El usuario debe seleccionar **A o B** después de comparar las capturas. Solo entonces implementar la dirección elegida en la experiencia compartida guest/PLAYER/Club Admin, mantener reglas, empates y contratos, y trabajar la mejora de Individual. No rediseñar globalmente ni integrar una propuesta por cuenta propia.
