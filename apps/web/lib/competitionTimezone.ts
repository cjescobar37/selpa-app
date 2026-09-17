export function validCompetitionTimezone(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (value.trim() !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value.trim())) return null
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.trim() }).format()
    return normalizeCompetitionTimezone(value.trim())
  } catch { return null }
}

const aliases: Record<string, string> = {
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Mendoza': 'America/Argentina/Mendoza',
}
export function normalizeCompetitionTimezone(value: string) { return aliases[value] ?? value }

const cities: Record<string, string> = {
  'America/Argentina/Buenos_Aires': 'Buenos Aires, Argentina',
  'America/Argentina/Cordoba': 'Córdoba, Argentina',
  'America/Argentina/Mendoza': 'Mendoza, Argentina',
  'America/Montevideo': 'Montevideo, Uruguay', 'America/Santiago': 'Santiago, Chile',
  'Europe/Madrid': 'Madrid, España', 'Europe/London': 'Londres, Reino Unido',
  'America/New_York': 'Nueva York, Estados Unidos', 'America/Mexico_City': 'Ciudad de México, México',
  UTC: 'Tiempo universal',
}
const timezoneLabels = new Map<string, string>()
export function competitionTimezoneLabel(value: string, at = new Date()) {
  const cacheKey = `${value}:${Math.floor(at.getTime()/3600000)}`
  const cached = timezoneLabels.get(cacheKey)
  if (cached) return cached
  const id = validCompetitionTimezone(value)
  if (!id) return 'Elegir zona horaria'
  const city = cities[id] ?? id.split('/').at(-1)!.replaceAll('_', ' ')
  const offset = new Intl.DateTimeFormat('es', { timeZone: id, timeZoneName: 'shortOffset' }).formatToParts(at).find(part => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? 'UTC'
  const label = `${city} · ${offset.replace('-', '−')}`
  if (timezoneLabels.size > 2000) timezoneLabels.clear()
  timezoneLabels.set(cacheKey, label)
  return label
}
export function competitionTimezoneOptions(current?: string | null, supported?: string[]) {
  const available = supported ?? (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [])
  // Safe, international fallback; the valid saved/device value is always retained.
  return [...new Set([...Object.keys(cities), ...available, ...(current ? [current] : [])].map(validCompetitionTimezone).filter((id): id is string => Boolean(id)))].sort((a,b) => competitionTimezoneLabel(a).localeCompare(competitionTimezoneLabel(b), 'es'))
}

export function competitionWallTime(instant: string | null, timezone: string | null) {
  if (!instant || !validCompetitionTimezone(timezone)) return ''
  const date = new Date(instant)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone!, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** Explicit offset conversion; reject nonexistent/ambiguous DST times, never guess UTC. */
export function competitionWallTimeToInstant(value: string, timezone: string) {
  if (!validCompetitionTimezone(timezone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Elegí una zona horaria y fecha válidas.')
  const naive = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(naive)) throw new Error('La fecha no es válida.')
  const offsets = new Set<number>()
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = naive + hours * 3600000
    offsets.add(Date.parse(`${competitionWallTime(new Date(sample).toISOString(), timezone)}:00Z`) - sample)
  }
  const candidates = [...offsets].map(offset => naive - offset).filter(instant => competitionWallTime(new Date(instant).toISOString(), timezone) === value)
  if (candidates.length !== 1) throw new Error('Esa hora es ambigua o no existe por un cambio de horario. Elegí otra hora.')
  return new Date(candidates[0]).toISOString()
}

/** Configured club wins; device is an explicit creation default, never a country constant. */
export function resolveCompetitionTimezone(input: { clubTimezone?: unknown; tournamentTimezone?: unknown; deviceTimezone?: unknown }) {
  return validCompetitionTimezone(input.clubTimezone)
    ?? validCompetitionTimezone(input.tournamentTimezone)
    ?? validCompetitionTimezone(input.deviceTimezone)
}
