export type CircuitRankingEntry = {
  position: number
  points: number
  events_played: number
  titles: number
  rule_snapshot?: Record<string, unknown> | null
}

export type CircuitAward = {
  id: string
  player_id: string
  settlement_id: string
  event_id: string
  event_name: string
  event_date: string | null
  ranking_at: string | null
  tournament_name: string | null
  tournament_team_id: string
  corrected_from_id: string | null
  result_code: string
  base_points: number
  bonus_points: number
  penalty_points: number
  multiplier: number
  total_points: number
}

export type CircuitMovement = {
  id: string
  points: number
  reversed_transaction_id: string | null
  metadata: Record<string, unknown> | null
}

export type CircuitHistoryRow = {
  eventId: string
  eventName: string
  eventDate: string | null
  result: string
  points: number
  corrected: boolean
  counted: boolean
  base: number
  bonus: number
  penalty: number
  multiplier: number
  showBreakdown: boolean
}

const resultLabels: Record<string, string> = {
  CHAMPION: 'Campeón', RUNNER_UP: 'Subcampeón', SEMIFINALIST: 'Semifinalista',
  QUARTERFINALIST: 'Cuartofinalista', EIGHTH_FINALIST: 'Octavos', SIXTEENTH_FINALIST: 'Dieciseisavos', THIRD_PLACE: 'Tercer puesto', PARTICIPANT: 'Participación',
}
const resultPriority: Record<string, number> = {
  CHAMPION: 7, RUNNER_UP: 6, THIRD_PLACE: 5, SEMIFINALIST: 4, QUARTERFINALIST: 3, EIGHTH_FINALIST: 2, SIXTEENTH_FINALIST: 1, PARTICIPANT: 0,
}

export function projectCircuitPointHistory(
  entry: CircuitRankingEntry,
  awards: CircuitAward[],
  movements: CircuitMovement[],
  playerIds: string[],
  mode: 'individual' | 'pairs',
) {
  const selectedPlayers = new Set(playerIds)
  const originals = new Map(movements.filter(row => !row.reversed_transaction_id).map(row => [row.id, row]))
  const effective = new Map<string, { points: number; reversed: boolean }>()
  for (const movement of movements) {
    const original = movement.reversed_transaction_id ? originals.get(movement.reversed_transaction_id) : movement
    const awardId = original?.metadata?.award_id
    if (typeof awardId !== 'string') continue
    const current = effective.get(awardId) ?? { points: 0, reversed: false }
    current.points += Number(movement.points)
    current.reversed ||= Boolean(movement.reversed_transaction_id)
    effective.set(awardId, current)
  }

  const byTeam = new Map<string, CircuitAward[]>()
  for (const award of awards) {
    if (!selectedPlayers.has(award.player_id) || !effective.get(award.id)?.points) continue
    const key = `${award.event_id}:${award.tournament_team_id}`
    byTeam.set(key, [...(byTeam.get(key) ?? []), award])
  }
  const rows: Array<CircuitHistoryRow & { eventKey: string; rankAt: string | null; priority: number }> = []
  for (const team of byTeam.values()) {
    if (mode === 'pairs' && (team.length !== 2 || new Set(team.map(row => row.player_id)).size !== 2)) continue
    const award = [...team].sort((left, right) => (effective.get(right.id)?.points ?? 0) - (effective.get(left.id)?.points ?? 0))[0]
    const points = effective.get(award.id)?.points ?? 0
    rows.push({
      eventId: award.event_id,
      eventKey: award.event_id,
      eventName: award.tournament_name || award.event_name,
      eventDate: award.event_date,
      rankAt: award.ranking_at,
      result: resultLabels[award.result_code] ?? 'Resultado',
      points,
      corrected: team.some(row => Boolean(row.corrected_from_id) || Boolean(effective.get(row.id)?.reversed) || effective.get(row.id)?.points !== row.total_points),
      counted: true,
      base: award.base_points,
      bonus: award.bonus_points,
      penalty: award.penalty_points,
      multiplier: award.multiplier,
      showBreakdown: Math.round((award.base_points + award.bonus_points + award.penalty_points) * award.multiplier) === points &&
        (award.bonus_points !== 0 || award.penalty_points !== 0 || award.multiplier !== 1),
      priority: resultPriority[award.result_code] ?? -1,
    })
  }

  // Ranking P1.1 remains the authority for totals and positions. This only
  // annotates dates excluded by its frozen accumulation rule for explanation.
  const rule = entry.rule_snapshot ?? {}
  const modeName = String(rule.accumulation_mode ?? 'ALL_RESULTS')
  const bestCount = Number(rule.best_results_count ?? 0)
  const discardCount = Number(rule.discard_worst_count ?? 0)
  const byBest = [...rows].sort((a, b) => b.points - a.points || (b.rankAt ?? '').localeCompare(a.rankAt ?? '') || a.eventKey.localeCompare(b.eventKey))
  const byWorst = [...rows].sort((a, b) => a.points - b.points || (a.rankAt ?? '').localeCompare(b.rankAt ?? '') || a.eventKey.localeCompare(b.eventKey))
  if (modeName === 'BEST_N' && bestCount > 0) byBest.slice(bestCount).forEach(row => { row.counted = false })
  if (modeName === 'DROP_WORST_N' && discardCount > 0) byWorst.slice(0, discardCount).forEach(row => { row.counted = false })
  rows.sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? '') || b.eventKey.localeCompare(a.eventKey))
  const best = [...rows].sort((a, b) => b.priority - a.priority)[0]
  return {
    position: entry.position,
    points: entry.points,
    eventsPlayed: entry.events_played,
    titles: entry.titles,
    bestResult: best?.result ?? null,
    latestEvent: rows[0]?.eventName ?? null,
    history: rows.map(row => ({
      eventId: row.eventId, eventName: row.eventName, eventDate: row.eventDate,
      result: row.result, points: row.points, corrected: row.corrected,
      counted: row.counted, base: row.base, bonus: row.bonus,
      penalty: row.penalty, multiplier: row.multiplier, showBreakdown: row.showBreakdown,
    })),
  }
}
