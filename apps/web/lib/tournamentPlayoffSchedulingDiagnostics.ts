import {
  buildProfessionalSchedulePlan,
  type MatchScheduleAssignment,
  type ProfessionalSchedulePlan,
  type ProfessionalSchedulableMatch,
  type ScheduleConfig,
  type TournamentCourtConfig,
} from '@/lib/tournamentSchedule'

export type PlayoffDiagnosticType = 'OPEN' | 'SEMI' | 'FINAL'
export type PlayoffQualityRecommendation = 'GOOD' | 'ACCEPTABLE' | 'RISKY'

export type PlayoffSchedulingDiagnosticMatch = {
  id: string
  team1Id?: string | null
  team2Id?: string | null
  phase?: string | null
  round?: number | null
  matchOrder?: number | null
}

export type PlayoffSchedulingDiagnostic = {
  playoffType: PlayoffDiagnosticType
  candidateMatches: number
  evaluatedMatches: number
  assignedMatches: number
  unassignedMatches: number
  courtBalance: ReturnType<typeof summarizeCourtBalance>
  teamRest: ReturnType<typeof summarizeTeamRest>
  warnings: Array<{ code: string; message: string; matchId?: string | null }>
  conflicts: Array<{ code: string; message: string; matchId?: string | null }>
  mixedPhases: boolean
  dependencyRisk: boolean
  reasons: string[]
  qualityScore: number
  qualityBreakdown: PlayoffQualityBreakdown
  recommendation: PlayoffQualityRecommendation
}

