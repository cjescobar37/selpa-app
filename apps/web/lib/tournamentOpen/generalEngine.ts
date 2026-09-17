import { OpenTournamentEngineError, type OpenPlayoffPhase } from './types'

export type OpenUseNormalizedStats = 'auto' | 'always' | 'never'
export type OpenByeAssignment = 'GLOBAL_SEED'

export type OpenQualificationConfig = {
  fixedQualifiersPerGroup: number
  bestThirdsToQualify: number
  useNormalizedStats: OpenUseNormalizedStats
  byeAssignment: OpenByeAssignment
  avoidSameGroupFirstRound: boolean
  avoidTopSeedsEarly: boolean
  rankingTieBreaker: boolean
  randomTieBreaker: boolean
}

export type OpenGeneralStandingRow = {
  teamId: string
  groupId: string
  groupName?: string | null
  groupOrder?: number | null
  groupPosition: number
  seed: number
  played: number
  wins: number
  points: number
  setDiff: number
  gameDiff: number
  gamesFor: number
}

export type OpenGeneralGroupStandings = {
  groupId: string
  groupName?: string | null
  groupOrder?: number | null
  standings: OpenGeneralStandingRow[]
}

export type OpenQualifiedTeam = OpenGeneralStandingRow & {
  qualificationReason: 'FIXED_GROUP_POSITION' | 'BEST_THIRD'
}

export type OpenGlobalSeed = OpenQualifiedTeam & {
  globalSeed: number
  ranking: {
    useNormalizedStats: boolean
    pointsValue: number
    winsValue: number
    setDiffValue: number
    gameDiffValue: number
    gamesForValue: number
  }
}

export type OpenGeneralBracketSlot = {
  position: number
  pairOrder: number
  pairSlot: 1 | 2
  team: OpenGlobalSeed | null
  isByeSlot: boolean
  advancesToMatchOrder: number
}

export type OpenFirstRoundMatch = {
  id: string
  phase: OpenPlayoffPhase
  matchOrder: number
  bracketPairOrder: number
  displayOrder: number
  slot1: OpenGeneralBracketSlot
  slot2: OpenGeneralBracketSlot
  team1: OpenGlobalSeed
  team2: OpenGlobalSeed
  sameGroupConflict: boolean
}

export type OpenGeneralBracketPlan = {
  totalQualified: number
  bracketSize: number
  byes: number
  qualifiedTeams: OpenQualifiedTeam[]
  globalSeeds: OpenGlobalSeed[]
  byeTeams: OpenGlobalSeed[]
  firstRoundMatches: OpenFirstRoundMatch[]
  bracketSlots: OpenGeneralBracketSlot[]
  warnings: string[]
}

export const defaultOpenQualificationConfig: OpenQualificationConfig = {
  fixedQualifiersPerGroup: 2,
  bestThirdsToQualify: 2,
  useNormalizedStats: 'auto',
  byeAssignment: 'GLOBAL_SEED',
  avoidSameGroupFirstRound: true,
  avoidTopSeedsEarly: true,
  rankingTieBreaker: true,
  randomTieBreaker: true,
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new OpenTournamentEngineError('INVALID_INPUT', `${label} debe ser un entero positivo.`)
  }
}

function normalizeConfig(config?: Partial<OpenQualificationConfig> | null): OpenQualificationConfig {
  const normalized = {
    ...defaultOpenQualificationConfig,
    ...(config ?? {}),
  }

  assertPositiveInteger(normalized.fixedQualifiersPerGroup, 'fixedQualifiersPerGroup')
  if (!Number.isInteger(normalized.bestThirdsToQualify) || normalized.bestThirdsToQualify < 0) {
    throw new OpenTournamentEngineError('INVALID_INPUT', 'bestThirdsToQualify debe ser un entero mayor o igual a 0.')
  }

  return normalized
}

export function nextPowerOfTwo(value: number) {
  assertPositiveInteger(value, 'value')

  let power = 1
  while (power < value) power *= 2
  return power
}

