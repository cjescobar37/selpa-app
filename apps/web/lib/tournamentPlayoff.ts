import { createMatch } from '@/lib/tournamentMatches'
import {
  calculateTournamentGroupStandings,
  type GroupStandings,
  type TournamentClassificationRules,
  type TournamentGroup,
  type TournamentGroupTeam,
  type TournamentStandingMatch,
} from '@/lib/tournamentStandings'
import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'
import { evaluatePlayoffSchedulingPlan } from '@/lib/tournamentPlayoffSchedulingDiagnostics'
import { normalizeScheduleConfig, normalizeTournamentCourts, readMatchScheduleAssignments, type MatchScheduleAssignment } from '@/lib/tournamentSchedule'

type PlayoffErrorCode =
  | 'TOURNAMENT_NOT_FOUND'
  | 'UNSUPPORTED_TOURNAMENT_FORMAT'
  | 'UNSUPPORTED_PLAYOFF_SHAPE'
  | 'PLAYOFF_ALREADY_EXISTS_OR_STARTED'
  | 'UNSUPPORTED_TIE_BREAKER'
  | 'SEMIFINALS_NOT_FOUND'
  | 'SEMIFINALS_NOT_COMPLETED'
  | 'FINAL_ALREADY_EXISTS'
  | 'INVALID_FINAL_TEAMS'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  format: string | null
  classification_rules: TournamentClassificationRules | null
  start_date: string | null
  end_date: string | null
  rules_json: Record<string, unknown> | null
  rules: Record<string, unknown> | null
}

type MatchRow = TournamentStandingMatch & {
  tournament_id: string
  club_id: string
}

type PlayoffMatchRow = {
  id: string
  tournament_id: string
  club_id: string
  team1_id: string | null
  team2_id: string | null
  phase: string | null
  status: string | null
  winner_team_id: string | null
  match_order: number | null
  created_at: string | null
}

export class PlayoffGenerationError extends Error {
  code: PlayoffErrorCode
  status: number

