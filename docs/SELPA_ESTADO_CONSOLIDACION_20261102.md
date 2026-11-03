# ESTADO PARA CHATGPT — Revisión final SELPA, 02/11/2026

1. **Dictamen y alcance.** La rama local está lista para crear commit y publicarse exclusivamente como rama de consolidación, cuando el usuario lo autorice. No hay bloqueos de integración encontrados tras esta revisión. NO hubo commit, push, merge ni deployment. No implica certificación de Production, servicios reales o iPhone físico. Se revisaron íntegramente el diff staged original de 31 archivos, sus archivos nuevos y este informe; la revisión agrega navegación segura y QA hasta 34 archivos locales respecto de e4161b2.

2. **Casa y banco preservados.** Casa (a1eda93 sobre aa9cfac): Home con errores parciales/clubes correctos, catálogo público compartido con PLAYER, filtros URL Aplicar/Cancelar, conteos, guardas de inscripción, borradores privados, pagos sin verificar y agenda basada en inscripciones reales. Banco (e4161b2): card canónica TournamentPublicCard mediante adaptador PlayerAgendaCard, responsive por contenedor, flyer manual, estado de inscripción, búsqueda compacta, filtros financieros en una línea y carga de Perfil con reintentos acotados. CSS público, navbar, CSS financiero, Perfil y lector/tests de Perfil idénticos al banco.

3. **Conflictos y correcciones finales.** Los cinco conflictos anteriores siguen resueltos, sin archivos unmerged ni marcadores:

| Archivo | Resolución verificada |
| --- | --- |
| apps/web/app/(app)/player/torneos/TournamentsPlayerView.tsx | Adaptador canónico del banco + catálogo común, filtros URL y sheet compacto. Sin composición legacy; se corrigió merge de clubs para conservar city. |
| apps/web/app/styles/public.css | Final idéntico al banco; conserva container queries y evita overrides antiguos por pantalla/alturas fijas del sprint. |
| apps/web/components/player/PlayerAgenda.module.css | Grid del banco + navegación del sprint; sin recuperar estilos de card legacy. |
| apps/web/components/public/TournamentPublicCard.tsx | Wrapper/flyer/estado canónicos + hechos y conteos, sin duplicar categoría/rama al faltar flyer. La navegación usa un prop returnTo, sin otra card o layout. |
| docs/SELPA_CONTINUIDAD.md | Historias de los dos equipos y protocolo vigente preservados; estado final y nueva evidencia al comienzo/cierre. |

**Volver resuelto:** catálogo y Explorar pasan origen y filtros en la URL del detalle. El enlace explícito, incluido estado de error, vuelve al recorrido correcto con q/categoria/rama/club. Nuevo helper tournamentNavigation.ts permite solo destinos internos conocidos de torneos, rechaza externos/controles/backslashes y descarta parámetros ajenos. Funciona al recargar o abrir pestaña nueva, sin depender de history.back. Enlaces directos mantienen /torneos como fallback. Dos tests nuevos cubren roundtrip de filtros Unicode/ampersand y retornos no confiables. Mes/día del calendario y paginación incremental no se persisten en URL con esta corrección.

**Pagos y Perfil:** los cinco filtros mantienen fila única, sin scroll horizontal y targets >=44x44 en 320/375/390/430; se seleccionaron Todos/Pendientes/Parciales/Pagados/Cancelados y se vieron sus cargos ficticios. Se amplió solo el fixture loopback con tres RPC de lectura financiera, sin tocar API/CSS de producto ni datos reales. Perfil tiene tests para 500→200, red, 502/503/504, persistentes, 401/403, cuenta cambiada y abort. Dos backoffs 300/900 ms, refresh 401 una sola vez; 5xx persistente termina tras tres solicitudes, 403 tras una. La pantalla muestra error y permite reintento manual; no reinicia un ciclo automático infinito.

4. **Pruebas ejecutadas en esta revisión.**

| Comprobación | Resultado |
| --- | --- |
| npm.cmd test en apps/web | 900/900 PASS, 0 fallos/omitidos, 106,2 s; incluye Perfil y nuevos tests de navegación. |
| npm.cmd exec tsc -- --noEmit --incremental false | PASS, código 0. |
| npm.cmd run lint | PASS, 0 errores / 128 advertencias existentes. |
| npm.cmd run build | PASS, compilación 20,9 s; 166/166 páginas. Variables sintéticas, sin deployment. |
| node scripts/qa/block2-http.mjs | 11/11 PASS, app optimizada local + fixture, sin servicios reales. |
| git diff --check / cached / HEAD | PASS al cierre; nuevos archivos incluidos en revisión. |
| QA navegador | Volver público con cuatro filtros tras refresh; Explorar PLAYER con cuatro filtros → detalle en pestaña nueva → Volver conserva ruta/valores; Agenda/Historial, calendario, Inicio, Perfil→Carrera y filtros de pagos sintéticos. |
| Responsive | Pagos/Agenda/Explorar medidos en 320/375/390/430/768/1280, sin overflow horizontal o interno de cards; pagos en una fila. Capturas revisadas pagos 320, Explorar 390 e Inicio 390. |

El primer npm test se invocó por error desde raíz, sin script y sin ejecutar tests; luego se corrigió cwd y pasó la suite completa. Build/servidores/HTTP fuera del sandbox por la restricción loopback conocida. Advertencias de module.register y Browserslist antiguo. Evidencias ignoradas: output/consolidation-final-20261102; reporte HTTP sintético en output/block2-qa/http-report.json. No se incluyen logs, capturas, .env, temporales, claves ni cambios ajenos.