export function calculateBracketSize(totalQualified: number) {
  assertPositiveInteger(totalQualified, 'totalQualified')
  return nextPowerOfTwo(totalQualified)
}

export function calculateByes(totalQualified: number) {
  const bracketSize = calculateBracketSize(totalQualified)
  return bracketSize - totalQualified
}

function getStartPhase(bracketSize: number): OpenPlayoffPhase {
  if (bracketSize === 64) return 'ROUND_OF_32'
  if (bracketSize === 32) return 'ROUND_OF_16'
  if (bracketSize === 16) return 'EIGHTHS'
  if (bracketSize === 8) return 'QUARTER'
  if (bracketSize === 4) return 'SEMI'
  if (bracketSize === 2) return 'FINAL'

  throw new OpenTournamentEngineError(
    'UNSUPPORTED_BRACKET_SIZE',
    'El tamaño del cuadro debe ser 2, 4, 8, 16, 32 o 64.'
  )
}

function getPositionRows(groups: OpenGeneralGroupStandings[], position: number) {
  return groups
    .flatMap((group) =>
      [...group.standings]
        .sort((left, right) => left.groupPosition - right.groupPosition)
        .filter((row) => row.groupPosition === position)
        .map((row) => ({
          ...row,
          groupId: row.groupId || group.groupId,
          groupName: row.groupName ?? group.groupName ?? null,
          groupOrder: row.groupOrder ?? group.groupOrder ?? null,
        }))
    )
}

function usesNormalizedStats(rows: OpenGeneralStandingRow[], config: OpenQualificationConfig) {
  if (config.useNormalizedStats === 'always') return true
  if (config.useNormalizedStats === 'never') return false
  return new Set(rows.map((row) => row.played)).size > 1
}

function getRankingValues(row: OpenGeneralStandingRow, useNormalizedStats: boolean) {
  const divisor = useNormalizedStats ? Math.max(1, row.played) : 1

  return {
    useNormalizedStats,
    pointsValue: row.points / divisor,
    winsValue: row.wins / divisor,
    setDiffValue: row.setDiff / divisor,
    gameDiffValue: row.gameDiff / divisor,
    gamesForValue: row.gamesFor / divisor,
  }
}

function compareRowsByGlobalCriteria(input: {
  left: OpenGeneralStandingRow
  right: OpenGeneralStandingRow
  useNormalizedStats: boolean
  rankingTieBreaker: boolean
  randomTieBreaker: boolean
}) {
  if (input.left.groupPosition !== input.right.groupPosition) {
    return input.left.groupPosition - input.right.groupPosition
  }

  const leftRanking = getRankingValues(input.left, input.useNormalizedStats)
  const rightRanking = getRankingValues(input.right, input.useNormalizedStats)
  const valueDiffs = [
    rightRanking.pointsValue - leftRanking.pointsValue,
    rightRanking.winsValue - leftRanking.winsValue,
    rightRanking.setDiffValue - leftRanking.setDiffValue,
    rightRanking.gameDiffValue - leftRanking.gameDiffValue,
    rightRanking.gamesForValue - leftRanking.gamesForValue,
  ]
  const foundDiff = valueDiffs.find((diff) => diff !== 0)
  if (foundDiff) return foundDiff

  if (input.rankingTieBreaker && input.left.seed !== input.right.seed) {
    return input.left.seed - input.right.seed
  }

  if (input.randomTieBreaker) return input.left.teamId.localeCompare(input.right.teamId)
  return 0
}

function rankRows<T extends OpenGeneralStandingRow>(rows: T[], config: OpenQualificationConfig): T[] {
  const useNormalized = usesNormalizedStats(rows, config)
  return [...rows].sort((left, right) =>
    compareRowsByGlobalCriteria({
      left,
      right,
      useNormalizedStats: useNormalized,
      rankingTieBreaker: config.rankingTieBreaker,
      randomTieBreaker: config.randomTieBreaker,
    })
  )
}

