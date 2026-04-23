import { isClubAdmin } from '@/lib/clubMembershipServer'
import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'
import { createMatch } from '@/lib/tournamentMatches'
import {
  calculateTournamentGroupStandings,
  type TournamentClassificationRules,
  type TournamentGroup,
  type TournamentGroupTeam,
  type TournamentStandingMatch,
} from '@/lib/tournamentStandings'
import { buildOpenBracketPlan } from '@/lib/tournamentOpen/bracket'
import { buildOpenFirstRoundMatchInputs } from '@/lib/tournamentOpen/persistence'
import { buildOpenQualificationPlan } from '@/lib/tournamentOpen/qualification'
import { OpenTournamentEngineError } from '@/lib/tournamentOpen/types'
import { getTournamentRegistrationEligibilityGate } from '@/lib/tournamentRegistrationEligibility'

type OpenPlayoffErrorCode =
  | 'UNAUTHORIZED'
  | 'TOURNAMENT_NOT_FOUND'
  | 'UNSUPPORTED_TOURNAMENT_FORMAT'
  | 'GROUPS_NOT_FOUND'
  | 'INVALID_GROUP_SIZE'
  | 'GROUP_NOT_COMPLETE'
  | 'REGISTRATION_ELIGIBILITY_BLOCKED'
  | 'PLAYOFF_ALREADY_EXISTS_OR_STARTED'
  | 'UNSUPPORTED_TIE_BREAKER'
  | 'OPEN_REQUIRES_MANUAL_RESOLUTION'
  | 'OPEN_GENERATION_ROLLED_BACK'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  format: string | null
  type?: string | null
  tournament_type?: string | null
  classification_rules: TournamentClassificationRules | null
}

type MatchRow = TournamentStandingMatch & {
  tournament_id: string
  club_id: string
  phase: string | null
}

export class OpenPlayoffGenerationError extends Error {
  code: OpenPlayoffErrorCode
  status: number
  details?: Record<string, unknown>

  constructor(code: OpenPlayoffErrorCode, message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.name = 'OpenPlayoffGenerationError'
    this.code = code
    this.status = status
    this.details = details
  }
}

function normalizeClassificationRules(value: unknown): TournamentClassificationRules | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as TournamentClassificationRules
}

function isOpenCompatibleTournament(tournament: TournamentRow) {
  const format = String(tournament.format ?? '').toUpperCase()
  const type = tournament.type ? String(tournament.type).toUpperCase() : null
  const legacyType = tournament.tournament_type ? String(tournament.tournament_type).toUpperCase() : null
  const compatibleFormat = format === 'ZONE_PLAYOFF' || format === 'GROUPS_ELIMINATION' || format === 'GROUPS_ELIM'
  const declaredTypes = [type, legacyType].filter(Boolean)
  return compatibleFormat && declaredTypes.length > 0 && declaredTypes.every((value) => value === 'OPEN')
}

function getPairKey(team1Id: string, team2Id: string) {
  return [team1Id, team2Id].sort().join(':')
}

function getExpectedPairKeys(groupTeams: TournamentGroupTeam[]) {
  const expectedPairs = new Set<string>()

  for (let firstIndex = 0; firstIndex < groupTeams.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < groupTeams.length; secondIndex += 1) {
      expectedPairs.add(getPairKey(groupTeams[firstIndex].team_id, groupTeams[secondIndex].team_id))
    }
  }

  return expectedPairs
}

