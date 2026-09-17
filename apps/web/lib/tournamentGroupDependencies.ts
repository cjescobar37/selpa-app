import type { MatchScheduleAssignment, ScheduleCapacity, TournamentCourtConfig } from './tournamentSchedule'
import { calculateScheduleCapacity } from './tournamentSchedule'

export type GroupDependencyOutcome = 'WINNER' | 'LOSER'
export type GroupDependencyMatch = {
  id: string
  groupId: string
  groupOrder: number
  groupMatchNumber: number
  round: number
  team1Id: string | null
  team2Id: string | null
  winnerTeamId?: string | null
  source1?: { matchId: string; outcome: GroupDependencyOutcome } | null
  source2?: { matchId: string; outcome: GroupDependencyOutcome } | null
}

export type GroupOrderedMatch = {
  id: string
  groupId: string | null
  round: number
  matchOrder: number
}

export function deriveGroupMatchNumbers(matches: GroupOrderedMatch[]) {
  const numbers = new Map<string, number>()
  const groupIds = [...new Set(matches.map(match => match.groupId).filter((id): id is string => Boolean(id)))]
  for (const groupId of groupIds) {
    const ordered = matches
      .filter(match => match.groupId === groupId)
      .sort((left, right) => left.round - right.round || left.matchOrder - right.matchOrder || left.id.localeCompare(right.id))
    ordered.forEach((match, index) => numbers.set(match.id, index + 1))
  }
  return numbers
}

export function resolveSourceParticipant(source: GroupDependencyMatch | undefined, outcome: GroupDependencyOutcome) {
  if (!source) return null
  if (!source.winnerTeamId || !source.team1Id || !source.team2Id) return null
  if (source.winnerTeamId !== source.team1Id && source.winnerTeamId !== source.team2Id) return null
  return outcome === 'WINNER'
    ? source.winnerTeamId
    : source.winnerTeamId === source.team1Id ? source.team2Id : source.team1Id
}

export function resolveGroupDependencies(matches: GroupDependencyMatch[]) {
  const byId = new Map(matches.map(match => [match.id, match]))
  return matches.map(match => ({
    ...match,
    team1Id: match.team1Id ?? (match.source1 ? resolveSourceParticipant(byId.get(match.source1.matchId), match.source1.outcome) : null),
    team2Id: match.team2Id ?? (match.source2 ? resolveSourceParticipant(byId.get(match.source2.matchId), match.source2.outcome) : null),
  }))
}

export function canonicalFourTeamDependencies(initialMatches: [GroupDependencyMatch, GroupDependencyMatch]) {
  const [first, second] = initialMatches
  return [
    { groupMatchNumber: 3, source1: { matchId: first.id, outcome: 'WINNER' as const }, source2: { matchId: second.id, outcome: 'WINNER' as const } },
    { groupMatchNumber: 4, source1: { matchId: first.id, outcome: 'LOSER' as const }, source2: { matchId: second.id, outcome: 'LOSER' as const } },
  ]
}

export function missingCanonicalFourTeamDependencies(initialMatches:[GroupDependencyMatch,GroupDependencyMatch],existingNumbers:number[]){
  const existing=new Set(existingNumbers)
  return canonicalFourTeamDependencies(initialMatches).filter(spec=>!existing.has(spec.groupMatchNumber))
}

export function resolveFourTeamFinalOrder(matches: GroupDependencyMatch[]) {
  const resolved = resolveGroupDependencies(matches)
  const winnersFinal = resolved.find(match => match.groupMatchNumber === 3)
  const losersFinal = resolved.find(match => match.groupMatchNumber === 4)
  if (!winnersFinal?.winnerTeamId || !losersFinal?.winnerTeamId || !winnersFinal.team1Id || !winnersFinal.team2Id || !losersFinal.team1Id || !losersFinal.team2Id) return null
  return [
    winnersFinal.winnerTeamId,
    winnersFinal.winnerTeamId === winnersFinal.team1Id ? winnersFinal.team2Id : winnersFinal.team1Id,
    losersFinal.winnerTeamId,
    losersFinal.winnerTeamId === losersFinal.team1Id ? losersFinal.team2Id : losersFinal.team1Id,
  ]
}

type DependencyScheduleInput = {
  matches: GroupDependencyMatch[]
  courts: TournamentCourtConfig[]
  date: string
  startTime: string
  endTime: string
  matchDurationMinutes: number
  minimumRestMinutes: number
}