export function buildQualificationPlan(
  groups: OpenGeneralGroupStandings[],
  configInput?: Partial<OpenQualificationConfig> | null
) {
  const config = normalizeConfig(configInput)
  if (groups.length === 0) {
    throw new OpenTournamentEngineError('INVALID_INPUT', 'Se necesita al menos un grupo para clasificar.')
  }

  const fixedQualified = groups.flatMap((group) => {
    const rows = [...group.standings].sort((left, right) => left.groupPosition - right.groupPosition)
    if (rows.length < config.fixedQualifiersPerGroup) {
      throw new OpenTournamentEngineError(
        'INSUFFICIENT_GROUP_STANDINGS',
        `El grupo ${group.groupName ?? group.groupId} no tiene suficientes posiciones para clasificar.`
      )
    }

    return rows.slice(0, config.fixedQualifiersPerGroup).map((row) => ({
      ...row,
      groupId: row.groupId || group.groupId,
      groupName: row.groupName ?? group.groupName ?? null,
      groupOrder: row.groupOrder ?? group.groupOrder ?? null,
      qualificationReason: 'FIXED_GROUP_POSITION' as const,
    }))
  })

  const thirds = rankRows(getPositionRows(groups, 3), config)
  const selectedThirds = thirds.slice(0, config.bestThirdsToQualify).map((row) => ({
    ...row,
    qualificationReason: 'BEST_THIRD' as const,
  }))
  const qualifiedTeams = [...fixedQualified, ...selectedThirds]
  const totalQualified = qualifiedTeams.length
  const bracketSize = calculateBracketSize(totalQualified)
  const byes = calculateByes(totalQualified)
  const warnings: string[] = []

  if (selectedThirds.length < config.bestThirdsToQualify) {
    warnings.push(`Se pidieron ${config.bestThirdsToQualify} mejores terceros, pero solo hay ${selectedThirds.length}.`)
  }

  return {
    config,
    totalQualified,
    bracketSize,
    byes,
    qualifiedTeams,
    bestThirdsRanking: thirds,
    selectedBestThirds: selectedThirds,
    warnings,
  }
}

export function buildGlobalSeeds(
  qualifiedTeams: OpenQualifiedTeam[],
  configInput?: Partial<OpenQualificationConfig> | null
): OpenGlobalSeed[] {
  const config = normalizeConfig(configInput)
  const useNormalized = usesNormalizedStats(qualifiedTeams, config)

  return [...qualifiedTeams]
    .sort((left, right) =>
      compareRowsByGlobalCriteria({
        left,
        right,
        useNormalizedStats: useNormalized,
        rankingTieBreaker: config.rankingTieBreaker,
        randomTieBreaker: config.randomTieBreaker,
      })
    )
    .map((team, index) => ({
      ...team,
      globalSeed: index + 1,
      ranking: getRankingValues(team, useNormalized),
    }))
}

export function assignByes(globalSeeds: OpenGlobalSeed[], byes: number, configInput?: Partial<OpenQualificationConfig> | null) {
  const config = normalizeConfig(configInput)
  if (!Number.isInteger(byes) || byes < 0) {
    throw new OpenTournamentEngineError('INVALID_INPUT', 'byes debe ser un entero mayor o igual a 0.')
  }
  if (config.byeAssignment !== 'GLOBAL_SEED') {
    throw new OpenTournamentEngineError('UNSUPPORTED_BYE_ASSIGNMENT', 'Solo se soporta BYE por seed global.')
  }

  return globalSeeds.slice(0, byes)
}

function pairHighLowSeeds<T>(items: T[]) {
  const pairs: Array<[T, T]> = []
  const midpoint = items.length / 2
  const highSeeds = items.slice(0, midpoint)
  const lowSeeds = items.slice(midpoint).reverse()

  for (let index = 0; index < highSeeds.length; index += 1) {
    const first = highSeeds[index]
    const second = lowSeeds[index]
    if (first && second) pairs.push([first, second])
  }
  return pairs
}

