import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'
import type * as RankingGroupsModule from '../features/competition/series/competition-series.ranking-groups'

const { groupSeriesRankingByDivision } = await import(new URL('../features/competition/series/competition-series.ranking-groups.ts', import.meta.url).href) as typeof RankingGroupsModule

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260912190000_competition_series_reversal_aware_ranking.sql'), 'utf8')
const finalization = readFileSync(join(process.cwd(), 'supabase/migrations/20260826134827_competition_series_finalize_champions.sql'), 'utf8')
const pairProjection = readFileSync(join(process.cwd(), 'supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql'), 'utf8')
const ledgerSchema = readFileSync(join(process.cwd(), 'supabase/migrations/20260729_competition_points_ledger_stage4.sql'), 'utf8')
const rankingRoute = readFileSync(join(process.cwd(), 'app/api/clubs/[clubId]/competition/series/[seriesId]/ranking/route.ts'), 'utf8')
const rankingPanel = readFileSync(join(process.cwd(), 'app/(app)/club/competition/SeriesRankingPanel.tsx'), 'utf8')

type Award = { id: string; series: string; division: string; event: string; player: string; team: string; points: number; published: boolean }
type Movement = { id: string; awardId?: string; originalId?: string; points: number }

// Small ledger fixture: the SQL contracts below assert that the database uses
// the same original-transaction link and published-settlement boundary.
const awards: Award[] = [
  { id: '1a', series: 's1', division: 'd1', event: 'e1', player: 'A', team: 'AB', points: 500, published: true },
  { id: '1b', series: 's1', division: 'd1', event: 'e1', player: 'B', team: 'AB', points: 400, published: true },
  { id: '1c', series: 's1', division: 'd1', event: 'e1', player: 'C', team: 'CD', points: 200, published: true },
  { id: '2a', series: 's1', division: 'd1', event: 'e2', player: 'A', team: 'AB', points: 200, published: true },
  { id: '2b', series: 's1', division: 'd1', event: 'e2', player: 'B', team: 'AB', points: 500, published: true },
  { id: '2c', series: 's1', division: 'd1', event: 'e2', player: 'C', team: 'CD', points: 400, published: true },
  { id: 'other-division', series: 's1', division: 'd2', event: 'e2', player: 'A', team: 'AX', points: 900, published: true },
  { id: 'other-series', series: 's2', division: 'd1', event: 'e3', player: 'A', team: 'AB', points: 900, published: true },
]
const originals: Movement[] = awards.map(award => ({ id: award.id, awardId: award.id, points: award.points }))

function effectiveAwards(source: Award[], movements: Movement[], series: string, division: string) {
  const originalById = new Map(movements.filter(row => row.awardId).map(row => [row.id, row]))
  const totalByAward = new Map<string, number>()
  for (const movement of movements) {
    const original = movement.originalId ? originalById.get(movement.originalId) : movement
    if (!original?.awardId) continue
    totalByAward.set(original.awardId, (totalByAward.get(original.awardId) ?? 0) + movement.points)
  }
  return source.filter(row => row.series === series && row.division === division && row.published)
    .map(row => ({ ...row, effectivePoints: totalByAward.get(row.id) ?? 0 }))
    .filter(row => row.effectivePoints !== 0)
}

test('two dates accumulate within one series/division without duplicating an event', () => {
  const result = effectiveAwards(awards, originals, 's1', 'd1')
  const totals = new Map<string, { points: number; events: Set<string> }>()
  for (const row of result) {
    const current = totals.get(row.player) ?? { points: 0, events: new Set<string>() }
    current.points += row.effectivePoints
    current.events.add(row.event)
    totals.set(row.player, current)
  }
  assert.deepEqual([...totals].sort((a, b) => b[1].points - a[1].points).map(([player, total]) => [player, total.points, total.events.size]), [
    ['B', 900, 2], ['A', 700, 2], ['C', 600, 2],
  ])
})

test('a reversal and corrected publication change only their original date', () => {
  const corrected = { ...awards[0], id: '1a-corrected', points: 400 }
  const movements: Movement[] = [
    ...originals,
    { id: 'reverse-1a', originalId: '1a', points: -500 },
    { id: corrected.id, awardId: corrected.id, points: 400 },
  ]
  const result = effectiveAwards([...awards, corrected], movements, 's1', 'd1')
  assert.equal(result.filter(row => row.player === 'A').reduce((sum, row) => sum + row.effectivePoints, 0), 600)
  assert.equal(result.filter(row => row.player === 'B').reduce((sum, row) => sum + row.effectivePoints, 0), 900)
  assert.equal(result.some(row => row.id === '1a'), false)
})

test('additional movements linked to the same award accumulate before ranking', () => {
  const movements: Movement[] = [...originals, { id: '1a-bonus', awardId: '1a', points: 50 }]
  const result = effectiveAwards(awards, movements, 's1', 'd1')
  assert.equal(result.filter(row => row.player === 'A').reduce((total, row) => total + row.effectivePoints, 0), 750)
})

