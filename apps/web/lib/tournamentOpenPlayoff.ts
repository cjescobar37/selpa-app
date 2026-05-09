import { isClubAdmin } from '@/lib/clubMembershipServer'
import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'
import { createMatch } from '@/lib/tournamentMatches'
import {
  calculateTournamentGroupStandings,
  type GroupStandings,
  type TournamentClassificationRules,
  type TournamentGroup,
  type TournamentGroupTeam,
  type TournamentStandingMatch,
} from '@/lib/tournamentStandings'
import { buildOpenBracketPlan } from '@/lib/tournamentOpen/bracket'
import {
  buildGeneralOpenBracketPlan,
  defaultOpenQualificationConfig,
  validateBracketPlan,
  type OpenGeneralBracketPlan,
  type OpenGeneralGroupStandings,
  type OpenQualificationConfig,
} from '@/lib/tournamentOpen/generalEngine'
import { buildOpenFirstRoundMatchInputs } from '@/lib/tournamentOpen/persistence'
import { buildOpenQualificationPlan } from '@/lib/tournamentOpen/qualification'
import { OpenTournamentEngineError, type OpenBracketPlan, type OpenPersistableMatchInput, type OpenQualificationPlan } from '@/lib/tournamentOpen/types'
import { getTournamentRegistrationEligibilityGate } from '@/lib/tournamentRegistrationEligibility'
import { evaluatePlayoffSchedulingPlan } from '@/lib/tournamentPlayoffSchedulingDiagnostics'
import { normalizeScheduleConfig, normalizeTournamentCourts, readMatchScheduleAssignments, type MatchScheduleAssignment } from '@/lib/tournamentSchedule'

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
  | 'PLAYOFF_REGENERATION_BLOCKED'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  format: string | null
  type?: string | null
  tournament_type?: string | null
  classification_rules: TournamentClassificationRules | null
  start_date: string | null
  end_date: string | null
  rules_json: Record<string, unknown> | null
  rules: Record<string, unknown> | null
}

type MatchRow = TournamentStandingMatch & {
  id: string
  tournament_id: string
  club_id: string
  phase: string | null
  status: string | null
  score: Record<string, unknown> | null
  winner_team_id: string | null
}

const OPEN_GENERAL_QUALIFICATION_CONFIG = {
  ...defaultOpenQualificationConfig,
  fixedQualifiersPerGroup: 2,
  bestThirdsToQualify: 2,
  useNormalizedStats: 'auto',
  byeAssignment: 'GLOBAL_SEED',
  avoidSameGroupFirstRound: true,
  avoidTopSeedsEarly: true,
} satisfies OpenQualificationConfig

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

function normalizeClassificationRules(value: unknown, tournamentRules?: unknown): TournamentClassificationRules | null {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value as TournamentClassificationRules : {}
  const safeRules = normalizeObject(tournamentRules)
  if (safeRules.group_tiebreakers) {
    return {
      ...base,
      group_tiebreakers: safeRules.group_tiebreakers as TournamentClassificationRules['group_tiebreakers'],
    }
  }
  return Object.keys(base).length > 0 ? base : null
}

function toGeneralOpenStandings(standings: GroupStandings[]): OpenGeneralGroupStandings[] {
  return standings.map((groupStandings) => ({
    groupId: groupStandings.group.id,
    groupName: groupStandings.group.name,
    groupOrder: groupStandings.group.order ?? null,
    standings: groupStandings.standings.map((row, index) => ({
      teamId: row.team_id,
      groupId: row.group_id,
      groupName: groupStandings.group.name,
      groupOrder: groupStandings.group.order ?? null,
      groupPosition: index + 1,
      seed: row.seed,
      played: row.played,
      wins: row.wins,
      points: row.match_points,
      setDiff: row.set_difference,
      gameDiff: row.game_difference,
      gamesFor: row.games_for,
    })),
  }))
}

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value))
}

function duplicatedValues(values: string[]) {
  const seen = new Set<string>()
  const duplicated = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) duplicated.add(value)
    seen.add(value)
  }

  return [...duplicated]
}