function minimizeSameGroupConflicts(pairings: Array<[OpenGlobalSeed, OpenGlobalSeed]>) {
  if (pairings.every(([first, second]) => first.groupId !== second.groupId)) return pairings

  // Keep the protected side in its bracket zone and seek a conflict-free
  // assignment of the opposite side. A stable augmenting-path matching avoids
  // the greedy case where the last pair needs an earlier opponent swap.
  const lowSeeds = pairings.map((pair) => pair[1])
  const ownerByLowSeed = Array<number>(pairings.length).fill(-1)
  const assign = (highIndex: number, visited: Set<number>): boolean => {
    const candidates = [highIndex, ...lowSeeds.map((_, index) => index).filter((index) => index !== highIndex)]
    for (const lowIndex of candidates) {
      if (visited.has(lowIndex) || pairings[highIndex][0].groupId === lowSeeds[lowIndex].groupId) continue
      visited.add(lowIndex)
      const previousOwner = ownerByLowSeed[lowIndex]
      if (previousOwner === -1 || assign(previousOwner, visited)) {
        ownerByLowSeed[lowIndex] = highIndex
        return true
      }
    }
    return false
  }
  if (pairings.every((_, index) => assign(index, new Set<number>()))) {
    const resolved = Array<[OpenGlobalSeed, OpenGlobalSeed]>(pairings.length)
    ownerByLowSeed.forEach((highIndex, lowIndex) => {
      resolved[highIndex] = [pairings[highIndex][0], lowSeeds[lowIndex]]
    })
    return resolved
  }

  const next = [...pairings]
  const hasConflict = (pair: [OpenGlobalSeed, OpenGlobalSeed]) => pair[0].groupId === pair[1].groupId

  for (let index = 0; index < next.length; index += 1) {
    if (!hasConflict(next[index])) continue

    for (let swapIndex = index + 1; swapIndex < next.length; swapIndex += 1) {
      const current = next[index]
      const candidate = next[swapIndex]
      const currentConflictCount = [current, candidate].filter(hasConflict).length
      const swappedCurrent: [OpenGlobalSeed, OpenGlobalSeed] = [current[0], candidate[1]]
      const swappedCandidate: [OpenGlobalSeed, OpenGlobalSeed] = [candidate[0], current[1]]
      const swappedConflictCount = [swappedCurrent, swappedCandidate].filter(hasConflict).length

      if (swappedConflictCount < currentConflictCount) {
        next[index] = swappedCurrent
        next[swapIndex] = swappedCandidate
        break
      }
    }
  }

  return next
}

export function buildCanonicalSeedLine(bracketSize: number): number[] {
  if (!Number.isInteger(bracketSize) || bracketSize < 2 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new OpenTournamentEngineError('INVALID_BRACKET_SIZE', 'bracketSize debe ser una potencia de 2 mayor o igual a 2.')
  }

  if (bracketSize === 2) return [1, 2]
  const previous = buildCanonicalSeedLine(bracketSize / 2)
  return previous.flatMap((seed) => [seed, bracketSize + 1 - seed])
}

type PairPlanEntry = {
  kind: 'BYE' | 'PLAYABLE' | 'EMPTY'
  byeTeam: OpenGlobalSeed | null
}

