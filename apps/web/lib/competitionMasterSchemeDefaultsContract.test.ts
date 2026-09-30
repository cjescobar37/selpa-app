import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const canonical = source('../supabase/migrations/20260929113440_competition_canonical_playoff_placements.sql')
const canonicalValidation = source('../supabase/qa/20260929113440_competition_canonical_playoff_placements_validation.sql')
const capabilities = source('../supabase/migrations/20260929113638_competition_event_points_scheme_capabilities.sql')
const validation = source('../supabase/qa/20260929113638_competition_event_points_scheme_capabilities_validation.sql')
const correctionPlan = source('../supabase/qa/noviembre_master_scheme_correction_plan.sql')
const eventsUi = source('../app/(app)/club/competition/SeriesEventsAdmin.tsx')
const tournamentWizard = source('../app/(app)/club/torneos/nuevo/page.tsx')
const settlementSql = source('../supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql')
const pairRankingSql = source('../supabase/migrations/20260912225433_competition_series_pair_rankings.sql')

function sqlFunction(name: string) {
  const start = capabilities.indexOf(`create or replace function public.${name}`)
  const end = capabilities.indexOf(`revoke all on function public.${name}`, start)
  assert.ok(start >= 0 && end > start, `SQL function ${name} is missing`)
  return capabilities.slice(start, end)
}

test('canonical placement migration is independent from the unapplied historical migration', () => {
  assert.doesNotMatch(canonical, /20260915110511/)
  for (const token of [
    'EIGHTH_FINALIST',
    'SIXTEENTH_FINALIST',
    'ROUND_OF_16',
    'ROUND_OF_32',
    'BYEs',
    'WALKOVER',
    'is_valid_competition_point_rules',
    'add_points_scheme_rule',
    'adjust_competition_event_settlement_points',
    'extract_competition_event_homologation_results',
  ]) assert.ok(canonical.includes(token), `canonical migration is missing ${token}`)
  assert.match(canonical, /jsonb_array_length\(p_rules\) not between 5 and 7/)
})

