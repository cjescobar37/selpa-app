import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migration = source('../supabase/migrations/20260930161656_competition_points_scheme_snapshot_consistency.sql')
const correctionPlan = source('../supabase/qa/noviembre_master_published_settlement_correction_plan.sql')
const oldDraft = source('../supabase/migrations/20260803120000_competition_event_settlement_stage5a5.sql')
const calculator = source('../supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql')
const adjustment = source('../supabase/migrations/20260929113440_competition_canonical_playoff_placements.sql')
const panel = source('../app/(app)/club/competition/EventSettlementPanel.tsx')
const repository = source('../features/competition/settlement/competition-settlement.repository.ts')
const http = source('../features/competition/settlement/competition-settlement.http.ts')

function sqlFunction(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`)
  const end = migration.indexOf(`revoke all on function public.${name}`, start)
  assert.ok(start >= 0 && end > start, `Missing ${name}`)
  return migration.slice(start, end)
}

test('the published bug is sourced from frozen effective scheme, not the override', () => {
  assert.match(oldDraft, /points_scheme_id[\s\S]*configuration_snapshot->>'effective_points_scheme_id'/)
  assert.match(oldDraft, /points_rules[\s\S]*configuration_snapshot->>'effective_points_scheme_id'/)
  assert.match(calculator, /s\.calculation_snapshot->'points_rules'/)
})

test('A-B: SCHEDULED setter atomically moves override and only effective snapshot key', () => {
  const setter = sqlFunction('set_competition_event_division_points_scheme')
  assert.match(setter, /set points_scheme_override_id = p_points_scheme_id,\s*configuration_snapshot = case\s*when division_row\.status = 'SCHEDULED' then jsonb_set\(\s*division_row\.configuration_snapshot,\s*'\{effective_points_scheme_id\}',\s*to_jsonb\(p_points_scheme_id::text\),\s*false/)
  assert.match(setter, /else division_row\.configuration_snapshot/)
  assert.doesNotMatch(setter, /set[\s\S]*series_rule_id =|set[\s\S]*event_tier_id =|set[\s\S]*frozen_at =/)
  const guard = sqlFunction('validate_competition_event_division_integrity')
  assert.match(guard, /new\.configuration_snapshot = jsonb_set\(\s*old\.configuration_snapshot,\s*'\{effective_points_scheme_id\}'/)
  assert.match(guard, /new\.status = old\.status/)
  assert.match(guard, /new\.frozen_at[\s\S]*old\.frozen_at/)
})

test('C-E: setter remains idempotent and blocks homologated or settled divisions', () => {
  const setter = sqlFunction('set_competition_event_division_points_scheme')
  assert.match(setter, /points_scheme_override_id is not distinct from p_points_scheme_id[\s\S]*configuration_snapshot->>'effective_points_scheme_id' = p_points_scheme_id::text[\s\S]*'changed', false/)
  assert.match(setter, /competition_event_homologations homologation[\s\S]*homologation\.event_division_id = division_row\.id/)
  assert.match(setter, /competition_event_settlements settlement[\s\S]*settlement\.event_division_id = division_row\.id/)
  assert.match(setter, /scheme\.is_active[\s\S]*scheme\.archived_at is null/)
})

test('F-G: ordinary POINTS draft creation and calculation fail closed on mismatch', () => {
  const predicate = sqlFunction('competition_settlement_scheme_snapshot_mismatch')
  assert.match(predicate, /frozen_scheme <> division_row\.points_scheme_override_id::text/)
  assert.match(predicate, /settlement_row\.points_scheme_id = division_row\.points_scheme_override_id[\s\S]*return false/)
  const trigger = sqlFunction('guard_competition_settlement_scheme_snapshot')
  assert.match(trigger, /tg_op = 'INSERT'[\s\S]*POINTS_SCHEME_SNAPSHOT_MISMATCH/)
  assert.match(trigger, /tg_op = 'UPDATE'[\s\S]*'PUBLISHED'[\s\S]*POINTS_SCHEME_SNAPSHOT_MISMATCH/)
  assert.match(migration, /alter function public\.calculate_competition_event_settlement[\s\S]*rename to calculate_competition_event_settlement_base_20260930/)
  assert.match(sqlFunction('calculate_competition_event_settlement'), /competition_settlement_scheme_snapshot_mismatch[\s\S]*POINTS_SCHEME_SNAPSHOT_MISMATCH[\s\S]*calculate_competition_event_settlement_base_20260930/)
  assert.match(sqlFunction('get_competition_event_settlement_preflight'), /'code', 'POINTS_SCHEME_SNAPSHOT_MISMATCH'/)
})

test('H: published correction preserves history and has an explicit, gated repair path', () => {
  const correction = sqlFunction('create_competition_event_settlement_correction')
  assert.match(correction, /'CORRECTION'/)
  assert.match(correction, /create_competition_event_settlement_draft/)
  assert.match(correction, /reverse_competition_point_transaction/)
  assert.match(correction, /status = 'SUPERSEDED'/)
  assert.match(correction, /finish_competition_settlement_command/)
  assert.match(sqlFunction('guard_competition_settlement_scheme_snapshot'), /competition_settlement_correction[\s\S]*operation = 'CORRECTION'[\s\S]*response_payload is null/)
  assert.match(sqlFunction('competition_settlement_scheme_snapshot_mismatch'), /source_row\.published_at is null[\s\S]*actual_rules is distinct from expected_rules/)
  assert.match(sqlFunction('competition_settlement_scheme_snapshot_mismatch'), /status = 'PUBLISHED'[\s\S]*configured_scheme_verified/)
  assert.match(sqlFunction('guard_competition_settlement_scheme_snapshot'), /new\.status = 'PUBLISHED'[\s\S]*configured_scheme_verified/)
  assert.match(adjustment, /'points_adjustment'[\s\S]*'adjusted_points_scheme_id'/)
  assert.match(correctionPlan, /reversed_transaction_id/)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.competition_point_transactions|update\s+public\.competition_point_transactions/i)
})

test('I: MASTER correction fixture contains exactly seven reviewed amounts', () => {
  for (const [key, points] of [
    ['CHAMPION', 750], ['RUNNER_UP', 500], ['SEMIFINALIST', 400],
    ['QUARTERFINALIST', 250], ['EIGHTH_FINALIST', 150],
    ['SIXTEENTH_FINALIST', 100], ['PARTICIPANT', 50],
  ] as const) assert.match(correctionPlan, new RegExp(`\\('${key}', ${points}\\)`))
  assert.match(correctionPlan, /master_rules_exact/)
  assert.doesNotMatch(migration, /68346ad8-3e23-42ad-8e82-8621dad954b3|19bbd434-af09-4684-b791-12f81a9e5184/)
})

test('UI exposes the actual settlement table and a guided configured-rule correction', () => {
  assert.match(repository, /points_scheme_override_id,configuration_snapshot/)
  assert.match(panel, /Esquema usado \(tabla efectiva\)/)
  assert.match(panel, /detail\.pointsScheme\?\.display_name/)
  assert.match(panel, /correctionNeedsConfiguredScheme/)
  assert.match(panel, /rules\.filter\(rule => rule\.is_active\)/)
  assert.match(panel, /'If-Match': String\(detail\.settlement\.revision\)/)
  assert.match(panel, /Aplicar tabla configurada y recalcular/)
  assert.match(http, /La tabla de puntos congelada no coincide con la configuración actual/)
})

test('all new internal SQL helpers remain closed to the Data API', () => {
  for (const name of [
    'validate_competition_event_division_integrity',
    'competition_settlement_scheme_snapshot_mismatch',
    'guard_competition_settlement_scheme_snapshot',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`))
  }
  assert.match(migration, /revoke all on function public\.calculate_competition_event_settlement_base_20260930[\s\S]*from public, anon, authenticated, service_role/)
})
