import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'
import type { CircuitAward, CircuitMovement } from '../features/competition/series/competition-series.point-history'

const { projectCircuitPointHistory } = await import(new URL('../features/competition/series/competition-series.point-history.ts', import.meta.url).href) as typeof import('../features/competition/series/competition-series.point-history')

const makeAward = (id: string, event: string, player: string, team: string, points: number, overrides: Partial<CircuitAward> = {}): CircuitAward => ({
  id, player_id: player, settlement_id: `settlement-${event}`, event_id: event,
  event_name: event, event_date: event === 'oct' ? '2026-10-12' : '2026-11-12',
  ranking_at: event === 'oct' ? '2026-10-12T20:00:00Z' : '2026-11-12T20:00:00Z',
  tournament_name: event === 'oct' ? 'Open Octubre' : 'Open Noviembre',
  tournament_team_id: team, corrected_from_id: null, result_code: 'CHAMPION',
  base_points: points, bonus_points: 0, penalty_points: 0, multiplier: 1, total_points: points, ...overrides,
})
const movement = (id: string, awardId: string, points: number, reversedTransactionId: string | null = null): CircuitMovement => ({
  id, points, reversed_transaction_id: reversedTransactionId, metadata: reversedTransactionId ? {} : { award_id: awardId },
})

test('two published dates retain the ranking total and explain result, bonus, penalty and multiplier', () => {
  const awards = [
    makeAward('a1', 'oct', 'A', 'AB-oct', 500, { base_points: 400, bonus_points: 100 }),
    makeAward('a2', 'nov', 'A', 'AB-nov', 350, { base_points: 200, bonus_points: 25, penalty_points: -50, multiplier: 2, result_code: 'SEMIFINALIST' }),
  ]
  const result = projectCircuitPointHistory({ position: 2, points: 850, events_played: 2, titles: 1 }, awards,
    [movement('tx1', 'a1', 500), movement('tx2', 'a2', 350)], ['A'], 'individual')
  assert.equal(result.points, 850)
  assert.equal(result.history.length, 2)
  assert.deepEqual(result.history.map(row => row.points), [350, 500])
  assert.equal(result.bestResult, 'Campeón')
  assert.equal(result.latestEvent, 'Open Noviembre')
  assert.equal(result.history[0].showBreakdown, true)
  assert.deepEqual([result.history[0].base, result.history[0].bonus, result.history[0].penalty, result.history[0].multiplier], [200, 25, -50, 2])
})

test('a reversal and corrected publication appear as one net result, never raw movements', () => {
  const awards = [makeAward('new', 'oct', 'A', 'AB', 400, { corrected_from_id: 'old-settlement' })]
  const result = projectCircuitPointHistory({ position: 1, points: 400, events_played: 1, titles: 1 }, awards,
    [movement('tx-old', 'old', 500), movement('rev-old', 'old', -500, 'tx-old'),
      movement('tx-new', 'new', 400), movement('tx-extra', 'new', 50), movement('rev-extra', 'new', -50, 'tx-extra')], ['A'], 'individual')
  assert.equal(result.history.length, 1)
  assert.equal(result.history[0].points, 400)
  assert.equal(result.history[0].corrected, true)
  assert.equal(result.history[0].showBreakdown, false)
})

test('A+B and B+A form one pair per date, with no double-counting of two player awards', () => {
  const awards = [
    makeAward('a1', 'oct', 'A', 'AB-oct', 500), makeAward('b1', 'oct', 'B', 'AB-oct', 500),
    makeAward('b2', 'nov', 'B', 'BA-nov', 400), makeAward('a2', 'nov', 'A', 'BA-nov', 400),
    makeAward('c2', 'nov', 'C', 'AC-nov', 200), makeAward('a3', 'nov', 'A', 'AC-nov', 200),
  ]
  const movements = awards.map(award => movement(`tx-${award.id}`, award.id, award.total_points))
  const result = projectCircuitPointHistory({ position: 1, points: 900, events_played: 2, titles: 1 }, awards, movements, ['A', 'B'], 'pairs')
  assert.equal(result.history.length, 2)
  assert.deepEqual(result.history.map(row => row.points), [400, 500])
  assert.equal(result.points, 900)
})

test('empty history is explicit and ranking total remains authoritative with BEST_N', () => {
  const empty = projectCircuitPointHistory({ position: 3, points: 0, events_played: 0, titles: 0 }, [], [], ['A'], 'individual')
  assert.equal(empty.history.length, 0)
  assert.equal(empty.bestResult, null)
  const awards = [makeAward('a1', 'oct', 'A', 'AB1', 500), makeAward('a2', 'nov', 'A', 'AB2', 200)]
  const result = projectCircuitPointHistory({ position: 1, points: 500, events_played: 2, titles: 1,
    rule_snapshot: { accumulation_mode: 'BEST_N', best_results_count: 1 } }, awards,
  [movement('tx1', 'a1', 500), movement('tx2', 'a2', 200)], ['A'], 'individual')
  assert.equal(result.points, 500)
  assert.deepEqual(result.history.map(row => row.counted), [false, true])
})

test('detail route keeps circuit/division scoping, published-only points and CLOSED snapshot', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/clubs/[clubId]/competition/series/[seriesId]/ranking/detail/route.ts'), 'utf8')
  const panel = readFileSync(join(process.cwd(), 'app/(app)/club/competition/SeriesRankingPanel.tsx'), 'utf8')
  assert.match(route, /authorizeCompetitionSeries\(request, clubId, 'read'\)/)
  assert.match(route, /\.eq\('series_id', seriesId\)\.eq\('series_division_id', divisionId\)/)
  assert.match(route, /series\.status === 'CLOSED'/)
  assert.match(route, /competition_series_final_pair_rankings/)
  assert.match(route, /competition_series_final_rankings/)
  assert.match(route, /\.eq\('status', 'PUBLISHED'\)\.in\('event_division_id'/)
  assert.match(route, /\.eq\('series_division_id', divisionId\)/)
  assert.match(panel, /pairs\.length > 0/)
  assert.match(panel, /setSelection\(\{ mode: 'individual'/)
  assert.match(panel, /setSelection\(\{ mode: 'pairs'/)
})
