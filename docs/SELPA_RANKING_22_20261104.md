# SELPA — Ranking 2.2: composición individual y parejas

Implementación iniciada el 03/11/2026; cierre local el 04/11/2026 (Argentina).

## Actualización posterior: Parejas con nombres centrados — 04/11/2026

El usuario sustituyó la composición diagonal por la referencia de dos fotografías alineadas en los extremos, con ambos nombres en el centro. Esta sección describe el estado actual; los apartados posteriores conservan la evidencia de la primera entrega de Ranking 2.2.

- Cada card mantiene posición a la izquierda, un retrato de cada integrante en los extremos, ambos nombres centrados y un único puntaje compartido debajo. Iniciales y nombres completos conservados. Como datos adicionales: aviso de empate y marca propia cuando corresponden; categoría/grupo/temporada siguen en el contexto, sin repetirlos ni inventar estadísticas.
- Individual no se modificó: mismo componente, reglas CSS y alturas; comprobación visual nueva a 390 px. No se modificaron reglas, APIs, puntos, posiciones, temporadas, Carrera, permisos, publicación ni Supabase.
- Mobile normal conserva 112/92/80/64 px. Cuatro puestos completos en 390×844 guest sin scroll, nueve filas desde #6 a scroll 802. Ambos nombres largos: 79,28 px en 390 y 96,08 px en 320; altura adaptativa para no recortar identidades.
- QA nueva: **53/53 focales**, ESLint, TypeScript y build **167/167 PASS**; git diff --check PASS. No se añadieron tests que repliquen CSS ni se repitió la auditoría de datos. El aviso caniuse-lite y el summary OWNER no implementado en el fixture siguen siendo limitaciones conocidas, ajenas al ranking; foto QA rota 404 intencional.
- **14 capturas nuevas**, mobile 320/375/390/430, tablet 768 y desktop 1280; guest/PLAYER/Club Admin, puesto propio, iniciales, nombres largos e Individual conservado. Mediciones DOM confirman fotos alineadas, nombres centrados, puntos debajo de ambos nombres y ausencia de overflow.
- Evidencia nueva: [galería y comparación](../output/ranking-pairs-centered-20261104-vVgRWf/REVISION_VISUAL.html), [medidas](../output/ranking-pairs-centered-20261104-vVgRWf/measurements.json), [tests](../output/ranking-pairs-centered-20261104-vVgRWf/tests-final.tap) y [build](../output/ranking-pairs-centered-20261104-vVgRWf/build-final.log). Las dos capturas anteriores incluidas en la galería están identificadas como históricas.
- Cambios de esta revisión: PublicRankingExperience.tsx y su CSS, este informe y continuidad. Los otros seis archivos pendientes se conservan desde el inicio de esta revisión; inventario de diez archivos y copias no SQL en output/ranking-pairs-centered-20261104-vVgRWf/baseline-local.
- Todo sigue local sobre e8a110d; sin commit/push/deploy. Pendiente revisión visual del usuario y prueba física iPhone. Mixto individual sigue diferido. Sesiones/servidores QA propios cerrados y configuración generada restaurada.

## Estado de la primera entrega de Ranking 2.2

- Checkout: D:/SELPA/output/selpa-full-integration-20261030; app canónica apps/web.
- Rama codex/club-admin-overnight-20261102; HEAD e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71. GitHub comprobado por lectura al cierre: mismo SHA. Índice vacío y stash histórico preservado.
- Ranking 2.1 ya tenía cambios locales. Se conservaron los nueve archivos preexistentes con inventario SHA-256 y copias de los ocho archivos no SQL en output/ranking22-20261103-bzLIHb/baseline-local. No se cambió de rama ni se integró trabajo remoto.
- Ranking 2.1 y 2.2 siguen **solo en local**, sin commit, push, merge ni deployment. GitHub conserva el checkpoint Ranking 2.0.

## Diseño implementado

- **Individual:** una foto circular, posición, nombre completo y puntos a la derecha. La jerarquía del Top 5 usa tamaño moderado, contraste y borde sutil. Desde el puesto 6, fila directa de 60 px en el caso normal.
- **Parejas:** una sola card, primera foto arriba a la izquierda y segunda abajo a la derecha; cada nombre se ancla a su retrato. Un único puntaje compartido al centro. La composición diagonal también se conserva en la clasificación compacta de 64 px.
- Fotos circulares 1:1, object-fit cover y encuadre 50% 35%. Fallback de iniciales del mismo tamaño. Nombres completos con ajuste de línea; nunca deduplicar personas por nombre ni truncar una identidad para encajar puntos.
- Se mantienen los filtros, las categorías disponibles, temporada/grupo/búsqueda, URLs, headers/nav/bottom nav, gutter mobile de 8 px, autorización y marca de posición propia. Sin variantes separadas por rol.
- En tablet 768–999 px, el Top 3 individual pone nombre y puntos en dos líneas junto al retrato. La primera revisión detectó nombres partidos letra por letra; se corrigió y se volvió a capturar antes del cierre. La captura final reemplaza ese caso fallido.
- **Ciudad omitida:** los contratos de ranking y de sus avatares no exponen una ciudad pública confiable. No se añadió una consulta ni se inferió residencia por club. La ausencia no deja espacio reservado.
- No se copiaron fotografías ni branding de las referencias; las fotos de QA ya existentes son ilustrativas y no acreditan identidad.

## Comparación medida con Ranking 2.1

Mismo fixture, filtros y navegador. Referencia mobile: 390×844, guest, búsqueda cerrada.