export type PlayoffSchedulingDecision = {
  shouldApplySchedule: boolean
  assignmentsByMatchId: Record<string, MatchScheduleAssignment>
  fallbackReasons: string[]
  diagnostic: PlayoffSchedulingDiagnostic
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

  return {
    courtUsage,
    mostLoadedCourt: usageEntries.find(([, count]) => count === maxUsage)?.[0] ?? null,
    leastLoadedCourt: usageEntries.find(([, count]) => count === minUsage)?.[0] ?? null,
    averageUsage: Number(averageUsage.toFixed(2)),
    deviations,
    maxDeviation,
    maxDifference: Math.max(0, maxUsage - minUsage),
    balanceScore: usageEntries.length > 0 ? Number((1 / (1 + maxDeviation)).toFixed(3)) : 1,
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
      if (worstRestMinutes === null || gapMinutes < worstRestMinutes) worstRestMinutes = gapMinutes
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

export type PlayoffQualityBreakdown = {
  rest: {
    score: number
    worstRestMinutes: number | null
    averageRestMinutes: number | null
    insufficientRestCount: number
    backToBackCount: number
  }
  balance: {
    score: number
    courtBalanceScore: number
    maxDifference: number
    maxDeviation: number
  }
  capacity: {
    score: number
    capacityUsageRatio: number
    assignedMatches: number
    totalCapacity: number
  }
  reliability: {
    score: number
    totalWarnings: number
    totalConflicts: number
  }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function buildRecommendation(score: number): PlayoffQualityRecommendation {
  if (score >= 80) return 'GOOD'
  if (score >= 60) return 'ACCEPTABLE'
  return 'RISKY'
}

export function calculatePlayoffQualityScore(input: {
  professionalPlan: ProfessionalSchedulePlan
  courtBalance: ReturnType<typeof summarizeCourtBalance>
  teamRest: ReturnType<typeof summarizeTeamRest>
  minimumRestMinutes: number
}): {
  qualityScore: number
  recommendation: PlayoffQualityRecommendation
  breakdown: PlayoffQualityBreakdown
} {
  const worstRestMinutes = input.teamRest.worstRestMinutes
  const averageRestMinutes = input.teamRest.averageRestMinutes
  const insufficientRestCount = input.teamRest.insufficientRestCount
  const backToBackCount = input.teamRest.backToBackCount
  const totalWarnings = input.professionalPlan.warnings.length
  const totalConflicts = input.professionalPlan.conflicts.length
  const minimumRestMinutes = Math.max(0, input.minimumRestMinutes)
  const capacityUsageRatio = input.professionalPlan.capacity.totalCapacity > 0
    ? Number((input.professionalPlan.assignments.length / input.professionalPlan.capacity.totalCapacity).toFixed(3))
    : 0

  const worstRestPenalty = worstRestMinutes === null || minimumRestMinutes === 0
    ? 0
    : Math.max(0, Math.min(25, ((minimumRestMinutes - worstRestMinutes) / minimumRestMinutes) * 25))
  const averageRestPenalty = averageRestMinutes === null || minimumRestMinutes === 0
    ? 0
    : Math.max(0, Math.min(10, ((minimumRestMinutes - averageRestMinutes) / minimumRestMinutes) * 10))
  const restScore = clampScore(
    100 -
    insufficientRestCount * 18 -
    backToBackCount * 24 -
    worstRestPenalty -
    averageRestPenalty
  )

  const courtBalanceScore = clampScore(input.courtBalance.balanceScore * 100)
  const balanceScore = clampScore(
    courtBalanceScore -
    Math.max(0, input.courtBalance.maxDifference - 1) * 8 -
    input.courtBalance.maxDeviation * 4
  )

  const capacityScore = clampScore(
    capacityUsageRatio <= 0
      ? 100
      : capacityUsageRatio <= 0.75
        ? 100
        : capacityUsageRatio <= 0.9
          ? 85
          : capacityUsageRatio <= 1
            ? 65
            : 20
  )

  const reliabilityScore = clampScore(100 - totalWarnings * 6 - totalConflicts * 25)

  const qualityScore = clampScore(
    restScore * 0.45 +
    balanceScore * 0.25 +
    capacityScore * 0.15 +
    reliabilityScore * 0.15
  )

  return {
    qualityScore,
    recommendation: buildRecommendation(qualityScore),
    breakdown: {
      rest: {
        score: restScore,
        worstRestMinutes,
        averageRestMinutes,
        insufficientRestCount,
        backToBackCount,
      },
      balance: {
        score: balanceScore,
        courtBalanceScore,
        maxDifference: input.courtBalance.maxDifference,
        maxDeviation: input.courtBalance.maxDeviation,
      },
      capacity: {
        score: capacityScore,
        capacityUsageRatio,
        assignedMatches: input.professionalPlan.assignments.length,
        totalCapacity: input.professionalPlan.capacity.totalCapacity,
      },
      reliability: {
        score: reliabilityScore,
        totalWarnings,
        totalConflicts,
      },
    },
  }
}

export function runPlayoffSchedulingDiagnostics(input: {
  tournamentId: string
  playoffType: PlayoffDiagnosticType
  candidateMatches: PlayoffSchedulingDiagnosticMatch[]
  courts: TournamentCourtConfig[]
  scheduleConfig: ScheduleConfig
  scheduleConfigReady?: boolean
  dependencyReasons?: string[]
}) {
  const filteredMatches = input.candidateMatches.filter(
    (match): match is ProfessionalSchedulableMatch =>
      Boolean(match.id && match.team1Id && match.team2Id)
  )

  const uniquePhases = Array.from(new Set(filteredMatches.map((match) => String(match.phase ?? '').toUpperCase()).filter(Boolean)))
  const mixedPhases = uniquePhases.length > 1
  const reasons = [...(input.dependencyReasons ?? [])]

  if (input.candidateMatches.length !== filteredMatches.length) {
    reasons.push('Se excluyeron matches sin ambos equipos definidos del diagnóstico.')
  }
  if (mixedPhases) {
    reasons.push(`Hay fases mezcladas en el bloque diagnosticado: ${uniquePhases.join(', ')}.`)
  }
  if (input.scheduleConfigReady === false) {
    reasons.push('La configuración schedule_config.playoff no está completa.')
  }
  if (input.courts.length === 0) {
    reasons.push('No hay canchas disponibles para planificar playoff.')
  }

  const professionalPlan = buildProfessionalSchedulePlan({
    matches: filteredMatches.map((match) => ({
      id: match.id,
      team1Id: match.team1Id,
      team2Id: match.team2Id,
      phase: match.phase ?? null,
      round: match.round ?? null,
      matchOrder: match.matchOrder ?? null,
      groupId: null,
    })),
    courts: input.courts,
    date: input.scheduleConfig.playoff.date,
    startTime: input.scheduleConfig.playoff.start_time,
    endTime: input.scheduleConfig.playoff.end_time,
    matchDurationMinutes: input.scheduleConfig.match_duration_minutes,
    minimumRestMinutes: input.scheduleConfig.match_duration_minutes,
  })

  const normalizedAssignments = professionalPlan.assignments
    .map((assignment) => ({
      matchId: assignment.match_id,
      startMs: Date.parse(assignment.scheduled_at),
      endMs: Date.parse(assignment.scheduled_at) + Math.max(0, assignment.end_minutes - assignment.start_minutes) * 60000,
      teamIds: [assignment.team1_id, assignment.team2_id],
    }))
    .filter((assignment) => Number.isFinite(assignment.startMs) && Number.isFinite(assignment.endMs))
    .sort((left, right) => left.startMs - right.startMs)
  const courtBalance = summarizeCourtBalance(professionalPlan.assignments)
  const teamRest = summarizeTeamRest(normalizedAssignments, input.scheduleConfig.match_duration_minutes)
  const quality = calculatePlayoffQualityScore({
    professionalPlan,
    courtBalance,
    teamRest,
    minimumRestMinutes: input.scheduleConfig.match_duration_minutes,
  })

  const diagnostic: PlayoffSchedulingDiagnostic = {
    playoffType: input.playoffType,
    candidateMatches: input.candidateMatches.length,
    evaluatedMatches: filteredMatches.length,
    assignedMatches: professionalPlan.assignments.length,
    unassignedMatches: professionalPlan.unassignedMatchIds.length,
    courtBalance,
    teamRest,
    warnings: professionalPlan.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      matchId: warning.matchId ?? null,
    })),
    conflicts: professionalPlan.conflicts.map((conflict) => ({
      code: conflict.code,
      message: conflict.message,
      matchId: conflict.matchId ?? null,
    })),
    mixedPhases,
    dependencyRisk: mixedPhases || reasons.length > 0,
    reasons,
    qualityScore: quality.qualityScore,
    qualityBreakdown: quality.breakdown,
    recommendation: quality.recommendation,
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[PAMPrax] Playoff scheduling diagnostics', {
      tournamentId: input.tournamentId,
      ...diagnostic,
      quality: {
        score: quality.qualityScore,
        recommendation: quality.recommendation,
        breakdown: quality.breakdown,
      },
    })
  }

  return diagnostic
}

