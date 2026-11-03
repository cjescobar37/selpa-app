# SELPA — Sprint Home + Torneos + QA Mobile

Inicio: 01/11/2026, notebook `C:\SELPA`. Base: `aa9cfac315a7ec568853a5dca0d12191ab231322`, rama `codex/selpa-full-integration-20261030`. Git limpio al iniciar; fetch y fast-forward sin cambios (0/0). Cambios de este sprint exclusivamente locales; sin autorización de commit/push/deploy ni escrituras en Supabase compartido.

## Plan P0/P1/P2

- P0: alinear presentación de inscripción con estados bloqueados existentes del backend; no ofrecer alta para finalizado/cancelado/borrador/pausado/cierre vencido. No cambiar el motor ni las reglas deportivas/financieras.
- P1: Home con errores parciales explícitos, identidad correcta de clubes fuera de los cuatro destacados y separación entre conteo desconocido y cero; listado sin perder próximos por historial antiguo; búsqueda/filtros recuperables; cards con datos reales legibles.
- P1: detalle con recuperación de errores y cupos desconocidos sin ceros inventados; continuidad público/PLAYER preservando navegación y diseños aprobados.
- P2: QA aislada de lecturas, estados y recorridos en 320/375/390/430/768/1280; TypeScript/lint/build y revisión visual real. Si se cierra el bloque, auditoría focal Club/Platform.

## Hallazgos confirmados en la base

1. Home ignora errores en consultas de torneos/estadísticas y usa cero como fallback; fallo de contenido puede derribar toda la Home.
2. Identidad del club de cada torneo se busca únicamente entre cuatro clubes destacados.
3. Detalle y wizard controlan pausa/cierre de fecha, pero omiten otros estados que el submit ya rechaza (finalizado/cancelado/borrador).
4. Listado limita a 96 filas ordenadas por fecha ascendente antes de agrupar: el historial puede desplazar torneos próximos. Filtros solo en memoria.
5. Cards reciben cupos/conteos, pero no los muestran; los flyers manuales en `rules.flyer_manual_url` requieren resolución explícita.
6. El dump contiene columnas legacy y la documentación incremental describe extensiones posteriores; el SELECT existente incluye `segment`/`age_category_id` ausentes en el dump base. No se modifica schema ni se presume despliegue de migraciones.

## Implementación, pruebas y cierre

### Implementado localmente

1. **Home pública y Comunidad:** errores parciales explícitos sin bloquear torneos por una caída de noticias; reintento; conteos desconocidos separados de cero; nombres/logos/tema del club de todos los torneos, no solo de cuatro destacados. Se preservan rankings, clubes, noticias, sponsors y anuncios existentes sin inventar contenido.
2. **Catálogo:** consultas separadas para hasta 72 activos/próximos y 24 finalizados recientes. El historial no ocupa primero el límite completo. Conteos por equipos distintos, excluyendo cancelados/rechazados, de acuerdo con la semántica de capacidad existente. Un mismo servicio abastece SSR público y `/api/public/tournaments`, consumido por Explorar PLAYER.
3. **Filtros:** búsqueda sin acentos; categoría/rama/club; sheet con aplicar y cancelar, controles de 44–46 px y fuentes de 16 px. Filtros/búsqueda en la URL; detalle → Volver y refresh conservan contexto. Los cambios del sheet se aplican al ver resultados; X/Volver descartan el borrador de filtros.
4. **Cards:** flyer manual real resuelto desde su configuración (en QA se usa un asset sintético local), categoría/rama e inscriptos visibles cuando hay lectura. Badge arriba a la derecha, título sin superposición, fechas sin recortes y flyer completo. Altura móvil mínima de 148 px con crecimiento por contenido; no se vuelve a recortar texto para forzar 126 px. La composición desktop reserva ancho para fecha y badge. Las alturas de cards no compactas conservan su fallback anterior.
5. **Detalle/inscripción:** estados finalizado/cancelado/borrador/pausado/cierre vencido y cupo completo sin CTA de alta. Inscripciones existentes conservan su recorrido. Cupo desconocido no se convierte en cero. Se elimina la repetición de badges/subtítulos y del tablero ficticio para no inscriptos; estado cerrado compacto y errores con Reintentar.
6. **Privacidad del detalle:** el SELECT con service role ya existente podía entregar DRAFT anónimo. Ahora verifica `tournaments:view` para ese club o Platform Admin comprobado en backend antes de devolver el borrador. Respuestas personalizadas `private, no-store` y `Vary: Authorization`. Fallos de conteo/membresía/equipos/inscripciones responden 503 recuperable en vez de fingir cupo cero o ausencia de inscripción.
7. **Inicio y agenda PLAYER:** prioridad basada en el próximo torneo realmente confirmado o inscripción pendiente, separada del descubrimiento; última inscripción por torneo para evitar duplicados y respetar cancelaciones posteriores. Un torneo RUNNING/ACTIVE sin fecha final no se archiva por haber empezado ayer. Navegación local Mi agenda/Explorar/Calendario siempre accesible, manteniendo Inicio/Torneos/Mi ranking/Perfil en la barra inferior.
8. **Responsive:** se corrigió un desborde desktop de 4 px del detalle: calculaba ancho con `100vw` en lugar de su contenedor. Se preserva el gutter del shell en móvil y se quita padding exterior adicional en loaders de detalle/inscripción. Sin ocultar overflow global.
9. **Lectura financiera del recorrido:** un error o tabla de pagos ausente podía mostrarse como «Pago no registrado». Se devuelve disponibilidad de lectura separada del estado del pago. Detalle y wizard muestran «Pago sin verificar» y Reintentar consulta, conservando la inscripción y sin ofrecer completar otro pago desde ese estado incierto. No cambia cargos, acreditaciones ni contratos de cobro.

