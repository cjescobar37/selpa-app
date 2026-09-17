import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'
import type { CircuitSeedRankingRow } from './tournamentCircuitSeeding'

const { circuitPointsByPlayer, scoreCircuitTeam, compareCircuitSeedCandidates, registrationsClosedForCircuitSeed } = await import(new URL('./tournamentCircuitSeeding.ts', import.meta.url).href) as typeof import('./tournamentCircuitSeeding')
const { buildCircuitSeededDraw, circuitSeedLine } = await import(new URL('./tournamentCircuitDraw.ts', import.meta.url).href) as typeof import('./tournamentCircuitDraw')

test('Fecha 2 uses the cumulative ranking of its own circuit division and missing players get zero', () => {
  const rows: CircuitSeedRankingRow[] = [
    { series_division_id: 'circuit-1', player_id: 'A', points: 500 },
    { series_division_id: 'circuit-1', player_id: 'B', points: '400' },
    { series_division_id: 'circuit-2', player_id: 'A', points: 9000 },
  ]
  const points = circuitPointsByPlayer(rows, 'circuit-1')
  assert.deepEqual(scoreCircuitTeam({ id: 'AB', player1_user_id: 'A', player2_user_id: 'B' }, points), {
    player1_points: 500, player2_points: 400, team_score: 900,
    best_individual_points: 500, worst_individual_points: 400,
  })
  assert.equal(scoreCircuitTeam({ id: 'BA', player1_user_id: 'B', player2_user_id: 'A' }, points).team_score, 900)
  assert.equal(scoreCircuitTeam({ id: 'AC', player1_user_id: 'A', player2_user_id: 'C' }, points).team_score, 500)
  assert.equal(circuitPointsByPlayer(rows, 'circuit-2').get('A'), 9000)
})

test('existing deterministic tie-break orders score, best, worst, registration and team ID', () => {
  const at = '2026-11-01T10:00:00Z'
  const candidates = [
    { team_id: 'b', team_score: 900, best_individual_points: 500, worst_individual_points: 400, registration_created_at: at },
    { team_id: 'a', team_score: 900, best_individual_points: 500, worst_individual_points: 400, registration_created_at: at },
    { team_id: 'c', team_score: 900, best_individual_points: 600, worst_individual_points: 300, registration_created_at: at },
    { team_id: 'd', team_score: 800, best_individual_points: 700, worst_individual_points: 100, registration_created_at: at },
  ]
  assert.deepEqual(candidates.sort(compareCircuitSeedCandidates).map(row => row.team_id), ['c', 'a', 'b', 'd'])
})

test('seed snapshot remains frozen even when circuit points change later', () => {
  const points = new Map([['A', 500], ['B', 400]])
  const snapshot = { ...scoreCircuitTeam({ id: 'AB', player1_user_id: 'A', player2_user_id: 'B' }, points), snapshot_at: '2026-11-01T10:00:00Z' }
  points.set('A', 1000)
  assert.equal(snapshot.team_score, 900)
  assert.equal(snapshot.player1_points, 500)
})

test('circuit seeds cannot freeze before the registration deadline', () => {
  const now = new Date('2026-11-01T10:00:00Z')
  assert.equal(registrationsClosedForCircuitSeed('2026-11-01T10:01:00Z', now), false)
  assert.equal(registrationsClosedForCircuitSeed('2026-11-01T10:00:00Z', now), true)
  assert.equal(registrationsClosedForCircuitSeed(null, now), false)
})

test('8/16/32 draws preserve top regions, protected seeds 5-8 and canonical BYEs', () => {
  for (const count of [7, 8, 13, 14, 15, 16, 25, 32]) {
    const teams = Array.from({ length: count }, (_, index) => ({ teamId: `team-${index + 1}`, seed: index + 1 }))
    const draw = buildCircuitSeededDraw(teams)
    const positions = new Map(draw.slots.filter(slot => slot.seed !== null).map(slot => [slot.seed, slot.position]))
    assert.equal(draw.slots.length, draw.bracketSize)
    assert.equal(new Set(draw.slots.filter(slot => slot.teamId).map(slot => slot.teamId)).size, count)
    assert.deepEqual(draw.byeAdvances.map(item => item.seed).sort((a, b) => a - b),
      Array.from({ length: draw.bracketSize - count }, (_, index) => index + 1))
    assert.equal(draw.matches.length, count - draw.bracketSize / 2)
    assert.ok(draw.matches.every(match => match.advancesToMatchOrder === Math.ceil(match.pairOrder / 2)))
    assert.ok(draw.byeAdvances.every(item => item.advancesToMatchOrder > 0))
    if (draw.bracketSize === 16) {
      assert.deepEqual([1, 2, 3, 4].map(seed => positions.get(seed)), [1, 16, 8, 9])
      assert.deepEqual(new Set([5, 6, 7, 8].map(seed => positions.get(seed))), new Set([4, 5, 12, 13]))
    }
  }
  assert.equal(new Set(circuitSeedLine(32)).size, 32)
})

test('BYEs are structural advances, not matches or synthetic scoring results', () => {
  const draw = buildCircuitSeededDraw(Array.from({ length: 13 }, (_, index) => ({ teamId: `team-${index + 1}`, seed: index + 1 })))
  assert.deepEqual(draw.byeAdvances.map(item => item.seed).sort((a, b) => a - b), [1, 2, 3])
  assert.equal(draw.matches.length, 5)
  assert.ok(draw.matches.every(match => !draw.byeAdvances.some(bye => bye.teamId === match.team1Id || bye.teamId === match.team2Id)))
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260903120000_competition_homologation_full_placements.sql'), 'utf8')
  assert.match(migration, /tier exists only when the Engine recorded a played playoff match/i)
})

test('existing group fixture snakes seeds across groups; group playoff classifies by sports results', () => {
  const fixture = readFileSync(join(process.cwd(), 'supabase/migrations/20260904161000_open_padel_group_fixture.sql'), 'utf8')
  const playoff = readFileSync(join(process.cwd(), 'lib/tournamentOpenPlayoff.ts'), 'utf8')
  const seeding = readFileSync(join(process.cwd(), 'lib/tournamentTeamSeeding.ts'), 'utf8')
  assert.match(fixture, /for v_i in 1\.\.v_group_count loop[\s\S]*?v_forward := not v_forward/)
  assert.match(fixture, /from public\.tournament_team_seed_snapshots/)
  assert.match(playoff, /calculateTournamentGroupStandings/)
  assert.match(playoff, /buildOpenQualificationPlan\(standings\)/)
  assert.match(seeding, /get_competition_series_ranking_by_division/)
  assert.match(seeding, /source_series_id: competitionScope\.sourceSeriesId/)
  assert.match(seeding, /source_event_division_id: competitionScope\.sourceEventDivisionId/)
  assert.match(seeding, /registrationsClosedForCircuitSeed\(tournament\.registration_deadline, new Date\(\)\)/)
})
