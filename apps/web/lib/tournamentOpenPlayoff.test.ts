import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const modulePromise = import('./tournamentOpenPlayoff')

function tournament(overrides: Record<string, unknown>) {
  return {
    id: 'tournament-1',
    club_id: 'club-1',
    name: 'Test',
    format: null,
    type: null,
    tournament_type: null,
    classification_rules: null,
    start_date: null,
    end_date: null,
    rules_json: null,
    rules: null,
    ...overrides,
  }
}

test('MASTER con rules.competition_system ZONE_PLAYOFF es compatible', async () => {
  const { isOpenCompatibleTournament } = await modulePromise
  assert.equal(isOpenCompatibleTournament(tournament({
    tournament_type: 'MASTER',
    rules: { competition_system: 'ZONE_PLAYOFF' },
  })), true)
})

test('MASTER con format GROUPS_ELIMINATION es compatible', async () => {
  const { isOpenCompatibleTournament } = await modulePromise
  assert.equal(isOpenCompatibleTournament(tournament({
    tournament_type: 'MASTER',
    format: 'GROUPS_ELIMINATION',
  })), true)
})

test('OPEN con ZONE_PLAYOFF es compatible', async () => {
  const { isOpenCompatibleTournament } = await modulePromise
  assert.equal(isOpenCompatibleTournament(tournament({
    tournament_type: 'OPEN',
    format: 'ZONE_PLAYOFF',
  })), true)
})

test('rechaza un formato y sistema no compatibles', async () => {
  const { isOpenCompatibleTournament } = await modulePromise
  assert.equal(isOpenCompatibleTournament(tournament({
    tournament_type: 'OPEN',
    format: 'ROUND_ROBIN',
    rules: { competition_system: 'LEAGUE' },
  })), false)
})

test('la compatibilidad no depende de tournament_type OPEN', async () => {
  const { isOpenCompatibleTournament } = await modulePromise
  assert.equal(isOpenCompatibleTournament(tournament({
    tournament_type: 'MASTER',
    format: 'GROUPS_ELIM',
  })), true)
  assert.equal(isOpenCompatibleTournament(tournament({
    tournament_type: 'OPEN',
    format: 'ROUND_ROBIN',
  })), false)
})
