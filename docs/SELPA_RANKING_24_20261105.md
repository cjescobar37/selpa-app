# SELPA — Ranking 2.4 · 05/11/2026

Estado: implementación local lista para revisión visual, sin aprobación final del usuario. Base e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71, rama codex/club-admin-overnight-20261102. Checkout D:/SELPA/output/selpa-full-integration-20261030. GitHub coincidía con este HEAD al inicio; no commit, push, merge ni deployment en esta tarea.

## UX y datos

- Default sin selección explícita: el servidor presenta Individual/Caballeros/última temporada ofrecida/primera categoría; Libres tiene prioridad dentro de esa categoría. Ya no se prefiere una categoría por población ni una temporada ACTIVE sobre otra posterior CLOSED. Se respetan selecciones URL existentes, incluso categorías vacías.
- La sesión vive en el cliente: RankingDefaultBoundary espera sesión lista, rol PLAYER e identidad/club. GET /api/player/ranking-default verifica bearer mediante verifySelfCareer y membresía deportiva aprobada. Lee únicamente entradas propias vigentes y divisiones de parejas con evidencia propia, dentro del club solicitado. No acepta un usuario ni un rol desde parámetros.
- La elección personal usa la temporada más reciente con evidencia propia y una división inequívoca. Premia evidencia oficial de pareja frente a la proyección individual derivada; si hay varias divisiones plausibles, no inventa modalidad/grupo y usa el fallback público. La categoría/rama del vínculo ayudan a desambiguar. Ausencia/fallo de lectura no produce un error fatal de la pantalla.
- Contexto propio no publicado: permite reconocer temporada/división personal, con aviso de ámbito no publicado y cero filas de competidores. No transforma esa temporada en pública ni permite utilizar el endpoint como lector administrativo. Cambiar usuario/club cancela lecturas y descarta el resultado anterior. Respuestas privadas no-store.
- Filtros mobile en cuatro filas: Parejas/Individual; Caballeros/Damas/Mixto; chips 6ta/7ma/etc.; Año + Grupo/división + lupa. Chips separados, targets >=44 px, scroll horizontal interno y categoría seleccionada visible. Categoría compatible se conserva al cambiar de modalidad. El grupo aparece incluso con una sola opción.
- Parejas: posición angosta, dos filas de avatar/nombre alineadas a izquierda y Total pareja separado a derecha. Nombres completos crecen naturalmente; iniciales ante foto ausente o fallida. Individual mantiene una identidad y puntos a derecha. Gutter 8 px y shell/navbars sin modificaciones propias.
- Puntos individuales NO se muestran: readPairRankingPage hoy asigna combined_points a ambos campos player1_points/player2_points. Esos campos no son aportes individuales y no pueden sumarse ni publicarse como tales. Hace falta un contrato de lectura canónico que entregue aportes independientes reconciliados con el total oficial, con sus controles deportivos; no se amplió SQL.
- Posiciones, empates, puntuación, publicación, Carrera y permisos deportivos sin cambios. Mixto individual sigue pendiente; Mixto parejas solo donde ya existe oferta.

## Medidas y QA actual

| Parejas normales | 2.3 anterior | 2.4 actual, viewport 390 |
|---|---:|---:|
| #1 | 138 px | 122 px |
| #2–#5 | 110 px | 104 px |
| #6+ | 72 px | 70 px |

320: 118/100/70 px. Dos nombres largos en #19: 106,6 px a 320, 74,4 px a 390, sin truncar identidad ni invadir el total. Individual: 92/70/58 px. Las filas desktop se igualan por el grid; los avatares mantienen relación 1:1.

Viewports reales de navegador: 320/375/390/430, tablet 768 y desktop 1280; sin overflow horizontal. Windows reserva 15 px para scrollbar vertical (ej. viewport390/contenido375); no se presentan como Safari físico. A altura844 y scroll0: guest 3 parejas completas en 320/390/430 y 4 individuales en 320/390. A390, scroll324: Top5 completo + #6; scroll999: 9 filas completas de clasificación (#7–#15). Conteos calculados contra los límites reales de header y bottom nav (55–786), no con márgenes inventados. No se compara el primer viewport con 2.3 como si el bloque de filtros tuviera la misma altura: ahora son cuatro filas explícitas.

