# Estado operativo y puntos extendidos
Tournament es la fuente de verdad deportiva. OPEN significa inscripciones abiertas;
al vencer registration_deadline se muestra Programado; RUNNING significa En juego.
Competition event/division mantienen su lifecycle y requisitos de snapshot.
No se fuerza SCHEDULED ni se congela configuración al publicar inscripciones.
is_public pertenece al catálogo Competition, no al estado de inscripciones del
Tournament vinculado. El panel no trata esa diferencia como bloqueo deportivo.
El contador creado/planificado es informativo; las reglas de cierre siguen intactas.

## Timezone
El dump local no tiene timezone canónico en clubs. No se inventó una columna.
Si existe configuración válida se prioriza; si no, la creación propone la zona
IANA del dispositivo. El editor muestra el valor explícitamente. La fecha actual
con timezone null requiere que el usuario lo confirme y guarde normalmente:
ningún registro existente se corrigió automáticamente.

## Master y compatibilidad
Creación/clonado de esquemas dejan is_active=false por diseño. Activación es
explícita, con permisos; no se investigó el historial remoto de este Master.
El editor ofrece siete niveles sin activar ni guardar valores automáticamente.
Propuesta a cargar manualmente: 750/500/400/250/150/100/50.
EIGHTH_FINALIST corresponde al perdedor real de ROUND_OF_16;
SIXTEENTH_FINALIST al de ROUND_OF_32. Sólo PLAYED con dos equipos distintos y
ganador canónico; un BYE no otorga tier. Walkover conserva el contrato PLAYED.
Se mantienen cinco reglas obligatorias y dos opcionales.
Snapshots de resultados/participantes transportan los códigos; cálculo, ledger,
proyecciones de ranking y reversals ya son genéricos por código/importe.
No se recalculan resultados publicados, snapshots ni puntos anteriores.

## Validación pendiente
Migración aditiva 20260915110511 preparada, NO aplicada.
QA SQL de catálogo/validador preparado, NO ejecutado.
Único bloque de validación real pendiente: PostgreSQL aislado, aplicar migración
y probar fixtures completos ROUND_OF_16/32, BYE/walkover, homologación,
snapshot, cálculo, publicación, ledger individual/parejas y reversals.
Los tests TS y contratos estáticos NO demuestran ese bloque PostgreSQL.
No instalar software ni conectar producción. Detenerse antes de seeds/grupos.

## Archivos de este P0
Todos los cambios de app están en apps/web:
- lib/competitionTournamentState.ts y .test.ts; competitionEventIssues.ts;
  competitionTimezone.ts; competitionEventOpenState.test.ts;
  competitionExtendedTiersContract.test.ts; competitionRankingAvatars.test.ts.
- features/competition/events/competition-events.repository.ts, .handlers.ts,
  .types.ts, .validation.ts y .timezone.ts.
- features/competition/ranking/competition-ranking.avatars.ts.
- features/competition/homologation/competition-homologation-review.ts.
- features/competition/points-schemes/points-schemes.types.ts.
- features/competition/series/competition-series.point-history.ts.
- app/(app)/club/competition/CompetitionAdmin.tsx, CompetitionControl.module.css,
  EventOperationsDashboard.tsx, SeriesEventsAdmin.tsx, PointsSchemesAdmin.tsx,
  SeriesCreateWizard.tsx, SeriesRankingPanel.tsx y EventSettlementPanel.tsx.
- app/(app)/club/torneos/nuevo/page.tsx.
- app/api/clubs/[clubId]/competition/series/[seriesId]/date-creation/route.ts
  y ranking/route.ts.
- components/ranking/RankingPlayerAvatar.tsx.
- supabase/migrations/20260915110511_competition_extended_playoff_tiers.sql.
- supabase/qa/20260915110511_competition_extended_playoff_tiers_validation.sql.
QA visual: mobile-review/event-polish-qa.mjs y sus capturas locales.
Se preservan los cambios preexistentes ajenos a este P0.
