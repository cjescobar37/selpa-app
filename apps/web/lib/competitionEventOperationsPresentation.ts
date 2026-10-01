import { formatCompetitionDateRange } from '../features/competition/series/competition-series-date'

type VersionRow = { status?: unknown }
type DivisionHistory = {
  homologations: readonly VersionRow[]
  settlements: readonly VersionRow[]
}

/** Count persisted versions, not pending workflow steps. */
export function summarizeCompetitionEventHistory(divisions: readonly DivisionHistory[]) {
  return divisions.reduce((totals, division) => ({
    resultVersions: totals.resultVersions + division.homologations.length,
    settlementVersions: totals.settlementVersions + division.settlements.length,
    publications: totals.publications + division.settlements.filter(row => row.status === 'PUBLISHED').length,
  }), { resultVersions: 0, settlementVersions: 0, publications: 0 })
}

type EventDateSource = {
  tournament_starts_at?: string | null
  tournament_ends_at?: string | null
  planned_starts_at?: string | null
  planned_ends_at?: string | null
  timezone?: string | null
}

const isCalendarDate = (value: string | null | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))

export function formatCompetitionEventOperationDate(event: EventDateSource) {
  // Tournament dates are calendar dates, not UTC instants. Never convert them
  // through Date/locale time zones before presenting the sporting range.
  if (isCalendarDate(event.tournament_starts_at)) {
    const end = isCalendarDate(event.tournament_ends_at) ? event.tournament_ends_at : event.tournament_starts_at
    return formatCompetitionDateRange(event.tournament_starts_at, end)
  }
  if (isCalendarDate(event.planned_starts_at)) {
    const end = isCalendarDate(event.planned_ends_at) ? event.planned_ends_at : event.planned_starts_at
    return formatCompetitionDateRange(event.planned_starts_at, end)
  }
  if (!event.planned_starts_at) return 'Sin fecha'
  const instant = new Date(event.planned_starts_at)
  if (Number.isNaN(instant.getTime())) return 'Sin fecha'
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', timeZone: event.timezone || undefined }
  try { return new Intl.DateTimeFormat('es-AR', options).format(instant) }
  catch { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(instant) }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function label(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export function competitionEventDivisionName(row: Record<string, unknown>) {
  const snapshot = record(row.configuration_snapshot)
  const division = record(snapshot.division)
  const internalName = label(division.division_name) || label(division.division_label) || label(snapshot.division_name)
  const publicName = [label(division.category_name), label(division.branch_name)].filter(Boolean).join(' ')
  if (publicName && (!internalName || /^(?:QA|TEST|PRUEBA)(?:\s|$)/i.test(internalName))) return publicName
  return internalName || publicName || `División ${Number(row.sort_order ?? 0) + 1}`
}
