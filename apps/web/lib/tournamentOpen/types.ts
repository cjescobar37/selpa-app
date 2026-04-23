export type OpenGroupStructure = {
  teamCount: number
  groupsOf3: number
  groupsOf4: number
  totalGroups: number
  groupSizes: number[]
}

export type OpenPlayoffPhase = 'ROUND_OF_32' | 'ROUND_OF_16' | 'EIGHTHS' | 'QUARTER' | 'SEMI' | 'FINAL'

export type OpenNormalizedMetrics = {
  pointsPerMatch: number
  setDiffPerMatch: number
  gameDiffPerMatch: number
  gamesForPerMatch: number
}

export type OpenRankedTeam = {
  groupId: string
  groupName: string
  groupOrder: number
  teamId: string
  seed: number
  groupPosition: number
  played: number
  metrics: OpenNormalizedMetrics
  requiresManualResolution: boolean
}

export type OpenQualificationManualReason = {
  code:
    | 'INSUFFICIENT_GROUP_STANDINGS'
    | 'INSUFFICIENT_BEST_THIRDS'
    | 'BEST_THIRDS_CUT_TIE'
    | 'BYES_CUT_TIE'
    | 'SAME_GROUP_CONFLICTS'
  message: string
  teamIds?: string[]
}

export type OpenQualificationPlan = {
  groupCount: number
  directQualifiers: number
  bracketSize: number
  vacancies: number
  byeCount: number
  bestThirdsCount: number
  byes: number
  selectedBestThirds: OpenRankedTeam[]
  byeCandidatesOrdered: OpenRankedTeam[]
  selectedByes: OpenRankedTeam[]
  directQualifiedTeams: OpenRankedTeam[]
  playoffTeams: OpenRankedTeam[]
  teamsEnteringFirstRound: OpenRankedTeam[]
  startPhase: OpenPlayoffPhase
  requiresManualResolution: boolean
  manualResolutionReasons: OpenQualificationManualReason[]
}

export type OpenBracketSlot = {
  id: string
  seedNumber: number
  team: OpenRankedTeam | null
  isBye: boolean
}

export type OpenSameGroupConflict = {
  matchId: string
  groupId: string
  teamIds: string[]
}

export type OpenBracketMatch = {
  id: string
  phase: OpenPlayoffPhase
  roundNumber: number
  matchOrder: number
  slot1: OpenBracketSlot
  slot2: OpenBracketSlot
  sameGroupConflict: boolean
}

export type OpenBracketRound = {
  phase: OpenPlayoffPhase
  roundNumber: number
  matches: OpenBracketMatch[]
}

export type OpenBracketPlan = {
  bracketSize: number
  startPhase: OpenPlayoffPhase
  rounds: OpenBracketRound[]
  firstRoundMatches: OpenBracketMatch[]
  slots: OpenBracketSlot[]
  assignedByes: OpenBracketSlot[]
  conflictScore: number
  sameGroupConflicts: OpenSameGroupConflict[]
  requiresManualResolution: boolean
  manualResolutionReasons: OpenQualificationManualReason[]
}

export type OpenPersistableMatchInput = {
  tournamentId: string
  clubId: string
  groupId: null
  team1Id: string
  team2Id: string
  phase: OpenPlayoffPhase
  round: number
  matchOrder: number
}

export class OpenTournamentEngineError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'OpenTournamentEngineError'
    this.code = code
  }
}
