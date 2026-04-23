import {
  OpenTournamentEngineError,
  type OpenBracketMatch,
  type OpenBracketPlan,
  type OpenPersistableMatchInput,
} from './types'

function hasBlockingManualResolution(bracketPlan: OpenBracketPlan) {
  return bracketPlan.manualResolutionReasons.some((reason) => reason.code !== 'SAME_GROUP_CONFLICTS')
}

function assertUuidLike(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new OpenTournamentEngineError('INVALID_INPUT', `${label} inválido.`)
  }
}

function toPersistableFirstRoundMatch(input: {
  tournamentId: string
  clubId: string
  match: OpenBracketMatch
}): OpenPersistableMatchInput {
  const team1Id = input.match.slot1.team?.teamId
  const team2Id = input.match.slot2.team?.teamId

  if (!team1Id || !team2Id) {
    throw new OpenTournamentEngineError(
      'INCOMPLETE_BRACKET_MATCH',
      'No se puede preparar persistencia de un cruce sin ambos equipos definidos.'
    )
  }

  if (input.match.slot1.isBye || input.match.slot2.isBye) {
    throw new OpenTournamentEngineError(
      'INVALID_FIRST_ROUND_MATCH',
      'Los equipos con bye no deben persistirse como rivales de primera ronda.'
    )
  }

  return {
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    groupId: null,
    team1Id,
    team2Id,
    phase: input.match.phase,
    round: input.match.roundNumber,
    matchOrder: input.match.matchOrder,
  }
}

export function buildOpenFirstRoundMatchInputs(input: {
  tournamentId: string
  clubId: string
  bracketPlan: OpenBracketPlan
}): OpenPersistableMatchInput[] {
  assertUuidLike(input.tournamentId, 'tournamentId')
  assertUuidLike(input.clubId, 'clubId')

  if (hasBlockingManualResolution(input.bracketPlan)) {
    throw new OpenTournamentEngineError(
      'BRACKET_REQUIRES_MANUAL_RESOLUTION',
      'El bracket OPEN requiere resolución manual antes de preparar persistencia.'
    )
  }

  return input.bracketPlan.firstRoundMatches.map((match) => toPersistableFirstRoundMatch({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    match,
  }))
}
