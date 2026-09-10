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
  if (['APPROVED', 'SUBMITTED'].includes(String(input.homologationStatus ?? '').toUpperCase())) {
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