function debugGeneralOpenBracketPlanDiagnostic(input: {
  standings: GroupStandings[]
  qualificationPlan: OpenQualificationPlan
  bracketPlan: OpenBracketPlan
  currentFirstRoundMatches: number
}) {
  if (process.env.NODE_ENV !== 'development') return

  try {
    const generalPlan = buildGeneralOpenBracketPlan(
      toGeneralOpenStandings(input.standings),
      OPEN_GENERAL_QUALIFICATION_CONFIG
    )
    const currentQualifiedTeamIds = input.qualificationPlan.playoffTeams.map((team) => team.teamId)
    const generalQualifiedTeamIds = generalPlan.qualifiedTeams.map((team) => team.teamId)
    const currentByeTeamIds = input.qualificationPlan.selectedByes.map((team) => team.teamId)
    const generalByeTeamIds = generalPlan.byeTeams.map((team) => team.teamId)

    console.debug('[PAMPrax] OPEN general bracket plan diagnostic', {
      current: {
        totalQualified: input.qualificationPlan.playoffTeams.length,
        bracketSize: input.bracketPlan.bracketSize,
        byes: input.qualificationPlan.byes,
        firstRoundMatches: input.currentFirstRoundMatches,
        byeTeamIds: currentByeTeamIds,
        duplicatedQualifiedTeamIds: duplicatedValues(currentQualifiedTeamIds),
      },
      general: {
        totalQualified: generalPlan.totalQualified,
        bracketSize: generalPlan.bracketSize,
        byes: generalPlan.byes,
        firstRoundMatches: generalPlan.firstRoundMatches.length,
        bracketSlots: generalPlan.bracketSlots.length,
        byeTeamIds: generalByeTeamIds,
        duplicatedQualifiedTeamIds: duplicatedValues(generalQualifiedTeamIds),
        warnings: generalPlan.warnings,
      },
      diff: {
        totalQualified: generalPlan.totalQualified - input.qualificationPlan.playoffTeams.length,
        bracketSize: generalPlan.bracketSize - input.bracketPlan.bracketSize,
        byes: generalPlan.byes - input.qualificationPlan.byes,
        firstRoundMatches: generalPlan.firstRoundMatches.length - input.currentFirstRoundMatches,
        qualifiedOnlyInCurrent: difference(currentQualifiedTeamIds, generalQualifiedTeamIds),
        qualifiedOnlyInGeneral: difference(generalQualifiedTeamIds, currentQualifiedTeamIds),
        byeOnlyInCurrent: difference(currentByeTeamIds, generalByeTeamIds),
        byeOnlyInGeneral: difference(generalByeTeamIds, currentByeTeamIds),
      },
    })
  } catch (error: unknown) {
    console.debug('[PAMPrax] OPEN general bracket plan diagnostic failed', {
      message: error instanceof Error ? error.message : 'Error desconocido.',
    })
  }
}

function toGeneralFirstRoundMatchInputs(input: {
  tournamentId: string
  clubId: string
  generalPlan: OpenGeneralBracketPlan
}): OpenPersistableMatchInput[] {
  return input.generalPlan.firstRoundMatches.map((match) => ({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    groupId: null,
    team1Id: match.team1.teamId,
    team2Id: match.team2.teamId,
    phase: match.phase,
    round: 1,
    matchOrder: match.matchOrder,
  }))
}

function toPersistableGeneralPlayoffPlan(generalPlan: OpenGeneralBracketPlan) {
  return {
    version: 1,
    source: 'general_engine',
    qualification_config: OPEN_GENERAL_QUALIFICATION_CONFIG,
    total_qualified: generalPlan.totalQualified,
    bracket_size: generalPlan.bracketSize,
    byes: generalPlan.byes,
    bye_teams: generalPlan.byeTeams.map((team) => ({
      team_id: team.teamId,
      global_seed: team.globalSeed,
      group_id: team.groupId,
      group_name: team.groupName ?? null,
      group_position: team.groupPosition,
      seed: team.seed,
    })),
    global_seeds: generalPlan.globalSeeds.map((team) => ({
      team_id: team.teamId,
      global_seed: team.globalSeed,
      group_id: team.groupId,
      group_name: team.groupName ?? null,
      group_position: team.groupPosition,
      qualification_reason: team.qualificationReason,
      seed: team.seed,
      ranking: team.ranking,
    })),
    bracket_slots: generalPlan.bracketSlots.map((slot) => ({
      position: slot.position,
      pair_order: slot.pairOrder,
      pair_slot: slot.pairSlot,
      advances_to_match_order: slot.advancesToMatchOrder,
      is_bye_slot: slot.isByeSlot,
      team_id: slot.team?.teamId ?? null,
      global_seed: slot.team?.globalSeed ?? null,
    })),
    first_round_matches: generalPlan.firstRoundMatches.map((match) => ({
      phase: match.phase,
      match_order: match.matchOrder,
      bracket_pair_order: match.bracketPairOrder,
      slot_positions: [match.slot1.position, match.slot2.position],
      team1_id: match.team1.teamId,
      team2_id: match.team2.teamId,
      same_group_conflict: match.sameGroupConflict,
    })),
    warnings: generalPlan.warnings,
  }
}