| Puesto / medida | Ranking 2.1 | 2.2 Parejas | 2.2 Individual |
|---|---:|---:|---:|
| #1 | 116 px | 112 px | 104 px |
| #2 y #3 | 96 px | 92 px | 84 px |
| #4 y #5 | 84 px | 80 px | 76 px |
| #6+ normal | 66 px | 64 px | 60 px |
| Top 5 completo con gaps, sin encabezado | 502 px | 482 px | 450 px |
| Puestos completos, scroll 0 | 3 | 4 | 4 |
| Puestos completos, scroll 422 | 7 | 7 | 8 |

Conteo conservador: card completa entre y=54 y y=754. A scroll 422 Parejas muestra puestos 3–9 frente a 2–8 de 2.1; Individual 3–10 frente a 2–8. No se suma una card cortada ni tapada por navbar. PLAYER agrega el bloque propio aprobado y Club Admin agrega acciones; sus capturas no se confunden con la comparación guest.

- Pareja con ambos nombres largos: 64 px a 390, 96,08 px a 320; ambos nombres completos, sin colisión con retratos o puntaje.
- A 320×844, scroll 0: tres puestos completos por modo; Parejas permite ver todo el Top 5 y dos filas adicionales a scroll 321. No se promete que todo el Top 5 entre junto al hero.
- Tablet 768×1024: diez puestos completos en ambas modalidades, con Top 3 en tres columnas. Desktop 1280×900: ocho en ambos modos. Se verificó legibilidad, no solo ausencia de overflow.

## QA de esta iteración

- **53/53 pruebas focales PASS**: publicRankingExperienceContract, clubRankingReadContract y playerProfileRead. Dos pruebas nuevas renderizan las cards reales y comprueban asociación foto/nombre de cada integrante, un único puntaje compartido, identidad individual única y ausencia de ciudad no contratada.
- **TypeScript PASS**, tsc --noEmit --incremental false. **ESLint focal PASS** sobre archivos de app modificados.
- **Build final PASS**, 167/167 páginas; posterior al arreglo tablet. Usa configuración sintética loopback con pagos deshabilitados. Aviso existente: base caniuse-lite de Browserslist desactualizada; no se actualizaron dependencias.
- **12 escenarios HTTP locales PASS**, incluyendo pública, OWNER/ADMIN/OPERADOR/PLATFORM, PLANILLERO denegado, anon/PLAYER denegados en API administrativa, puesto propio, privacidad, cambios de publicación CAS en fixture, Mixto y modelo ausente. Estos controles no certifican RLS de una base real.
- **QA visual real de navegador:** 320/375/390/430 px, tablet 768 y desktop 1280; guest, PLAYER y Club Admin; Top 5/lista en ambos modos, nombres largos, foto rota/iniciales, puesto propio #19, Damas con empate #2/#2 y Mixto parejas. Sin overflow horizontal en los 32 registros DOM/capturas.
- Configuración de Club Admin abierta y cerrada sin modificar switches. El script HTTP solo cambia escenarios de la base efímera QA y restablece su estado; no actúa sobre Supabase compartido.
- Foto rota QA devuelve 404 intencional y muestra iniciales. El dashboard genérico OWNER continúa limitado por el fixture (summary 500); las rutas y lecturas de Ranking responden 200. No se certifica ese dashboard como parte de esta tarea.
- Cambios generados por Next en tsconfig.json y next-env.d.ts identificados por contenido y restaurados al estado anterior. Servidores QA propios y sesión sintética cerrados, viewport restaurado. No se cerraron otros procesos.
- git diff --check, índice vacío, ausencia de conflictos y revisión de archivos sensibles comprobados al cierre.

## Archivos de Ranking 2.2

1. apps/web/components/public/PublicRankingExperience.tsx — componentes de card propios por modalidad; conserva el frame compartido y sus contratos.
2. apps/web/components/public/PublicRankingExperience.module.css — composición circular, diagonal para parejas y medidas más compactas; corrección tablet localizada.
3. apps/web/lib/publicRankingExperienceContract.test.mjs — dos regresiones de render/identidad.
4. docs/SELPA_CONTINUIDAD.md — estado actual e histórico preservado.
5. docs/SELPA_RANKING_22_20261104.md — este informe.

Los CSS OwnRankingPosition y RankingDiscovery, el fixture de nombres y el informe 2.1 son cambios locales heredados, conservados byte por byte desde el inicio de 2.2. La propuesta docs/proposals/20261103-mixed-club-ranking.sql también se conserva intacta: SHA-256 a1f7b7cd88d797d8361894a585e8ad11a3d9673ce500afd2c79f89a3215663a5. No se ejecutó SQL.

## Evidencia y siguientes pasos

- Galería local: [32 capturas y comparaciones](../output/ranking22-20261103-bzLIHb/REVISION_VISUAL.html).
- [Medidas originales](../output/ranking22-20261103-bzLIHb/measurements.json), [comparación](../output/ranking22-20261103-bzLIHb/comparison.json), [tests](../output/ranking22-20261103-bzLIHb/tests-final.tap), [HTTP](../output/ranking22-20261103-bzLIHb/http.json), [build final](../output/ranking22-20261103-bzLIHb/build-final.log). Output es evidencia local ignorada por Git.
- QA **sintética y local**. No se crearon ni cambiaron datos reales, ni se tocó Supabase, Data API, permisos, publicación compartida, API deportiva, cálculo, puntos, temporadas o Carrera. Perfil no se modificó en 2.2; se conservaron y ejecutaron sus regresiones existentes. No se certificó la prueba física del problema de Perfil.
- Pendientes: revisión visual del usuario y Safari/iPhone físico con sesión real. Mixto individual sigue diferido por decisión del usuario; no habilitarlo ni ejecutar su propuesta SQL.
- Antes de trasladar a otra computadora, obtener autorización de commit/push y revisar el alcance conjunto 2.1/2.2. Los cambios locales y la galería no viajan por GitHub todavía.