  constructor(code: PlayoffErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'PlayoffGenerationError'
    this.code = code
    this.status = status
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

function isZonePlayoffLikeFormat(format: string | null | undefined) {
  return format === 'ZONE_PLAYOFF' || format === 'GROUPS_ELIMINATION'
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

function assertSupportedShape(standings: GroupStandings[]) {
  if (standings.length !== 2) {
    throw new PlayoffGenerationError(
      'UNSUPPORTED_PLAYOFF_SHAPE',
      'La generación automática inicial solo soporta exactamente 2 grupos con 2 clasificados por grupo.'
    )
  }

  const [firstGroup, secondGroup] = standings
  const totalQualifiers = firstGroup.qualifiers.length + secondGroup.qualifiers.length
  if (firstGroup.qualifiers.length !== 2 || secondGroup.qualifiers.length !== 2 || totalQualifiers !== 4) {
    throw new PlayoffGenerationError(
      'UNSUPPORTED_PLAYOFF_SHAPE',
      'La generación automática inicial requiere exactamente 2 clasificados por grupo y 4 clasificados totales.'
    )
  }
}

export async function generateZonePlayoffSemifinals(input: { clubId: string; tournamentId: string }) {
  assertServiceRole()

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name,format,classification_rules,start_date,end_date,rules_json,rules')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (tournamentError) throw new Error(`No pude validar el torneo: ${tournamentError.message}`)
  if (!tournament) {
    throw new PlayoffGenerationError('TOURNAMENT_NOT_FOUND', 'Torneo no encontrado para este club.', 404)
  }

  const tournamentRow = tournament as TournamentRow
  if (!isZonePlayoffLikeFormat(tournamentRow.format)) {
    throw new PlayoffGenerationError(
      'UNSUPPORTED_TOURNAMENT_FORMAT',
      'La generación automática de playoff solo está habilitada para torneos por grupos con eliminación.'
    )
  }

  const { data: matches, error: matchesError } = await supabaseAdmin
    .from('tournament_matches')
    .select('id,tournament_id,club_id,group_id,phase,status,team1_id,team2_id,winner_team_id,score')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)

  if (matchesError) throw new Error(`No pude leer partidos del torneo: ${matchesError.message}`)

  const matchRows = (matches ?? []) as MatchRow[]
  const existingPlayoff = matchRows.find((match) => String(match.phase ?? '').toUpperCase() !== 'GROUP')
  if (existingPlayoff) {
    throw new PlayoffGenerationError(
      'PLAYOFF_ALREADY_EXISTS_OR_STARTED',
      'El playoff ya existe o ya fue iniciado para este torneo.',
      409
    )
  }

  const { data: groups, error: groupsError } = await supabaseAdmin
    .from('tournament_groups')
    .select('id,tournament_id,name,size,order')
    .eq('tournament_id', input.tournamentId)
    .order('order', { ascending: true })

  if (groupsError) throw new Error(`No pude leer grupos del torneo: ${groupsError.message}`)

  const groupRows = (groups ?? []) as TournamentGroup[]
  if (groupRows.length !== 2) {
    throw new PlayoffGenerationError(
      'UNSUPPORTED_PLAYOFF_SHAPE',
      'La generación automática inicial solo soporta exactamente 2 grupos con 2 clasificados por grupo.'
    )
  }

  const { data: groupTeams, error: groupTeamsError } = await supabaseAdmin
    .from('tournament_group_teams')
    .select('group_id,tournament_id,team_id,seed,position')
    .eq('tournament_id', input.tournamentId)

  if (groupTeamsError) throw new Error(`No pude leer equipos de grupos: ${groupTeamsError.message}`)

  const currentRules = normalizeObject(tournamentRow.rules_json ?? tournamentRow.rules ?? {})
  const classificationRules = normalizeClassificationRules(tournamentRow.classification_rules, currentRules)
  let standings: GroupStandings[]
  try {
    standings = calculateTournamentGroupStandings({
      groups: groupRows,
      groupTeams: (groupTeams ?? []) as TournamentGroupTeam[],
      matches: matchRows,
      classificationRules,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('head_to_head')) {
      throw new PlayoffGenerationError('UNSUPPORTED_TIE_BREAKER', error.message, 422)
    }
    throw error
  }

  assertSupportedShape(standings)

  const [firstGroup, secondGroup] = standings
  const semifinalInputs = [
    {
      team1Id: firstGroup.qualifiers[0].team_id,
      team2Id: secondGroup.qualifiers[1].team_id,
      matchOrder: 1,
    },
    {
      team1Id: secondGroup.qualifiers[0].team_id,
      team2Id: firstGroup.qualifiers[1].team_id,
      matchOrder: 2,
    },
  ]

  const scheduleConfig = normalizeScheduleConfig((currentRules as Record<string, unknown>).schedule_config, {
    startDate: tournamentRow.start_date,
    endDate: tournamentRow.end_date ?? tournamentRow.start_date,
  })
  const tournamentCourts = normalizeTournamentCourts((currentRules as Record<string, unknown>).tournament_courts)
  const schedulingDecision = evaluatePlayoffSchedulingPlan({
    tournamentId: input.tournamentId,
    playoffType: 'SEMI',
    candidateMatches: semifinalInputs.map((semifinal) => ({
      id: `SEMI:${semifinal.matchOrder}`,
      team1Id: semifinal.team1Id,
      team2Id: semifinal.team2Id,
      phase: 'SEMI',
      round: 1,
      matchOrder: semifinal.matchOrder,
    })),
    courts: tournamentCourts,
    scheduleConfig,
    scheduleConfigReady: hasCompletePlayoffScheduleConfig((currentRules as Record<string, unknown>).schedule_config),
  })

  const createdMatches = []
  const createdAssignments: MatchScheduleAssignment[] = []
  for (const semifinal of semifinalInputs) {
    const candidateId = `SEMI:${semifinal.matchOrder}`
    const assignment = schedulingDecision.shouldApplySchedule
      ? schedulingDecision.assignmentsByMatchId[candidateId]
      : null
    const { match } = await createMatch({
      tournamentId: input.tournamentId,
      clubId: input.clubId,
      groupId: null,
      team1Id: semifinal.team1Id,
      team2Id: semifinal.team2Id,
      phase: 'SEMI',
      round: 1,
      matchOrder: semifinal.matchOrder,
      scheduledAt: assignment?.scheduled_at ?? null,
    })
    createdMatches.push(match)
    if (match?.id && assignment) {
      createdAssignments.push({
        ...assignment,
        match_id: String(match.id),
      })
    }
  }

  if (createdAssignments.length > 0) {
    const currentAssignments = readMatchScheduleAssignments(currentRules.match_schedule_assignments)
    const nextAssignments = { ...currentAssignments }
    for (const assignment of createdAssignments) {
      nextAssignments[assignment.match_id] = assignment
    }

    const nextRules = {
      ...currentRules,
      match_schedule_assignments: nextAssignments,
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
      throw new Error(`No pude guardar la planificación de semifinales: ${schedulePersistError.message}`)
    }
  }

  return {
    phase: 'SEMI',
    matches: createdMatches,
    meta: {
      source: 'standings',
      shape: '2_groups_2_qualifiers',
    },
  }
}

export async function generateZonePlayoffFinal(input: { clubId: string; tournamentId: string }) {
  assertServiceRole()

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name,format,start_date,end_date,rules_json,rules')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (tournamentError) throw new Error(`No pude validar el torneo: ${tournamentError.message}`)
  if (!tournament) {
    throw new PlayoffGenerationError('TOURNAMENT_NOT_FOUND', 'Torneo no encontrado para este club.', 404)
  }

  if (!isZonePlayoffLikeFormat((tournament as Pick<TournamentRow, 'format'>).format)) {
    throw new PlayoffGenerationError(
      'UNSUPPORTED_TOURNAMENT_FORMAT',
      'La generación automática de final solo está habilitada para torneos por grupos con eliminación.'
    )
  }

  const { data: playoffMatches, error: matchesError } = await supabaseAdmin
    .from('tournament_matches')
    .select('id,tournament_id,club_id,team1_id,team2_id,phase,status,winner_team_id,match_order,created_at')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .in('phase', ['SEMI', 'FINAL'])

  if (matchesError) throw new Error(`No pude leer partidos de playoff: ${matchesError.message}`)

  const rows = (playoffMatches ?? []) as PlayoffMatchRow[]
  const finalExists = rows.some((match) => match.phase === 'FINAL')
  if (finalExists) {
    throw new PlayoffGenerationError('FINAL_ALREADY_EXISTS', 'La final ya existe para este torneo.', 409)
  }

  const semifinals = rows
    .filter((match) => match.phase === 'SEMI')
    .sort((a, b) => {
      const orderDiff = (a.match_order ?? 0) - (b.match_order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    })

  if (semifinals.length !== 2) {
    throw new PlayoffGenerationError(
      'SEMIFINALS_NOT_FOUND',
      'Para generar la final deben existir exactamente 2 semifinales.',
      409
    )
  }

  const incompleteSemifinal = semifinals.find(
    (match) => !match.team1_id || !match.team2_id || match.status !== 'PLAYED' || !match.winner_team_id
  )
  if (incompleteSemifinal) {
    throw new PlayoffGenerationError(
      'SEMIFINALS_NOT_COMPLETED',
      'Ambas semifinales deben estar jugadas y tener ganador antes de generar la final.',
      409
    )
  }

  const firstWinner = semifinals[0].winner_team_id
  const secondWinner = semifinals[1].winner_team_id
  if (!firstWinner || !secondWinner || firstWinner === secondWinner) {
    throw new PlayoffGenerationError(
      'INVALID_FINAL_TEAMS',
      'Los ganadores de semifinales deben ser dos equipos distintos.',
      409
    )
  }

  const tournamentRow = tournament as TournamentRow
  const currentRules = normalizeObject(tournamentRow.rules_json ?? tournamentRow.rules ?? {})
  const scheduleConfig = normalizeScheduleConfig((currentRules as Record<string, unknown>).schedule_config, {
    startDate: tournamentRow.start_date,
    endDate: tournamentRow.end_date ?? tournamentRow.start_date,
  })
  const tournamentCourts = normalizeTournamentCourts((currentRules as Record<string, unknown>).tournament_courts)

  const schedulingDecision = evaluatePlayoffSchedulingPlan({
    tournamentId: input.tournamentId,
    playoffType: 'FINAL',
    candidateMatches: [{
      id: 'FINAL:1',
      team1Id: firstWinner,
      team2Id: secondWinner,
      phase: 'FINAL',
      round: 2,
      matchOrder: 1,
    }],
    courts: tournamentCourts,
    scheduleConfig,
    scheduleConfigReady: hasCompletePlayoffScheduleConfig((currentRules as Record<string, unknown>).schedule_config),
  })

  const assignment = schedulingDecision.shouldApplySchedule
    ? schedulingDecision.assignmentsByMatchId['FINAL:1']
    : null

  const { match } = await createMatch({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    groupId: null,
    team1Id: firstWinner,
    team2Id: secondWinner,
    phase: 'FINAL',
    round: 2,
    matchOrder: 1,
    scheduledAt: assignment?.scheduled_at ?? null,
  })

  if (match?.id && assignment) {
    const currentAssignments = readMatchScheduleAssignments(currentRules.match_schedule_assignments)
    const nextRules = {
      ...currentRules,
      match_schedule_assignments: {
        ...currentAssignments,
        [String(match.id)]: {
          ...assignment,
          match_id: String(match.id),
        },
      },
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
      throw new Error(`No pude guardar la planificación de la final: ${schedulePersistError.message}`)
    }
  }

  return {
    phase: 'FINAL',
    match,
    meta: {
      source: 'semifinals',
      shape: '2_semifinals_to_final',
    },
  }
}
