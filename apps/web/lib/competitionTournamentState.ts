export type TournamentOperationalStage =
  | 'BORRADOR'
  | 'INSCRIPCIONES'
  | 'LISTO_PARA_INICIAR'
  | 'GRUPOS'
  | 'PLAYOFF'
  | 'FINALIZADO'

export type CompetitionPipelineState = {
  key: 'SPORTS_COMPLETE' | 'TOURNAMENT_FINISHED' | 'RESULTS_HOMOLOGATED' | 'SETTLED'
  title: string
  message: string
}

export type CompetitionEventPipelineInput = {
  status: string
  tournament_status?: string | null
  sports_complete?: boolean
  tournament_starts_at?: string | null
  planned_starts_at?: string | null
  tournament_registration_deadline?: string | null
  circuit_context?: {
    event_status?: string | null
    event_division_status?: string | null
    homologation_status?: string | null
    settlement_status?: string | null
  } | null
}

export type CompetitionEventOperationalState = {
  key: 'DRAFT' | 'OPEN' | 'SCHEDULED' | 'IN_PROGRESS' | 'SPORTS_COMPLETE' | 'TOURNAMENT_FINISHED' | 'HOMOLOGATED' | 'SETTLED' | 'CANCELLED'
  label: string
  pointsLabel: string
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger'
}

export type CompetitionEventNextAction = {
  key: 'CLOSE_DATE' | 'REVIEW_RESULTS' | 'APPROVE_RESULTS' | 'PUBLISH_POINTS' | 'MANAGE_NEXT_EVENT'
  label: string
}

export function isPersistedTournamentFinished(status: string | null | undefined) {
  return ['FINISHED', 'COMPLETED'].includes(String(status ?? '').toUpperCase())
}

export function deriveTournamentOperationalStage(input: {
  status: string
  groupCount: number
  groupMatchesTotal: number
  playoffMatchesCount: number
}): TournamentOperationalStage {
  if (isPersistedTournamentFinished(input.status)) return 'FINALIZADO'
  if (input.status === 'DRAFT') return 'BORRADOR'
  if (input.playoffMatchesCount > 0) return 'PLAYOFF'
  if (input.groupCount > 0 || input.groupMatchesTotal > 0) return 'GRUPOS'
  return 'INSCRIPCIONES'
}

export function deriveCompetitionPipelineState(input: {
  tournamentStatus: string | null | undefined
  sportsComplete: boolean
  homologationStatus?: string | null
  settlementStatus?: string | null
}): CompetitionPipelineState | null {
  if (String(input.settlementStatus ?? '').toUpperCase() === 'PUBLISHED') {
    return { key: 'SETTLED', title: 'Fecha liquidada', message: 'Los puntos ya fueron incorporados al ranking.' }
  }
  if (String(input.homologationStatus ?? '').toUpperCase() === 'APPROVED') {
    return { key: 'RESULTS_HOMOLOGATED', title: 'Resultados homologados', message: 'Pendiente calcular y publicar puntos.' }
  }
  if (isPersistedTournamentFinished(input.tournamentStatus)) {
    return { key: 'TOURNAMENT_FINISHED', title: 'Torneo finalizado', message: 'Pendiente homologar resultados.' }
  }
  if (input.sportsComplete) {
    return { key: 'SPORTS_COMPLETE', title: 'Resultados deportivos completos', message: 'Falta finalizar formalmente el torneo.' }
  }
  return null
}

export function deriveCompetitionEventPipelineState(event: CompetitionEventPipelineInput) {
  return deriveCompetitionPipelineState({
    tournamentStatus: event.tournament_status,
    sportsComplete: Boolean(event.sports_complete),
    homologationStatus: event.circuit_context?.homologation_status,
    settlementStatus: event.circuit_context?.settlement_status,
  })
}

