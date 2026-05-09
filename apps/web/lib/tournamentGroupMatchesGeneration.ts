import { createMatch } from '@/lib/tournamentMatches'
import {
  assignScheduleSlots,
  buildProfessionalSchedulePlan,
  normalizeScheduleConfig,
  normalizeTournamentCourts,
  readMatchScheduleAssignments,
  type MatchScheduleAssignment,
  type ProfessionalSchedulePlan,
  type ScheduleCapacity,
} from '@/lib/tournamentSchedule'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type GroupMatchesGenerationErrorCode =
  | 'TOURNAMENT_NOT_FOUND'
  | 'GROUPS_NOT_FOUND'
  | 'GROUP_MATCHES_ALREADY_EXIST'
  | 'GROUP_NOT_COMPLETE'
  | 'INVALID_GROUP_SIZE'
  | 'SCHEDULE_COURTS_REQUIRED'
  | 'SCHEDULE_CAPACITY_INSUFFICIENT'

type TournamentGroupRow = {
  id: string
  tournament_id: string
  name: string
  size: number
  order: number
}

type TournamentGroupTeamRow = {
  id: string
  group_id: string
  team_id: string
  seed: number
}

type TournamentRow = {
  id: string
  club_id: string
  name: string
  start_date: string | null
  end_date: string | null
  rules_json: Record<string, unknown> | null
  rules: Record<string, unknown> | null
}

type PlannedPair = {
  planId: string
  groupId: string
  groupName: string
  groupOrder: number
  team1Id: string
  team2Id: string
  round: number
  matchOrder: number
}

const MIN_PROFESSIONAL_SCORE_IMPROVEMENT = 3

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export class TournamentGroupMatchesGenerationError extends Error {
  code: GroupMatchesGenerationErrorCode
  status: number

  constructor(code: GroupMatchesGenerationErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'TournamentGroupMatchesGenerationError'
    this.code = code
    this.status = status
  }
}

function buildRoundRobinPairs(teamRows: TournamentGroupTeamRow[]) {
  const teams = [...teamRows].sort((a, b) => a.seed - b.seed)

  if (teams.length === 4) {
    const [seed1, seed2, seed3, seed4] = teams
    if (!seed1 || !seed2 || !seed3 || !seed4) return []

    return [
      { team1Id: seed1.team_id, team2Id: seed3.team_id, round: 1 },
      { team1Id: seed2.team_id, team2Id: seed4.team_id, round: 1 },
      { team1Id: seed1.team_id, team2Id: seed4.team_id, round: 2 },
      { team1Id: seed3.team_id, team2Id: seed2.team_id, round: 2 },
    ]
  }

  const pairs: Array<{ team1Id: string; team2Id: string; round: number }> = []

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const team1 = teams[i]
      const team2 = teams[j]
      if (!team1 || !team2) continue
      pairs.push({
        team1Id: team1.team_id,
        team2Id: team2.team_id,
        round: pairs.length + 1,
      })
    }
  }

  return pairs
}

function countCourtUsage(assignments: Array<{ court_name: string }>) {
  return assignments.reduce<Record<string, number>>((acc, assignment) => {
    acc[assignment.court_name] = (acc[assignment.court_name] ?? 0) + 1
    return acc
  }, {})
}