function minutes(value: string) { const [h,m] = value.split(':').map(Number); return h * 60 + m }
function instant(date: string, totalMinutes: number) { const [y,m,d] = date.split('-').map(Number); return new Date(y,m-1,d,Math.floor(totalMinutes/60),totalMinutes%60).toISOString() }

export function buildDependencyAwareGroupSchedule(input: DependencyScheduleInput): { capacity: ScheduleCapacity; assignments: MatchScheduleAssignment[]; unassignedMatchIds: string[] } {
  const capacity = calculateScheduleCapacity({ courtsCount: input.courts.length, startTime: input.startTime, endTime: input.endTime, matchDurationMinutes: input.matchDurationMinutes, totalMatches: input.matches.length })
  if (!capacity.isEnough || !input.courts.length) return { capacity, assignments: [], unassignedMatchIds: input.matches.map(match => match.id) }
  const restSlots = Math.ceil(input.minimumRestMinutes / input.matchDurationMinutes)
  // Intercalar los grupos por ronda evita que un grupo monopolice los primeros
  // turnos y deje huecos imposibles de utilizar al final de la jornada.
  const ordered = [...input.matches].sort((a,b) => a.round-b.round || a.groupMatchNumber-b.groupMatchNumber || a.groupOrder-b.groupOrder || a.id.localeCompare(b.id))
  const sourceMap = new Map(ordered.map(match => [match.id, match]))
  const placed = new Map<string,{slot:number;court:number;teams:Set<string>;match:GroupDependencyMatch}>()
  const courtLoads = new Map<number,number>()
  const assignments: MatchScheduleAssignment[] = []
  const possibleTeams = (match: GroupDependencyMatch) => {
    if (match.team1Id && match.team2Id) return new Set([match.team1Id,match.team2Id])
    const sources = [match.source1,match.source2].flatMap(source => source ? [sourceMap.get(source.matchId)] : []).filter(Boolean) as GroupDependencyMatch[]
    return new Set(sources.flatMap(source => [source.team1Id,source.team2Id].filter((id): id is string => Boolean(id))))
  }
  const complementarySiblings = (a:GroupDependencyMatch,b:GroupDependencyMatch) => a.round === 2 && b.round === 2 && a.groupId === b.groupId && [a.source1?.matchId,a.source2?.matchId].sort().join(':') === [b.source1?.matchId,b.source2?.matchId].sort().join(':')

  for (const match of ordered) {
    const teams = possibleTeams(match)
    const dependencySlots = [match.source1,match.source2].flatMap(source => source && placed.has(source.matchId) ? [placed.get(source.matchId)!.slot] : [])
    const earliest = dependencySlots.length ? Math.max(...dependencySlots) + 1 + restSlots : 0
    const preferredComplex = [...placed.values()].find(value => value.match.groupId === match.groupId)?.court
    const candidates: Array<{slot:number;court:number;score:number}> = []
    for (let slot=earliest; slot<capacity.slotsPerCourt; slot++) for (let court=0; court<input.courts.length; court++) {
      if ([...placed.values()].some(value => value.slot === slot && value.court === court)) continue
      const collision = [...placed.values()].some(value => value.slot === slot && !complementarySiblings(value.match,match) && [...teams].some(team => value.teams.has(team)))
      if (collision) continue
      const restConflict = [...placed.values()].some(value => !complementarySiblings(value.match,match) && [...teams].some(team => value.teams.has(team)) && Math.abs(slot-value.slot) < 1+restSlots)
      if (restConflict) continue
      const sameComplex = preferredComplex === undefined || input.courts[preferredComplex]?.complex_name === input.courts[court]?.complex_name
      candidates.push({slot,court,score:slot*100+(sameComplex?0:20)+(courtLoads.get(court)??0)})
    }
    candidates.sort((a,b)=>a.score-b.score||a.court-b.court)
    const best=candidates[0]
    if(!best) continue
    placed.set(match.id,{slot:best.slot,court:best.court,teams,match}); courtLoads.set(best.court,(courtLoads.get(best.court)??0)+1)
    const court=input.courts[best.court]!
    assignments.push({match_id:match.id,scheduled_at:instant(input.date,minutes(input.startTime)+best.slot*input.matchDurationMinutes),court_name:court.name,...(court.id?{court_id:court.id}:{}),court_source:court.source,court_complex_name:court.complex_name??null})
  }
  return { capacity, assignments, unassignedMatchIds: ordered.filter(match=>!placed.has(match.id)).map(match=>match.id) }
}
