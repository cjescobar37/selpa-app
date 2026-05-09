export type GroupTiebreakerCriterion = 'POINTS' | 'HEAD_TO_HEAD' | 'SET_DIFF' | 'GAME_DIFF'
export type GroupTiebreakerFinal = 'SEED' | 'DRAW'

export type GroupTiebreakerConfig = {
  order: GroupTiebreakerCriterion[]
  final: GroupTiebreakerFinal
}

export const legacyGroupTiebreakerConfig: GroupTiebreakerConfig = {
  order: ['POINTS', 'SET_DIFF', 'GAME_DIFF'],
  final: 'SEED',
}

export const defaultGroupTiebreakerConfig: GroupTiebreakerConfig = {
  order: ['POINTS', 'HEAD_TO_HEAD', 'SET_DIFF', 'GAME_DIFF'],
  final: 'SEED',
}

export const groupTiebreakerCriterionOptions: Array<{ value: GroupTiebreakerCriterion; label: string }> = [
  { value: 'POINTS', label: 'Puntos' },
  { value: 'HEAD_TO_HEAD', label: 'Resultado entre empatados' },
  { value: 'SET_DIFF', label: 'Diferencia de sets' },
  { value: 'GAME_DIFF', label: 'Diferencia de games' },
]

export const groupTiebreakerFinalOptions: Array<{ value: GroupTiebreakerFinal; label: string }> = [
  { value: 'SEED', label: 'Ranking / seed' },
  { value: 'DRAW', label: 'Sorteo / manual' },
]

const criterionAliases: Record<string, GroupTiebreakerCriterion | null> = {
  POINTS: 'POINTS',
  MATCH_POINTS: 'POINTS',
  HEAD_TO_HEAD: 'HEAD_TO_HEAD',
  H2H: 'HEAD_TO_HEAD',
  SET_DIFF: 'SET_DIFF',
  SET_DIFFERENCE: 'SET_DIFF',
  GAME_DIFF: 'GAME_DIFF',
  GAME_DIFFERENCE: 'GAME_DIFF',
  SEED: null,
}

function normalizeCriterion(value: unknown) {
  if (typeof value !== 'string') return null
  return criterionAliases[value.trim().toUpperCase()] ?? null
}

function normalizeFinal(value: unknown, fallback: GroupTiebreakerFinal) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toUpperCase()
  if (normalized === 'DRAW' || normalized === 'SORTEO' || normalized === 'MANUAL') return 'DRAW'
  if (normalized === 'SEED' || normalized === 'RANKING') return 'SEED'
  return fallback
}

export function normalizeGroupTiebreakerOrder(
  value: unknown,
  fallback: GroupTiebreakerCriterion[] = legacyGroupTiebreakerConfig.order
): GroupTiebreakerCriterion[] {
  const source = Array.isArray(value) ? value : fallback
  const seen = new Set<GroupTiebreakerCriterion>()
  const order: GroupTiebreakerCriterion[] = []

  for (const item of source) {
    const criterion = normalizeCriterion(item)
    if (!criterion || seen.has(criterion)) continue
    seen.add(criterion)
    order.push(criterion)
  }

  if (!seen.has('POINTS')) order.unshift('POINTS')
  return order.length > 0 ? order : [...fallback]
}

export function normalizeGroupTiebreakerConfig(
  value: unknown,
  fallback: GroupTiebreakerConfig = legacyGroupTiebreakerConfig
): GroupTiebreakerConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback, order: [...fallback.order] }
  const safeValue = value as Record<string, unknown>

  return {
    order: normalizeGroupTiebreakerOrder(safeValue.order, fallback.order),
    final: normalizeFinal(safeValue.final, fallback.final),
  }
}

export function buildGroupTiebreakerPayload(input: {
  order: GroupTiebreakerCriterion[]
  final: GroupTiebreakerFinal
}): GroupTiebreakerConfig {
  return normalizeGroupTiebreakerConfig(input, defaultGroupTiebreakerConfig)
}

export function criterionToLegacyBreaker(criterion: GroupTiebreakerCriterion) {
  if (criterion === 'POINTS') return 'match_points'
  if (criterion === 'HEAD_TO_HEAD') return 'head_to_head'
  if (criterion === 'SET_DIFF') return 'set_difference'
  return 'game_difference'
}
