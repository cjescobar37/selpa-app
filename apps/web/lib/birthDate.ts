const minimumBirthYear = 1900

export const birthMonths = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export function birthYears() {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: currentYear - minimumBirthYear + 1 }, (_, index) => currentYear - index)
}

export function toBirthDate(year: string, month: string, day: string) {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return null

  const numericYear = Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  const today = new Date()
  const utcDate = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay))

  if (
    numericYear < minimumBirthYear ||
    numericYear > today.getFullYear() ||
    numericMonth < 1 ||
    numericMonth > 12 ||
    numericDay < 1 ||
    utcDate.getUTCFullYear() !== numericYear ||
    utcDate.getUTCMonth() !== numericMonth - 1 ||
    utcDate.getUTCDate() !== numericDay
  ) {
    return null
  }

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  if (utcDate.getTime() > todayUtc) return null

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

export function isValidBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return Boolean(match && toBirthDate(match[1], match[2], match[3]))
}
