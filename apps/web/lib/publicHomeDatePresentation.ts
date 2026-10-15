// The legacy public home uses Argentine business time, like tournamentDisplayStatus.
// This is presentation only: never change stored instants or sporting deadlines.
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires'
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

function presentationDate(value?: string | null) {
  if (!value) return null
  const calendar = CALENDAR_DATE.test(value)
  const timestamp = value.replace(' ', 'T')
  const wallTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(timestamp)
  if (!calendar && !wallTime && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) return null
  // Calendar days have no timezone/hour. UTC is only a neutral formatting anchor.
  // Legacy offsetless datetimes mean Argentine wall time, not the host's timezone.
  const input = calendar ? `${value}T12:00:00Z` : wallTime ? `${timestamp}-03:00` : timestamp
  const date = new Date(input)
  if (!Number.isFinite(date.getTime())) return null
  if (calendar && date.toISOString().slice(0, 10) !== value) return null
  return { date, calendar, timeZone: calendar ? 'UTC' : BUSINESS_TIME_ZONE }
}

export function formatHomeNewsDate(value?: string | null) {
  const parsed = presentationDate(value)
  if (!parsed) return 'Fecha a confirmar'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: parsed.timeZone,
  }).format(parsed.date).replace('.', '')
}

export function formatHomeAgendaDeadline(value?: string | null) {
  const parsed = presentationDate(value)
  if (!parsed) return 'A definir'
  if (parsed.calendar) {
    const month = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' }).format(parsed.date).replace('.', '')
    return `${parsed.date.getUTCDate()} de ${month}`
  }
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: parsed.timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(parsed.date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value
  return `El ${part('day')}/${part('month')}/${part('year')} a las ${part('hour')}:${part('minute')}`
}