function buildGeneralOpenPlanSelection(input: {
  tournamentId: string
  clubId: string
  standings: GroupStandings[]
}) {
  try {
    const generalPlan = buildGeneralOpenBracketPlan(
      toGeneralOpenStandings(input.standings),
      OPEN_GENERAL_QUALIFICATION_CONFIG
    )
    const validation = validateBracketPlan(generalPlan)
    const qualifiedTeamIds = generalPlan.globalSeeds.map((team) => team.teamId)
    const duplicatedTeamIds = duplicatedValues(qualifiedTeamIds)
    const gateFailures = [
      validation.isValid ? null : 'validation_not_valid',
      generalPlan.totalQualified > 0 ? null : 'empty_total_qualified',
      generalPlan.firstRoundMatches.length > 0 ? null : 'empty_first_round_matches',
      duplicatedTeamIds.length === 0 ? null : 'duplicated_teams',
      generalPlan.bracketSlots.length === generalPlan.bracketSize ? null : 'invalid_bracket_slots_count',
    ].filter((reason): reason is string => Boolean(reason))

    if (gateFailures.length > 0) {
      return {
        useGeneralPlan: false,
        fallbackReason: gateFailures.join(', '),
        generalPlan,
        validation,
        duplicatedTeamIds,
      }
    }

    return {
      useGeneralPlan: true,
      generalPlan,
      validation,
      duplicatedTeamIds,
      matchInputs: toGeneralFirstRoundMatchInputs({
        tournamentId: input.tournamentId,
        clubId: input.clubId,
        generalPlan,
      }),
      persistedPlan: toPersistableGeneralPlayoffPlan(generalPlan),
    }
  } catch (error: unknown) {
    return {
      useGeneralPlan: false,
      fallbackReason: error instanceof Error ? error.message : 'Error desconocido al validar generalPlan.',
    }
  }
}

function debugGeneralOpenPlanFallback(reason: string | null | undefined) {
  if (process.env.NODE_ENV !== 'development') return
  console.debug('[PAMPrax] OPEN general bracket plan fallback', {
    reason: reason ?? 'generalPlan no pasó el gate de seguridad.',
  })
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

  if (groupTeams.length === 4) {
    const sortedBySeed = [...groupTeams].sort((left, right) => {
      if (left.seed !== right.seed) return left.seed - right.seed
      if ((left.position ?? Number.MAX_SAFE_INTEGER) !== (right.position ?? Number.MAX_SAFE_INTEGER)) {
        return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
      }
      return left.team_id.localeCompare(right.team_id)
    })

    const reducedPairs: Array<[number, number]> = [
      [0, 2], // 1 vs 3
      [1, 3], // 2 vs 4
      [0, 3], // 1 vs 4
      [2, 1], // 3 vs 2
    ]

    reducedPairs.forEach(([firstIndex, secondIndex]) => {
      const firstTeam = sortedBySeed[firstIndex]
      const secondTeam = sortedBySeed[secondIndex]
      if (firstTeam && secondTeam) {
        expectedPairs.add(getPairKey(firstTeam.team_id, secondTeam.team_id))
      }
    })

    return expectedPairs
  }

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

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function hasCompletePlayoffScheduleConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const safeValue = value as Record<string, unknown>
  const playoff = safeValue.playoff
  if (!playoff || typeof playoff !== 'object' || Array.isArray(playoff)) return false
  const safePlayoff = playoff as Record<string, unknown>
  return Boolean(
    typeof safeValue.match_duration_minutes === 'number' && safeValue.match_duration_minutes > 0 &&
    typeof safePlayoff.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(safePlayoff.date) &&
    typeof safePlayoff.start_time === 'string' && /^\d{2}:\d{2}$/.test(safePlayoff.start_time) &&
    typeof safePlayoff.end_time === 'string' && /^\d{2}:\d{2}$/.test(safePlayoff.end_time)
  )
}

