import {
  OpenTournamentEngineError,
  type OpenBracketMatch,
  type OpenBracketPlan,
  type OpenBracketRound,
  type OpenBracketSlot,
  type OpenQualificationManualReason,
  type OpenQualificationPlan,
  type OpenRankedTeam,
  type OpenSameGroupConflict,
} from './types'

const phaseOrder = ['ROUND_OF_32', 'ROUND_OF_16', 'EIGHTHS', 'QUARTER', 'SEMI', 'FINAL'] as const

function assertResolvedQualificationPlan(qualificationPlan: OpenQualificationPlan) {
  if (qualificationPlan.requiresManualResolution) {
    throw new OpenTournamentEngineError(
      'QUALIFICATION_REQUIRES_MANUAL_RESOLUTION',
      'El plan de clasificación OPEN requiere resolución manual antes de armar el bracket.'
    )
  }
}

function uniqueTeamCount(teams: OpenRankedTeam[]) {
  return new Set(teams.map((team) => team.teamId)).size
}

function assertQualificationCounts(qualificationPlan: OpenQualificationPlan) {
  const playoffTeams = qualificationPlan.playoffTeams
  const selectedByes = qualificationPlan.selectedByes
  const teamsEnteringFirstRound = qualificationPlan.teamsEnteringFirstRound

  if (uniqueTeamCount(playoffTeams) !== playoffTeams.length) {
    throw new OpenTournamentEngineError('DUPLICATED_PLAYOFF_TEAM', 'El plan OPEN contiene equipos duplicados.')
  }

  const playoffTeamIds = new Set(playoffTeams.map((team) => team.teamId))
  const invalidBye = selectedByes.find((team) => !playoffTeamIds.has(team.teamId))
  if (invalidBye) {
    throw new OpenTournamentEngineError('INVALID_BYE_TEAM', 'Hay un bye asignado a un equipo que no integra el playoff.')
  }

  if (selectedByes.length !== qualificationPlan.byeCount) {
    throw new OpenTournamentEngineError('INVALID_BYE_COUNT', 'La cantidad de byes seleccionados no coincide con el plan.')
  }

  if (teamsEnteringFirstRound.length + selectedByes.length !== playoffTeams.length) {
    throw new OpenTournamentEngineError(
      'INVALID_FIRST_ROUND_COUNT',
      'Los equipos de primera ronda y los byes no coinciden con el total de playoff.'
    )
  }

  if (teamsEnteringFirstRound.length % 2 !== 0) {
    throw new OpenTournamentEngineError(
      'INVALID_FIRST_ROUND_COUNT',
      'La primera ronda necesita una cantidad par de equipos.'
    )
  }
}

function getRoundsFromStart(startPhase: OpenQualificationPlan['startPhase']): OpenBracketRound[] {
  const startIndex = phaseOrder.indexOf(startPhase)
  if (startIndex < 0) {
    throw new OpenTournamentEngineError('UNSUPPORTED_PLAYOFF_PHASE', 'Fase inicial de playoff no soportada.')
  }

  return phaseOrder.slice(startIndex).map((phase, index) => ({
    phase,
    roundNumber: index + 1,
    matches: [],
  }))
}

function getSeededPlayoffTeams(qualificationPlan: OpenQualificationPlan) {
  const playoffTeamIds = new Set(qualificationPlan.playoffTeams.map((team) => team.teamId))
  const ordered = qualificationPlan.byeCandidatesOrdered.filter((team) => playoffTeamIds.has(team.teamId))
  const missing = qualificationPlan.playoffTeams.filter((team) => !ordered.some((row) => row.teamId === team.teamId))
  return [...ordered, ...missing]
}

function buildSlots(qualificationPlan: OpenQualificationPlan): OpenBracketSlot[] {
  const byeIds = new Set(qualificationPlan.selectedByes.map((team) => team.teamId))

  return getSeededPlayoffTeams(qualificationPlan).map((team, index) => ({
    id: `slot-${index + 1}`,
    seedNumber: index + 1,
    team,
    isBye: byeIds.has(team.teamId),
  }))
}

function buildInitialPairings(slots: OpenBracketSlot[]) {
  const playableSlots = slots.filter((slot) => slot.team && !slot.isBye)
  const pairings: Array<[OpenBracketSlot, OpenBracketSlot]> = []

  for (let index = 0; index < playableSlots.length / 2; index += 1) {
    const highSeed = playableSlots[index]
    const lowSeed = playableSlots[playableSlots.length - 1 - index]
    if (highSeed && lowSeed) pairings.push([highSeed, lowSeed])
  }

  return pairings
}