- 82/82 tests focales PASS (ranking público/privado, defaults, lectura Perfil y sesión, aislamiento de demo y seguridad de integración).
- TypeScript --noEmit --incremental false PASS.
- ESLint focal de archivos modificados: 0 errores/8 advertencias previas del navbar, que esta tarea no modificó.
- Build Next final PASS, 167 páginas. Advertencia previa caniuse-lite. Build y loopback requirieron ejecución fuera del sandbox por EPERM/EACCES; todas las variables de proceso de QA apuntan al mock local, pagos deshabilitados y credenciales ficticias. No se tocaron .env.
- HTTP real local: PLAYER200 con F7/Parejas/Libres; anon401; OWNER403; ADMIN403; club no vinculado devuelve preferred:null sin información ajena.
- Navegador: entrada PLAYER por ruta de compatibilidad confirma F7/Parejas/Libres; navegar explícitamente a Caballeros/6ta/Individual conserva esa elección. Temporada privada sintética presenta solo contexto personal, sin roster. Invitado y Admin usan fallback Individual/M/primera categoría vacía. Admin conserva configuración de publicación, inspeccionada sin activar interruptores.
- Damas Individual conserva 1/2/2 con 500/400/400. Mixto parejas responde con fixture; Individual muestra pendiente. Búsqueda administrativa sin resultados muestra vacío corto. Muchas categorías desplazables; fotos QA cargadas, iniciales correctas y cero nombres invadiendo Total pareja.
- No se certifica el dashboard fuera de Ranking: el mock de /club no implementa su resumen y la agenda PLAYER tampoco está completa. No se ampliaron cambios a esas áreas. Errores iniciales de arranque QA (cwd/loopback) fueron corregidos antes de capturas finales.
- git diff --check PASS; índice sin stage, stashes intactos. Generados next-env.d.ts/tsconfig.json devueltos al contenido limpio inicial. Servidores QA propios cerrados al finalizar.

## Archivos de esta tarea

- apps/web/app/ranking/page.tsx; app/(app)/player/ranking/club/page.tsx; app/api/clubs/[clubId]/ranking/official/route.ts; nueva app/api/player/ranking-default/route.ts.
- components/ranking/RankingDefaultBoundary.tsx (nuevo), RankingDiscovery.tsx y .module.css; components/public/PublicRankingExperience.tsx y .module.css.
- features/player-career/public-ranking.presentation.ts, player-career.repository.ts; ranking-default.rules.ts y ranking-default.repository.ts (nuevos).
- features/preview-sports-demo/ranking-demo-data.ts (solo default), lib/publicRankingExperienceContract.test.mjs, previewRankingDemoContract.test.mjs, rankingDefault.test.mjs (nuevo), scripts/qa/ranking-experience-fixture.mjs (opt-in V24).
- Este informe y docs/SELPA_CONTINUIDAD.md. El resto de cambios locales de 2.1/2.2/2.3/demo preservado. SQL pendiente intacto, sin ejecutar.

## Evidencia y pendientes

[Galería de capturas](../output/ranking24-20261105-4K0jZQ/REVISION_VISUAL.html). Métricas, HTTP, tests, TypeScript, lint y build en el mismo directorio output ignorado por Git; las capturas no viajan a la otra PC sin copia adicional autorizada.

Pendientes: aprobación visual; prueba física Safari/PWA; comprobar default con una cuenta y datos oficiales en Preview cuando se autorice publicar este checkpoint. El endpoint nuevo usa tablas/modelos de solo lectura ya existentes: si ese entorno no los expone al backend, se degrada al fallback y debe investigarse, sin habilitar permisos automáticamente. No se certifica Supabase compartido en esta tarea. Sin datos reales creados/modificados, sin cambios de configuración, SQL, Production ni nueva Preview.
