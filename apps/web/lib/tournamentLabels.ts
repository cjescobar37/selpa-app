export type TournamentSegment = 'LIBRES' | 'MENORES' | 'VETERANOS'

export function normalizeTournamentSegment(value?: unknown): TournamentSegment {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'MENORES' || normalized === 'VETERANOS') return normalized
  return 'LIBRES'
}

export function formatCategoryLabel(value?: number | string | null) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return 'Categoría abierta'
  if (parsed === 7) return '7ma'
  return `${Math.trunc(parsed)}ta`
}

export function formatGenderLabel(value?: string | null) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'M' || normalized === 'MALE' || normalized === 'MASCULINO') return 'Caballeros'
  if (normalized === 'F' || normalized === 'FEMALE' || normalized === 'FEMENINO' || normalized === 'MUJERES') return 'Damas'
  if (normalized.includes('MIX')) return 'Mixto'
  return 'Rama abierta'
}

export function formatSegmentLabel(value?: unknown) {
  const normalized = normalizeTournamentSegment(value)
  if (normalized === 'MENORES') return 'Menores'
  if (normalized === 'VETERANOS') return 'Veteranos'
  return 'Libres'
}
