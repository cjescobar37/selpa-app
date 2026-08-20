const month = (date: Date) => date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toLowerCase()

function localDate(value: string) {
  return new Date(`${value}T12:00:00`)
}

export function formatCompetitionDateRange(startValue: string | null, endValue: string | null) {
  if (!startValue || !endValue) return 'Período pendiente'
  const start = localDate(startValue)
  const end = localDate(endValue)
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const sameDay = sameMonth && start.getDate() === end.getDate()

  if (sameDay) return `${start.getDate()} ${month(start)} ${start.getFullYear()}`
  if (sameMonth) return `${start.getDate()}–${end.getDate()} ${month(end)} ${end.getFullYear()}`
  if (sameYear) return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`
  return `${start.getDate()} ${month(start)} ${start.getFullYear()} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`
}