function hasScorePayload(score: unknown) {
  return Boolean(score && typeof score === 'object' && !Array.isArray(score) && Object.keys(score).length > 0)
}

async function rollbackCreatedMatches(matchIds: string[]) {
  if (matchIds.length === 0) return

  const { error } = await supabaseAdmin
    .from('tournament_matches')
    .delete()
    .in('id', matchIds)

  if (error) throw new Error(`No pude revertir partidos creados: ${error.message}`)
}

function removePlayoffScheduleState(input: {
  rules: Record<string, unknown>
  playoffMatchIds: string[]
}) {
  const playoffMatchIdSet = new Set(input.playoffMatchIds)
  const currentAssignments = readMatchScheduleAssignments(input.rules.match_schedule_assignments)
  const nextAssignments: Record<string, MatchScheduleAssignment> = {}

  for (const [matchId, assignment] of Object.entries(currentAssignments)) {
    if (!playoffMatchIdSet.has(matchId)) {
      nextAssignments[matchId] = assignment
    }
  }

  const { playoff_plan: _playoffPlan, ...nextRules } = input.rules
  nextRules.match_schedule_assignments = nextAssignments
  return nextRules
}

async function restoreLegacyPlayoffState(input: {
  tournamentId: string
  clubId: string
  rules: Record<string, unknown>
  matches: MatchRow[]
}) {
  await supabaseAdmin
    .from('tournament_matches')
    .delete()
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .neq('phase', 'GROUP')

  if (input.matches.length > 0) {
    const { error: restoreMatchesError } = await supabaseAdmin
      .from('tournament_matches')
      .insert(input.matches)

    if (restoreMatchesError) {
      throw new Error(`No pude restaurar el playoff anterior: ${restoreMatchesError.message}`)
    }
  }

  const { error: restoreRulesError } = await supabaseAdmin
    .from('tournaments')
    .update({
      rules_json: input.rules,
      rules: input.rules,
    })
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)

  if (restoreRulesError) {
    throw new Error(`No pude restaurar rules_json anterior: ${restoreRulesError.message}`)
  }
}

