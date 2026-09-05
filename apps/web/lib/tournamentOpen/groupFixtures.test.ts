import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateTournamentGroupStandings } from '../tournamentStandings'
import {
  buildOpenGroupDependentFixture,
  buildOpenGroupInitialFixture,
  getOpenGroupProjectedMatchCount,
} from './groupFixtures'
import { assertOpenGroupsComplete } from '../tournamentOpenPlayoff'

const teams = [1, 2, 3, 4].map((seed) => ({ teamId: `team-${seed}`, seed }))

test('OPEN de tres conserva round robin de tres partidos', () => {
  const fixture = buildOpenGroupInitialFixture(teams.slice(0, 3))
  assert.equal(getOpenGroupProjectedMatchCount(3), 3)
  assert.equal(fixture.initialMatches.length, 3)
})

test('OPEN de cuatro persiste dos iniciales y proyecta cuatro', () => {
  const fixture = buildOpenGroupInitialFixture(teams)
  assert.equal(getOpenGroupProjectedMatchCount(4), 4)
  assert.deepEqual(fixture.initialMatches.map((match) => [match.team1Id, match.team2Id]), [
    ['team-1', 'team-4'],
    ['team-2', 'team-3'],
  ])
})

test('OPEN de cuatro espera ambas iniciales y luego construye Ganadores/Ganadores y Perdedores/Perdedores', () => {
  const initial = buildOpenGroupInitialFixture(teams)
  assert.equal(buildOpenGroupDependentFixture({
    initialMatches: [{ team1Id: initial.initialMatches[0]!.team1Id, team2Id: initial.initialMatches[0]!.team2Id, winnerTeamId: 'team-1' }],
  }), null)

  const dependent = buildOpenGroupDependentFixture({
    initialMatches: [
      { team1Id: 'team-1', team2Id: 'team-4', winnerTeamId: 'team-1' },
      { team1Id: 'team-2', team2Id: 'team-3', winnerTeamId: 'team-2' },
    ],
  })
  assert.deepEqual(dependent?.map((match) => [match.team1Id, match.team2Id]), [
    ['team-1', 'team-2'],
    ['team-4', 'team-3'],
  ])
})

test('standings OPEN 2/1 deja dos PJ para cada pareja de un grupo de cuatro', () => {
  const standings = calculateTournamentGroupStandings({
    groups: [{ id: 'group-a', tournament_id: 'tournament', name: 'A', size: 4, order: 1 }],
    groupTeams: teams.map((team) => ({ group_id: 'group-a', tournament_id: 'tournament', team_id: team.teamId, seed: team.seed })),
    matches: [
      { id: 'm1', group_id: 'group-a', phase: 'GROUP', status: 'PLAYED', team1_id: 'team-1', team2_id: 'team-4', winner_team_id: 'team-1', score: { sets: [{ team1: 6, team2: 2 }, { team1: 6, team2: 2 }] } },
      { id: 'm2', group_id: 'group-a', phase: 'GROUP', status: 'PLAYED', team1_id: 'team-2', team2_id: 'team-3', winner_team_id: 'team-2', score: { sets: [{ team1: 6, team2: 4 }, { team1: 6, team2: 4 }] } },
      { id: 'm3', group_id: 'group-a', phase: 'GROUP', status: 'PLAYED', team1_id: 'team-1', team2_id: 'team-2', winner_team_id: 'team-1', score: { sets: [{ team1: 6, team2: 4 }, { team1: 6, team2: 4 }] } },
      { id: 'm4', group_id: 'group-a', phase: 'GROUP', status: 'PLAYED', team1_id: 'team-4', team2_id: 'team-3', winner_team_id: 'team-3', score: { sets: [{ team1: 3, team2: 6 }, { team1: 4, team2: 6 }] } },
    ],
    classificationRules: { points_for_win: 2, points_for_loss: 1 },
  })
  assert.deepEqual(standings[0]?.standings.map((row) => row.played), [2, 2, 2, 2])
  assert.equal(standings[0]?.standings[0]?.match_points, 4)
})

test('preflight OPEN acepta cuatro cruces canónicos y bloquea los seis del round robin viejo', () => {
  const group = { id: 'group-a', tournament_id: 'tournament', name: 'A', size: 4, order: 1 }
  const groupTeams = teams.map((team) => ({ group_id: group.id, tournament_id: 'tournament', team_id: team.teamId, seed: team.seed }))
  const canonicalMatchTuples: Array<[string, string, string, number]> = [
    ['team-1', 'team-4', 'team-1', 1], ['team-2', 'team-3', 'team-2', 1],
    ['team-1', 'team-2', 'team-1', 2], ['team-4', 'team-3', 'team-3', 2],
  ]
  const canonicalMatches = canonicalMatchTuples.map(([team1_id, team2_id, winner_team_id, round], index) => ({
    id: `m-${index}`, tournament_id: 'tournament', club_id: 'club', group_id: group.id, phase: 'GROUP', status: 'PLAYED', score: {},
    team1_id, team2_id, winner_team_id, round: Number(round),
  }))
  assert.doesNotThrow(() => assertOpenGroupsComplete({ groups: [group], groupTeams, matches: canonicalMatches }))

  const oldRoundRobin = [
    { ...canonicalMatches[0]! },
    { ...canonicalMatches[1]! },
    { ...canonicalMatches[2]!, id: 'legacy-1', team1_id: 'team-1', team2_id: 'team-3', round: 2 },
    { ...canonicalMatches[3]!, id: 'legacy-2', team1_id: 'team-4', team2_id: 'team-2', round: 2 },
    { ...canonicalMatches[2]!, id: 'legacy-3', team1_id: 'team-1', team2_id: 'team-2', round: 3 },
    { ...canonicalMatches[3]!, id: 'legacy-4', team1_id: 'team-3', team2_id: 'team-4', round: 3 },
  ]
  assert.throws(() => assertOpenGroupsComplete({ groups: [group], groupTeams, matches: oldRoundRobin }))
})
