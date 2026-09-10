import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql'), 'utf8')
const rankingRepository = readFileSync(join(process.cwd(), 'features/competition/ranking/competition-ranking.repository.ts'), 'utf8')
const pairProjection = migration.slice(migration.indexOf('create or replace view public.competition_pair_ranking_projection'))
const ledgerValidator = migration.slice(
  migration.indexOf('create or replace function public.validate_competition_point_transaction()'),
  migration.indexOf('create or replace view public.competition_pair_ranking_projection'),
)

test('PAIRS mapping is constrained and frozen before scoring', () => {
  assert.match(migration, /ranking_division\.modality <> 'INDIVIDUAL'/)
  assert.match(migration, /ranking_division\.season_id <> source_division\.season_id/)
  assert.match(migration, /ranking_division\.branch_id <> source_division\.branch_id/)
  assert.match(migration, /ranking_division\.category_id is distinct from source_division\.category_id/)
  assert.match(migration, /ranking_division\.segment_id is not null/)
  assert.match(migration, /RANKING_DIVISION_REQUIRED/)
  assert.ok(migration.includes('configuration_snapshot') && migration.includes("'ranking_division_id', ranking_id"))
})

test('homologation and settlement keep individual entry plus historical pair identity', () => {
  assert.match(migration, /entry\.division_id=ranking_id/)
  assert.match(migration, /entry\.valid_from<=eligibility_at/)
  assert.match(migration, /'tournament_team_id',p\.tournament_team_id/)
  assert.match(migration, /join public\.competition_divisions ranking on ranking\.id=nullif\(ed\.configuration_snapshot->>'ranking_division_id'/)
})

test('CREATE OR REPLACE VIEW preserves existing columns and appends pairs_division_id', () => {
  assert.match(pairProjection, /select club_id,season_id,division_id,player_ids\[1\] player1_user_id,player_ids\[2\] player2_user_id,\s*concat\([^\n]+\) pair_key,sum\(points\)::bigint total_points,count\(\*\)::integer settled_results,\s*pairs_division_id\s*from team_results/)
})

test('pair projection grants only SELECT to service_role', () => {
  assert.match(pairProjection, /revoke all on public\.competition_pair_ranking_projection from public,anon,authenticated,service_role;/)
  assert.match(pairProjection, /grant select on public\.competition_pair_ranking_projection to service_role;/)
  assert.doesNotMatch(pairProjection, /grant (?:all|insert|update|delete|truncate|references|trigger)[^;]*competition_pair_ranking_projection/i)
})

test('migration documents the production history drift without changing the historical file', () => {
  assert.match(migration, /20260902120000_competition_pair_ranking_projection\.sql/)
  assert.match(migration, /20260903124241 competition_pair_ranking_projection/)
  assert.match(migration, /Do not run a global\s*-- db push/)
})

test('REQUIRE_ENTRY marks a missing individual entry as blocker', () => {
  assert.match(migration, /when pe\.id is null then 'ENTRY_MISSING' else 'ELIGIBLE'/)
  assert.match(migration, /scoring_eligibility_status in\('ENTRY_MISSING','PLAYER_INACTIVE'\).*invited_policy='REQUIRE_ENTRY' then 'BLOCKER'/)
})

test('permissive invited policy keeps a missing entry NON_SCORING', () => {
  assert.match(migration, /pe\.id is null and allow_invited and invited_policy='NON_SCORING'\) then 'NON_SCORING'/)
  assert.match(migration, /then 'INVITED_NON_SCORING'/)
})

test('eligibility_at is transported independently from effective_at', () => {
  assert.match(migration, /'eligibility_at',eligibility_at/)
  assert.match(migration, /'eligibility_at',p\.participant_snapshot->>'eligibility_at'/)
  assert.match(migration, /'eligibility_at',a\.calculation_detail->>'eligibility_at'/)
  assert.match(ledgerValidator, /historical_eligibility_at:=nullif\(new\.metadata->>'eligibility_at',''\)::timestamptz/)
})

test('historical ledger validity uses eligibility_at and not effective_at', () => {
  assert.match(ledgerValidator, /historical_eligibility_at>=v_entry\.valid_from/)
  assert.match(ledgerValidator, /historical_eligibility_at<v_entry\.valid_until/)
  assert.doesNotMatch(ledgerValidator, /new\.effective_at\s*[<>]=?\s*v_entry\.(?:valid_from|valid_until)/)
})

test('an entry invalid at eligibility_at is rejected', () => {
  assert.match(ledgerValidator, /and not historical_settlement then\s*raise exception 'La entrada competitiva no era válida en eligibility_at\.'/)
})

test('pair projection counts one two-player result and compensates reversals', () => {
  assert.match(pairProjection, /coalesce\(tx\.reversed_transaction_id,tx\.id\)/)
  assert.match(pairProjection, /having count\(distinct award\.player_id\)=2/)
  assert.match(pairProjection, /max\(effective\.points\) points/)
  assert.match(pairProjection, /sum\(points\)::bigint total_points/)
})

test('Competition individual ranking has no legacy points fallback', () => {
  assert.doesNotMatch(rankingRepository, /club_players\.ranking_points/)
  assert.doesNotMatch(rankingRepository, /getCompetitionPointsSource/)
  assert.match(rankingRepository, /getLedgerPointsByEntry/)
})

test('Competition completion requires a persisted finished tournament', () => {
  assert.match(migration, /TOURNAMENT_NOT_FINISHED/)
  assert.match(migration, /linked_tournament_status is distinct from 'FINISHED'/)
})
