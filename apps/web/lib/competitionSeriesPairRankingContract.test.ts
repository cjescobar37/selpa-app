import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260912225433_competition_series_pair_rankings.sql'), 'utf8')
const individualMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20260912190000_competition_series_reversal_aware_ranking.sql'), 'utf8')
const postgresQa = readFileSync(join(process.cwd(), 'supabase/qa/20260912225433_competition_series_pair_rankings_validation.sql'), 'utf8')
const route = readFileSync(join(process.cwd(), 'app/api/clubs/[clubId]/competition/series/[seriesId]/ranking/route.ts'), 'utf8')
const panel = readFileSync(join(process.cwd(), 'app/(app)/club/competition/SeriesRankingPanel.tsx'), 'utf8')

type Result = { series: string; division: string; event: string; team: string; players: [string, string]; points: number }

function pairKey(players: [string, string]) {
  return [...players].sort().join(':')
}

function pairTotals(results: Result[], series: string, division: string) {
  const totals = new Map<string, { points: number; events: Set<string> }>()
  for (const result of results.filter(row => row.series === series && row.division === division)) {
    const key = pairKey(result.players)
    const total = totals.get(key) ?? { points: 0, events: new Set<string>() }
    total.points += result.points
    total.events.add(result.event)
    totals.set(key, total)
  }
  return totals
}

test('pair identity is order-independent, but does not merge different partners or scopes', () => {
  const results: Result[] = [
    { series: 's1', division: 'd1', event: 'e1', team: 't1', players: ['A', 'B'], points: 500 },
    { series: 's1', division: 'd1', event: 'e2', team: 't2', players: ['B', 'A'], points: 400 },
    { series: 's1', division: 'd1', event: 'e2', team: 't3', players: ['A', 'C'], points: 200 },
    { series: 's1', division: 'd2', event: 'e3', team: 't4', players: ['A', 'B'], points: 900 },
    { series: 's2', division: 'd1', event: 'e4', team: 't5', players: ['A', 'B'], points: 900 },
  ]
  const totals = pairTotals(results, 's1', 'd1')
  assert.equal(totals.size, 2)
  assert.deepEqual(totals.get('A:B'), { points: 900, events: new Set(['e1', 'e2']) })
  assert.deepEqual(totals.get('A:C'), { points: 200, events: new Set(['e2']) })
})

test('published pair totals include multiplier, bonus and penalty exactly once per team', () => {
  const score = (base: number, multiplier: number, bonus = 0, penalty = 0) =>
    Math.round((base + bonus + penalty) * multiplier)
  const results: Result[] = [
    { series: 's1', division: 'd1', event: 'e1', team: 'ab1', players: ['A', 'B'], points: score(500, 1) },
    { series: 's1', division: 'd1', event: 'e2', team: 'ba2', players: ['B', 'A'], points: score(250, 2, 0, -50) },
    { series: 's1', division: 'd1', event: 'e1', team: 'cd1', players: ['C', 'D'], points: score(400, 1) },
    { series: 's1', division: 'd1', event: 'e2', team: 'cd2', players: ['C', 'D'], points: score(200, 2, 50) },
  ]
  const totals = pairTotals(results, 's1', 'd1')
  assert.equal(totals.get('A:B')?.points, 900)
  assert.equal(totals.get('C:D')?.points, 900)
  assert.equal(totals.get('A:B')?.events.size, 2)
  assert.equal(totals.get('C:D')?.events.size, 2)
})

test('pair SQL keeps published circuit scope, net reversals, one team score and canonical players', () => {
  assert.match(migration, /event\.series_id=p_series_id/)
  assert.match(migration, /ed\.series_division_id=ar\.series_division_id/)
  assert.match(migration, /settlement\.status='PUBLISHED'/)
  assert.match(migration, /original\.id=coalesce\(tx\.reversed_transaction_id,tx\.id\)/)
  assert.match(migration, /group by original\.club_id,original\.season_id,original\.division_id,[\s\S]*?original\.metadata->>'settlement_id',original\.metadata->>'award_id'/)
  assert.match(migration, /having sum\(tx\.points\)<>0/)
  assert.match(migration, /array_agg\(distinct award\.player_id order by award\.player_id\)/)
  assert.match(migration, /having count\(distinct award\.player_id\)=2/)
  assert.match(migration, /max\(effective\.effective_points\)::bigint event_points/)
  assert.doesNotMatch(migration, /min\(effective\.effective_points\)=max\(effective\.effective_points\)/)
  assert.match(migration, /partition by te\.series_division_id,te\.player_ids/)
  assert.match(migration, /order by n\.points desc,n\.tie_vector desc/)
  assert.match(migration, /oe\.accumulation_mode='BEST_N' and oe\.best_order<=oe\.best_results_count/)
  assert.match(migration, /oe\.accumulation_mode='DROP_WORST_N' and oe\.worst_order>oe\.discard_worst_count/)
  assert.match(migration, /having count\(distinct oe\.event_id\)>=oe\.minimum_participations/)
})

