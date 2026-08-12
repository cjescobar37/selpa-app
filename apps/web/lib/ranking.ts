export type RankingGender = 'M' | 'F' | 'MIXED' | 'UNKNOWN'

export type RankingPositionRow = {
  full_name: string
  ranking_points: number
}

export type RankingFilterRow = RankingPositionRow & {
  category: number | null
  gender: string | null
  email?: string | null
}

export function normalizeRankingGender(value?: string | null): RankingGender {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'MALE') return 'M'
  if (normalized === 'FEMALE') return 'F'
  if (normalized === 'M' || normalized === 'F' || normalized === 'MIXED') return normalized
  return 'UNKNOWN'
}

export function formatRankingGender(value?: string | null) {
  const normalized = normalizeRankingGender(value)
  if (normalized === 'M') return 'Caballeros'
  if (normalized === 'F') return 'Damas'
  if (normalized === 'MIXED') return 'Mixto'
  return 'Sin rama'
}

export function formatRankingCategory(value?: number | null) {
  if (!value) return 'Sin categoría'
  if (value === 1) return '1ra'
  if (value === 2) return '2da'
  if (value === 3) return '3ra'
  return `${value}ta`
}

export function formatRankingPoints(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Sin ranking'
  return `${value} pts`
}

export function sortRankingRows<T extends RankingPositionRow>(rows: T[]) {
  return [...rows].sort((a, b) => b.ranking_points - a.ranking_points || a.full_name.localeCompare(b.full_name))
}

export function withRankingPositions<T extends RankingPositionRow, K extends string>(
  rows: T[],
  positionKey: K,
) {
  const pointCounts = new Map<number, number>()
  rows.forEach((row) => pointCounts.set(row.ranking_points, (pointCounts.get(row.ranking_points) ?? 0) + 1))

  let lastPoints: number | null = null
  let lastPosition = 0
  return rows.map((row, index) => {
    const position = lastPoints === row.ranking_points ? lastPosition : index + 1
    lastPoints = row.ranking_points
    lastPosition = position
    return {
      ...row,
      [positionKey]: position,
      isTied: (pointCounts.get(row.ranking_points) ?? 0) > 1,
    } as T & Record<K, number> & { isTied: boolean }
  })
}

export function filterRankingRows<T extends RankingFilterRow>(
  rows: T[],
  filters: { category?: string; gender?: string; query?: string },
) {
  const query = filters.query?.trim().toLowerCase() ?? ''
  return rows
    .filter((row) => !filters.category || filters.category === 'all' || String(row.category ?? '') === filters.category)
    .filter((row) => !filters.gender || filters.gender === 'all' || normalizeRankingGender(row.gender) === filters.gender)
    .filter((row) => !query || `${row.full_name} ${row.email ?? ''}`.toLowerCase().includes(query))
}