function buildPairPlan(input: {
  bracketSize: number
  byeTeams: OpenGlobalSeed[]
  teamsEnteringFirstRound: OpenGlobalSeed[]
}) {
  const totalParticipants = input.byeTeams.length + input.teamsEnteringFirstRound.length
  const firstRoundPairCount = input.bracketSize / 2
  const pairPlan: PairPlanEntry[] = Array.from({ length: firstRoundPairCount }, () => ({
    kind: 'EMPTY',
    byeTeam: null,
  }))
  const byeTeamBySeed = new Map(input.byeTeams.map((team) => [team.globalSeed, team]))
  const seedLine = buildCanonicalSeedLine(input.bracketSize)

  for (let pairIndex = 0; pairIndex < firstRoundPairCount; pairIndex += 1) {
    const firstSeed = seedLine[pairIndex * 2]
    const secondSeed = seedLine[pairIndex * 2 + 1]
    const firstIsReal = firstSeed <= totalParticipants
    const secondIsReal = secondSeed <= totalParticipants

    if (firstIsReal === secondIsReal) continue
    const beneficiarySeed = firstIsReal ? firstSeed : secondSeed
    const byeTeam = byeTeamBySeed.get(beneficiarySeed)
    if (!byeTeam) {
      throw new OpenTournamentEngineError(
        'INVALID_BRACKET_PLAN',
        `No se encontró el seed global ${beneficiarySeed} esperado para un BYE canónico.`
      )
    }

    pairPlan[pairIndex] = { kind: 'BYE', byeTeam }
  }

  const assignedByeIds = new Set(
    pairPlan.flatMap((entry) => entry.byeTeam ? [entry.byeTeam.teamId] : [])
  )
  if (assignedByeIds.size !== input.byeTeams.length) {
    throw new OpenTournamentEngineError('INVALID_BYE_COUNT', 'La seed-line canónica no pudo ubicar todos los BYEs.')
  }

  let remainingPlayablePairs = input.teamsEnteringFirstRound.length / 2
  for (let pairIndex = 0; pairIndex < pairPlan.length && remainingPlayablePairs > 0; pairIndex += 1) {
    if (pairPlan[pairIndex].kind !== 'EMPTY') continue
    pairPlan[pairIndex] = { kind: 'PLAYABLE', byeTeam: null }
    remainingPlayablePairs -= 1
  }

  if (remainingPlayablePairs !== 0) {
    throw new OpenTournamentEngineError('INVALID_BRACKET_PLAN', 'No alcanzan posiciones para ubicar todos los cruces jugables.')
  }

  return pairPlan
}

export function buildBracketSlots(input: {
  globalSeeds: OpenGlobalSeed[]
  byes: number
  bracketSize?: number
  config?: Partial<OpenQualificationConfig> | null
}) {
  const config = normalizeConfig(input.config)
  const bracketSize = input.bracketSize ?? calculateBracketSize(input.globalSeeds.length)
  const byeTeams = assignByes(input.globalSeeds, input.byes, config)
  const byeIds = new Set(byeTeams.map((team) => team.teamId))
  const teamsEnteringFirstRound = input.globalSeeds.filter((team) => !byeIds.has(team.teamId))

  if (teamsEnteringFirstRound.length % 2 !== 0) {
    throw new OpenTournamentEngineError('INVALID_FIRST_ROUND_COUNT', 'La primera ronda necesita cantidad par de equipos.')
  }

  const basePlayablePairs = pairHighLowSeeds(teamsEnteringFirstRound)
  const playablePairs = config.avoidSameGroupFirstRound
    ? minimizeSameGroupConflicts(basePlayablePairs)
    : basePlayablePairs
  const pairPlan = buildPairPlan({ bracketSize, byeTeams, teamsEnteringFirstRound })
  const slots: OpenGeneralBracketSlot[] = []
  const firstRoundMatches: OpenFirstRoundMatch[] = []
  let playablePairIndex = 0

  pairPlan.forEach((entry, pairIndex) => {
    const pairOrder = pairIndex + 1
    const advancesToMatchOrder = Math.ceil(pairOrder / 2)
    const position = pairIndex * 2 + 1

    if (entry.kind === 'BYE') {
      slots.push(
        { position, pairOrder, pairSlot: 1, team: entry.byeTeam, isByeSlot: false, advancesToMatchOrder },
        { position: position + 1, pairOrder, pairSlot: 2, team: null, isByeSlot: true, advancesToMatchOrder }
      )
      return
    }

    if (entry.kind === 'PLAYABLE') {
      const pair = playablePairs[playablePairIndex]
      playablePairIndex += 1
      if (!pair) {
        throw new OpenTournamentEngineError('INVALID_BRACKET_PLAN', 'Falta una pareja jugable para completar el cuadro.')
      }

      const [team1, team2] = pair
      const slot1: OpenGeneralBracketSlot = { position, pairOrder, pairSlot: 1, team: team1, isByeSlot: false, advancesToMatchOrder }
      const slot2: OpenGeneralBracketSlot = { position: position + 1, pairOrder, pairSlot: 2, team: team2, isByeSlot: false, advancesToMatchOrder }
      slots.push(slot1, slot2)
      firstRoundMatches.push({
        id: `${getStartPhase(bracketSize)}-${pairOrder}`,
        phase: getStartPhase(bracketSize),
        matchOrder: firstRoundMatches.length + 1,
        bracketPairOrder: pairOrder,
        displayOrder: firstRoundMatches.length + 1,
        slot1,
        slot2,
        team1,
        team2,
        sameGroupConflict: team1.groupId === team2.groupId,
      })
      return
    }

    slots.push(
      { position, pairOrder, pairSlot: 1, team: null, isByeSlot: true, advancesToMatchOrder },
      { position: position + 1, pairOrder, pairSlot: 2, team: null, isByeSlot: true, advancesToMatchOrder }
    )
  })

  return {
    bracketSlots: slots,
    firstRoundMatches,
    byeTeams,
  }
}

