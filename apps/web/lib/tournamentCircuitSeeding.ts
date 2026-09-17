export type CircuitSeedRankingRow = {
  series_division_id: string
  player_id: string | null
  points: number | string | null
}

export type CircuitSeedTeam = {
  id: string
  player1_user_id: string
  player2_user_id: string
}

export type CircuitSeedCandidate = {
  team_id: string
  team_score: number
  best_individual_points: number
  worst_individual_points: number
  registration_created_at: string
}

export function circuitPointsByPlayer(rows: CircuitSeedRankingRow[], seriesDivisionId: string) {
  const points = new Map<string, number>()
  for (const row of rows) {
    if (row.series_division_id !== seriesDivisionId || !row.player_id) continue
    const value = Number(row.points)
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_CIRCUIT_RANKING_POINTS')
    if (points.has(row.player_id)) throw new Error('DUPLICATE_CIRCUIT_RANKING_PLAYER')
    points.set(row.player_id, value)
  }
  return points
}

export function scoreCircuitTeam(team: CircuitSeedTeam, pointsByUserId: ReadonlyMap<string, number>) {
  const player1 = pointsByUserId.get(team.player1_user_id) ?? 0
  const player2 = pointsByUserId.get(team.player2_user_id) ?? 0
  return {
    player1_points: player1,
    player2_points: player2,
    team_score: player1 + player2,
    best_individual_points: Math.max(player1, player2),
    worst_individual_points: Math.min(player1, player2),
  }
}

export function registrationsClosedForCircuitSeed(deadline: string | null, now: Date) {
  if (!deadline) return false
  const closesAt = new Date(deadline).getTime()
  return Number.isFinite(closesAt) && closesAt <= now.getTime()
}

export function compareCircuitSeedCandidates(a: CircuitSeedCandidate, b: CircuitSeedCandidate) {
  return b.team_score - a.team_score ||
    b.best_individual_points - a.best_individual_points ||
    b.worst_individual_points - a.worst_individual_points ||
    new Date(a.registration_created_at).getTime() - new Date(b.registration_created_at).getTime() ||
    a.team_id.localeCompare(b.team_id)
}

export function buildCircuitSeedPreview(
  teams: Array<CircuitSeedTeam & { registration_created_at: string }>,
  pointsByUserId: ReadonlyMap<string, number>
) {
  return teams.map((team) => ({
    team_id: team.id,
    registration_created_at: team.registration_created_at,
    ...scoreCircuitTeam(team, pointsByUserId),
  })).sort(compareCircuitSeedCandidates).map((candidate, index) => ({ ...candidate, seed: index + 1 }))
}