test('settlement adjustment reconciles active rules exactly for 7→5, 5→7 and 7→6', () => {
  assert.match(canonical, /select array_agg\(upper\(value->>'rule_key'\)\)[\s\S]*into requested_rule_keys/)
  assert.match(canonical, /perform public\.update_points_scheme_rule/)
  assert.match(canonical, /perform public\.add_points_scheme_rule/)
  assert.match(canonical, /upper\(rule\.rule_key\) <> all\(requested_rule_keys\)/)
  assert.match(canonical, /perform public\.deactivate_points_scheme_rule\([\s\S]*scheme_revision,[\s\S]*current_rule\.revision/)
  assert.match(canonical, /where scheme_id = cloned_scheme\.id and is_active/)
  assert.match(canonicalValidation, /Seven-tier scheme must be valid/)
  assert.match(canonicalValidation, /Historical five-tier scheme must remain valid/)
  assert.match(canonicalValidation, /Six-tier scheme must remain valid/)
})

test('an omitted placement stays missing and never falls back to PARTICIPANT', () => {
  assert.match(settlementSql, /upper\(r\.value->>'rule_key'\)=upper\(p\.result_role\)/)
  assert.match(settlementSql, /'RESULT_RULE_MISSING','BLOCKER'/)
  assert.doesNotMatch(settlementSql, /coalesce\(p\.result_role\s*,\s*'PARTICIPANT'\)/)
})

test('capability migration is generic and contains no known live identifiers', () => {
  for (const liveId of [
    '19bbd434-af09-4684-b791-12f81a9e5184',
    '2184d5ce-2f00-41bb-a4fa-51e4d848e3fc',
    'b6e81e5c-e5f3-4f11-b7e2-9ae9fbbd3dfa',
    '68346ad8-3e23-42ad-8e82-8621dad954b3',
  ]) assert.doesNotMatch(capabilities, new RegExp(liveId))
  assert.doesNotMatch(capabilities, /update public\.points_scheme_rules/)
  assert.doesNotMatch(capabilities, /where\s+code\s*=\s*'MASTER'/i)
})

test('tier defaults resolve before the circuit rule while explicit overrides win', () => {
  assert.match(capabilities, /resolved_scheme_id := coalesce\([\s\S]*p_scheme_override_id,[\s\S]*tier_row\.default_points_scheme_id,[\s\S]*rule_row\.points_scheme_id/)
  assert.doesNotMatch(capabilities, /update public\.competition_series_rules/)
})

test('event-division setter supports DRAFT and SCHEDULED POINTS with optimistic revisions', () => {
  assert.match(capabilities, /create or replace function public\.set_competition_event_division_points_scheme/)
  assert.match(capabilities, /event_row\.revision <> p_event_revision[\s\S]*division_row\.revision <> p_division_revision[\s\S]*PRECONDITION_FAILED/)
  assert.match(capabilities, /event_row\.status not in \('DRAFT', 'SCHEDULED'\)/)
  assert.match(capabilities, /division_row\.status not in \('DRAFT', 'SCHEDULED'\)/)
  assert.match(capabilities, /division_row\.scoring_mode <> 'POINTS'/)
  assert.match(capabilities, /scheme\.is_active[\s\S]*scheme\.archived_at is null[\s\S]*scheme\.is_global or scheme\.club_id = p_club_id/)
})

test('event-division setter is idempotent and changes only scheme plus both revisions', () => {
  const idempotent = capabilities.indexOf('division_row.points_scheme_override_id is not distinct from p_points_scheme_id')
  const write = capabilities.indexOf("set_config('selpa.competition_event_write', 'allowed', true)")
  assert.ok(idempotent > -1 && write > idempotent)
  assert.match(capabilities, /set points_scheme_override_id = p_points_scheme_id,\s*revision = revision \+ 1\s*where id = division_row\.id/)
  assert.match(capabilities, /update public\.competition_series_events\s*set revision = revision \+ 1\s*where id = event_row\.id/)
  assert.doesNotMatch(capabilities, /set points_scheme_override_id = p_points_scheme_id,[\s\S]{0,160}(series_rule_id|event_tier_id|scoring_mode|points_multiplier_override)\s*=/)
})

test('event-division setter blocks homologated, settled and frozen unrelated writes', () => {
  assert.match(capabilities, /from public\.competition_event_homologations[\s\S]*event_division_id = division_row\.id/)
  assert.match(capabilities, /from public\.competition_event_settlements[\s\S]*event_division_id = division_row\.id/)
  assert.match(capabilities, /selpa\.competition_event_points_scheme_write/)
  assert.match(capabilities, /new\.status = old\.status/)
  assert.match(capabilities, /new\.series_rule_id[\s\S]*old\.series_rule_id/)
  assert.match(validation, /Frozen-division guard does not contain the narrow scheme exception/)
})

test('SCHEDULED with a homologation is rejected', () => {
  const setter = sqlFunction('set_competition_event_division_points_scheme')
  assert.match(setter, /competition_event_homologations/)
  assert.match(setter, /homologation\.event_division_id = division_row\.id/)
})

test('SCHEDULED with a settlement is rejected', () => {
  const setter = sqlFunction('set_competition_event_division_points_scheme')
  assert.match(setter, /competition_event_settlements/)
  assert.match(setter, /settlement\.event_division_id = division_row\.id/)
})

test('inactive schemes are rejected and the base OPEN rule or other events are never updated', () => {
  const setter = sqlFunction('set_competition_event_division_points_scheme')
  assert.match(setter, /scheme\.is_active/)
  assert.match(setter, /where id = division_row\.id/)
  assert.match(setter, /where id = event_row\.id/)
  assert.doesNotMatch(setter, /update public\.competition_series_rules/)
  assert.doesNotMatch(setter, /where\s+event_id\s*=/)
})

test('tier-default setter accepts NULL, is idempotent and does not rewrite events', () => {
  const setter = sqlFunction('set_competition_event_tier_default_points_scheme')
  assert.match(setter, /where id = p_event_tier_id\s*and club_id = p_club_id\s*and is_active/)
  assert.match(setter, /p_points_scheme_id is not null and not exists/)
  assert.match(setter, /tier_row\.default_points_scheme_id is not distinct from p_points_scheme_id/)
  assert.match(setter, /set default_points_scheme_id = p_points_scheme_id\s*where id = tier_row\.id/)
  assert.doesNotMatch(setter, /competition_series_events|competition_series_event_divisions/)
})

test('NULL tier default falls back to the active series-rule scheme', () => {
  assert.match(capabilities, /resolved_scheme_id := coalesce\([\s\S]*p_scheme_override_id,[\s\S]*tier_row\.default_points_scheme_id,[\s\S]*rule_row\.points_scheme_id/)
  assert.match(capabilities, /effective_scheme_id := coalesce\(scheme_override_id, tier_row\.default_points_scheme_id, rule_row\.points_scheme_id\)/)
})

test('event configuration resets to the tier default and exposes manual mismatches', () => {
  assert.match(eventsUi, /select\('id,name,code,default_points_scheme_id'\)/)
  assert.match(eventsUi, /onChange=\{event => configure\('POINTS', event\.target\.value, null\)\}/)
  assert.match(eventsUi, /Usar default del tipo de fecha/)
  assert.match(eventsUi, /Combinación manual:/)
  assert.match(eventsUi, /Tipo de fecha/)
  assert.match(eventsUi, /Esquema de puntos/)
  assert.match(capabilities, /create or replace function public\.create_competition_date_tournament_atomic/)
  assert.match(capabilities, /case when scoring_mode = 'POINTS' then scheme_override_id end/)
  assert.doesNotMatch(capabilities, /case when scoring_mode = 'POINTS' then rule_row\.points_scheme_id/)
  assert.match(tournamentWizard, /default_points_scheme_id/)
  assert.match(tournamentWizard, /Esquema de puntos: \{selectedEventTierSchemeName\}/)
})

test('Noviembre Master correction plan is focal and preserves the OPEN circuit rule', () => {
  assert.match(correctionPlan, /68346ad8-3e23-42ad-8e82-8621dad954b3/)
  assert.match(correctionPlan, /b6e81e5c-e5f3-4f11-b7e2-9ae9fbbd3dfa/)
  assert.match(correctionPlan, /19bbd434-af09-4684-b791-12f81a9e5184/)
  assert.match(correctionPlan, /series_rule_id_unchanged/)
  assert.match(correctionPlan, /set_competition_event_division_points_scheme/)
  assert.match(correctionPlan, /p_division_revision/)
  assert.match(correctionPlan, /competition_event_homologations/)
  assert.match(correctionPlan, /competition_event_settlements/)
  assert.doesNotMatch(correctionPlan, /update\s+public\./i)
})

test('preview remains fail-closed and settlement/pair ranking contracts stay intact', () => {
  assert.match(settlementSql, /'RESULT_RULE_MISSING','BLOCKER'/)
  assert.match(settlementSql, /begin_competition_settlement_command/)
  assert.match(settlementSql, /'settlement:'\|\|s\.id\|\|':award:'\|\|a\.id/)
  assert.match(pairRankingSql, /max\(effective\.effective_points\)::bigint event_points/)
  assert.match(pairRankingSql, /coalesce\(tx\.reversed_transaction_id,tx\.id\)/)
})

test('new and replaced functions have explicit default-deny grants', () => {
  assert.match(canonical, /revoke all on function public\.adjust_competition_event_settlement_points[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(canonical, /grant execute on function public\.adjust_competition_event_settlement_points[\s\S]*to authenticated, service_role/)
  for (const signature of [
    'set_competition_event_division_points_scheme',
    'set_competition_event_tier_default_points_scheme',
    'configure_competition_series_event_division',
  ]) {
    assert.match(capabilities, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`))
    assert.match(capabilities, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*to authenticated, service_role`))
  }
  assert.match(capabilities, /revoke all on function public\.validate_competition_event_division_integrity\(\)\s*from public, anon, authenticated, service_role/)
  assert.doesNotMatch(capabilities, /grant execute on function public\.validate_competition_event_division_integrity/)
})
