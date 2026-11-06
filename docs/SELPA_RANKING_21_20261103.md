# SELPA — Ranking 2.1, compactación premium, 03/11/2026

Estado: solo local en codex/club-admin-overnight-20261102, base e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71, verificada contra GitHub al inicio. Sin commit/push/deployment. Preexistente: propuesta Mixto individual sin seguimiento; se conserva intacta, sin ejecutar. Stash histórico preservado.

## Alcance y decisiones

- Una misma composición para invitado, PLAYER y Club Admin. Se conservan header/nav/bottom nav y gutter móvil de 8 px.
- Avatares 1:1 circulares con object-fit cover y encuadre 50%/35%. Pareja como una sola unidad: posición izquierda, dos avatares con solape de 10 px, dos nombres y un solo puntaje compartido.
- Fotos e iniciales tienen el mismo contenedor. Tamaños exteriores mobile: 54 / 46 / 42 / 32 px para #1 / #2–3 / #4–5 / #6+.
- Nombres sin truncar ni superponerse al puntaje. Puntaje bajo los nombres en las cards destacadas de parejas; desde el 6 lateral cuando hay espacio, inferior a 320 px. Individual mantiene puntos laterales y el mismo lenguaje visual.
- #1 se distingue por borde/acento suave y tipografía, sin fotografía rectangular dominante. No se agregan variaciones de puesto sin datos.
- Categoría seleccionada una sola vez en los chips; se elimina su repetición por card. Un puntaje en formato 1.900 pts, sin recalcularlo.
- Filtros locales más juntos; desde 375 px categorías y controles secundarios comparten fila. Selects y búsqueda conservan fuente de 16 px, filtros targets >=44 px. La posición propia mide 58 px, con link de 44 px.
- Cards completas clickeables cuando ya existe href válido (individual). Las parejas sin destino siguen siendo artículos: no se inventa una ruta de pareja.

## Identidades y fixtures

La pareja que mostraba dos veces Álex Torres tenía dos user IDs distintos en el fixture; el adaptador mapeaba correctamente las columnas de cada integrante. Se cambia solo el nombre sintético de uno a Bruno Ferreyra y se añaden dos nombres largos al fixture V2: Alejandro Fernández de la Vega / Maximiliano Rodríguez de los Santos. No se sustituyen nombres reales ni se deduplican personas por texto; dos personas reales pueden compartir nombre. Se mantienen IDs, puntos y posiciones.

El mismo fixture actualizado se utilizó antes y después de editar la UI. No se cambiaron ranking, puntos, empates, temporadas, visibilidad, Carrera, autorización, API, modelo ni Supabase. No se ejecutó SQL compartido. Mixto individual sigue diferido.

## Alturas y aprovechamiento medidos

| Caso mobile | Ranking 2.0 | Ranking 2.1 |
| --- | ---: | ---: |
| #1 | 182 px | 116 px |
| #2–3 | 182 px | 96 px |
| #4–5 | 132 px | 84 px |
| #6+ normal, 390 px | 73,5 px | 66 px |
| #6+ normal, 320 px | 72 px | 68,8 px |
| Dos nombres largos, 390 px | 106 px | 81,2 px |
| Dos nombres largos, 320 px | 101 px | 102,4 px |

El caso largo a 320 utiliza nombres de 14 px (antes 12 px) y crece lo necesario para mostrarlos completos. No hay colisiones ni ocultación de texto. Top 5, del inicio de #1 al final de #5: **852 → 502 px, −41,1%**. En desktop/tablet los tres primeros comparten la altura de la fila de grid (116 px en el fixture).

| Viewport / scroll | Completas antes | Completas después |
| --- | ---: | ---: |
| 390×844 / 0 | 1 | 3 |
| 390×844 / 422 | 3 | 7 |
| 320×760 / 0 | 1 | 2 |
| 320×760 / 380 | 3 | 5 |

Criterio idéntico: card completa con top>=54 y bottom<=alto−90, evitando navbar y bottom nav. El IAB usa scrollbar clásico de 15 px, clientWidth 375/305 a viewport 390/320. Primer Top 5 en 390: y445,2 → y356,9. PLAYER y Club Admin también muestran 3 posiciones completas en 390×844 sin scroll. No se certifica Safari/iPhone físico.

## QA ejecutado

- **51/51 pruebas focales PASS**, incluidos contratos de ranking, aislamiento, nombres/avatares por identidad y guardas de Perfil. Se fortaleció la aserción de dos integrantes y añadieron dos casos de nombres largos/fotos faltantes y nombres iguales con IDs distintos.
- TypeScript sin emisión PASS; ESLint de archivos de esta tarea PASS sin advertencias; **build local optimizado PASS 167/167**, configuración sintética, sin deployment.
- **12 escenarios HTTP PASS** contra PGlite local; se mantienen puntos/posiciones oficiales, permisos, temporadas privadas, bandera de publicación y error de modelo ausente. Los cambios de escenario son únicamente del fixture desechable.
- Navegador en 320/375/390/430/768/1280, invitado/PLAYER/OWNER. Sin overflow horizontal; targets de filtros >=44, avatares circulares de tamaño estable, separación nombres/puntos, links individuales y puesto propio conservados. No se modifica la configuración administrativa durante las capturas.
- 404 de foto inexistente deliberada confirma iniciales. Al entrar como OWNER, el landing genérico de Club Admin consulta un summary no implementado por este fixture y devuelve 500; no es parte de la certificación de Ranking. /club/ranking y sus lecturas/configuración responden 200. No se certifica el dashboard general ni datos reales.
- Advertencia existente de Browserslist desactualizado; no se actualizan dependencias por este cambio visual.

## Archivos

1. apps/web/components/public/PublicRankingExperience.tsx — composición de card, tamaño de imagen solicitado, campeón y pts; sin cambios de datos.
2. apps/web/components/public/PublicRankingExperience.module.css — familia compacta y circular, responsive y motion reducido.
3. apps/web/components/ranking/RankingDiscovery.module.css — densidad y fila compartida local de filtros.
4. apps/web/components/ranking/OwnRankingPosition.module.css — padding local compacto, target conservado.
5. apps/web/scripts/qa/ranking-experience-fixture.mjs — nombres sintéticos distintos y caso largo, solo fixture V2.
6. apps/web/lib/publicRankingExperienceContract.test.mjs — contratos de identidad/avatares/puntos.
7. docs/SELPA_CONTINUIDAD.md — estado local actual e historia preservada.
8. Este informe.

No se modifican archivos API, repositorios deportivos, reglas, schema, migraciones, permisos ni Perfil. Configuración generada por Next restaurada tras QA. Propuesta SQL heredada sin seguimiento, intacta y sin ejecutar.

## Evidencia y siguientes pasos

21 capturas locales en output/ranking21-20261103-ArARkg. Abrir REVISION_VISUAL.html para comparación 2.0/2.1 al mismo viewport y scroll, Top 5 de parejas 320/390 por tramos, lista 6+, Individual, nombres largos, sin fotos, PLAYER y Club Admin. measurements-before.json contiene la línea base automática; comparison.json consolida las lecturas literales devueltas por CUA y sus imágenes. measurements.json conserva registros adicionales; no es un inventario completo de imágenes. Logs focales/TS/lint/build y http.json en la misma carpeta, ignorada por Git.

Pendiente: revisión visual del usuario, sesión real/iPhone/PWA; Mixto individual continúa sin autorización SQL. No solicitar publicación durante esta revisión: el usuario prohibió commit/push hasta revisar las capturas. Nada de esta pasada viaja a la notebook por Git todavía.