function summarizeCourtBalance(assignments: Array<{ court_name: string }>) {
  const courtUsage = countCourtUsage(assignments)
  const usageEntries = Object.entries(courtUsage).sort((left, right) => left[0].localeCompare(right[0]))
  const usageValues = usageEntries.map(([, count]) => count)
  const maxUsage = usageValues.length > 0 ? Math.max(...usageValues) : 0
  const minUsage = usageValues.length > 0 ? Math.min(...usageValues) : 0
  const averageUsage = usageValues.length > 0
    ? usageValues.reduce((sum, value) => sum + value, 0) / usageValues.length
    : 0
  const deviations = Object.fromEntries(
    usageEntries.map(([courtName, count]) => [courtName, Number((count - averageUsage).toFixed(2))])
  )
  const maxDeviation = usageValues.length > 0
    ? Number(Math.max(...usageValues.map((value) => Math.abs(value - averageUsage))).toFixed(2))
    : 0
  const difference = Math.max(0, maxUsage - minUsage)
  const balanceScore = usageEntries.length > 0
    ? Number((1 / (1 + maxDeviation)).toFixed(3))
    : 1

  return {
    courtUsage,
    mostLoadedCourt: usageEntries.find(([, count]) => count === maxUsage)?.[0] ?? null,
    leastLoadedCourt: usageEntries.find(([, count]) => count === minUsage)?.[0] ?? null,
    averageUsage: Number(averageUsage.toFixed(2)),
    deviations,
    maxDeviation,
    maxDifference: difference,
    balanceScore,
  }
}

function summarizeTeamRest(assignments: Array<{
  matchId: string
  startMs: number
  endMs: number
  teamIds: string[]
}>, minimumRestMinutes: number) {
  const teamSummaries = new Map<string, {
    teamId: string
    matchIds: string[]
    restMinutes: number[]
    insufficientRestCount: number
    backToBackCount: number
    worstRestMinutes: number | null
  }>()

  for (const teamId of new Set(assignments.flatMap((assignment) => assignment.teamIds))) {
    const teamAssignments = assignments
      .filter((assignment) => assignment.teamIds.includes(teamId))
      .sort((left, right) => left.startMs - right.startMs)

    const restMinutes: number[] = []
    let insufficientRestCount = 0
    let backToBackCount = 0
    let worstRestMinutes: number | null = null

    for (let index = 1; index < teamAssignments.length; index += 1) {
      const previous = teamAssignments[index - 1]
      const current = teamAssignments[index]
      if (!previous || !current) continue

      const gapMinutes = Math.round((current.startMs - previous.endMs) / 60000)
      restMinutes.push(gapMinutes)
      if (worstRestMinutes === null || gapMinutes < worstRestMinutes) {
        worstRestMinutes = gapMinutes
      }
      if (gapMinutes < minimumRestMinutes) insufficientRestCount += 1
      if (gapMinutes < 1) backToBackCount += 1
    }

    teamSummaries.set(teamId, {
      teamId,
      matchIds: teamAssignments.map((assignment) => assignment.matchId),
      restMinutes,
      insufficientRestCount,
      backToBackCount,
      worstRestMinutes,
    })
  }

  const aggregate = Array.from(teamSummaries.values()).reduce((acc, summary) => {
    acc.insufficientRestCount += summary.insufficientRestCount
    acc.backToBackCount += summary.backToBackCount
    acc.totalRestSamples += summary.restMinutes.length
    acc.totalRestMinutes += summary.restMinutes.reduce((sum, value) => sum + value, 0)
    if (summary.insufficientRestCount > 0) acc.teamsBelowMinimum.push(summary.teamId)
    if (summary.worstRestMinutes !== null && (acc.worstRestMinutes === null || summary.worstRestMinutes < acc.worstRestMinutes)) {
      acc.worstRestMinutes = summary.worstRestMinutes
    }
    return acc
  }, {
    insufficientRestCount: 0,
    backToBackCount: 0,
    totalRestSamples: 0,
    totalRestMinutes: 0,
    worstRestMinutes: null as number | null,
    teamsBelowMinimum: [] as string[],
  })

  const averageRestMinutes = aggregate.totalRestSamples > 0
    ? Number((aggregate.totalRestMinutes / aggregate.totalRestSamples).toFixed(2))
    : null

  return {
    byTeam: Object.fromEntries(teamSummaries),
    averageRestMinutes,
    ...aggregate,
  }
}

