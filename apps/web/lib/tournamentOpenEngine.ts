import type { GroupStandingRow, GroupStandings } from '@/lib/tournamentStandings'

export type OpenGroupStructure = {
  teamCount: number
  groupsOf3: number
  groupsOf4: number
  totalGroups: number
  groupSizes: number[]
}

export type OpenPlayoffBase = {
  directQualifiers: number
  bracketSize: number
  vacancies: number
}

export type OpenPlayoffPhase = 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER' | 'SEMI' | 'FINAL'

export type NormalizedGroupMetrics = {
  pointsPerMatch: number
  setDiffPerMatch: number
  gameDiffPerMatch: number
  gamesForPerMatch: number
}

export type OpenQualifiedTeam = {
  groupId: string
  groupName: string
  groupOrder: number
  teamId: string
  seed: number
  groupPosition: number
  row: GroupStandingRow
  metrics: NormalizedGroupMetrics
}

export type OpenByeAndThirdsPlan = OpenPlayoffBase & {
  byeCount: number
  bestThirdsCount: number
}

export type OpenQualificationPlan = OpenByeAndThirdsPlan & {
  directQualifiersList: OpenQualifiedTeam[]
  selectedBestThirds: OpenQualifiedTeam[]
  byeCandidates: OpenQualifiedTeam[]
  actualByes: OpenQualifiedTeam[]
  startPhase: OpenPlayoffPhase
}

export class OpenTournamentEngineError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'OpenTournamentEngineError'
    this.code = code
  }
}

const MIN_OPEN_TEAMS = 6

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new OpenTournamentEngineError('INVALID_INPUT', `${label} debe ser un entero positivo.`)
  }
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new OpenTournamentEngineError('INVALID_INPUT', `${label} debe ser un entero mayor o igual a 0.`)
  }
}

function normalizeGroupOrder(value: number | undefined) {
  return Number.isInteger(value) ? value : 0
}

function compareQualifiedTeams(a: OpenQualifiedTeam, b: OpenQualifiedTeam) {
  const pointsDiff = b.metrics.pointsPerMatch - a.metrics.pointsPerMatch
  if (pointsDiff !== 0) return pointsDiff

  const setDiff = b.metrics.setDiffPerMatch - a.metrics.setDiffPerMatch
  if (setDiff !== 0) return setDiff

  const gameDiff = b.metrics.gameDiffPerMatch - a.metrics.gameDiffPerMatch
  if (gameDiff !== 0) return gameDiff

  const gamesForDiff = b.metrics.gamesForPerMatch - a.metrics.gamesForPerMatch
  if (gamesForDiff !== 0) return gamesForDiff

  const seedDiff = a.seed - b.seed
  if (seedDiff !== 0) return seedDiff

  return a.teamId.localeCompare(b.teamId)
}

function toQualifiedTeam(group: GroupStandings, row: GroupStandingRow, groupPosition: number): OpenQualifiedTeam {
  return {
    groupId: group.group.id,
    groupName: group.group.name,
    groupOrder: normalizeGroupOrder(group.group.order),
    teamId: row.team_id,
    seed: row.seed,
    groupPosition,
    row,
    metrics: getNormalizedGroupMetrics(row, row.played),
  }
}

function collectDirectQualifiers(groupStandings: GroupStandings[]) {
  return groupStandings.flatMap((group) => {
    if (group.standings.length < 2) {
      throw new OpenTournamentEngineError(
        'INSUFFICIENT_GROUP_STANDINGS',
        'Cada grupo necesita al menos 2 equipos ordenados para construir el plan OPEN.'
      )
    }

    return group.standings.slice(0, 2).map((row, index) => toQualifiedTeam(group, row, index + 1))
  })
}

export function calculateOpenGroupStructure(teamCount: number): OpenGroupStructure {
  assertPositiveInteger(teamCount, 'teamCount')

  if (teamCount < MIN_OPEN_TEAMS) {
    throw new OpenTournamentEngineError(
      'UNSUPPORTED_TEAM_COUNT',
      `Un OPEN por grupos requiere al menos ${MIN_OPEN_TEAMS} parejas.`
    )
  }

  if (teamCount === 5) {
    throw new OpenTournamentEngineError(
      'UNSUPPORTED_TEAM_COUNT',
      'El caso de 5 parejas no está soportado por la regla estándar de grupos de 3 y hasta 2 grupos de 4.'
    )
  }

  const remainder = teamCount % 3
  let groupsOf4 = 0

  if (remainder === 1) groupsOf4 = 1
  if (remainder === 2) {
    if (teamCount < 8) {
      throw new OpenTournamentEngineError(
        'UNSUPPORTED_TEAM_COUNT',
        'Para usar 2 grupos de 4 se requieren al menos 8 parejas.'
      )
    }
    groupsOf4 = 2
  }

  const teamsInGroupsOf4 = groupsOf4 * 4
  const remainingTeams = teamCount - teamsInGroupsOf4
  const groupsOf3 = remainingTeams / 3

  if (!Number.isInteger(groupsOf3) || groupsOf3 < 0 || groupsOf4 > 2) {
    throw new OpenTournamentEngineError(
      'UNSUPPORTED_TEAM_COUNT',
      'No se pudo resolver una estructura válida de grupos para este OPEN.'
    )
  }

  const groupSizes = [...Array(groupsOf4).fill(4), ...Array(groupsOf3).fill(3)]

  return {
    teamCount,
    groupsOf3,
    groupsOf4,
    totalGroups: groupSizes.length,
    groupSizes,
  }
}