### QA verificada

| Comprobación | Resultado y alcance |
| --- | --- |
| `npm.cmd test` | 892 aprobados, 0 fallidos, 0 omitidos; 18 casos nuevos de este sprint y suite existente. 105,8 s en el último recorrido general. |
| Focal inicial y correcciones | Primeros 11 casos aprobados; la primera suite general dio 884/885 por un contrato de presentación que exigía fallback cero. Se actualizó para exigir lectura conocida o mensaje de no disponibilidad; no se cambió el motor de ranking. Los dos casos finales de pago requirieron completar el entorno VM con `NODE_ENV` sintético; ambos aprobados y luego incluidos en la suite general final. |
| TypeScript | `npm.cmd exec tsc -- --noEmit --incremental false`, código 0. |
| ESLint | `npm.cmd run lint`, código 0; 128 advertencias totales. No se hace saneamiento global fuera del alcance. |
| HTTP sintético | `node scripts/qa/block2-http.mjs`: 10/10. Home/descubrimiento, estados, cupos, borrador privado, caída de noticias/inscripciones y vacío válido. |
| Navegador local | Login sintético → retorno a inscripción; agenda con confirmados/historial; Home con prioridad personal; Explorar con club externo; aplicar/cancelar/Back del sheet; detalle → Back conserva filtro; logout; caída de contenido sin perder torneos y recuperación con Reintentar. |
| Responsive | 36 combinaciones de seis rutas/superficies y seis anchos: 320/375/390/430/768/1280. Sin overflow final; se detectó y corrigió el caso desktop del detalle, repitiendo sus seis mediciones. Se revisaron capturas reales móviles y desktop, no solo geometría. |
| Runtime | Pestaña nueva de Home sin errores/advertencias de consola. Durante edición hubo un error HMR transitorio al añadir un CSS Module, resuelto y revalidado; no se presenta como fallo persistente. |
| Build | `npm.cmd run build`, código 0; compilación Turbopack, TypeScript y 166/166 páginas estáticas. El primer intento se detuvo por falta de progreso dentro del sandbox; el reintento autorizado fuera de él y el build de la versión final pasaron. Advertencias de Node `module.register` y base Browserslist antigua, sin cambiar dependencias/configuración. |
| Diff | `git diff --check` sin errores; los diez archivos nuevos también se comprobaron por whitespace. Búsqueda de patrones conocidos de claves sin coincidencias; las credenciales de fixture son explícitamente sintéticas y locales. |

Los scripts locales escuchan solo en loopback. Fixture de solo lectura salvo login/logout sintético sin persistencia, escenarios en memoria y ningún forward externo. Next se inició con URL y claves falsas de QA en variables del proceso; no se editó `.env.local`. La suite usa su bootstrap aislado. Las consultas deportivas de Bloque 1 ausentes en el fixture nuevo devuelven no disponibilidad: no se cambia su arquitectura para rellenarlas.

Evidencias locales ignoradas por Git: `output/block2-qa/tests-final.log`, `focused-final.log`, `payment-focused.log`, `typescript-final.log`, `lint-final.log`, `http.log`, `http-optimized.log`, `http-report.json`, `build.log`. `focused-final.log` conserva el intento intermedio 16/18 del VM; la evidencia final que lo supera es `tests-final.log` (892/892). No se incluyen logs ni datos de usuarios reales.

### Límites y pendientes

