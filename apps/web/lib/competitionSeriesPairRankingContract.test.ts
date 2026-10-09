import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

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

test('ranking panel opts into pairs without creating a separate sports calculation', () => {
  assert.match(route, /request\.nextUrl\.searchParams\.get\('include'\) === 'pairs'/)
  assert.match(route, /'get_competition_series_pair_ranking'/)
  assert.match(route, /'competition_series_final_pair_rankings'/)
  assert.match(panel, /scope=division&include=pairs/)
  assert.match(panel, /groupSeriesRankingByDivision\(pairs, divisions\)/)
})

// Execute the real handler and the real STAFF presentation filter. The contract
// is the DTO, scope, immutable points/positions and opt-in, not a one-line return.
const clubId = '11111111-1111-4111-8111-111111111111'
const seriesId = '22222222-2222-4222-8222-222222222222'
const individualRows = [
  { ranking_position: 1, player_id: 'staff', points: 900, display_name: 'Staff' },
  { ranking_position: 5, player_id: 'player', points: 700, display_name: 'Jugador' },
]
const pairRows = [
  { ranking_position: 1, player1_user_id: 'staff', player2_user_id: 'other', points: 500 },
  { ranking_position: 3, player1_user_id: 'player', player2_user_id: 'other', points: 400 },
]
function rankingHandler(closed: boolean, denied = false) {
  const calls: Array<{ name: string; params?: Record<string, unknown>; filters?: Array<[string, string]> }> = []
  const admin = { from: (table: string) => {
    const q = { select: () => q, in: () => q, neq: () => q,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: table === 'club_memberships' ? [{ user_id: 'staff' }] : [], error: null }).then(resolve) }
    return q
  } }
  const roleExports: Record<string, unknown> = {}
  runInNewContext(ts.transpileModule(readFileSync(join(process.cwd(), 'lib/accountRoleServer.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: roleExports, Set, require: (name: string) => {
    if (name.endsWith('supabaseAdmin')) return { supabaseAdmin: admin }
    if (name.endsWith('clubMembershipRules')) return { STAFF_ROLES: ['OWNER', 'ADMIN', 'OPERADOR', 'PLANILLERO'] }
    if (name === 'next/server') return { NextResponse: { json: Response.json } }
    return {}
  } })
  const client = {
    from: (name: string) => {
      const filters: Array<[string, string]> = []
      calls.push({ name, filters })
      const result = () => ({ data: name === 'competition_series' ? { status: closed ? 'CLOSED' : 'ACTIVE' }
        : name === 'competition_series_final_rankings' ? individualRows : pairRows, error: null })
      const q = { select: () => q, eq: (key: string, value: string) => { filters.push([key, value]); return q }, order: () => q,
        maybeSingle: async () => result(), then: (resolve: (result: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
      return q
    },
    rpc: async (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params }); return { data: name === 'get_competition_series_pair_ranking' ? pairRows : individualRows, error: null }
    },
  }
  const exports: Record<string, unknown> = {}
  runInNewContext(ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: (name: string) => {
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name.endsWith('competition-series.auth')) return { authorizeCompetitionSeries: async (_request: unknown, club: string, action: string) => {
        assert.equal(club, clubId); assert.equal(action, 'read')
        return denied ? { error: Response.json({ error: 'Sin permiso.' }, { status: 403 }), client: null } : { error: null, client }
      } }
      if (name.endsWith('competition-series.validation')) return { isUuid: (value: string) => [clubId, seriesId].includes(value) }
      if (name.endsWith('supabaseAdmin')) return { supabaseAdmin: admin }
      if (name.endsWith('competition-ranking.avatars')) return { enrichCompetitionRankingAvatars: async (_admin: unknown, individual: unknown[], pairs: unknown[]) => ({ individual, pairs }) }
      if (name.endsWith('accountRoleServer')) return roleExports
      if (name.endsWith('competition-series.http')) return { seriesErrorResponse: () => Response.json({ error: 'Error.' }, { status: 500 }) }
      throw new Error(name)
    },
  })
  const get = exports.GET as (request: { nextUrl: URL }, context: { params: Promise<{ clubId: string; seriesId: string }> }) => Promise<Response>
  return { calls, get: (includePairs = false, division = false) => get({ nextUrl: new URL(`https://fixture.invalid/?${includePairs ? 'include=pairs&' : ''}${division ? 'scope=division' : ''}`) }, { params: Promise.resolve({ clubId, seriesId }) }) }
}
for (const closed of [false, true]) {
  for (const includePairs of [false, true]) {
    test(`real ranking handler ${closed ? 'frozen' : 'open'} pairs=${includePairs}: DTO, STAFF exclusion, original points/positions and circuit scope`, async () => {
      const app = rankingHandler(closed), response = await app.get(includePairs, true)
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.deepEqual(Object.keys(body).sort(), (includePairs ? ['ranking', 'individual', 'pairs', 'pairsUnavailable', 'finalized'] : ['ranking', 'finalized']).sort())
      assert.deepEqual(body.ranking, [{ position: 5, player_id: 'player', points: 700, display_name: 'Jugador' }])
      assert.equal(body.finalized, closed)
      if (includePairs) {
        assert.deepEqual(body.individual, body.ranking)
        assert.deepEqual(body.pairs, [{ position: 3, player1_user_id: 'player', player2_user_id: 'other', points: 400 }])
        assert.equal(body.pairsUnavailable, false)
      }
      assert.equal(app.calls.some(call => /pair/.test(call.name)), includePairs)
      for (const call of app.calls) {
        if (call.params) assert.deepEqual(JSON.parse(JSON.stringify(call.params)), { p_club_id: clubId, p_series_id: seriesId })
        else {
          assert.ok(call.filters?.some(([key, value]) => key === 'club_id' && value === clubId))
          assert.ok(call.filters?.some(([key, value]) => key === (call.name === 'competition_series' ? 'id' : 'series_id') && value === seriesId))
        }
      }
      if (closed) assert.ok(app.calls.every(call => !call.params))
      else assert.ok(app.calls.some(call => call.name === 'get_competition_series_ranking_by_division'))
    })
  }
}
test('series authorization denial stops all sports reads', async () => {
  const app = rankingHandler(false, true)
  assert.equal((await app.get(true)).status, 403)
  assert.equal(app.calls.length, 0)
})