test('participation and semifinal tiers do not require invented ordinal positions', () => {
  assert.match(migration, /count\(distinct coalesce\(award\.final_position,-1\)\)=1/)
  assert.doesNotMatch(migration, /min\(award\.final_position\)=max\(award\.final_position\)/)
  assert.match(migration, /count\(\*\) filter\(where oe\.result_code in\('CHAMPION','RUNNER_UP','SEMIFINALIST'\)\)::bigint semifinals/)
  assert.match(individualMigration, /count\(\*\) filter\(where oe\.result_code in\('CHAMPION','RUNNER_UP','SEMIFINALIST'\)\)::bigint semifinals/)
  assert.match(postgresQa, /null,'PARTICIPANT',50,1,50,'ELIGIBLE'/)
})

test('one atomic close freezes pair snapshots and guards subsequent changes', () => {
  const finalizer = migration.slice(migration.indexOf('create or replace function public.finalize_competition_series_atomic('))
  assert.match(finalizer, /insert into public\.competition_series_final_rankings[\s\S]*?insert into public\.competition_series_final_pair_rankings[\s\S]*?update public\.competition_series set status='CLOSED'/)
  assert.match(migration, /before insert or update or delete on public\.competition_series_final_pair_rankings/)
  assert.match(migration, /constraint competition_series_final_pair_order_chk check\(player1_user_id<player2_user_id\)/)
  assert.match(migration, /FINAL_PAIR_RANKING_EMPTY/)
  for (const table of ['competition_series_events', 'competition_series_rules', 'competition_series_eligibility',
    'competition_event_homologation_results', 'competition_event_settlement_awards']) {
    assert.match(migration, new RegExp(`before insert or update or delete on public\\.${table}`))
  }
  assert.match(migration, /s\.status='CLOSED' for share/)
  assert.match(migration, /alter table public\.competition_series_final_pair_rankings enable row level security/)
  assert.match(migration, /revoke all on table public\.competition_series_final_pair_rankings from public,anon,authenticated,service_role/)
  assert.match(migration, /grant select on table public\.competition_series_final_pair_rankings to authenticated,service_role/)
})

test('Postgres QA is fail-closed, synthetic and always rolls back', () => {
  assert.match(postgresQa, /QA_ISOLATED_DATABASE_NOT_CONFIRMED/)
  assert.match(postgresQa, /coalesce\(current_setting\('selpa\.qa_isolated', true\),''\) <> 'confirmed'/)
  assert.match(postgresQa, /insert into auth\.users/)
  assert.match(postgresQa, /B 900 #1, A 700 #2, C 600 #3/)
  assert.match(postgresQa, /PARTICIPANT null ordinal included/)
  assert.match(postgresQa, /multiplier_value:=case when i=2 then 2 else 1 end/)
  assert.match(postgresQa, /bonus_value:=case when i=2 and position_value=1 then 50 else 0 end/)
  assert.match(postgresQa, /penalty_value:=case when i=2 and position_value=2 then -50 else 0 end/)
  assert.match(postgresQa, /base_value,multiplier_value,bonus_value,penalty_value,points_value/)
  assert.match(postgresQa, /FAIL CLOSED accepted reversal/)
  assert.match(postgresQa.trim(), /rollback;$/)
})

test('ranking endpoint is circuit-scoped and opt-in pairs preserves the existing response', () => {
  assert.match(route, /request\.nextUrl\.searchParams\.get\('include'\) === 'pairs'/)
  assert.match(route, /if \(!includePairs\) return NextResponse\.json\(\{ ranking, finalized: true \}\)/)
  assert.match(route, /if \(!includePairs\) return NextResponse\.json\(\{ ranking, finalized: false \}\)/)
  assert.match(route, /'get_competition_series_pair_ranking'/)
  assert.match(route, /'competition_series_final_pair_rankings'/)
  assert.match(panel, /scope=division&include=pairs/)
  assert.match(panel, /groupSeriesRankingByDivision\(pairs, divisions\)/)
})