test('a PAIRS result is counted once per team/date, not twice per player', () => {
  const pairAwards: Award[] = [
    { id: 'p1a', series: 's1', division: 'pairs', event: 'e1', player: 'A', team: 'AB', points: 500, published: true },
    { id: 'p1b', series: 's1', division: 'pairs', event: 'e1', player: 'B', team: 'AB', points: 500, published: true },
    { id: 'p2a', series: 's1', division: 'pairs', event: 'e2', player: 'A', team: 'AB', points: 400, published: true },
    { id: 'p2b', series: 's1', division: 'pairs', event: 'e2', player: 'B', team: 'AB', points: 400, published: true },
  ]
  const result = effectiveAwards(pairAwards, pairAwards.map(row => ({ id: row.id, awardId: row.id, points: row.points })), 's1', 'pairs')
  const teams = new Map<string, number>()
  for (const row of result) {
    const key = `${row.event}:${row.team}`
    teams.set(key, Math.max(teams.get(key) ?? 0, row.effectivePoints))
  }
  assert.equal(teams.get('e1:AB'), 500)
  assert.equal(teams.get('e2:AB'), 400)
  assert.equal([...teams].filter(([key]) => key.endsWith(':AB')).reduce((sum, [, points]) => sum + points, 0), 900)
})

test('ledger idempotency and one reversal per original prevent double counting', () => {
  assert.match(ledgerSchema, /constraint competition_point_transactions_idempotency_key_key unique \(idempotency_key\)/)
  assert.match(ledgerSchema, /constraint competition_point_transactions_reversed_transaction_id_key unique \(reversed_transaction_id\)/)
})

test('circuit ranking groups divisions and restarts positions without changing the legacy endpoint', () => {
  const grouped = groupSeriesRankingByDivision([
    { series_division_id: 'd2', player: 'A', position: 1 },
    { series_division_id: 'd1', player: 'B', position: 1 },
    { series_division_id: 'd1', player: 'A', position: 2 },
  ], [{ id: 'd1', name: 'Sexta' }, { id: 'd2', name: 'Quinta' }])
  assert.deepEqual(grouped.map(group => [group.id, group.name, group.rows.map(row => [row.player, row.position])]), [
    ['d1', 'Sexta', [['B', 1], ['A', 2]]],
    ['d2', 'Quinta', [['A', 1]]],
  ])
  assert.match(rankingRoute, /byDivision \? 'get_competition_series_ranking_by_division' : 'get_competition_series_ranking'/)
  assert.match(rankingPanel, /ranking\?scope=division/)
  assert.match(rankingRoute, /select\('series_division_id,ranking_position/)
})

test('both series ranking RPCs use the original transaction for reversals', () => {
  const rankingFunctions = migration.slice(0, migration.indexOf('-- A direct ledger reversal'))
  assert.equal((rankingFunctions.match(/original\.id\s*=\s*coalesce\(tx\.reversed_transaction_id,\s*tx\.id\)/g) ?? []).length, 2)
  assert.equal((rankingFunctions.match(/original\.source_concept\s*=\s*'COMPETITION_EVENT_SETTLEMENT'/g) ?? []).length, 2)
  assert.equal((rankingFunctions.match(/having sum\(tx\.points\) <> 0/g) ?? []).length, 2)
  assert.match(rankingFunctions, /count\(distinct award\.event_id\)::bigint as events_played/)
  assert.match(rankingFunctions, /row_number\(\) over\(partition by n\.series_division_id order by n\.points desc,n\.tie_vector desc/)
  assert.match(rankingFunctions, /settlement\.status\s*=\s*'PUBLISHED'/)
})

test('pair projection also compensates reversals and counts one team result', () => {
  assert.match(pairProjection, /original\.id=coalesce\(tx\.reversed_transaction_id,tx\.id\)/)
  assert.match(pairProjection, /max\(effective\.points\) points/)
  assert.match(pairProjection, /having count\(distinct award\.player_id\)=2/)
})

test('preflight blocks pending settlement but treats planned count as informational', () => {
  const preflight = finalization.slice(finalization.indexOf('create or replace function public.get_competition_series_finalization_preflight('), finalization.indexOf('create or replace function public.finalize_competition_series_atomic('))
  assert.match(preflight, /ed\.scoring_mode='POINTS'[\s\S]*?st\.status='PUBLISHED'/)
  assert.match(preflight, /'SETTLEMENT_PENDING'/)
  assert.match(preflight, /e\.status not in\('COMPLETED','CANCELLED'\)/)
  assert.match(preflight, /'FINAL_RANKING_EMPTY'/)
  assert.match(preflight, /'can_finalize',s.status='CLOSED' or jsonb_array_length\(blockers\)=0/)
  assert.doesNotMatch(preflight, /planned_events_count/)
})

test('CLOSED snapshots final positions and guards future result writes', () => {
  assert.match(finalization, /insert into public\.competition_series_final_rankings\([\s\S]*?from public\.get_competition_series_ranking_by_division\(p_club_id,s\.id\) r/)
  assert.match(finalization, /update public\.competition_series set status='CLOSED'/)
  assert.match(finalization, /SERIES_FINAL_RANKING_IMMUTABLE/)
  assert.match(finalization, /SERIES_FINALIZED_IMMUTABLE/)
  assert.match(migration, /new\.transaction_type='REVERSAL'[\s\S]*?original\.source_concept='COMPETITION_EVENT_SETTLEMENT'/)
  assert.match(migration, /where settlement\.id=settlement_id_value and settlement\.club_id=new\.club_id\s*for share of series/)
  assert.match(migration, /if series_status='CLOSED' then\s*raise exception 'SERIES_FINALIZED_IMMUTABLE'/)
  assert.match(migration, /before insert on public\.competition_point_transactions/)
})
