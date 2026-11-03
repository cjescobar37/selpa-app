export function normalizeTournamentSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-AR')
}

/** Missing dates sort last in both upcoming and history, never as year 2999. */
export function compareTournamentDates(a: { startDate?: string | null }, b: { startDate?: string | null }, recentFirst = false) {
  const left = a.startDate ? Date.parse(a.startDate) : NaN
  const right = b.startDate ? Date.parse(b.startDate) : NaN
  if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0
  if (!Number.isFinite(right)) return -1
  return recentFirst ? right - left : left - right
}