export function validateBracketPlan(plan: OpenGeneralBracketPlan) {
  const warnings = [...plan.warnings]
  const teamIds = plan.globalSeeds.map((team) => team.teamId)
  const uniqueTeamIds = new Set(teamIds)
  const slottedTeamIds = plan.bracketSlots.flatMap((slot) => slot.team?.teamId ? [slot.team.teamId] : [])
  const uniqueSlottedTeamIds = new Set(slottedTeamIds)

  if (teamIds.length !== uniqueTeamIds.size) {
    throw new OpenTournamentEngineError('DUPLICATED_PLAYOFF_TEAM', 'El plan contiene equipos duplicados.')
  }
  if (plan.bracketSlots.length !== plan.bracketSize) {
    throw new OpenTournamentEngineError('INVALID_BRACKET_PLAN', 'La cantidad de slots no coincide con el tamaño de cuadro.')
  }
  if (slottedTeamIds.length !== plan.totalQualified || uniqueSlottedTeamIds.size !== plan.totalQualified) {
    throw new OpenTournamentEngineError('INVALID_BRACKET_PLAN', 'No todos los clasificados están ubicados una sola vez.')
  }
  if (plan.byeTeams.length !== plan.byes) {
    throw new OpenTournamentEngineError('INVALID_BYE_COUNT', 'La cantidad de equipos con BYE no coincide con el plan.')
  }
  if (plan.byeTeams.some((team, index) => team.globalSeed !== index + 1)) {
    throw new OpenTournamentEngineError('INVALID_BYE_TEAM', 'Los BYEs deben asignarse a los mejores seeds globales.')
  }

  const sameGroupConflicts = plan.firstRoundMatches.filter((match) => match.sameGroupConflict)
  if (sameGroupConflicts.length > 0) {
    warnings.push(`Hay ${sameGroupConflicts.length} cruces de primera ronda con parejas del mismo grupo.`)
  }

  return {
    isValid: true,
    valid: true,
    warnings,
  }
}

export function buildGeneralOpenBracketPlan(
  groups: OpenGeneralGroupStandings[],
  configInput?: Partial<OpenQualificationConfig> | null
): OpenGeneralBracketPlan {
  const qualificationPlan = buildQualificationPlan(groups, configInput)
  const globalSeeds = buildGlobalSeeds(qualificationPlan.qualifiedTeams, qualificationPlan.config)
  const slotPlan = buildBracketSlots({
    globalSeeds,
    byes: qualificationPlan.byes,
    bracketSize: qualificationPlan.bracketSize,
    config: qualificationPlan.config,
  })
  const plan: OpenGeneralBracketPlan = {
    totalQualified: qualificationPlan.totalQualified,
    bracketSize: qualificationPlan.bracketSize,
    byes: qualificationPlan.byes,
    qualifiedTeams: qualificationPlan.qualifiedTeams,
    globalSeeds,
    byeTeams: slotPlan.byeTeams,
    firstRoundMatches: slotPlan.firstRoundMatches,
    bracketSlots: slotPlan.bracketSlots,
    warnings: qualificationPlan.warnings,
  }
  const validation = validateBracketPlan(plan)

  return {
    ...plan,
    warnings: validation.warnings,
  }
}