function toAssignmentDiagnostics(
  assignments: Array<{ match_id: string; scheduled_at: string; court_name: string }>,
  matchLookup: Map<string, PlannedPair>,
  matchDurationMinutes: number,
  minimumRestMinutes: number,
) {
  const normalizedAssignments = assignments
    .map((assignment) => {
      const match = matchLookup.get(assignment.match_id)
      if (!match) return null

      const startAt = new Date(assignment.scheduled_at)
      const startMs = startAt.getTime()
      if (!Number.isFinite(startMs)) return null

      return {
        matchId: assignment.match_id,
        courtName: assignment.court_name,
        startMs,
        endMs: startMs + matchDurationMinutes * 60 * 1000,
        teamIds: [match.team1Id, match.team2Id],
      }
    })
    .filter((assignment): assignment is NonNullable<typeof assignment> => assignment !== null)
    .sort((left, right) => left.startMs - right.startMs)

  const teamRest = summarizeTeamRest(normalizedAssignments, minimumRestMinutes)
  const courtBalance = summarizeCourtBalance(assignments)

  return {
    assignedMatches: normalizedAssignments.length,
    unassignedMatches: Math.max(0, matchLookup.size - normalizedAssignments.length),
    courtUsage: courtBalance.courtUsage,
    courtBalance,
    teamRest,
    backToBackCount: teamRest.backToBackCount,
    insufficientRestCount: teamRest.insufficientRestCount,
    totalWarnings: 0,
    totalConflicts: 0,
  }
}

function summarizeProfessionalPlan(plan: ProfessionalSchedulePlan, minimumRestMinutes: number) {
  const normalizedAssignments = plan.assignments
    .map((assignment) => ({
      matchId: assignment.match_id,
      startMs: Date.parse(assignment.scheduled_at),
      endMs: Date.parse(assignment.scheduled_at) + Math.max(0, assignment.end_minutes - assignment.start_minutes) * 60000,
      teamIds: [assignment.team1_id, assignment.team2_id],
    }))
    .filter((assignment) => Number.isFinite(assignment.startMs) && Number.isFinite(assignment.endMs))
    .sort((left, right) => left.startMs - right.startMs)

  const courtBalance = summarizeCourtBalance(plan.assignments)
  const teamRest = summarizeTeamRest(normalizedAssignments, minimumRestMinutes)
  const backToBackWarnings = plan.warnings.filter((warning) => warning.code === 'BACK_TO_BACK_UNAVOIDABLE').length
  const insufficientRestWarnings = plan.warnings.filter((warning) => warning.code === 'REST_RELAXED').length

  return {
    assignedMatches: plan.assignments.length,
    unassignedMatches: plan.unassignedMatchIds.length,
    courtUsage: courtBalance.courtUsage,
    courtBalance,
    teamRest,
    warnings: plan.warnings.map((warning) => ({
      code: warning.code,
      matchId: warning.matchId ?? null,
      message: warning.message,
    })),
    conflicts: plan.conflicts.map((conflict) => ({
      code: conflict.code,
      matchId: conflict.matchId ?? null,
      relatedMatchIds: conflict.relatedMatchIds ?? [],
      message: conflict.message,
    })),
    backToBackWarnings,
    insufficientRestWarnings,
    backToBackCount: teamRest.backToBackCount,
    insufficientRestCount: teamRest.insufficientRestCount,
    totalWarnings: plan.warnings.length,
    totalConflicts: plan.conflicts.length,
  }
}

function calculatePlannerScore(input: {
  assignedMatches: number
  unassignedMatches: number
  backToBackCount: number
  insufficientRestCount: number
  totalWarnings: number
  totalConflicts: number
  courtBalance: {
    maxDifference: number
    maxDeviation: number
  }
}) {
  let score = 100
  score += input.assignedMatches * 2
  score -= input.unassignedMatches * 25
  score -= input.totalConflicts * 20
  score -= input.backToBackCount * 10
  score -= input.insufficientRestCount * 6
  score -= input.totalWarnings * 2
  score -= Math.round(input.courtBalance.maxDifference * 3)
  score -= Math.round(input.courtBalance.maxDeviation * 4)
  return score
}