- **No certificar Bloque 2 completo en entorno real.** Falta recorrer inscripción/pareja/horarios/revisión con cuentas y club autorizados, sin crear datos reales sin permiso. Se comprobó retorno de login y estado del wizard con sesión sintética, no un submit real.
- Falta certificar publicación efectiva de grupos, agenda y resultados personales; el tablero legacy sigue dependiendo de esos contratos. No se inventan partidos ni posiciones.
- La recuperación visual del error de lectura de pagos está implementada, pero falta la auditoría integral de cargos, pagos parciales/reversos y conciliación con cuentas/servicios autorizados. No hay certificación de Mercado Pago ni cobros.
- El catálogo devuelve un conjunto acotado (72 + 24); no se implementó paginación remota ilimitada. La paginación incremental pública opera sobre ese conjunto. Para mayor volumen, continuar con cursor/filtros server-side y prueba de carga autorizada.
- El dump base y los contratos incrementales no están completamente alineados (`segment`, `age_category_id`, otras extensiones ya usadas). No se aplicaron cambios de schema ni se certificó el ledger live en esta tarea.
- Safari/iPhone instalado: revisar teclado, selects, sheet con Back, safe area y scroll, flyers reales y regreso desde autenticación. El destello de splash previo sigue pendiente; no se hicieron parches.
- Club Admin/Platform: suite existente de roles/finanzas sigue incluida, pero no hubo sesión real ni certificación de sus operaciones. El bloque principal conserva pendientes end-to-end; no se inició una reimplementación administrativa.
- Antes de compartir entre equipos: revisión de diff y autorización específica de commit/push. Este sprint **no está en GitHub**.

### Próxima acción concreta

Revisar este diff local y completar QA de inscripción y publicación deportiva en un entorno autorizado, con iPhone físico. Auditar cargos, pagos parciales/reversos y conciliación como un hito separado, sin tocar datos ni reglas financieras como efecto secundario. Mantener las decisiones aprobadas y registrar evidencia nueva antes de cerrar cada pendiente.

### Archivos modificados

Todos los cambios de app se encuentran en `apps/web`; `AGENTS.md`, `apps/web2` y `apps/web3` no se modificaron.

- `apps/web/app/page.tsx`
- `apps/web/app/(app)/player/page.tsx`
- `apps/web/app/(app)/player/torneos/TournamentsPlayerView.tsx`
- `apps/web/app/(app)/torneos/[id]/page.tsx`
- `apps/web/app/(app)/torneos/[id]/inscripcion/page.tsx`
- `apps/web/app/(app)/torneos/[id]/TournamentDetail.module.css` (nuevo)
- `apps/web/app/api/public/home/route.ts`
- `apps/web/app/api/public/tournaments/route.ts` (nuevo)
- `apps/web/app/api/tournaments/[tournamentId]/public-detail/route.ts`
- `apps/web/app/styles/public.css` (solo reglas de altura de la card compartida, con fallbacks)
- `apps/web/components/player/PlayerAgenda.module.css`
- `apps/web/components/product/ReadFailure.tsx`
- `apps/web/components/public/PublicHomeEmbed.tsx`
- `apps/web/components/public/PublicHomeExperience.tsx`
- `apps/web/components/public/PublicTournamentsExperience.tsx`
- `apps/web/components/public/TournamentPublicCard.tsx`
- `apps/web/components/public/TournamentPublicCard.module.css` (nuevo)
- `apps/web/components/public/TournamentSearch.tsx`
- `apps/web/lib/playerAgenda.ts`
- `apps/web/lib/publicHomeData.ts`
- `apps/web/lib/publicTournamentItems.ts`
- `apps/web/lib/publicTournamentDiscovery.ts` (nuevo)
- `apps/web/lib/tournamentRegistrationAvailability.ts` (nuevo)
- `apps/web/lib/useTournamentDiscoveryFilters.ts` (nuevo)
- `apps/web/lib/homeTournamentsBlock2.test.mjs` (nuevo)
- `apps/web/lib/rankingClubCards.test.ts`
- `apps/web/scripts/qa/block2-server.mjs` (nuevo, fixture)
- `apps/web/scripts/qa/block2-http.mjs` (nuevo, checks locales)
- `docs/SELPA_CONTINUIDAD.md`
- `docs/SELPA_SPRINT_NOCTURNO.md` (nuevo)

`next-env.d.ts` fue regenerado durante dev y el propio build lo devolvió al contenido de HEAD; no tiene diff. No se modificó configuración del producto. No hubo commit, push, merge de ramas ni deployment; no se crearon datos reales. Estado al cierre: 20 archivos versionados modificados y diez nuevos, sin staging, sobre `aa9cfac`.
