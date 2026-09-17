import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  buildDependencyAwareGroupSchedule,
  canonicalFourTeamDependencies,
  deriveGroupMatchNumbers,
  type GroupDependencyMatch,
} from '@/lib/tournamentGroupDependencies'
import { materializeOpenGroupDependentMatches } from '@/lib/tournamentOpenGroupDependencies'
import {
  normalizeScheduleConfig,
  normalizeTournamentCourts,
  readMatchScheduleAssignments,
  type TournamentCourtConfig,
} from '@/lib/tournamentSchedule'

type MatchRow = {
  id: string
  tournament_id: string
  club_id: string
  group_id: string | null
  team1_id: string
  team2_id: string
  winner_team_id: string | null
  round: number
  match_order: number
  status: string | null
  score: Record<string, unknown> | null
  scheduled_at: string | null
}
type GroupRow = { id: string; name: string; size: number; order: number }
type CourtAssignmentRow = {
  court_id: string
  sort_order: number
  court_snapshot: Record<string, unknown> | null
  tournament_venues: { club_venues: { club_id: string } | null } | null
}

const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {}

function canonicalCourts(rows: CourtAssignmentRow[], organizerClubId: string): TournamentCourtConfig[] {
  return rows.map(row => {
    const snapshot = object(row.court_snapshot)
    return {
      id: row.court_id,
      name: String(snapshot.name ?? 'Cancha'),
      complex_name: typeof snapshot.venue_name === 'string' ? snapshot.venue_name : null,
      source: row.tournament_venues?.club_venues?.club_id === organizerClubId ? 'OWN_CLUB' : 'EXTERNAL_COMPLEX',
    }
  })
}

function buildDomains(matches: MatchRow[], groups: GroupRow[]) {
  const numberById = deriveGroupMatchNumbers(matches.map(match => ({
    id: match.id,
    groupId: match.group_id,
    round: match.round,
    matchOrder: match.match_order,
  })))
  const domains: GroupDependencyMatch[] = []
  for (const group of groups) {
    const groupMatches = matches
      .filter(match => match.group_id === group.id)
      .sort((left, right) => left.round - right.round || left.match_order - right.match_order || left.id.localeCompare(right.id))
    const initialDomains = groupMatches.filter(match => match.round === 1).slice(0, 2).map(match => ({
      id: match.id,
      groupId: group.id,
      groupOrder: group.order,
      groupMatchNumber: numberById.get(match.id) ?? 0,
      round: match.round,
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      winnerTeamId: match.winner_team_id,
    })) as GroupDependencyMatch[]
    const specs = group.size === 4 && initialDomains.length === 2
      ? canonicalFourTeamDependencies(initialDomains as [GroupDependencyMatch, GroupDependencyMatch])
      : []
    for (const match of groupMatches) {
      const groupMatchNumber = numberById.get(match.id) ?? 0
      const dependency = specs.find(spec => spec.groupMatchNumber === groupMatchNumber)
      domains.push({
        id: match.id,
        groupId: group.id,
        groupOrder: group.order,
        groupMatchNumber,
        round: match.round,
        team1Id: match.team1_id,
        team2Id: match.team2_id,
        winnerTeamId: match.winner_team_id,
        source1: dependency?.source1 ?? null,
        source2: dependency?.source2 ?? null,
      })
    }
  }
  return domains
}

async function readGroupMatches(clubId: string, tournamentId: string) {
  const result = await supabaseAdmin
    .from('tournament_matches')
    .select('id,tournament_id,club_id,group_id,team1_id,team2_id,winner_team_id,round,match_order,status,score,scheduled_at')
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)
    .eq('phase', 'GROUP')
    .order('match_order')
  if (result.error) throw new Error(`No pude leer los partidos: ${result.error.message}`)
  return (result.data ?? []) as MatchRow[]
}

