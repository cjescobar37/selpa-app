# SELPA — Ranking 2.3 C integrada, 04/11/2026

Estado: implementación local lista para revisión visual; C fue elegida por el usuario, pero esta integración final todavía no está aprobada para publicar. Sin commit/push/deployment ni cambios en Supabase, SQL, Carrera o reglas deportivas.

## Alcance y archivos

App canónica: apps/web. Worktree: D:/SELPA/output/selpa-full-integration-20261030. Rama: codex/club-admin-overnight-20261102. HEAD base: e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71; GitHub coincidente al inicio y al cierre (ls-remote verificado). Índice vacío y stash preexistente preservado.

Cambios nuevos sobre el estado local 2.2/C recibido:

- apps/web/components/public/PublicRankingExperience.tsx: composición compartida de Parejas e Individual, dos filas de integrantes y un único Total pareja.
- apps/web/components/public/PublicRankingExperience.module.css: jerarquía C, avatares circulares, clasificación normal de 72 px, nombres completos con crecimiento natural, posición propia y adaptación a tablet/desktop. Gap local de Ranking de 8 a 4 px en mobile; sin rediseñar header, bottom nav ni controles globales.
- apps/web/lib/publicRankingExperienceContract.test.mjs: render real con correspondencia foto/nombre, un único total oficial, campos individuales no confiables excluidos y empates preservados.
- docs/SELPA_CONTINUIDAD.md, docs/SELPA_RANKING_23_PROPUESTAS_20261104.md y este informe: estado actual, evidencia y pendientes. El prototipo y las propuestas A/B/C se conservan como históricos.

Los otros cambios locales heredados se preservan: OwnRankingPosition.module.css, RankingDiscovery.module.css, ranking-experience-fixture.mjs, informes 2.1/2.2 y propuesta SQL Mixto. No se incluyen modificaciones nuevas de esos archivos en esta tarea. Once rutas pendientes inventariadas por SHA-256 y diez archivos no SQL copiados en output antes de comenzar. La propuesta SQL conserva SHA-256 a1f7b7cd88d797d8361894a585e8ad11a3d9673ce500afd2c79f89a3215663a5 y no fue ejecutada.

## Composición y contratos preservados

- Parejas: posición → integrante 1 → integrante 2 → bloque Total pareja. Foto y nombre completo alineados a izquierda; total separado a derecha. #1 navy con acento cian/magenta, #2–5 claros y compactos. Desde #6 conserva ambas identidades y un total legible.
- Solo se muestra entry.points, proveniente del total oficial. El contrato no ofrece aportes individuales fiables; los campos player1_points/player2_points no se utilizan como contribuciones ni se suman/dividen. No se añadieron datos personales, ciudad, estadísticas o variaciones inventadas.
- Individual: posición, foto circular, nombre izquierdo y puntos a derecha; Top 5 destacado y resto compacto. Sin categoría repetida por card.
- Fotografías faltantes o con error usan iniciales; no se repite un integrante como ambos miembros de la dupla. Nombres sin line-clamp/ellipsis y con crecimiento natural.
- RankingEntryFrame sigue proporcionando destino, label accesible y marca Vos. Se reservó espacio para esa marca, sin tapar el puesto. Targets, focus y prefers-reduced-motion conservados. Gutter exterior único de 8 px.
- No se cambió selección, lector, API, cálculo, orden, desempates, temporadas, grupos, publicación o autorización. Parejas/Caballeros siguen por defecto. Damas/Mixto y categorías según disponibilidad. Mixto individual conserva el mensaje de pendiente.

Rutas reales probadas con fixtures aislados:

- Invitado: /ranking?clubId=…; misma base PublicRankingExperience.
- PLAYER: /player/ranking/club resuelve contexto y deriva a /ranking con Parejas/Caballeros; posición propia fuera del Top 5 comprobada. /player/ranking conserva su resumen personal existente.
- Club Admin: /club/ranking usa la misma base visual y mantiene acciones/configuración de publicación. El diálogo Ramas publicadas fue capturado, sin cambiar interruptores mediante navegador.

## Medidas reales dentro del shell

Capturas nativas de navegador; medición DOM, altura de viewport móvil 844 px. El navegador de QA usa scrollbar de escritorio (15 px), por lo que su clientWidth es menor que el viewport nominal; se mantuvo idéntico antes/después. No equivale a Safari físico.

| Card normal | 2.2, 390 px | 2.3 C, 390 px | 2.3 C, 320 px |
|---|---:|---:|---:|
| Parejas #1 | 112 | 138 | 138 |
| Parejas #2–3 | 92 | 110 | 106 |
| Parejas #4–5 | 80 | 110 | 106 |
| Parejas #6+ | 64 | 72 | 72 |
| Individual #1 | 104 | 92 | 92 |
| Individual #2–3 | 84 | 70 | 70 |
| Individual #4–5 | 76 | 70 | 70 |
| Individual #6+ | 60 | 58 | 58 |