export function evaluatePlayoffSchedulingPlan(input: {
  tournamentId: string
  playoffType: PlayoffDiagnosticType
  candidateMatches: PlayoffSchedulingDiagnosticMatch[]
  courts: TournamentCourtConfig[]
  scheduleConfig: ScheduleConfig
  scheduleConfigReady?: boolean
  dependencyReasons?: string[]
}): PlayoffSchedulingDecision {
  const diagnostic = runPlayoffSchedulingDiagnostics(input)
  const shouldApplySchedule =
    input.scheduleConfigReady === true &&
    input.courts.length > 0 &&
    diagnostic.evaluatedMatches === diagnostic.candidateMatches &&
    diagnostic.assignedMatches === diagnostic.evaluatedMatches &&
    diagnostic.unassignedMatches === 0 &&
    diagnostic.conflicts.length === 0 &&
    diagnostic.mixedPhases === false &&
    diagnostic.dependencyRisk === false

  const filteredMatches = input.candidateMatches.filter(
    (match): match is ProfessionalSchedulableMatch =>
      Boolean(match.id && match.team1Id && match.team2Id)
  )
  const professionalPlan = buildProfessionalSchedulePlan({
    matches: filteredMatches.map((match) => ({
      id: match.id,
      team1Id: match.team1Id,
      team2Id: match.team2Id,
      phase: match.phase ?? null,
      round: match.round ?? null,
      matchOrder: match.matchOrder ?? null,
      groupId: null,
    })),
    courts: input.courts,
    date: input.scheduleConfig.playoff.date,
    startTime: input.scheduleConfig.playoff.start_time,
    endTime: input.scheduleConfig.playoff.end_time,
    matchDurationMinutes: input.scheduleConfig.match_duration_minutes,
    minimumRestMinutes: input.scheduleConfig.match_duration_minutes,
  })

  const assignmentsByMatchId = Object.fromEntries(
    professionalPlan.assignments.map((assignment) => [
      assignment.match_id,
      {
        match_id: assignment.match_id,
        scheduled_at: assignment.scheduled_at,
        court_name: assignment.court_name,
        ...(assignment.court_id ? { court_id: assignment.court_id } : {}),
        court_source: assignment.court_source,
      } satisfies MatchScheduleAssignment,
    ])
  )

  const fallbackReasons = shouldApplySchedule
    ? []
    : [
        ...(diagnostic.reasons.length > 0 ? diagnostic.reasons : []),
        ...(input.scheduleConfigReady === true ? [] : ['schedule_config.playoff no está listo para scheduling.']),
        ...(diagnostic.evaluatedMatches === diagnostic.candidateMatches ? [] : ['Hay matches candidatos sin ambos equipos definidos.']),
        ...(diagnostic.unassignedMatches === 0 ? [] : ['El planner dejó matches sin asignar.']),
        ...(diagnostic.conflicts.length === 0 ? [] : ['El planner detectó conflictos.']),
        ...(diagnostic.mixedPhases === false ? [] : ['Hay fases mezcladas en el mismo bloque.']),
        ...(diagnostic.dependencyRisk === false ? [] : ['Se detectó riesgo de precedencia o dependencia.']),
      ]

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[PAMPrax] Playoff scheduling decision', {
      tournamentId: input.tournamentId,
      playoffType: input.playoffType,
      shouldApplySchedule,
      fallbackReasons,
    })
  }

  return {
    shouldApplySchedule,
    assignmentsByMatchId,
    fallbackReasons,
    diagnostic,
  }
}
