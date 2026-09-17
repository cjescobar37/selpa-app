import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type * as Repository from '../features/competition/series/competition-series.repository'

const { getSeriesDetail } = await import(new URL('../features/competition/series/competition-series.repository.ts', import.meta.url).href) as typeof Repository
const stage5a2 = readFileSync(join(process.cwd(), 'supabase/migrations/20260730170000_competition_series_stage5a2.sql'), 'utf8')
const pairsFix = readFileSync(join(process.cwd(), 'supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql'), 'utf8')

test('series detail embeds the sports division through its explicit FK', async () => {
  const selects: Array<{ table: string; columns: string }> = []
  const division = { id: 'series-division', division_id: 'sports-division', ranking_division_id: 'ranking-division', division: { id: 'sports-division', modality: 'PAIRS' } }
  const rows: Record<string, unknown> = {
    competition_series: { id: 'series', club_id: 'club', season_id: 'season', name: 'Circuito' },
    competition_series_divisions: [division],
    competition_series_rules: [{ id: 'rule', series_division_id: 'series-division', status: 'ACTIVE' }],
    competition_series_eligibility: [{ id: 'eligibility', series_rule_id: 'rule' }],
    competition_series_final_rankings: [],
  }
  const from = (table: string) => {
    let columns = ''
    const result = () => ({ data: rows[table], error: table === 'competition_series_divisions' && !columns.includes('competition_divisions!competition_series_divisions_division_fkey')
      ? { code: 'PGRST201', message: 'Could not embed because more than one relationship was found' }
      : null })
    const query = {
      select(value: string) { columns = value; selects.push({ table, columns }); return query },
      eq() { return query }, in() { return query }, order() { return query },
      maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return query
  }
  const client = { from, rpc: async () => ({ data: { can_finalize: false, blockers: [] }, error: null }) } as unknown as SupabaseClient

  const detail = await getSeriesDetail(client, 'club', 'series')
  assert.match(selects.find(call => call.table === 'competition_series_divisions')?.columns ?? '', /division:competition_divisions!competition_series_divisions_division_fkey\(/)
  assert.equal(detail.divisions[0].division?.id, 'sports-division')
  assert.equal(detail.divisions[0].rules[0].eligibility?.id, 'eligibility')
  assert.deepEqual(detail.finalRanking, [])
})

test('both foreign keys exist locally, so an unqualified embed is ambiguous', () => {
  assert.match(stage5a2, /constraint competition_series_divisions_division_fkey foreign key \(club_id, division_id\)/)
  assert.match(pairsFix, /add constraint competition_series_divisions_ranking_division_fkey\s+foreign key \(club_id, ranking_division_id\)/)
})