export function nextPowerOfTwo(value: number): number {
  assertPositiveInteger(value, 'value')

  let power = 1
  while (power < value) power *= 2
  return power
}

export function calculateOpenPlayoffBase(groupCount: number): OpenPlayoffBase {
  assertPositiveInteger(groupCount, 'groupCount')

  const directQualifiers = groupCount * 2
  const bracketSize = nextPowerOfTwo(directQualifiers)

  return {
    directQualifiers,
    bracketSize,
    vacancies: bracketSize - directQualifiers,
  }
}

export function getNormalizedGroupMetrics(
  row: GroupStandingRow,
  playedCount: number = row.played
): NormalizedGroupMetrics {
  assertNonNegativeInteger(playedCount, 'playedCount')

  if (playedCount === 0) {
    return {
      pointsPerMatch: 0,
      setDiffPerMatch: 0,
      gameDiffPerMatch: 0,
      gamesForPerMatch: 0,
    }
  }

  return {
    pointsPerMatch: row.match_points / playedCount,
    setDiffPerMatch: row.set_difference / playedCount,
    gameDiffPerMatch: row.game_difference / playedCount,
    gamesForPerMatch: row.games_for / playedCount,
  }
}

export function rankBestThirds(groupStandings: GroupStandings[]): OpenQualifiedTeam[] {
  return groupStandings
    .filter((group) => group.standings.length >= 3)
    .map((group) => toQualifiedTeam(group, group.standings[2], 3))
    .sort(compareQualifiedTeams)
}

export function determineOpenByeAndThirds(groupCount: number, maxByes = 4): OpenByeAndThirdsPlan {
  assertPositiveInteger(groupCount, 'groupCount')
  assertNonNegativeInteger(maxByes, 'maxByes')

  const base = calculateOpenPlayoffBase(groupCount)
  const byeCount = Math.min(maxByes, base.vacancies)

  return {
    ...base,
    byeCount,
    bestThirdsCount: base.vacancies - byeCount,
  }
}

export function getPlayoffStartPhase(bracketSize: number): OpenPlayoffPhase {
  assertPositiveInteger(bracketSize, 'bracketSize')

  if (bracketSize === 64) return 'ROUND_OF_32'
  if (bracketSize === 32) return 'ROUND_OF_16'
  if (bracketSize === 16) return 'ROUND_OF_16'
  if (bracketSize === 8) return 'QUARTER'
  if (bracketSize === 4) return 'SEMI'
  if (bracketSize === 2) return 'FINAL'

  throw new OpenTournamentEngineError(
    'UNSUPPORTED_BRACKET_SIZE',
    'El tamaño del cuadro debe ser 2, 4, 8, 16, 32 o 64.'
  )
}

export function buildOpenQualificationPlan(groupStandings: GroupStandings[], maxByes = 4): OpenQualificationPlan {
  if (groupStandings.length === 0) {
    throw new OpenTournamentEngineError('INVALID_INPUT', 'Se necesita al menos un grupo para construir el plan OPEN.')
  }

  const byeAndThirds = determineOpenByeAndThirds(groupStandings.length, maxByes)
  const directQualifiersList = collectDirectQualifiers(groupStandings)
  const selectedBestThirds = rankBestThirds(groupStandings).slice(0, byeAndThirds.bestThirdsCount)

  if (selectedBestThirds.length < byeAndThirds.bestThirdsCount) {
    throw new OpenTournamentEngineError(
      'INSUFFICIENT_BEST_THIRDS',
      'No hay suficientes terceros disponibles para completar el cuadro OPEN.'
    )
  }

  const playoffTeams = [...directQualifiersList, ...selectedBestThirds]
  const byeCandidates = [...playoffTeams].sort((a, b) => {
    const positionDiff = a.groupPosition - b.groupPosition
    if (positionDiff !== 0) return positionDiff
    return compareQualifiedTeams(a, b)
  })

  return {
    ...byeAndThirds,
    directQualifiersList,
    selectedBestThirds,
    byeCandidates,
    actualByes: byeCandidates.slice(0, byeAndThirds.byeCount),
    startPhase: getPlayoffStartPhase(byeAndThirds.bracketSize),
  }
}

/*
Ejemplos:

calculateOpenGroupStructure(24)
// { teamCount: 24, groupsOf3: 8, groupsOf4: 0, totalGroups: 8, groupSizes: [3, 3, 3, 3, 3, 3, 3, 3] }

calculateOpenGroupStructure(25)
// { teamCount: 25, groupsOf3: 7, groupsOf4: 1, totalGroups: 8, groupSizes: [4, 3, 3, 3, 3, 3, 3, 3] }

calculateOpenGroupStructure(26)
// { teamCount: 26, groupsOf3: 6, groupsOf4: 2, totalGroups: 8, groupSizes: [4, 4, 3, 3, 3, 3, 3, 3] }

calculateOpenGroupStructure(83)
// { teamCount: 83, groupsOf3: 25, groupsOf4: 2, totalGroups: 27, groupSizes: [4, 4, 3, ...] }

calculateOpenPlayoffBase(27)
// { directQualifiers: 54, bracketSize: 64, vacancies: 10 }
*/