function assertGroupsComplete(input: {
  groups: TournamentGroup[]
  groupTeams: TournamentGroupTeam[]
  matches: MatchRow[]
}) {
  for (const group of input.groups) {
    if (group.size !== 3 && group.size !== 4) {
      throw new OpenPlayoffGenerationError(
        'INVALID_GROUP_SIZE',
        `El grupo ${group.name} debe tener tamaño 3 o 4.`,
        409
      )
    }

    const groupTeams = input.groupTeams.filter((team) => team.group_id === group.id)
    if (groupTeams.length !== group.size) {
      throw new OpenPlayoffGenerationError(
        'GROUP_NOT_COMPLETE',
        `El grupo ${group.name} no tiene la cantidad de equipos esperada.`,
        409
      )
    }

    const groupTeamIds = new Set(groupTeams.map((team) => team.team_id))
    const expectedPairs = getExpectedPairKeys(groupTeams)
    const playedPairs = new Map<string, number>()
    const invalidPairs: string[] = []

    for (const match of input.matches) {
      if (match.group_id !== group.id || String(match.phase ?? '').toUpperCase() !== 'GROUP') continue
      if (match.status !== 'PLAYED' || !match.winner_team_id) continue
      const pairKey = getPairKey(match.team1_id, match.team2_id)
      if (!groupTeamIds.has(match.team1_id) || !groupTeamIds.has(match.team2_id) || !expectedPairs.has(pairKey)) {
        invalidPairs.push(pairKey)
        continue
      }
      playedPairs.set(pairKey, (playedPairs.get(pairKey) ?? 0) + 1)
    }

    const missingPairs = Array.from(expectedPairs).filter((pairKey) => !playedPairs.has(pairKey))
    const duplicatePairs = Array.from(playedPairs.entries())
      .filter(([, count]) => count > 1)
      .map(([pairKey]) => pairKey)

    if (missingPairs.length > 0 || duplicatePairs.length > 0 || invalidPairs.length > 0) {
      const details = [
        missingPairs.length ? `faltantes: ${missingPairs.length}` : null,
        duplicatePairs.length ? `duplicados: ${duplicatePairs.length}` : null,
        invalidPairs.length ? `inválidos: ${invalidPairs.length}` : null,
      ].filter(Boolean).join(', ')

      throw new OpenPlayoffGenerationError(
        'GROUP_NOT_COMPLETE',
        `El grupo ${group.name} no tiene una matriz de cruces válida (${details}).`,
        409
      )
    }
  }
}

function hasBlockingBracketResolution(bracketPlan: { manualResolutionReasons: Array<{ code: string }> }) {
  return bracketPlan.manualResolutionReasons.some((reason) => reason.code !== 'SAME_GROUP_CONFLICTS')
}

async function rollbackCreatedMatches(matchIds: string[]) {
  if (matchIds.length === 0) return

  const { error } = await supabaseAdmin
    .from('tournament_matches')
    .delete()
    .in('id', matchIds)

  if (error) throw new Error(`No pude revertir partidos creados: ${error.message}`)
}