Avatares Parejas: 56 px #1; 48 px #2–5 (46 en 320); 34 px clasificación. Individual: 56/48/38 px. La pareja con Alejandro Fernández de la Vega y Maximiliano Rodríguez de los Santos mide 72 px en 390 y 100,56 px en 320: ambos nombres completos; no se impuso una altura fija.

Se cuentan únicamente cards completas entre el header y la bottom nav, sin contar las parcialmente tapadas. Invitado mobile: zona útil y=55–786; PLAYER/Admin y=57–786.

| Condición, mismos fixtures | 2.2 | 2.3 C |
|---|---:|---:|
| Parejas 390×844, scroll 0 | 4 | 3 |
| Parejas 320×844, scroll 0 | 3 | 3 |
| Parejas 390×844, scroll 270 (Top 5) | 7 | 6 |
| Parejas 320×844, scroll 321 (Top 5) | 7 | 6 |
| Parejas 390×844, mismo scroll 802 | 10 | 7 |
| Parejas 390×844, #6 alineado en y=73 | 10 (scroll 802) | 9 (scroll 904) |
| Individual 390×844, scroll 0 | 4 | 5 |
| Individual 320×844, scroll 0 | 4 | 5 |
| Individual 390×844, scroll 270 | 8 | 9 |
| Individual 390×844, mismo scroll 760 | 10 | 11 |
| Individual 390×844, #6 alineado en y=83 | 10 (scroll 760) | 11 (scroll 688) |

La mayor presencia de fotos/jerarquía C cuesta una pareja completa en el primer viewport de 390. La clasificación alcanza el objetivo 68–74 px y mejora frente al prototipo C anterior de 82 px; no se afirma que sea más densa que 2.2 de 64 px. Individual sí aumenta densidad. Los conteos de cinco parejas del prototipo aislado no representan el shell real y no deben reutilizarse como evidencia de esta integración.

Con posición propia y herramientas internas: PLAYER y Admin muestran inicialmente 3 parejas / 4 individuales completos a 390. Tablet 768×1024: 8 parejas / 11 individuales. Desktop 1280×900: 8 parejas / 10 individuales. En desktop los tres líderes comparten altura de fila (138 parejas / 92 individuales), sin deformar avatares. No se modificó el shell para inflar estos conteos.

## QA realizada en esta tarea

- 54/54 tests focales PASS: publicRankingExperienceContract, clubRankingReadContract y playerProfileRead. El último es regresión del fix preexistente de Perfil, sin nueva modificación de auth/fetch.
- TypeScript --noEmit --incremental false PASS; ESLint focal PASS sin warnings de archivos modificados; build Next PASS, 167/167 páginas.
- Doce escenarios HTTP PASS con app real y fixture efímero local: default Parejas/M, lectores públicos, roles internos, denegación anon/PLAYER, PLANILLERO, posición propia/antisuplantación, división de otro club, publicación owner-only/CAS, temporada privada, Mixto parejas/ausencia Individual y modelo faltante distinto de vacío. La prueba de publicación muta solo el fixture desechable, no Supabase.
- 44 capturas: 9 antes 2.2 y 35 después C. Mobile 320/375/390/430, tablet768, desktop1280, Top 5 y clasificación, nombres largos, fotos/initiales, posición propia, guest/PLAYER/Admin, diálogo de publicación, Damas con empates 1/2/2, Mixto parejas, Mixto individual pendiente y categoría vacía.
- Medición DOM: sin overflow horizontal; nombres dentro de su card y sin invadir Total pareja; puntos completos; fotografías presentes cargadas. Las fotos ausentes usan iniciales. Se revisaron visualmente las capturas, no solo la compilación.
- Archivos generados next-env.d.ts y tsconfig.json restaurados a sus bytes anteriores después de comparar semánticamente los cambios de Next. Servidores temporales locales 3000/45432 cerrados; no se alteraron otros procesos ni pestañas del usuario.
- Advertencia preexistente de caniuse-lite desactualizado. El fixture provoca intencionalmente 404 de una foto para comprobar fallback; sus dashboards ajenos al Ranking no cubren toda la app (resumen /club 500 y agenda PLAYER sin lectura). No se presentan esos dashboards como certificados ni se amplía el alcance para corregir mocks.

## Evidencia y continuación

[Galería antes/después y capturas de roles/dispositivos](../output/ranking23-integrated-20261104-HOyEFm/REVISION_VISUAL.html).
[Métricas DOM](../output/ranking23-integrated-20261104-HOyEFm/measurements.json), [resumen](../output/ranking23-integrated-20261104-HOyEFm/qa-summary.json), [HTTP](../output/ranking23-integrated-20261104-HOyEFm/http.json), [tests](../output/ranking23-integrated-20261104-HOyEFm/tests-final.tap), [build](../output/ranking23-integrated-20261104-HOyEFm/build-final.log). Output ignorado por Git; no se transporta a la otra PC sin copiarlo por un medio autorizado.

Pendiente: aprobación visual de esta integración por el usuario, prueba física iPhone/PWA y verificación con datos oficiales cuando se autorice publicar. Mixto individual continúa pendiente de autorización SQL; no se tocó. No repetir ni reinstalar migraciones. No hay commit/push/deployment autorizado para este checkpoint.
