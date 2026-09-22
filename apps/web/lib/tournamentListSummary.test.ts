import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { buildTournamentListSummaries } from './tournamentListSummary'
import { getTournamentOperationalStatus } from './tournamentDisplayStatus'

const listRoute = readFileSync(resolve(process.cwd(), 'app/api/clubs/[clubId]/tournaments/route.ts'), 'utf8')
const listPage = readFileSync(resolve(process.cwd(), 'app/(app)/club/torneos/page.tsx'), 'utf8')

const summaries = buildTournamentListSummaries({
  tournaments: [
    { id: 'draft', status: 'DRAFT' },
    { id: 'groups', status: 'OPEN' },
    { id: 'playoff', status: 'OPEN' },
    { id: 'finished', status: 'FINISHED' },
  ],
  registrations: [
    { tournament_id: 'groups', status: 'CONFIRMED' },
    { tournament_id: 'groups', status: 'CONFIRMED' },
    { tournament_id: 'groups', status: 'PENDING' },
    { tournament_id: 'another-club', status: 'CONFIRMED' },
  ],
  groups: [
    { id: 'group-1', tournament_id: 'groups' },
    { id: 'foreign-group', tournament_id: 'another-club' },
  ],
  matches: [
    {
      id: 'group-match', tournament_id: 'groups', phase: 'GROUP', status: 'PLAYED',
      winner_team_id: 'team-1', round: 1, match_order: 1, created_at: '2026-01-01T10:00:00Z',
    },
    {
      id: 'semi', tournament_id: 'playoff', phase: 'SEMI', status: 'PLAYED',
      winner_team_id: 'team-2', round: 1, match_order: 1, created_at: '2026-01-02T10:00:00Z',
    },
    {
      id: 'pending-final', tournament_id: 'playoff', phase: 'FINAL', status: 'SCHEDULED',
      winner_team_id: null, round: 2, match_order: 1, created_at: '2026-01-03T10:00:00Z',
    },
    {
      id: 'played-final', tournament_id: 'finished', phase: 'FINAL', status: 'PLAYED',
      winner_team_id: 'champion', round: 2, match_order: 1, created_at: '2026-01-04T10:00:00Z',
    },
  ],
})

test('builds the minimal list summary for multiple tournaments in one aggregation', () => {
  assert.deepEqual(Object.keys(summaries), ['draft', 'groups', 'playoff', 'finished'])
  assert.equal(summaries.groups.operationalStage, 'GRUPOS')
  assert.equal(summaries.groups.counts.registrations.confirmed, 2)
  assert.equal(summaries.groups.counts.groups, 1)
  assert.equal(summaries.groups.counts.groupMatches.total, 1)
  assert.equal(summaries.playoff.operationalStage, 'PLAYOFF')
  assert.equal(summaries.playoff.currentPlayoffPhase, 'FINAL')
  assert.deepEqual(summaries.playoff.final, { status: 'SCHEDULED' })
  assert.deepEqual(summaries.finished.champion, { team_id: 'champion' })
  assert.equal('score' in summaries.playoff, false)
  assert.equal('teams' in summaries.playoff.counts, false)
})

test('does not emit summaries for rows outside the authorized tournament list', () => {
  assert.equal(summaries['another-club'], undefined)
  assert.match(listRoute, /\.from\('tournaments'\)[\s\S]*?\.eq\('club_id', clubId\)/)
  assert.match(listRoute, /\.from\('tournament_registrations'\)[\s\S]*?\.eq\('club_id', clubId\)[\s\S]*?\.in\('tournament_id', tournamentIds\)/)
  assert.match(listRoute, /\.from\('tournament_matches'\)[\s\S]*?\.eq\('club_id', clubId\)[\s\S]*?\.in\('tournament_id', tournamentIds\)/)
})

test('preserves the operational labels consumed by tournament cards', () => {
  assert.equal(getTournamentOperationalStatus({ operationalStage: summaries.draft.operationalStage, status: 'DRAFT' }).label, 'Borrador')
  assert.equal(getTournamentOperationalStatus({ operationalStage: summaries.groups.operationalStage, status: 'OPEN', counts: summaries.groups.counts }).label, 'En curso: Grupos')
  assert.equal(getTournamentOperationalStatus({ operationalStage: summaries.playoff.operationalStage, status: 'OPEN', counts: summaries.playoff.counts, final: summaries.playoff.final, currentPlayoffPhase: summaries.playoff.currentPlayoffPhase }).label, 'En vivo: Final')
  assert.equal(getTournamentOperationalStatus({ operationalStage: summaries.finished.operationalStage, status: 'FINISHED', champion: summaries.finished.champion }).label, 'Finalizado')
})

test('list page consumes the batch DTO without per-tournament summary fetches', () => {
  assert.doesNotMatch(listPage, /loadTournamentStages/)
  assert.doesNotMatch(listPage, /tournaments\/\$\{tournament\.id\}\/summary/)
  assert.match(listPage, /tournament\.summary\.operationalStage/)
})

test('GET uses three constant batch queries and does not move N+1 into the backend', () => {
  const getSource = listRoute.split('export async function POST')[0]
  assert.match(getSource, /Promise\.all\(\[/)
  assert.equal((getSource.match(/\.in\('tournament_id', tournamentIds\)/g) ?? []).length, 3)
  assert.doesNotMatch(getSource, /rows\.map\(async/)
  assert.match(getSource, /\.select\('tournament_id,status'\)/)
  assert.match(getSource, /\.select\('id,tournament_id'\)/)
  assert.match(getSource, /\.select\('id,tournament_id,phase,status,winner_team_id,round,match_order,created_at'\)/)
})

test('mutation code remains separate from the read-only batch path', () => {
  const postSource = listRoute.split('export async function POST')[1]
  assert.ok(postSource)
  assert.doesNotMatch(postSource, /buildTournamentListSummaries|tournament_groups|tournament_matches/)
  assert.match(postSource, /create_tournament_canonical/)
})