5. **Límites pendientes.** No se certificaron sesión real de Perfil, inscripción completa autorizada, datos deportivos publicados, ledger/cobros reales ni Safari/iPhone/PWA físico. El fixture muestra datos inventados identificados como QA y no representa verificación del ledger real. No hubo submit de inscripción, pago ni edición de perfil. La card conserva truncado de nombres extremos aprobado en el banco. Sin regresiones observadas en recorridos revisados; esto no equivale a QA exhaustiva de toda SELPA. Cero datos reales creados/modificados y ningún cambio en Supabase/schema/RLS, main o Production.

6. **Git y respaldo.**

| Rama | Estado comprobado |
| --- | --- |
| codex/home-block2-recovery-20261102 | a1eda932444077399a06ad7e971a0ed02e7e672b; respaldo GitHub reconfirmado mediante ls-remote. |
| origin/codex/player-ux-20261102 | e4161b2877f2aad15a277ce3f907590a5615398f, remoto reconfirmado y preservado. |
| codex/player-block2-consolidated-20261102 | Activa, HEAD e4161b2 + 34 archivos locales revisados, sin commit nuevo, sin upstream ni publicación. |
| codex/selpa-full-integration-20261030 | Local aa9cfac; remoto 9c28abcf79869a022b1cb745434246511cfc788e, intactos. Local un commit detrás, sin avance automático. |

Stashes vacíos e intactos; sin reset/clean/force. La consolidada sigue ausente en GitHub. Preview/Production no consultadas ni operadas. El banco todavía NO dispone de esta resolución final local.

7. **Próximo paso exacto para sincronizar con el banco.**

- Ahora: obtener autorización explícita para commit y push únicamente de codex/player-block2-consolidated-20261102. No ejecutar todavía.
- Después de autorización, desde C:\SELPA: comprobar rama/diff staged, crear commit con los archivos revisados y ejecutar git push -u origin codex/player-block2-consolidated-20261102. Verificar que git rev-parse HEAD coincida con git ls-remote origin refs/heads/codex/player-block2-consolidated-20261102 y entregar el SHA resultante. Ningún merge a integración/main ni deployment está autorizado.
- En el banco, desde el worktree canónico D:\SELPA\output\selpa-full-integration-20261030 (confirmar la ruta real antes): revisar status, rama, HEAD, remoto y stashes; conservar cualquier pendiente. Solo con checkout/índice limpios ejecutar:

```powershell
git fetch origin
git switch --track -c codex/player-block2-consolidated-20261102 origin/codex/player-block2-consolidated-20261102
git rev-parse HEAD
git rev-list --left-right --count HEAD...origin/codex/player-block2-consolidated-20261102
```

- Comparar SHA recibido con el entregado al publicar y exigir 0 0. Si la rama ya existe, NO recrearla/forzarla: inspeccionarla; solo con avance compatible y sin pendientes usar switch de esa rama y pull --ff-only; detenerse ante divergencia. Leer AGENTS.md y docs/SELPA_CONTINUIDAD.md recibidos antes de continuar en apps/web. No copiar .env, chats o node_modules. Hasta el push autorizado, no cambiar de rama en C:\SELPA ni asumir que este trabajo final viajó al banco.

## Archivos locales completos respecto de e4161b2

- apps/web/app/(app)/player/page.tsx
- apps/web/app/(app)/player/torneos/TournamentsPlayerView.tsx
- apps/web/app/(app)/torneos/[id]/TournamentDetail.module.css
- apps/web/app/(app)/torneos/[id]/inscripcion/page.tsx
- apps/web/app/(app)/torneos/[id]/page.tsx
- apps/web/app/api/public/home/route.ts
- apps/web/app/api/public/tournaments/route.ts
- apps/web/app/api/tournaments/[tournamentId]/public-detail/route.ts
- apps/web/app/page.tsx
- apps/web/components/player/PlayerAgenda.module.css
- apps/web/components/player/PlayerAgendaCard.tsx
- apps/web/components/product/ReadFailure.tsx
- apps/web/components/public/CommunityTournamentCalendar.tsx
- apps/web/components/public/PublicHomeEmbed.tsx
- apps/web/components/public/PublicHomeExperience.tsx
- apps/web/components/public/PublicTournamentsExperience.tsx
- apps/web/components/public/TournamentPublicCard.module.css
- apps/web/components/public/TournamentPublicCard.tsx
- apps/web/components/public/TournamentSearch.tsx
- apps/web/lib/homeTournamentsBlock2.test.mjs
- apps/web/lib/playerAgenda.ts
- apps/web/lib/publicHomeData.ts
- apps/web/lib/publicTournamentDiscovery.ts
- apps/web/lib/publicTournamentItems.ts
- apps/web/lib/rankingClubCards.test.ts
- apps/web/lib/tournamentNavigation.test.ts
- apps/web/lib/tournamentNavigation.ts
- apps/web/lib/tournamentRegistrationAvailability.ts
- apps/web/lib/useTournamentDiscoveryFilters.ts
- apps/web/scripts/qa/block2-http.mjs
- apps/web/scripts/qa/block2-server.mjs
- docs/SELPA_CONTINUIDAD.md
- docs/SELPA_ESTADO_CONSOLIDACION_20261102.md
- docs/SELPA_SPRINT_NOCTURNO.md

Cambios propios de esta revisión: vista PLAYER Torneos, detalle, PlayerAgendaCard, CommunityTournamentCalendar, PublicTournamentsExperience, TournamentPublicCard, useTournamentDiscoveryFilters, fixture block2-server, helper/test de navegación y ambos documentos de continuidad/estado. El resto es integración preservada del sprint.