export async function generateOpenFirstRoundPlayoff(input: {
  userId: string
  clubId: string
  tournamentId: string
}) {
  assertServiceRole()

  const canManage = await isClubAdmin(input.userId, input.clubId)
  if (!canManage) {
    throw new OpenPlayoffGenerationError('UNAUTHORIZED', 'No autorizado para generar playoff OPEN.', 403)
  }

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name,format,type,tournament_type,classification_rules')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (tournamentError) throw new Error(`No pude validar el torneo: ${tournamentError.message}`)
  if (!tournament) {
    throw new OpenPlayoffGenerationError('TOURNAMENT_NOT_FOUND', 'Torneo no encontrado para este club.', 404)
  }

  const tournamentRow = tournament as TournamentRow
  if (!isOpenCompatibleTournament(tournamentRow)) {
    throw new OpenPlayoffGenerationError(
      'UNSUPPORTED_TOURNAMENT_FORMAT',
      'La generación OPEN requiere un torneo OPEN con formato de grupos y eliminación.',
      422
    )
  }

  const eligibilityGate = await getTournamentRegistrationEligibilityGate({
    clubId: input.clubId,
    tournamentId: input.tournamentId,
  })
  if (eligibilityGate.blockedCount > 0) {
    throw new OpenPlayoffGenerationError(
      'REGISTRATION_ELIGIBILITY_BLOCKED',
      `Hay ${eligibilityGate.blockedCount} parejas que no pueden competir todavía.`,
      409,
      {
        count: eligibilityGate.count,
        blockedCount: eligibilityGate.blockedCount,
        blockedRegistrationIds: eligibilityGate.blockedRegistrationIds,
      }
    )
  }

  const { data: groups, error: groupsError } = await supabaseAdmin
    .from('tournament_groups')
    .select('id,tournament_id,name,size,order')
    .eq('tournament_id', input.tournamentId)
    .order('order', { ascending: true })

  if (groupsError) throw new Error(`No pude leer grupos del torneo: ${groupsError.message}`)

  const groupRows = (groups ?? []) as TournamentGroup[]
  if (groupRows.length === 0) {
    throw new OpenPlayoffGenerationError('GROUPS_NOT_FOUND', 'El torneo no tiene grupos generados.', 409)
  }

  const { data: groupTeams, error: groupTeamsError } = await supabaseAdmin
    .from('tournament_group_teams')
    .select('group_id,tournament_id,team_id,seed,position')
    .eq('tournament_id', input.tournamentId)

  if (groupTeamsError) throw new Error(`No pude leer equipos de grupos: ${groupTeamsError.message}`)

  const { data: matches, error: matchesError } = await supabaseAdmin
    .from('tournament_matches')
    .select('id,tournament_id,club_id,group_id,phase,status,team1_id,team2_id,winner_team_id,score')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)

  if (matchesError) throw new Error(`No pude leer partidos del torneo: ${matchesError.message}`)

  const matchRows = (matches ?? []) as MatchRow[]
  const existingPlayoff = matchRows.find((match) => String(match.phase ?? '').toUpperCase() !== 'GROUP')
  if (existingPlayoff) {
    throw new OpenPlayoffGenerationError(
      'PLAYOFF_ALREADY_EXISTS_OR_STARTED',
      'El playoff ya existe o ya fue iniciado para este torneo.',
      409
    )
  }

  const groupTeamRows = (groupTeams ?? []) as TournamentGroupTeam[]
  assertGroupsComplete({ groups: groupRows, groupTeams: groupTeamRows, matches: matchRows })

  const classificationRules = normalizeClassificationRules(tournamentRow.classification_rules)
  let standings
  try {
    standings = calculateTournamentGroupStandings({
      groups: groupRows,
      groupTeams: groupTeamRows,
      matches: matchRows.filter((match) => String(match.phase ?? '').toUpperCase() === 'GROUP' && match.status === 'PLAYED'),
      classificationRules,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('head_to_head')) {
      throw new OpenPlayoffGenerationError('UNSUPPORTED_TIE_BREAKER', error.message, 422)
    }
    throw error
  }

  let qualificationPlan
  let bracketPlan
  try {
    qualificationPlan = buildOpenQualificationPlan(standings)
    bracketPlan = buildOpenBracketPlan(qualificationPlan)
  } catch (error: unknown) {
    if (error instanceof OpenTournamentEngineError) {
      throw new OpenPlayoffGenerationError('OPEN_REQUIRES_MANUAL_RESOLUTION', error.message, 422)
    }
    throw error
  }

  if (qualificationPlan.requiresManualResolution || hasBlockingBracketResolution(bracketPlan)) {
    throw new OpenPlayoffGenerationError(
      'OPEN_REQUIRES_MANUAL_RESOLUTION',
      'El playoff OPEN requiere resolución manual antes de persistir partidos.',
      422
    )
  }

  const matchInputs = buildOpenFirstRoundMatchInputs({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    bracketPlan,
  })

  const createdMatches = []
  const createdMatchIds: string[] = []
  try {
    for (const matchInput of matchInputs) {
      const { match } = await createMatch({
        tournamentId: matchInput.tournamentId,
        clubId: matchInput.clubId,
        groupId: matchInput.groupId,
        team1Id: matchInput.team1Id,
        team2Id: matchInput.team2Id,
        phase: matchInput.phase,
        round: matchInput.round,
        matchOrder: matchInput.matchOrder,
      })
      createdMatches.push(match)
      if (match?.id) createdMatchIds.push(match.id as string)
    }
  } catch (error: unknown) {
    await rollbackCreatedMatches(createdMatchIds)
    const detail = error instanceof Error ? error.message : 'Error desconocido.'
    throw new OpenPlayoffGenerationError(
      'OPEN_GENERATION_ROLLED_BACK',
      `Falló la generación OPEN y se revirtieron los partidos creados en esta ejecución. ${detail}`,
      500
    )
  }

  return {
    tournament: {
      id: tournamentRow.id,
      club_id: tournamentRow.club_id,
      name: tournamentRow.name,
      format: tournamentRow.format,
      type: tournamentRow.type ?? tournamentRow.tournament_type ?? null,
    },
    phase: bracketPlan.startPhase,
    createdCount: createdMatches.length,
    matches: createdMatches,
    meta: {
      bracketSize: bracketPlan.bracketSize,
      groupCount: qualificationPlan.groupCount,
      directQualifiers: qualificationPlan.directQualifiers,
      bestThirdsCount: qualificationPlan.bestThirdsCount,
      byeCount: qualificationPlan.byeCount,
      assignedByes: bracketPlan.assignedByes.length,
      conflictScore: bracketPlan.conflictScore,
      warnings: bracketPlan.sameGroupConflicts.length > 0
        ? [{
            code: 'SAME_GROUP_CONFLICTS',
            message: 'El bracket conserva cruces del mismo grupo luego de minimizar conflictos.',
            conflicts: bracketPlan.sameGroupConflicts,
          }]
        : [],
    },
  }
}