export async function repairAndScheduleTournamentGroups(input: { clubId: string; tournamentId: string }) {
  const [tournamentResult, groupsResult, teamsResult] = await Promise.all([
    supabaseAdmin.from('tournaments').select('id,club_id,start_date,end_date,rules_json,rules').eq('id', input.tournamentId).eq('club_id', input.clubId).maybeSingle(),
    supabaseAdmin.from('tournament_groups').select('id,name,size,order').eq('tournament_id', input.tournamentId).order('order'),
    supabaseAdmin.from('tournament_group_teams').select('group_id').eq('tournament_id', input.tournamentId),
  ])
  if (tournamentResult.error) throw new Error(`No pude leer el torneo: ${tournamentResult.error.message}`)
  if (!tournamentResult.data) throw new Error('Torneo no encontrado.')
  if (groupsResult.error || teamsResult.error) throw new Error(groupsResult.error?.message ?? teamsResult.error?.message ?? 'No pude leer los grupos.')
  const groups = (groupsResult.data ?? []) as GroupRow[]
  const teamCounts = new Map<string, number>()
  for (const team of (teamsResult.data ?? []) as Array<{ group_id: string }>) teamCounts.set(team.group_id, (teamCounts.get(team.group_id) ?? 0) + 1)
  for (const group of groups) if ((teamCounts.get(group.id) ?? 0) !== group.size) throw new Error(`El Grupo ${group.name} no tiene sus ${group.size} parejas completas.`)

  const before = await readGroupMatches(input.clubId, input.tournamentId)
  for (const group of groups.filter(item => item.size === 4)) {
    const existingGroupMatches = before.filter(match => match.group_id === group.id)
    if (existingGroupMatches.length >= 4) continue
    await materializeOpenGroupDependentMatches({ clubId: input.clubId, tournamentId: input.tournamentId, groupId: group.id })
  }
  const matches = await readGroupMatches(input.clubId, input.tournamentId)
  const created = Math.max(0, matches.length - before.length)
  const rules = object(tournamentResult.data.rules_json ?? tournamentResult.data.rules)
  const schedule = normalizeScheduleConfig(rules.schedule_config, { startDate: tournamentResult.data.start_date, endDate: tournamentResult.data.end_date })
  let scheduled = 0
  let courtsCount = 0
  let scheduledMatches = Object.keys(readMatchScheduleAssignments(rules.match_schedule_assignments)).length

  if (schedule.mode === 'AUTO') {
    const courtResult = await supabaseAdmin
      .from('tournament_court_assignments')
      .select('court_id,sort_order,court_snapshot,tournament_venues!inner(club_venues!inner(club_id))')
      .eq('tournament_id', input.tournamentId)
      .eq('status', 'ACTIVE')
      .order('sort_order')
    if (courtResult.error) throw new Error(`No pude leer las canchas seleccionadas: ${courtResult.error.message}`)
    const canonical = canonicalCourts((courtResult.data ?? []) as unknown as CourtAssignmentRow[], input.clubId)
    const courts = canonical.length ? canonical : normalizeTournamentCourts(rules.tournament_courts)
    courtsCount = courts.length
    if (!courts.length) throw new Error('El cronograma automático necesita al menos una cancha.')
    const plan = buildDependencyAwareGroupSchedule({
      matches: buildDomains(matches, groups), courts, date: schedule.groups.date,
      startTime: schedule.groups.start_time, endTime: schedule.groups.end_time,
      matchDurationMinutes: schedule.match_duration_minutes, minimumRestMinutes: schedule.match_duration_minutes,
    })
    if (plan.unassignedMatchIds.length) throw new Error(`No pudimos ubicar ${plan.unassignedMatchIds.length} partido(s) respetando dependencias y descansos.`)
    const existing = readMatchScheduleAssignments(rules.match_schedule_assignments)
    const next = { ...existing }
    for (const assignment of plan.assignments) {
      if (existing[assignment.match_id]) continue
      const change = await supabaseAdmin.from('tournament_matches').update({ scheduled_at: assignment.scheduled_at })
        .eq('id', assignment.match_id).eq('tournament_id', input.tournamentId).eq('club_id', input.clubId)
      if (change.error) throw new Error(`No pude programar un partido: ${change.error.message}`)
      next[assignment.match_id] = assignment
      scheduled += 1
    }
    if (scheduled) {
      const nextRules = { ...rules, match_schedule_assignments: next }
      const save = await supabaseAdmin.from('tournaments').update({ rules_json: nextRules, rules: nextRules })
        .eq('id', input.tournamentId).eq('club_id', input.clubId)
      if (save.error) throw new Error(`No pude guardar el cronograma: ${save.error.message}`)
    }
    scheduledMatches = Object.keys(next).length
  }
  return { groups: groups.length, matches: matches.length, created, updated: 0, scheduled, scheduledMatches, courtsCount, scheduleApplied: schedule.mode === 'AUTO' }
}
