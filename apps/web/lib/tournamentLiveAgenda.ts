import type { ScheduleConfig } from '@/lib/tournamentSchedule'

export type TournamentLiveMatchStatus = 'PENDING' | 'PLAYED' | 'CANCELLED' | string

export type TournamentLiveAgendaInputMatch = {
  id: string
  team1_id: string | null
  team2_id: string | null
  team1_name?: string | null
  team2_name?: string | null
  phase?: string | null
  round?: number | null
  match_order?: number | null
  status?: TournamentLiveMatchStatus | null
  scheduled_at?: string | null
  court_name?: string | null
  court_id?: string | null
  court_source?: string | null
}

export type TournamentLiveAgendaMatch = TournamentLiveAgendaInputMatch & {
  status: TournamentLiveMatchStatus
  isScheduled: boolean
  isLate: boolean
  isProbablyInProgress: boolean
  isPlayed: boolean
  scheduledStartMs: number | null
  estimatedEndMs: number | null
  estimatedEndAt: string | null
  minutesLate: number
}

export type TournamentLiveAgendaCourt = {
  key: string
  courtName: string | null
  courtId: string | null
  courtSource: string | null
  matches: TournamentLiveAgendaMatch[]
}

export type TournamentLiveAgendaTeam = {
  teamId: string
  teamName: string | null
  matches: TournamentLiveAgendaMatch[]
  nextMatch: TournamentLiveAgendaMatch | null
}

export type TournamentLiveAgendaMetrics = {
  pendingMatches: number
  lateMatches: number
  probablyInProgressMatches: number
}

export type TournamentLiveAgenda = {
  courts: TournamentLiveAgendaCourt[]
  timeline: TournamentLiveAgendaMatch[]
  teams: TournamentLiveAgendaTeam[]
  metrics: TournamentLiveAgendaMetrics
}

function normalizeStatus(status: TournamentLiveAgendaInputMatch['status']) {
  return String(status ?? 'PENDING').trim().toUpperCase() || 'PENDING'
}

function normalizeDurationMinutes(scheduleConfig: ScheduleConfig) {
  const duration = Number(scheduleConfig.match_duration_minutes)
  return Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : 90
}

function parseScheduledStartMs(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compareAgendaMatches(left: TournamentLiveAgendaMatch, right: TournamentLiveAgendaMatch) {
  const leftStart = left.scheduledStartMs ?? Number.MAX_SAFE_INTEGER
  const rightStart = right.scheduledStartMs ?? Number.MAX_SAFE_INTEGER
  if (leftStart !== rightStart) return leftStart - rightStart

  const leftRound = left.round ?? Number.MAX_SAFE_INTEGER
  const rightRound = right.round ?? Number.MAX_SAFE_INTEGER
  if (leftRound !== rightRound) return leftRound - rightRound

  const leftOrder = left.match_order ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.match_order ?? Number.MAX_SAFE_INTEGER
  if (leftOrder !== rightOrder) return leftOrder - rightOrder

  return left.id.localeCompare(right.id)
}

function buildCourtKey(match: TournamentLiveAgendaMatch) {
  if (match.court_id) return `id:${match.court_id}`
  if (match.court_name) return `name:${match.court_name}`
  return 'unassigned'
}

function buildTeamName(match: TournamentLiveAgendaMatch, teamId: string) {
  if (teamId === match.team1_id) return match.team1_name ?? null
  if (teamId === match.team2_id) return match.team2_name ?? null
  return null
}

function findNextTeamMatch(matches: TournamentLiveAgendaMatch[], nowMs: number) {
  return matches.find((match) => {
    if (match.status !== 'PENDING') return false
    if (!match.isScheduled) return true
    return (match.estimatedEndMs ?? match.scheduledStartMs ?? 0) >= nowMs
  }) ?? null
}

export function buildTournamentLiveAgenda(
  matches: TournamentLiveAgendaInputMatch[],
  scheduleConfig: ScheduleConfig
): TournamentLiveAgenda {
  const nowMs = Date.now()
  const matchDurationMs = normalizeDurationMinutes(scheduleConfig) * 60000

  const timeline = matches
    .map<TournamentLiveAgendaMatch>((match) => {
      const status = normalizeStatus(match.status)
      const scheduledStartMs = parseScheduledStartMs(match.scheduled_at)
      const isScheduled = scheduledStartMs !== null
      const estimatedEndMs = scheduledStartMs !== null ? scheduledStartMs + matchDurationMs : null
      const isPlayed = status === 'PLAYED'
      const canBeLive = status === 'PENDING' && scheduledStartMs !== null && estimatedEndMs !== null
      const isProbablyInProgress = canBeLive && nowMs >= scheduledStartMs && nowMs <= estimatedEndMs
      const isLate = canBeLive && nowMs > estimatedEndMs
      const minutesLate = isLate && estimatedEndMs !== null
        ? Math.floor((nowMs - estimatedEndMs) / 60000)
        : 0

      return {
        ...match,
        status,
        isScheduled,
        isLate,
        isProbablyInProgress,
        isPlayed,
        scheduledStartMs,
        estimatedEndMs,
        estimatedEndAt: estimatedEndMs !== null ? new Date(estimatedEndMs).toISOString() : null,
        minutesLate,
      }
    })
    .sort(compareAgendaMatches)

  const courtMap = new Map<string, TournamentLiveAgendaCourt>()
  for (const match of timeline) {
    const key = buildCourtKey(match)
    const current = courtMap.get(key)
    if (current) {
      current.matches.push(match)
      continue
    }

    courtMap.set(key, {
      key,
      courtName: match.court_name ?? null,
      courtId: match.court_id ?? null,
      courtSource: match.court_source ?? null,
      matches: [match],
    })
  }

  const teamMap = new Map<string, TournamentLiveAgendaTeam>()
  for (const match of timeline) {
    for (const teamId of [match.team1_id, match.team2_id]) {
      if (!teamId) continue
      const current = teamMap.get(teamId)
      if (current) {
        current.matches.push(match)
        continue
      }

      teamMap.set(teamId, {
        teamId,
        teamName: buildTeamName(match, teamId),
        matches: [match],
        nextMatch: null,
      })
    }
  }

  const teams = Array.from(teamMap.values())
    .map((team) => ({
      ...team,
      matches: [...team.matches].sort(compareAgendaMatches),
    }))
    .map((team) => ({
      ...team,
      nextMatch: findNextTeamMatch(team.matches, nowMs),
    }))
    .sort((left, right) => {
      const leftNext = left.nextMatch?.scheduledStartMs ?? Number.MAX_SAFE_INTEGER
      const rightNext = right.nextMatch?.scheduledStartMs ?? Number.MAX_SAFE_INTEGER
      if (leftNext !== rightNext) return leftNext - rightNext
      return (left.teamName ?? left.teamId).localeCompare(right.teamName ?? right.teamId)
    })

  return {
    courts: Array.from(courtMap.values())
      .map((court) => ({
        ...court,
        matches: [...court.matches].sort(compareAgendaMatches),
      }))
      .sort((left, right) => {
        if (left.key === 'unassigned') return 1
        if (right.key === 'unassigned') return -1
        return (left.courtName ?? left.key).localeCompare(right.courtName ?? right.key)
      }),
    timeline,
    teams,
    metrics: {
      pendingMatches: timeline.filter((match) => match.status === 'PENDING').length,
      lateMatches: timeline.filter((match) => match.isLate).length,
      probablyInProgressMatches: timeline.filter((match) => match.isProbablyInProgress).length,
    },
  }
}
