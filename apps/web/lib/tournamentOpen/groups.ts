import { OpenTournamentEngineError, type OpenGroupStructure } from './types'

const MIN_OPEN_TEAMS = 6

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new OpenTournamentEngineError('INVALID_INPUT', `${label} debe ser un entero positivo.`)
  }
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

  const remainingTeams = teamCount - groupsOf4 * 4
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