function isSameGroupPair(pairing: [OpenBracketSlot, OpenBracketSlot]) {
  const [first, second] = pairing
  return Boolean(first.team && second.team && first.team.groupId === second.team.groupId)
}

function minimizeSameGroupPairings(pairings: Array<[OpenBracketSlot, OpenBracketSlot]>) {
  const next = [...pairings]

  for (let index = 0; index < next.length; index += 1) {
    if (!isSameGroupPair(next[index])) continue

    for (let swapIndex = index + 1; swapIndex < next.length; swapIndex += 1) {
      const current = next[index]
      const candidate = next[swapIndex]
      const currentConflictCount = [current, candidate].filter(isSameGroupPair).length
      const swappedCurrent: [OpenBracketSlot, OpenBracketSlot] = [current[0], candidate[1]]
      const swappedCandidate: [OpenBracketSlot, OpenBracketSlot] = [candidate[0], current[1]]
      const swappedConflictCount = [swappedCurrent, swappedCandidate].filter(isSameGroupPair).length

      if (swappedConflictCount < currentConflictCount) {
        next[index] = swappedCurrent
        next[swapIndex] = swappedCandidate
        break
      }
    }
  }

  return next
}

function toBracketMatches(input: {
  pairings: Array<[OpenBracketSlot, OpenBracketSlot]>
  phase: OpenBracketMatch['phase']
  roundNumber: number
}): OpenBracketMatch[] {
  return input.pairings.map(([slot1, slot2], index) => {
    const sameGroupConflict = isSameGroupPair([slot1, slot2])

    return {
      id: `${input.phase}-${index + 1}`,
      phase: input.phase,
      roundNumber: input.roundNumber,
      matchOrder: index + 1,
      slot1,
      slot2,
      sameGroupConflict,
    }
  })
}

function collectConflicts(matches: OpenBracketMatch[]): OpenSameGroupConflict[] {
  return matches
    .filter((match) => match.sameGroupConflict && match.slot1.team && match.slot2.team)
    .map((match) => ({
      matchId: match.id,
      groupId: match.slot1.team?.groupId ?? '',
      teamIds: [match.slot1.team?.teamId ?? '', match.slot2.team?.teamId ?? ''].filter(Boolean),
    }))
}

function buildManualReasons(conflicts: OpenSameGroupConflict[]): OpenQualificationManualReason[] {
  if (conflicts.length === 0) return []

  return [{
    code: 'SAME_GROUP_CONFLICTS',
    message: 'No se pudieron evitar todos los cruces entre equipos del mismo grupo en primera ronda.',
    teamIds: conflicts.flatMap((conflict) => conflict.teamIds),
  }]
}

export function buildOpenBracketPlan(qualificationPlan: OpenQualificationPlan): OpenBracketPlan {
  assertResolvedQualificationPlan(qualificationPlan)
  assertQualificationCounts(qualificationPlan)

  const slots = buildSlots(qualificationPlan)
  const assignedByes = slots.filter((slot) => slot.isBye)
  const rounds = getRoundsFromStart(qualificationPlan.startPhase)
  const firstRound = rounds[0]

  if (!firstRound) {
    throw new OpenTournamentEngineError('UNSUPPORTED_PLAYOFF_PHASE', 'No se pudo construir la ronda inicial.')
  }

  const initialPairings = buildInitialPairings(slots)
  const optimizedPairings = minimizeSameGroupPairings(initialPairings)
  const firstRoundMatches = toBracketMatches({
    pairings: optimizedPairings,
    phase: firstRound.phase,
    roundNumber: firstRound.roundNumber,
  })
  const sameGroupConflicts = collectConflicts(firstRoundMatches)
  const manualResolutionReasons = buildManualReasons(sameGroupConflicts)

  return {
    bracketSize: qualificationPlan.bracketSize,
    startPhase: qualificationPlan.startPhase,
    rounds: [
      {
        ...firstRound,
        matches: firstRoundMatches,
      },
      ...rounds.slice(1),
    ],
    firstRoundMatches,
    slots,
    assignedByes,
    conflictScore: sameGroupConflicts.length,
    sameGroupConflicts,
    requiresManualResolution: manualResolutionReasons.length > 0,
    manualResolutionReasons,
  }
}
