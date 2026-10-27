export type AgendaTournament = { id: string; status: string | null; starts_on: string | null; start_date: string | null; ends_on: string | null; end_date: string | null }
export type AgendaRegistration = { id: string; tournament_id: string; status: string | null; created_at: string }
export type AgendaGroup = 'upcoming' | 'pending' | 'history'

const finished = new Set(['FINISHED', 'COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED', 'CANCELED'])
const inactive = new Set(['CANCELLED', 'CANCELED', 'REJECTED'])
const live = new Set(['LIVE', 'IN_PROGRESS', 'ONGOING', 'STARTED'])

/** An old confirmation must never override a later cancellation. */
export function latestAgendaRegistrations<T extends AgendaRegistration>(rows: T[]) {
  const result = new Map<string, T>()
  for (const row of [...rows].sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))) {
    if (!result.has(row.tournament_id)) result.set(row.tournament_id, row)
  }
  return result
}

function dateKey(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : null }
export function agendaDay(now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit' }).format(now)
}
export function agendaGroup(tournament: AgendaTournament, registration: AgendaRegistration | undefined, today: string): AgendaGroup {
  const state = String(tournament.status ?? '').toUpperCase()
  const registrationState = String(registration?.status ?? '').toUpperCase()
  const end = dateKey(tournament.ends_on ?? tournament.end_date)
  const start = dateKey(tournament.starts_on ?? tournament.start_date)
  if (finished.has(state) || inactive.has(registrationState) || (end && end < today) || (!end && start && start < today && !live.has(state))) return 'history'
  if (registrationState !== 'CONFIRMED') return 'pending'
  return 'upcoming'
}
export function groupPlayerAgenda<T extends AgendaTournament>(tournaments: T[], registrations: AgendaRegistration[], now: Date) {
  const groups: Record<AgendaGroup,T[]> = { upcoming: [], pending: [], history: [] }
  const latest = latestAgendaRegistrations(registrations)
  const today = agendaDay(now)
  const seen = new Set<string>()
  for (const tournament of tournaments) {
    if (seen.has(tournament.id)) continue
    seen.add(tournament.id)
    groups[agendaGroup(tournament,latest.get(tournament.id),today)].push(tournament)
  }
  for (const [group,rows] of Object.entries(groups)) rows.sort((a,b) => {
    const left = dateKey(a.starts_on ?? a.start_date) ?? (group === 'history' ? '' : '9999')
    const right = dateKey(b.starts_on ?? b.start_date) ?? (group === 'history' ? '' : '9999')
    return (group === 'history' ? right.localeCompare(left) : left.localeCompare(right)) || a.id.localeCompare(b.id)
  })
  return groups
}
/** These are sports registration states. Payment requires its own financial evidence. */
export function agendaRegistrationLabel(status: string | null | undefined) {
  switch (String(status ?? '').toUpperCase()) {
    case 'CONFIRMED': return 'Cupo confirmado'
    case 'PENDING': return 'Inscripción pendiente'
    case 'CANCELLED': case 'CANCELED': return 'Inscripción cancelada'
    case 'REJECTED': return 'Inscripción rechazada'
    default: return 'Confirmación a consultar'
  }
}
