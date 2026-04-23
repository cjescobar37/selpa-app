import type { GroupStandings } from '@/lib/tournamentStandings'
import { nextPowerOfTwo } from './groups'
import { getOpenPlayoffStartPhase } from './phases'
import { rankOpenBestThirds, rankOpenByeCandidates, toOpenRankedTeam } from './rankings'
import {
  OpenTournamentEngineError,
  type OpenQualificationManualReason,
  type OpenQualificationPlan,
  type OpenRankedTeam,
} from './types'

type OpenPlayoffBase = {
  directQualifiers: number
  bracketSize: number
  vacancies: number
}

type OpenHybridCounts = OpenPlayoffBase & {
  byeCount: number
  bestThirdsCount: number
}

function hasEqualRankingCriteria(a: OpenRankedTeam, b: OpenRankedTeam) {
  return (
    a.metrics.pointsPerMatch === b.metrics.pointsPerMatch &&
    a.metrics.setDiffPerMatch === b.metrics.setDiffPerMatch &&
    a.metrics.gameDiffPerMatch === b.metrics.gameDiffPerMatch &&
    a.metrics.gamesForPerMatch === b.metrics.gamesForPerMatch &&
    a.seed === b.seed
  )
}

function getCutTieReason(input: {
  rows: OpenRankedTeam[]
  count: number
  code: 'BEST_THIRDS_CUT_TIE' | 'BYES_CUT_TIE'
  message: string
}): OpenQualificationManualReason | null {
  if (input.count <= 0 || input.rows.length <= input.count) return null

  const lastSelected = input.rows[input.count - 1]
  const firstExcluded = input.rows[input.count]
  if (!lastSelected || !firstExcluded || !hasEqualRankingCriteria(lastSelected, firstExcluded)) return null

  const tiedTeamIds = input.rows
    .filter((row) => hasEqualRankingCriteria(row, lastSelected))
    .map((row) => row.teamId)

  return {
    code: input.code,
    message: input.message,
    teamIds: tiedTeamIds,
  }
}

function getDirectQualifiedTeams(groupStandings: GroupStandings[]) {
  const directQualifiedTeams: OpenRankedTeam[] = []

  for (const group of groupStandings) {
    if (group.standings.length < 2) {
      throw new OpenTournamentEngineError(
        'INSUFFICIENT_GROUP_STANDINGS',
        `El grupo ${group.group.name} necesita al menos 2 equipos ordenados para clasificar directos.`
      )
    }

    directQualifiedTeams.push(toOpenRankedTeam(group, group.standings[0], 1))
    directQualifiedTeams.push(toOpenRankedTeam(group, group.standings[1], 2))
  }

  return directQualifiedTeams
}

export function calculateOpenPlayoffBase(groupCount: number): OpenPlayoffBase {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new OpenTournamentEngineError('INVALID_INPUT', 'groupCount debe ser un entero positivo.')
  }

  const directQualifiers = groupCount * 2
  const bracketSize = nextPowerOfTwo(directQualifiers)

  return {
    directQualifiers,
    bracketSize,
    vacancies: bracketSize - directQualifiers,
  }
}

export function determineOpenHybridCounts(groupCount: number, maxByes = 4): OpenHybridCounts {
  if (!Number.isInteger(maxByes) || maxByes < 0) {
    throw new OpenTournamentEngineError('INVALID_INPUT', 'maxByes debe ser un entero mayor o igual a 0.')
  }

  const base = calculateOpenPlayoffBase(groupCount)
  const byeCount = Math.min(maxByes, base.vacancies)

  return {
    ...base,
    byeCount,
    bestThirdsCount: base.vacancies - byeCount,
  }
}

export function buildOpenQualificationPlan(groupStandings: GroupStandings[], maxByes = 4): OpenQualificationPlan {
  if (groupStandings.length === 0) {
    throw new OpenTournamentEngineError('INVALID_INPUT', 'Se necesita al menos un grupo para construir el plan OPEN.')
  }

  const groupCount = groupStandings.length
  const counts = determineOpenHybridCounts(groupCount, maxByes)
  const manualResolutionReasons: OpenQualificationManualReason[] = []
  const directQualifiedTeams = getDirectQualifiedTeams(groupStandings)

  const bestThirdsRanking = rankOpenBestThirds(groupStandings)
  const selectedBestThirds = counts.bestThirdsCount > 0
    ? bestThirdsRanking.slice(0, counts.bestThirdsCount)
    : []

  const missingThirdsCount = Math.max(0, counts.bestThirdsCount - selectedBestThirds.length)
  if (missingThirdsCount > 0) {
    manualResolutionReasons.push({
      code: 'INSUFFICIENT_BEST_THIRDS',
      message: `Faltan ${missingThirdsCount} terceros disponibles para completar el cuadro OPEN.`,
    })
  }

  const bestThirdsCutTie = getCutTieReason({
    rows: bestThirdsRanking,
    count: counts.bestThirdsCount,
    code: 'BEST_THIRDS_CUT_TIE',
    message: 'Hay empate total en el corte de mejores terceros y requiere resolución manual.',
  })
  if (bestThirdsCutTie) manualResolutionReasons.push(bestThirdsCutTie)

  const playoffTeams = [...directQualifiedTeams, ...selectedBestThirds]
  const playoffTeamIds = new Set(playoffTeams.map((team) => team.teamId))
  const byeCandidatesOrdered = rankOpenByeCandidates(groupStandings).filter((team) => playoffTeamIds.has(team.teamId))
  const selectedByes = counts.byeCount > 0
    ? byeCandidatesOrdered.slice(0, counts.byeCount)
    : []

  const byesCutTie = getCutTieReason({
    rows: byeCandidatesOrdered,
    count: counts.byeCount,
    code: 'BYES_CUT_TIE',
    message: 'Hay empate total en el corte de byes y requiere resolución manual.',
  })
  if (byesCutTie) manualResolutionReasons.push(byesCutTie)

  const byeTeamIds = new Set(selectedByes.map((team) => team.teamId))
  const teamsEnteringFirstRound = playoffTeams.filter((team) => !byeTeamIds.has(team.teamId))
  const byes = counts.bracketSize - playoffTeams.length

  return {
    groupCount,
    directQualifiers: counts.directQualifiers,
    bracketSize: counts.bracketSize,
    vacancies: counts.vacancies,
    byeCount: counts.byeCount,
    bestThirdsCount: counts.bestThirdsCount,
    byes,
    selectedBestThirds,
    byeCandidatesOrdered,
    selectedByes,
    directQualifiedTeams,
    playoffTeams,
    teamsEnteringFirstRound,
    startPhase: getOpenPlayoffStartPhase(counts.bracketSize),
    requiresManualResolution: manualResolutionReasons.length > 0,
    manualResolutionReasons,
  }
}