export async function regenerateOpenPlayoffWithGeneralEngine(input: {
  userId: string
  clubId: string
  tournamentId: string
}) {
  assertServiceRole()

  const canManage = await isClubAdmin(input.userId, input.clubId)
  if (!canManage) {
    throw new OpenPlayoffGenerationError('UNAUTHORIZED', 'No autorizado para regenerar playoff OPEN.', 403)
  }

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name,format,type,tournament_type,classification_rules,start_date,end_date,rules_json,rules')
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
      'La regeneración OPEN requiere un torneo OPEN con formato de grupos y eliminación.',
      422
    )
  }

  const { data: playoffMatches, error: matchesError } = await supabaseAdmin
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .neq('phase', 'GROUP')

  if (matchesError) throw new Error(`No pude leer partidos de playoff: ${matchesError.message}`)

  const playoffRows = (playoffMatches ?? []) as MatchRow[]
  const blockingMatches = playoffRows.filter((match) => {
    const status = String(match.status ?? '').toUpperCase()
    return status === 'PLAYED' ||
      status === 'IN_PROGRESS' ||
      Boolean(match.winner_team_id) ||
      hasScorePayload(match.score)
  })

  if (blockingMatches.length > 0) {
    throw new OpenPlayoffGenerationError(
      'PLAYOFF_REGENERATION_BLOCKED',
      'No se puede regenerar el playoff porque ya hay resultados, ganadores o partidos en curso.',
      409,
      {
        blockingMatchIds: blockingMatches.map((match) => match.id),
      }
    )
  }

  const currentRules = normalizeObject(tournamentRow.rules_json ?? tournamentRow.rules ?? {})
  const oldRules = { ...currentRules }
  const oldPlayoffMatches = [...playoffRows]
  const oldPlayoffMatchIds = oldPlayoffMatches.map((match) => match.id)
  const oldAssignments = readMatchScheduleAssignments(currentRules.match_schedule_assignments)
  const removedScheduleAssignmentCount = oldPlayoffMatchIds.filter((matchId) => Boolean(oldAssignments[matchId])).length
  const cleanedRules = removePlayoffScheduleState({
    rules: currentRules,
    playoffMatchIds: oldPlayoffMatchIds,
  })

  try {
    if (oldPlayoffMatchIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('tournament_matches')
        .delete()
        .in('id', oldPlayoffMatchIds)

      if (deleteError) throw new Error(`No pude borrar el playoff anterior: ${deleteError.message}`)
    }

    const { error: cleanRulesError } = await supabaseAdmin
      .from('tournaments')
      .update({
        rules_json: cleanedRules,
        rules: cleanedRules,
      })
      .eq('id', input.tournamentId)
      .eq('club_id', input.clubId)

    if (cleanRulesError) throw new Error(`No pude limpiar rules_json antes de regenerar: ${cleanRulesError.message}`)

    const generated = await generateOpenFirstRoundPlayoff(input)
    const { data: refreshedTournament, error: refreshedTournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('rules_json,rules')
      .eq('id', input.tournamentId)
      .eq('club_id', input.clubId)
      .maybeSingle()

    if (refreshedTournamentError) throw new Error(`No pude validar el playoff regenerado: ${refreshedTournamentError.message}`)

    const refreshedRules = normalizeObject(refreshedTournament?.rules_json ?? refreshedTournament?.rules ?? {})
    const playoffPlan = normalizeObject(refreshedRules.playoff_plan)

    return {
      ...generated,
      regeneration: {
        deletedPlayoffMatches: oldPlayoffMatchIds.length,
        removedScheduleAssignments: removedScheduleAssignmentCount,
        playoffPlan: {
          source: playoffPlan.source ?? null,
          bracketSize: playoffPlan.bracket_size ?? null,
          byes: playoffPlan.byes ?? null,
          firstRoundMatches: Array.isArray(playoffPlan.first_round_matches) ? playoffPlan.first_round_matches.length : null,
          bracketSlots: Array.isArray(playoffPlan.bracket_slots) ? playoffPlan.bracket_slots.length : null,
        },
      },
    }
  } catch (error: unknown) {
    await restoreLegacyPlayoffState({
      tournamentId: input.tournamentId,
      clubId: input.clubId,
      rules: oldRules,
      matches: oldPlayoffMatches,
    })

    const detail = error instanceof Error ? error.message : 'Error desconocido.'
    throw new OpenPlayoffGenerationError(
      'OPEN_GENERATION_ROLLED_BACK',
      `Falló la regeneración OPEN y se restauró el playoff anterior. ${detail}`,
      500
    )
  }
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
    .select('id,club_id,name,format,type,tournament_type,classification_rules,start_date,end_date,rules_json,rules')
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

  const currentRules = normalizeObject(tournamentRow.rules_json ?? tournamentRow.rules ?? {})
  const classificationRules = normalizeClassificationRules(tournamentRow.classification_rules, currentRules)
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

  const legacyMatchInputs = buildOpenFirstRoundMatchInputs({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    bracketPlan,
  })
  debugGeneralOpenBracketPlanDiagnostic({
    standings,
    qualificationPlan,
    bracketPlan,
    currentFirstRoundMatches: legacyMatchInputs.length,
  })
  const generalSelection = buildGeneralOpenPlanSelection({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    standings,
  })
  if (!generalSelection.useGeneralPlan) {
    debugGeneralOpenPlanFallback(generalSelection.fallbackReason)
  }
  const matchInputs = generalSelection.useGeneralPlan && generalSelection.matchInputs
    ? generalSelection.matchInputs
    : legacyMatchInputs
  const selectedStartPhase = generalSelection.useGeneralPlan && generalSelection.generalPlan
    ? generalSelection.generalPlan.firstRoundMatches[0]?.phase ?? bracketPlan.startPhase
    : bracketPlan.startPhase
  const selectedPlayoffPlan = generalSelection.useGeneralPlan && generalSelection.persistedPlan
    ? generalSelection.persistedPlan
    : null

  const scheduleConfig = normalizeScheduleConfig((currentRules as Record<string, unknown>).schedule_config, {
    startDate: tournamentRow.start_date,
    endDate: tournamentRow.end_date ?? tournamentRow.start_date,
  })
  const tournamentCourts = normalizeTournamentCourts((currentRules as Record<string, unknown>).tournament_courts)
  const schedulingDecision = evaluatePlayoffSchedulingPlan({
    tournamentId: input.tournamentId,
    playoffType: 'OPEN',
    candidateMatches: matchInputs.map((matchInput) => ({
      id: `${matchInput.phase}:${matchInput.matchOrder}`,
      team1Id: matchInput.team1Id,
      team2Id: matchInput.team2Id,
      phase: matchInput.phase,
      round: matchInput.round,
      matchOrder: matchInput.matchOrder,
    })),
    courts: tournamentCourts,
    scheduleConfig,
    scheduleConfigReady: hasCompletePlayoffScheduleConfig((currentRules as Record<string, unknown>).schedule_config),
  })

  const createdMatches = []
  const createdMatchIds: string[] = []
  const createdAssignments: MatchScheduleAssignment[] = []
  try {
    for (const matchInput of matchInputs) {
      const candidateId = `${matchInput.phase}:${matchInput.matchOrder}`
      const assignment = schedulingDecision.shouldApplySchedule
        ? schedulingDecision.assignmentsByMatchId[candidateId]
        : null
      const { match } = await createMatch({
        tournamentId: matchInput.tournamentId,
        clubId: matchInput.clubId,
        groupId: matchInput.groupId,
        team1Id: matchInput.team1Id,
        team2Id: matchInput.team2Id,
        phase: matchInput.phase,
        round: matchInput.round,
        matchOrder: matchInput.matchOrder,
        scheduledAt: assignment?.scheduled_at ?? null,
      })
      createdMatches.push(match)
      if (match?.id) {
        createdMatchIds.push(match.id as string)
        if (assignment) {
          createdAssignments.push({
            ...assignment,
            match_id: String(match.id),
          })
        }
      }
    }

    if (createdAssignments.length > 0 || selectedPlayoffPlan) {
      const nextRules: Record<string, unknown> = {
        ...currentRules,
        ...(selectedPlayoffPlan ? { playoff_plan: selectedPlayoffPlan } : {}),
      }

      if (createdAssignments.length > 0) {
        const currentAssignments = readMatchScheduleAssignments(currentRules.match_schedule_assignments)
        const nextAssignments = { ...currentAssignments }
        for (const assignment of createdAssignments) {
          nextAssignments[assignment.match_id] = assignment
        }
        nextRules.match_schedule_assignments = nextAssignments
      }

      const { error: schedulePersistError } = await supabaseAdmin
        .from('tournaments')
        .update({
          rules_json: nextRules,
          rules: nextRules,
        })
        .eq('id', input.tournamentId)
        .eq('club_id', input.clubId)

      if (schedulePersistError) {
        throw new Error(`No pude guardar la planificación de playoff: ${schedulePersistError.message}`)
      }
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
    phase: selectedStartPhase,
    createdCount: createdMatches.length,
    matches: createdMatches,
    meta: {
      bracketSize: generalSelection.useGeneralPlan && generalSelection.generalPlan
        ? generalSelection.generalPlan.bracketSize
        : bracketPlan.bracketSize,
      groupCount: qualificationPlan.groupCount,
      directQualifiers: generalSelection.useGeneralPlan && generalSelection.generalPlan
        ? generalSelection.generalPlan.qualifiedTeams.filter((team) => team.qualificationReason === 'FIXED_GROUP_POSITION').length
        : qualificationPlan.directQualifiers,
      bestThirdsCount: generalSelection.useGeneralPlan && generalSelection.generalPlan
        ? generalSelection.generalPlan.qualifiedTeams.filter((team) => team.qualificationReason === 'BEST_THIRD').length
        : qualificationPlan.bestThirdsCount,
      byeCount: generalSelection.useGeneralPlan && generalSelection.generalPlan
        ? generalSelection.generalPlan.byes
        : qualificationPlan.byeCount,
      assignedByes: generalSelection.useGeneralPlan && generalSelection.generalPlan
        ? generalSelection.generalPlan.byeTeams.length
        : bracketPlan.assignedByes.length,
      planSource: generalSelection.useGeneralPlan ? 'general_engine' : 'legacy_engine',
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
