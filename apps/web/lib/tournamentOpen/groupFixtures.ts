import { OpenTournamentEngineError } from './types'

export type OpenGroupFixtureTeam = { teamId: string; seed: number }

export type OpenGroupFixtureMatch = {
  round: number
  slot: 1 | 2 | 3 | 4
  team1Id: string
  team2Id: string
  label: 'PARTIDO INICIAL' | 'GANADORES VS GANADORES' | 'PERDEDORES VS PERDEDORES'
}

export type OpenGroupFixturePlan = {
  projectedMatchCount: number
  initialMatches: OpenGroupFixtureMatch[]
}

function orderedTeams(teams: OpenGroupFixtureTeam[]) {
  return [...teams].sort((left, right) => left.seed - right.seed || left.teamId.localeCompare(right.teamId))
}

export function getOpenGroupProjectedMatchCount(size: number) {
  if (size === 3) return 3
  if (size === 4) return 4
  throw new OpenTournamentEngineError('INVALID_GROUP_SIZE', 'Un grupo OPEN debe tener 3 o 4 parejas.')
}

export function buildOpenGroupInitialFixture(teams: OpenGroupFixtureTeam[]): OpenGroupFixturePlan {
  const ordered = orderedTeams(teams)
  if (ordered.length === 3) {
    const [seed1, seed2, seed3] = ordered
    if (!seed1 || !seed2 || !seed3) throw new OpenTournamentEngineError('INVALID_GROUP_SIZE', 'El grupo OPEN no tiene las parejas esperadas.')
    return {
      projectedMatchCount: 3,
      initialMatches: [
        { round: 1, slot: 1, team1Id: seed2.teamId, team2Id: seed3.teamId, label: 'PARTIDO INICIAL' },
        { round: 2, slot: 2, team1Id: seed1.teamId, team2Id: seed3.teamId, label: 'PARTIDO INICIAL' },
        { round: 3, slot: 3, team1Id: seed1.teamId, team2Id: seed2.teamId, label: 'PARTIDO INICIAL' },
      ],
    }
  }

  if (ordered.length === 4) {
    const [seed1, seed2, seed3, seed4] = ordered
    if (!seed1 || !seed2 || !seed3 || !seed4) throw new OpenTournamentEngineError('INVALID_GROUP_SIZE', 'El grupo OPEN no tiene las parejas esperadas.')
    return {
      projectedMatchCount: 4,
      initialMatches: [
        { round: 1, slot: 1, team1Id: seed1.teamId, team2Id: seed4.teamId, label: 'PARTIDO INICIAL' },
        { round: 1, slot: 2, team1Id: seed2.teamId, team2Id: seed3.teamId, label: 'PARTIDO INICIAL' },
      ],
    }
  }

  throw new OpenTournamentEngineError('INVALID_GROUP_SIZE', 'Un grupo OPEN debe tener 3 o 4 parejas.')
}

export function buildOpenGroupDependentFixture(input: {
  initialMatches: Array<{ team1Id: string; team2Id: string; winnerTeamId: string | null | undefined }>
}): OpenGroupFixtureMatch[] | null {
  if (input.initialMatches.length !== 2) return null
  const [first, second] = input.initialMatches
  if (!first || !second || !first.winnerTeamId || !second.winnerTeamId) return null

  const firstLoser = first.winnerTeamId === first.team1Id ? first.team2Id : first.team1Id
  const secondLoser = second.winnerTeamId === second.team1Id ? second.team2Id : second.team1Id
  if (first.winnerTeamId === second.winnerTeamId || firstLoser === secondLoser) {
    throw new OpenTournamentEngineError('INVALID_GROUP_FIXTURE', 'Los partidos iniciales no pueden resolver la misma pareja dos veces.')
  }

  return [
    { round: 2, slot: 3, team1Id: first.winnerTeamId, team2Id: second.winnerTeamId, label: 'GANADORES VS GANADORES' },
    { round: 2, slot: 4, team1Id: firstLoser, team2Id: secondLoser, label: 'PERDEDORES VS PERDEDORES' },
  ]
}

export function getOpenGroupMatchDisplayCode(groupOrder: number | null | undefined, position: number) {
  const safeOrder = Number(groupOrder ?? 0)
  const groupLabel = Number.isInteger(safeOrder) && safeOrder >= 1 && safeOrder <= 26
    ? String.fromCharCode(64 + safeOrder)
    : String(Math.max(1, safeOrder || 1))
  return `${groupLabel}-${String(Math.max(1, position)).padStart(2, '0')}`
}
