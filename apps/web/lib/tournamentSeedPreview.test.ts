import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { buildCircuitSeedPreview, circuitPointsByPlayer } = await import(new URL('./tournamentCircuitSeeding.ts', import.meta.url).href) as typeof import('./tournamentCircuitSeeding')

test('preview exposes individual circuit points and the exact deterministic seed order without writes', () => {
  const points = circuitPointsByPlayer([
    { series_division_id: 'noviembre-division', player_id: 'A', points: 500 },
    { series_division_id: 'noviembre-division', player_id: 'B', points: 400 },
    { series_division_id: 'otra-division', player_id: 'C', points: 9999 },
  ], 'noviembre-division')
  const teams = [
    { id: 'later', player1_user_id: 'A', player2_user_id: 'B', registration_created_at: '2026-10-02T00:00:00Z' },
    { id: 'earlier-b', player1_user_id: 'B', player2_user_id: 'A', registration_created_at: '2026-10-01T00:00:00Z' },
    { id: 'earlier-a', player1_user_id: 'A', player2_user_id: 'B', registration_created_at: '2026-10-01T00:00:00Z' },
    { id: 'no-ranking', player1_user_id: 'C', player2_user_id: 'D', registration_created_at: '2026-09-01T00:00:00Z' },
  ]
  const preview = buildCircuitSeedPreview(teams, points)
  assert.deepEqual(preview.map(row => [row.seed, row.team_id, row.player1_points, row.player2_points, row.team_score]), [
    [1, 'earlier-a', 500, 400, 900],
    [2, 'earlier-b', 400, 500, 900],
    [3, 'later', 500, 400, 900],
    [4, 'no-ranking', 0, 0, 0],
  ])
  assert.deepEqual(buildCircuitSeedPreview([...teams].reverse(), points), preview)
  assert.deepEqual(teams.map(team => team.id), ['later', 'earlier-b', 'earlier-a', 'no-ranking'])
})

test('registration preview shares the circuit scope and eligibility gate with snapshot generation, never legacy points', () => {
  const route = readFileSync(new URL('../app/api/clubs/[clubId]/tournaments/[tournamentId]/registrations/route.ts', import.meta.url), 'utf8')
  const generator = readFileSync(new URL('./tournamentTeamSeeding.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/(app)/club/torneos/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /seedSource: typeof json\?\.meta\?\.seedSource === 'string' \? json\.meta\.seedSource : undefined/)
  assert.match(route, /getCompetitionSeedScope\(\{/)
  assert.match(route, /accessToken: user\.accessToken/)
  assert.match(route, /getTournamentRegistrationEligibilityGate\(\{ clubId, tournamentId \}\)/)
  assert.match(route, /registration\.status !== 'CONFIRMED' \|\| blockedSeedRegistrationIds\.has\(registration\.id\)/)
  assert.match(route, /buildCircuitSeedPreview\(seedPreviewTeams, competitionSeedScope\.pointsByUserId\)/)
  assert.doesNotMatch(route, /from\('club_players'\)|clubPlayers|ClubPlayerRow/)
  assert.match(generator, /circuitPointsByPlayer\([\s\S]*?eventDivision\.series_division_id\)/)
  assert.match(generator, /if \(\(existingCount \?\? 0\) > 0\)[\s\S]*?'SEED_SNAPSHOT_ALREADY_EXISTS'/)
  assert.match(route, /seedSnapshot\?\.player1_points \?\? score\.player1_points/)
  assert.match(route, /seedSnapshot\?\.player2_points \?\? score\.player2_points/)
})