function toLegacyAssignments(assignments: ProfessionalSchedulePlan['assignments']): MatchScheduleAssignment[] {
  return assignments.map((assignment) => ({
    match_id: assignment.match_id,
    scheduled_at: assignment.scheduled_at,
    court_name: assignment.court_name,
    ...(assignment.court_id ? { court_id: assignment.court_id } : {}),
    court_source: assignment.court_source,
  }))
}

function buildPlannerRecommendation(input: {
  oldSummary: ReturnType<typeof toAssignmentDiagnostics>
  newSummary: ReturnType<typeof summarizeProfessionalPlan>
  oldScore: number
  newScore: number
}) {
  const reasons: string[] = []

  if (input.newSummary.unassignedMatches > input.oldSummary.unassignedMatches) {
    reasons.push('El planner profesional deja más partidos sin asignar que el planner actual.')
  }

  if (input.newSummary.totalConflicts > 0) {
    reasons.push('El planner profesional reporta conflictos explícitos.')
  }

  if (reasons.length > 0) {
    return {
      recommendation: 'PROFESSIONAL_HAS_RISKS' as const,
      reasons,
    }
  }

  const scoreDelta = input.newScore - input.oldScore
  if (scoreDelta >= 5) {
    reasons.push(`Mejora el score general del plan (${input.oldScore} -> ${input.newScore}).`)
    if (input.newSummary.backToBackCount < input.oldSummary.backToBackCount) {
      reasons.push('Reduce la cantidad de back-to-back.')
    }
    if (input.newSummary.insufficientRestCount < input.oldSummary.insufficientRestCount) {
      reasons.push('Reduce descansos insuficientes.')
    }
    if (input.newSummary.courtBalance.maxDeviation < input.oldSummary.courtBalance.maxDeviation) {
      reasons.push('Mejora el balance entre canchas.')
    }

    return {
      recommendation: 'PROFESSIONAL_BETTER' as const,
      reasons,
    }
  }

  return {
    recommendation: 'KEEP_OLD' as const,
    reasons: ['No hay una mejora clara sin cambiar el riesgo operativo actual.'],
  }
}

function buildPlannerComparison(input: {
  oldAssignments: MatchScheduleAssignment[]
  professionalPlan: ProfessionalSchedulePlan
  plannedPairs: PlannedPair[]
  matchDurationMinutes: number
  minimumRestMinutes: number
}) {
  const matchLookup = new Map(input.plannedPairs.map((pair) => [pair.planId, pair] as const))
  const oldSummary = toAssignmentDiagnostics(
    input.oldAssignments,
    matchLookup,
    input.matchDurationMinutes,
    input.minimumRestMinutes,
  )
  const newSummary = summarizeProfessionalPlan(input.professionalPlan, input.minimumRestMinutes)
  const oldScore = calculatePlannerScore(oldSummary)
  const newScore = calculatePlannerScore(newSummary)
  const recommendation = buildPlannerRecommendation({ oldSummary, newSummary, oldScore, newScore })

  return {
    oldSummary,
    newSummary,
    oldScore,
    newScore,
    recommendation,
  }
}

