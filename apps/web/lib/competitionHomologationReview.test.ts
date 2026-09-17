import assert from 'node:assert/strict'
import test from 'node:test'
import type * as ReviewModule from '../features/competition/homologation/competition-homologation-review'

const { buildHomologationTeamResults } = await import(new URL('../features/competition/homologation/competition-homologation-review.ts', import.meta.url).href) as typeof ReviewModule

const roles = ['CHAMPION', 'RUNNER_UP', ...Array(2).fill('SEMIFINALIST'), ...Array(4).fill('QUARTERFINALIST'), ...Array(11).fill('PARTICIPANT')]
const results = roles.map((result_role, index) => ({
  id: `result-${index + 1}`,
  tournament_team_id: `team-${index + 1}`,
  result_role,
  final_position: index < 2 ? index + 1 : null,
  result_snapshot: { team_id: `team-${index + 1}` },
}))
const participants = roles.flatMap((_, index) => [1, 2].map(player => ({
  id: `participant-${index + 1}-${player}`,
  tournament_team_id: `team-${index + 1}`,
  participant_snapshot: { team_id: `team-${index + 1}`, display_name: `Jugador ${index + 1}.${player}` },
})))

test('real review fixture keeps 38 individual participants and projects 19 teams', () => {
  const teams = buildHomologationTeamResults(participants, results)
  assert.equal(participants.length, 38)
  assert.equal(teams.length, 19)
  assert.equal(teams[0].pairName, 'Jugador 1.1 / Jugador 1.2')
  assert.ok(teams.every(team => team.participantNames.length === 2))
})

test('team results preserve canonical playoff tiers without invented ordinal positions', () => {
  const teams = buildHomologationTeamResults(participants, results)
  const counts = Object.fromEntries([...new Set(roles)].map(role => [role, teams.filter(team => team.resultRole === role).length]))
  assert.deepEqual(counts, { CHAMPION: 1, RUNNER_UP: 1, SEMIFINALIST: 2, QUARTERFINALIST: 4, PARTICIPANT: 11 })
  assert.deepEqual(teams.slice(0, 8).map(team => team.resultLabel), ['Campeón', 'Subcampeón', 'Semifinalista', 'Semifinalista', 'Cuartofinalista', 'Cuartofinalista', 'Cuartofinalista', 'Cuartofinalista'])
  assert.equal(teams.at(-1)?.resultLabel, 'Participante')
})

test('missing final_position never turns a participant into a semifinalist', () => {
  const teams = buildHomologationTeamResults(participants.slice(-2), [{ tournament_team_id: 'team-19', final_position: null }])
  assert.equal(teams[0].resultRole, 'PARTICIPANT')
  assert.equal(teams[0].resultLabel, 'Participante')
})

test('duplicate player-shaped result rows still collapse by tournament_team_id', () => {
  const duplicatedResults = results.flatMap(result => [result, { ...result, id: `${result.id}-duplicate` }])
  assert.equal(duplicatedResults.length, 38)
  assert.equal(buildHomologationTeamResults(participants, duplicatedResults).length, 19)
})
