/** Club discovery must keep running events even after their start date. */
export function clubTournamentIsActive(tournament: { status?: string | null; start_date?: string | null }, today = new Date().toISOString().slice(0, 10)) {
  const state = String(tournament.status ?? '').toUpperCase()
  if (['FINISHED', 'FINALIZED', 'FINALIZADO', 'COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED', 'ARCHIVED'].includes(state)) return false
  if (['DRAFT', 'OPEN', 'PUBLISHED', 'REGISTRATION_OPEN', 'RUNNING', 'ACTIVE', 'LIVE', 'IN_PROGRESS', 'PAUSED'].includes(state)) return true
  return Boolean(tournament.start_date && tournament.start_date >= today)
}

export function clubTournamentSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-AR')
}

/** Business dates have no UTC offset; midnight UTC would show the previous day in Argentina. */
export function clubTournamentDate(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
}

export function clubDeadlineIsSoon(value: string, now = Date.now()) {
  const end = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59-03:00` : value)
  return Number.isFinite(end) && end >= now && end - now <= 48 * 60 * 60 * 1000
}