function debugSchedulePlannerComparison(input: {
  tournamentId: string
  oldAssignments: MatchScheduleAssignment[]
  professionalPlan: ProfessionalSchedulePlan
  plannedPairs: PlannedPair[]
  matchDurationMinutes: number
  minimumRestMinutes: number
}) {
  if (process.env.NODE_ENV === 'production') return

  const comparison = buildPlannerComparison({
    oldAssignments: input.oldAssignments,
    professionalPlan: input.professionalPlan,
    plannedPairs: input.plannedPairs,
    matchDurationMinutes: input.matchDurationMinutes,
    minimumRestMinutes: input.minimumRestMinutes,
  })

  const logPayload = {
    tournamentId: input.tournamentId,
    oldPlanner: comparison.oldSummary,
    professionalPlanner: comparison.newSummary,
    scores: {
      oldPlanner: comparison.oldScore,
      professionalPlanner: comparison.newScore,
    },
    delta: {
      assignedMatches: comparison.newSummary.assignedMatches - comparison.oldSummary.assignedMatches,
      unassignedMatches: comparison.newSummary.unassignedMatches - comparison.oldSummary.unassignedMatches,
      backToBackCount: comparison.newSummary.backToBackCount - comparison.oldSummary.backToBackCount,
      insufficientRestCount: comparison.newSummary.insufficientRestCount - comparison.oldSummary.insufficientRestCount,
      courtBalanceDelta: Number((comparison.newSummary.courtBalance.balanceScore - comparison.oldSummary.courtBalance.balanceScore).toFixed(3)),
      totalWarnings: comparison.newSummary.totalWarnings - comparison.oldSummary.totalWarnings,
      totalConflicts: comparison.newSummary.totalConflicts - comparison.oldSummary.totalConflicts,
    },
    recommendation: comparison.recommendation,
  }

  console.debug('[PAMPrax] Group match scheduling planner diagnostics', logPayload)
}

