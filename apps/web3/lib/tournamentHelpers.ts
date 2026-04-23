export type TournamentView = {
  id: string
  club_id: string
  name: string
  status: string
  type: string
  format: string
  gender: string
  category: number | null
  startDate: string | null
  endDate: string | null
  registrationDeadline: string | null
  minPairs: number | null
  maxPairs: number | null
  pricePerPlayer: number | null
  pointsTotal: number | null
  rules: Record<string, unknown> | null
  createdAt: string | null
  updatedAt: string | null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function toTournamentView(row: Record<string, any> | null | undefined): TournamentView | null {
  if (!row?.id) return null

  return {
    id: String(row.id),
    club_id: String(row.club_id ?? ''),
    name: String(row.name ?? ''),
    status: String(row.status ?? 'DRAFT'),
    type: String(row.tournament_type ?? row.type ?? 'OPEN'),
    format: String(row.format ?? 'GROUPS_ELIMINATION'),
    gender: String(row.gender ?? 'MALE'),
    category: asNumber(row.category ?? row.category_id),
    startDate: (row.starts_on ?? row.start_date ?? null) as string | null,
    endDate: (row.ends_on ?? row.end_date ?? null) as string | null,
    registrationDeadline: (row.registration_deadline ?? row.signup_deadline ?? null) as string | null,
    minPairs: asNumber(row.min_pairs),
    maxPairs: asNumber(row.max_pairs),
    pricePerPlayer: asNumber(row.price_per_player),
    pointsTotal: asNumber(row.points_total),
    rules: (row.rules_json ?? row.rules ?? null) as Record<string, unknown> | null,
    createdAt: (row.created_at ?? null) as string | null,
    updatedAt: (row.updated_at ?? null) as string | null,
  }
}

export const TOURNAMENT_SELECT = [
  'id',
  'club_id',
  'name',
  'status',
  'type',
  'tournament_type',
  'format',
  'gender',
  'category_id',
  'category',
  'start_date',
  'starts_on',
  'end_date',
  'ends_on',
  'registration_deadline',
  'signup_deadline',
  'min_pairs',
  'max_pairs',
  'price_per_player',
  'points_total',
  'rules',
  'rules_json',
  'created_at',
  'updated_at',
].join(',')