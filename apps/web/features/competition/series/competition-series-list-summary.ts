import {
  deriveCompetitionEventOperationalState,
  selectCompetitionFocusEvent,
  type CompetitionEventPipelineInput,
} from '@/lib/competitionTournamentState'

export type CompetitionSeriesSummarySource = {
  id: string
  status: string
  planned_events_count: number | null
}

export type CompetitionSeriesSummaryEvent = CompetitionEventPipelineInput & {
  id: string
  series_id: string
}

export type CompetitionSeriesListSummary = {
  events_count: number
  progress_label: string
}

function seriesOperationalLine(item: CompetitionSeriesSummarySource) {
  const dates = item.planned_events_count ?? 0
  if (item.status === 'CLOSED') return 'Circuito finalizado.'
  if (!dates) return 'Próximo paso: agregá la primera fecha.'
  return dates === 1 ? '1 fecha programada.' : `${dates} fechas planificadas.`
}

export function getCompetitionSeriesProgressLabel(
  item: CompetitionSeriesSummarySource,
  events: CompetitionSeriesSummaryEvent[]
) {
  const focus = selectCompetitionFocusEvent(events)
  const state = focus ? deriveCompetitionEventOperationalState(focus) : null
  if (state?.key === 'TOURNAMENT_FINISHED') return 'Pendiente homologación'
  if (state?.key === 'HOMOLOGATED') return 'Pendiente publicar puntos'
  if (state?.key === 'SETTLED') return 'Ranking actualizado'
  if (state) return state.label
  return seriesOperationalLine(item)
}

export function buildCompetitionSeriesListSummaries(
  series: CompetitionSeriesSummarySource[],
  events: CompetitionSeriesSummaryEvent[]
) {
  const eventsBySeriesId = new Map<string, CompetitionSeriesSummaryEvent[]>()
  events.forEach((event) => {
    const current = eventsBySeriesId.get(event.series_id) ?? []
    current.push(event)
    eventsBySeriesId.set(event.series_id, current)
  })

  return Object.fromEntries(series.map((item) => {
    const ownEvents = eventsBySeriesId.get(item.id) ?? []
    const summary: CompetitionSeriesListSummary = {
      events_count: ownEvents.length,
      progress_label: getCompetitionSeriesProgressLabel(item, ownEvents),
    }
    return [item.id, summary]
  })) as Record<string, CompetitionSeriesListSummary>
}
