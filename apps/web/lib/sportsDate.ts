const argentinaZone = 'America/Argentina/Buenos_Aires'

/** PostgreSQL DATE is a civil date, not midnight UTC. Never subtract a zone offset. */
export function civilSportsDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year,month,day]=value.split('-').map(Number)
  const date=new Date(Date.UTC(year,month-1,day,12))
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day ? value : null
}
/** Timestamp fields are instants: their sporting day is the day in Argentina. */
export function instantSportsDate(value: string | null | undefined) {
  if (!value || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null
  if(!civilSportsDate(value.slice(0,10)))return null
  const date=new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA',{timeZone:argentinaZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
}
export function sportsDateKey(value: string | null | undefined) { return civilSportsDate(value) ?? instantSportsDate(value) }
export function sportsDateParts(value: string | null | undefined) {
  const key=sportsDateKey(value)
  if (!key) return null
  const [year,month,day]=key.split('-')
  return {key,year,day:String(Number(day)),month:new Intl.DateTimeFormat('es-AR',{timeZone:'UTC',month:'short'}).format(new Date(`${key}T12:00:00Z`)).replace('.',''),monthNumber:month}
}