export function deriveCompetitionEventOperationalState(event: CompetitionEventPipelineInput, now = new Date()): CompetitionEventOperationalState {
  const eventStatus = String(event.circuit_context?.event_status ?? event.status ?? '').toUpperCase()
  const homologationStatus = String(event.circuit_context?.homologation_status ?? '').toUpperCase()
  const settlementStatus = String(event.circuit_context?.settlement_status ?? '').toUpperCase()
  if (eventStatus === 'CANCELLED') return { key: 'CANCELLED', label: 'Cancelada', pointsLabel: 'Cancelada', tone: 'danger' }
  if (settlementStatus === 'PUBLISHED') return { key: 'SETTLED', label: 'Liquidada', pointsLabel: 'Puntos publicados', tone: 'success' }
  if (homologationStatus === 'APPROVED') return { key: 'HOMOLOGATED', label: 'Homologada', pointsLabel: 'Pendiente publicar puntos', tone: 'warning' }
  if (isPersistedTournamentFinished(event.tournament_status)) return { key: 'TOURNAMENT_FINISHED', label: 'Finalizado', pointsLabel: 'Pendiente homologar', tone: 'warning' }
  if (event.sports_complete) return { key: 'SPORTS_COMPLETE', label: 'Resultados completos', pointsLabel: 'Pendiente finalizar torneo', tone: 'warning' }
  if (eventStatus === 'COMPLETED') return { key: 'SPORTS_COMPLETE', label: 'Resultados completos', pointsLabel: 'Pendiente homologar', tone: 'warning' }
  const tournamentStatus = String(event.tournament_status ?? '').toUpperCase()
  if (tournamentStatus === 'CANCELLED') return { key: 'CANCELLED', label: 'Cancelada', pointsLabel: 'Cancelada', tone: 'danger' }
  if (tournamentStatus === 'RUNNING') {
    return { key: 'IN_PROGRESS', label: 'En juego', pointsLabel: 'Fecha en juego', tone: 'info' }
  }
  if (tournamentStatus === 'OPEN') {
    const deadline = event.tournament_registration_deadline ? new Date(event.tournament_registration_deadline).getTime() : Number.NaN
    if (Number.isFinite(deadline) && deadline <= now.getTime()) return { key: 'SCHEDULED', label: 'Programado', pointsLabel: 'Inscripciones cerradas', tone: 'info' }
    return { key: 'OPEN', label: 'Abierto: Inscripciones', pointsLabel: 'Inscripciones abiertas', tone: 'info' }
  }
  if (tournamentStatus === 'DRAFT') return { key: 'DRAFT', label: 'Borrador', pointsLabel: 'Torneo sin publicar', tone: 'neutral' }
  if (eventStatus === 'SCHEDULED') return { key: 'SCHEDULED', label: 'Programada', pointsLabel: 'Fecha programada', tone: 'info' }
  return { key: 'DRAFT', label: 'Borrador', pointsLabel: 'Fecha pendiente', tone: 'neutral' }
}

export function deriveCompetitionEventNextAction(event: CompetitionEventPipelineInput): CompetitionEventNextAction | null {
  const eventStatus = String(event.circuit_context?.event_status ?? event.status ?? '').toUpperCase()
  const divisionStatus = String(event.circuit_context?.event_division_status ?? '').toUpperCase()
  const homologationStatus = String(event.circuit_context?.homologation_status ?? '').toUpperCase()
  const settlementStatus = String(event.circuit_context?.settlement_status ?? '').toUpperCase()
  if (settlementStatus === 'PUBLISHED') return { key: 'MANAGE_NEXT_EVENT', label: 'Gestionar próxima fecha' }
  if (homologationStatus === 'APPROVED') return { key: 'PUBLISH_POINTS', label: 'Publicar puntos' }
  if (homologationStatus === 'SUBMITTED') return { key: 'APPROVE_RESULTS', label: 'Aprobar resultados' }
  if (homologationStatus) return { key: 'REVIEW_RESULTS', label: 'Revisar resultados' }
  if (isPersistedTournamentFinished(event.tournament_status) && ['DRAFT', 'SCHEDULED', 'COMPLETED'].includes(eventStatus) && (!divisionStatus || ['DRAFT', 'SCHEDULED', 'COMPLETED'].includes(divisionStatus))) return { key: 'CLOSE_DATE', label: 'Cerrar fecha' }
  return null
}

const semanticPointsOrder: Record<string, number> = {
  CHAMPION: 10,
  RUNNER_UP: 20,
  SEMIFINALIST: 30,
  QUARTERFINALIST: 40,
  EIGHTH_FINALIST: 50,
  ROUND_OF_16: 50,
  SIXTEENTH_FINALIST: 60,
  ROUND_OF_32: 60,
  PARTICIPANT: 70,
  PARTICIPATION: 70,
}

export function sortCompetitionPointsRules<T extends { rule_key: string; sort_order?: number | null }>(rules: T[]) {
  const persistedOrders = rules.map((rule) => rule.sort_order).filter((value): value is number => typeof value === 'number')
  const usePersistedOrder = new Set(persistedOrders).size > 1
  return [...rules].sort((left, right) => {
    const leftOrder = usePersistedOrder ? left.sort_order ?? 1000 : semanticPointsOrder[String(left.rule_key).toUpperCase()] ?? 1000
    const rightOrder = usePersistedOrder ? right.sort_order ?? 1000 : semanticPointsOrder[String(right.rule_key).toUpperCase()] ?? 1000
    return leftOrder - rightOrder || left.rule_key.localeCompare(right.rule_key)
  })
}

export function selectCompetitionFocusEvent<T extends CompetitionEventPipelineInput>(events: T[]) {
  return events.find((event) => {
    const state = deriveCompetitionEventPipelineState(event)
    return state && state.key !== 'SETTLED'
  }) ?? [...events].reverse().find((event) => deriveCompetitionEventPipelineState(event)?.key === 'SETTLED') ?? null
}

export function selectNextCompetitionEvent<T extends CompetitionEventPipelineInput>(events: T[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return events.find((event) => {
    if (['COMPLETED', 'CANCELLED'].includes(String(event.status).toUpperCase()) || event.sports_complete || isPersistedTournamentFinished(event.tournament_status)) return false
    const startsAt = event.tournament_starts_at ?? event.planned_starts_at
    if (!startsAt) return false
    const timestamp = new Date(/^\d{4}-\d{2}-\d{2}$/.test(startsAt) ? `${startsAt}T00:00:00` : startsAt).getTime()
    return Number.isFinite(timestamp) && timestamp >= today
  }) ?? null
}