export async function generateGroupMatchesForTournament(input: {
  tournamentId: string
  clubId: string
}) {
  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name,start_date,end_date,rules_json,rules')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (tournamentError) throw new Error(`No pude validar el torneo: ${tournamentError.message}`)
  if (!tournament) {
    throw new TournamentGroupMatchesGenerationError('TOURNAMENT_NOT_FOUND', 'Torneo no encontrado para este club.', 404)
  }
  const tournamentRow = tournament as TournamentRow

  const { count: existingMatchesCount, error: existingMatchesError } = await supabaseAdmin
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .eq('phase', 'GROUP')

  if (existingMatchesError) throw new Error(`No pude validar partidos existentes: ${existingMatchesError.message}`)
  if ((existingMatchesCount ?? 0) > 0) {
    throw new TournamentGroupMatchesGenerationError(
      'GROUP_MATCHES_ALREADY_EXIST',
      'Este torneo ya tiene partidos de grupos generados.',
      409
    )
  }

  const { data: groupRows, error: groupsError } = await supabaseAdmin
    .from('tournament_groups')
    .select('id,tournament_id,name,size,order')
    .eq('tournament_id', input.tournamentId)
    .order('order', { ascending: true })

  if (groupsError) throw new Error(`No pude leer grupos: ${groupsError.message}`)

  const groups = (groupRows ?? []) as TournamentGroupRow[]
  if (groups.length === 0) {
    throw new TournamentGroupMatchesGenerationError('GROUPS_NOT_FOUND', 'Primero generá los grupos del torneo.', 409)
  }

  const invalidGroup = groups.find((group) => group.size !== 3 && group.size !== 4)
  if (invalidGroup) {
    throw new TournamentGroupMatchesGenerationError(
      'INVALID_GROUP_SIZE',
      `El grupo ${invalidGroup.name} tiene un tamaño inválido.`,
      409
    )
  }

  const groupIds = groups.map((group) => group.id)
  const { data: groupTeamRows, error: groupTeamsError } = await supabaseAdmin
    .from('tournament_group_teams')
    .select('id,group_id,team_id,seed')
    .eq('tournament_id', input.tournamentId)
    .in('group_id', groupIds)
    .order('seed', { ascending: true })

  if (groupTeamsError) throw new Error(`No pude leer equipos de grupos: ${groupTeamsError.message}`)

  const groupTeamsByGroup = ((groupTeamRows ?? []) as TournamentGroupTeamRow[]).reduce((map, row) => {
    const current = map.get(row.group_id) ?? []
    current.push(row)
    map.set(row.group_id, current)
    return map
  }, new Map<string, TournamentGroupTeamRow[]>())

  for (const group of groups) {
    const teams = groupTeamsByGroup.get(group.id) ?? []
    if (teams.length !== group.size) {
      throw new TournamentGroupMatchesGenerationError(
        'GROUP_NOT_COMPLETE',
        `El grupo ${group.name} no tiene sus ${group.size} equipos completos.`,
        409
      )
    }
  }

  const currentRules = normalizeObject(tournamentRow.rules_json ?? tournamentRow.rules ?? {})
  const scheduleConfig = normalizeScheduleConfig(currentRules.schedule_config, {
    startDate: tournamentRow.start_date,
    endDate: tournamentRow.end_date ?? tournamentRow.start_date,
  })
  const tournamentCourts = normalizeTournamentCourts(currentRules.tournament_courts)
  const perGroupCounts: Array<{ groupId: string; groupName: string; matchesCreated: number }> = []
  const plannedPairs: PlannedPair[] = []
  let matchOrder = 1

  for (const group of groups) {
    const pairs = buildRoundRobinPairs(groupTeamsByGroup.get(group.id) ?? [])
    perGroupCounts.push({ groupId: group.id, groupName: group.name, matchesCreated: pairs.length })

    for (const pair of pairs) {
      plannedPairs.push({
        planId: `${group.id}:${pair.round}:${matchOrder}`,
        groupId: group.id,
        groupName: group.name,
        groupOrder: group.order,
        team1Id: pair.team1Id,
        team2Id: pair.team2Id,
        round: pair.round,
        matchOrder,
      })
      matchOrder += 1
    }
  }

  let scheduleCapacity: ScheduleCapacity | null = null
  let plannedAssignments: MatchScheduleAssignment[] = []
  const autoScheduleEnabled = scheduleConfig.mode === 'AUTO'

  if (autoScheduleEnabled) {
    if (tournamentCourts.length === 0) {
      throw new TournamentGroupMatchesGenerationError(
        'SCHEDULE_COURTS_REQUIRED',
        'Necesitás al menos una cancha seleccionada para planificar automáticamente los partidos de grupos.',
        409
      )
    }

    const schedulePlan = assignScheduleSlots({
      matches: plannedPairs.map((pair) => ({
        id: pair.planId,
        groupOrder: pair.groupOrder,
        round: pair.round,
        matchOrder: pair.matchOrder,
      })),
      courts: tournamentCourts,
      date: scheduleConfig.groups.date,
      startTime: scheduleConfig.groups.start_time,
      endTime: scheduleConfig.groups.end_time,
      matchDurationMinutes: scheduleConfig.match_duration_minutes,
    })

    const professionalPlan = buildProfessionalSchedulePlan({
      matches: plannedPairs.map((pair) => ({
        id: pair.planId,
        groupId: pair.groupId,
        groupOrder: pair.groupOrder,
        round: pair.round,
        matchOrder: pair.matchOrder,
        team1Id: pair.team1Id,
        team2Id: pair.team2Id,
        phase: 'GROUP',
      })),
      courts: tournamentCourts,
      date: scheduleConfig.groups.date,
      startTime: scheduleConfig.groups.start_time,
      endTime: scheduleConfig.groups.end_time,
      matchDurationMinutes: scheduleConfig.match_duration_minutes,
      minimumRestMinutes: scheduleConfig.match_duration_minutes,
    })
    const comparison = buildPlannerComparison({
      oldAssignments: schedulePlan.assignments,
      professionalPlan,
      plannedPairs,
      matchDurationMinutes: scheduleConfig.match_duration_minutes,
      minimumRestMinutes: scheduleConfig.match_duration_minutes,
    })

    scheduleCapacity = schedulePlan.capacity
    if (!schedulePlan.capacity.isEnough || schedulePlan.assignments.length !== plannedPairs.length) {
      throw new TournamentGroupMatchesGenerationError(
        'SCHEDULE_CAPACITY_INSUFFICIENT',
        `Con ${tournamentCourts.length} canchas y el horario elegido entran ${schedulePlan.capacity.totalCapacity} partidos, pero se necesitan ${plannedPairs.length}.`,
        409
      )
    }

    const shouldUseProfessionalPlan =
      professionalPlan.isComplete === true &&
      professionalPlan.conflicts.length === 0 &&
      comparison.newSummary.unassignedMatches <= comparison.oldSummary.unassignedMatches &&
      comparison.recommendation.recommendation !== 'PROFESSIONAL_HAS_RISKS' &&
      comparison.newScore >= comparison.oldScore + MIN_PROFESSIONAL_SCORE_IMPROVEMENT

    plannedAssignments = shouldUseProfessionalPlan
      ? toLegacyAssignments(professionalPlan.assignments)
      : schedulePlan.assignments

    const fallbackReasons = [...comparison.recommendation.reasons]
    if (comparison.newScore < comparison.oldScore + MIN_PROFESSIONAL_SCORE_IMPROVEMENT) {
      fallbackReasons.push(
        `La mejora de score no alcanza el mínimo requerido (${comparison.oldScore} -> ${comparison.newScore}; mínimo +${MIN_PROFESSIONAL_SCORE_IMPROVEMENT}).`
      )
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PAMPrax] Group match scheduling planner selected', {
        tournamentId: input.tournamentId,
        selectedPlanner: shouldUseProfessionalPlan ? 'PROFESSIONAL' : 'LEGACY',
        fallbackApplied: !shouldUseProfessionalPlan,
        reasons: shouldUseProfessionalPlan ? comparison.recommendation.reasons : fallbackReasons,
        oldScore: comparison.oldScore,
        professionalScore: comparison.newScore,
        minimumProfessionalScoreImprovement: MIN_PROFESSIONAL_SCORE_IMPROVEMENT,
      })
    }

    debugSchedulePlannerComparison({
      tournamentId: input.tournamentId,
      oldAssignments: schedulePlan.assignments,
      professionalPlan,
      plannedPairs,
      matchDurationMinutes: scheduleConfig.match_duration_minutes,
      minimumRestMinutes: scheduleConfig.match_duration_minutes,
    })
  }

  const createdMatchIds: string[] = []
  const createdAssignments: MatchScheduleAssignment[] = []

  try {
    for (let index = 0; index < plannedPairs.length; index += 1) {
      const pair = plannedPairs[index]
      if (!pair) continue
      const assignment = plannedAssignments[index]

      const { match } = await createMatch({
        tournamentId: input.tournamentId,
        clubId: input.clubId,
        groupId: pair.groupId,
        team1Id: pair.team1Id,
        team2Id: pair.team2Id,
        phase: 'GROUP',
        round: pair.round,
        matchOrder: pair.matchOrder,
        scheduledAt: assignment?.scheduled_at ?? null,
      })

      if (match?.id) {
        createdMatchIds.push(match.id)
        if (assignment) {
          createdAssignments.push({
            ...assignment,
            match_id: match.id,
          })
        }
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
        throw new Error(`No pude guardar la planificación de canchas: ${schedulePersistError.message}`)
      }
    }
  } catch (error) {
    if (createdMatchIds.length > 0) {
      await supabaseAdmin
        .from('tournament_matches')
        .delete()
        .eq('tournament_id', input.tournamentId)
        .eq('club_id', input.clubId)
        .eq('phase', 'GROUP')
        .in('id', createdMatchIds)
    }
    throw error
  }

  return {
    tournament: tournamentRow,
    groupsCount: groups.length,
    matchesCreated: createdMatchIds.length,
    perGroupCounts,
    scheduleApplied: autoScheduleEnabled,
    scheduleCapacity,
  }
}
