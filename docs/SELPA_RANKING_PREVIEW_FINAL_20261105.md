# SELPA — Ranking: validación final en Preview · 05/11/2026

**READY**: [Abrir DEMO en Safari](https://selpa-9dfhb8cpj-selpaapp-2619s-projects.vercel.app/preview/demo?modality=PAIRS&gender=M&category=6).

Deployment: dpl_ADL8YXq4h1Bw7Lws5nK2H7AcCHMt. Proyecto selpa-app, scope selpaapp-2619s-projects, origen CLI, target Preview. Una publicación autorizada del código local; no se modificó diseño/código durante este cierre.

## Aceptación

| Control | Resultado y evidencia |
| --- | --- |
| Foto/nombre en cada extremo, puesto/total al centro | PASS en navegador remoto; ambas fotos QA de la primera pareja cargadas. |
| Top5 especial y compacto | PASS:90/83/82px en390 para#1/#2–3/#4–5. |
| Desde#6 más denso | PASS:~70,9px; captura con#6–#12 completos. |
| Nombres largos320/390 | PASS sin overflow/superposición; crecimiento natural hasta~105,8px en320. |
| Filtros táctiles | PASS>=44px; chips, modalidades, año y grupo. Libres→General vacío→Libres. |
| Default del jugador | PASS en QA con sesión/lector sintéticos:F7/Parejas/2026/Libres. Pendiente cuenta real; DEMO usa invitado. |
| Empates | Se preserva puesto oficial, sin renumerar. Tests actuales PASS y QA previo500/400/400→1/2/2. DEMO Individual no contiene empate. |
| Aportes individuales de parejas | No se muestran:solo total oficial; sin puntos inventados. |

Sin contexto personal inequívoco:Individual/Caballeros/última temporada ofrecida/primera categoría/Libres si está disponible. URL explícita prevalece. No se publica una temporada privada para resolver el default.

## Pruebas y evidencia

- 82/82 tests focales reejecutados PASS. Build de esta Preview PASS. TypeScript/lint/build locales PASS de la revisión anterior, sin cambios de fuente posteriores; no se reejecutaron aquí.
- QA navegador real desde el deployment READY, sin operaciones de escritura ni datos privados. Consola capturada:sin errores/avisos. Vista390×844 Windows, ancho de contenido375 por scrollbar15px; no equivale a iPhone físico.
- [Top5 parejas390](../output/ranking-final-preview-20261105-pPj4FY/remote-pairs-top5-390.jpg), [clasificación390](../output/ranking-final-preview-20261105-pPj4FY/remote-pairs-classification-390.jpg), [Individual390](../output/ranking-final-preview-20261105-pPj4FY/remote-individual-390.jpg), [nombres largos320](../output/ranking-final-preview-20261105-pPj4FY/remote-long-names-320.jpg), [galería](../output/ranking-final-preview-20261105-pPj4FY/REVISION_VISUAL.html). Capturas reales con fixtures DEMO sintéticos; las fotos QA no representan identidades reales del ranking.
- El icono negro flotante visible pertenece a Vercel Toolbar; no se modificó protección/configuración para ocultarlo.
- Dry run845 archivos/39.803.987bytes; snapshot SHA256 40306b8ec60f543157f6e8b99e9b42294e27b8d15b976ec4216b869c6d9a3104. Sin env/secretos/SQL/otros worktrees; trece archivos clave remotos coinciden por SHA1 y snapshot local completo idéntico tras publicación.

## Estado y límites

La ruta DEMO existente conserva el aislamiento Preview y no consulta ni cambia información privada. Para ver parejas usar Libres; General conserva el caso vacío. Mixto individual y un contrato fiable de aportes individuales por pareja siguen pendientes. Validación física Safari/PWA y default con cuenta real pendientes.

Production permanece en dpl_EhpxrmcQVzr2eWzAVywaJqdwi4BY. Sin Supabase/SQL/datos reales, commit, push, merge ni alteraciones de protección. Solo se añadieron este informe, la entrada de continuidad y evidencia output ignorada. Código local acumulado preservado.

Rama codex/club-admin-overnight-20261102; HEAD e8a110dc1bb7fc9f85c41169ea1971c2ae8dde71 coincide con GitHub según ls-remote de este cierre. Índice vacío; stash intacto. El código posterior a ese commit sigue sin publicar en GitHub, pero el snapshot indicado está publicado en esta Preview.
