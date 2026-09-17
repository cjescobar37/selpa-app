import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260911163822_competition_points_preview_safe_edit.sql'), 'utf8')
const settlementPanel = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventSettlementPanel.tsx'), 'utf8')
const homologationPanel = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventHomologationAdmin.tsx'), 'utf8')
const handler = readFileSync(join(process.cwd(), 'features/competition/settlement/competition-settlement.handlers.ts'), 'utf8')
const qa = readFileSync(join(process.cwd(), 'supabase/qa/20260911163822_competition_points_preview_safe_edit_validation.sql'), 'utf8')
const schemaSources = [
  'supabase/migrations/20260417_tournament_engine_phase1.sql',
  'supabase/migrations/20260729_competition_points_ledger_stage4.sql',
  'supabase/migrations/20260729_competition_points_ledger_stage4_functions.sql',
  'supabase/migrations/20260803120000_competition_event_settlement_stage5a5.sql',
  'supabase/migrations/20260804120000_competition_points_schemes_stage5a7.sql',
  'supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql',
].map(path => readFileSync(join(process.cwd(), path), 'utf8')).join('\n')

const adjustment = migration.slice(
  migration.indexOf('create or replace function public.adjust_competition_event_settlement_points'),
  migration.indexOf('-- A published correction'),
)
const correction = migration.slice(migration.indexOf('create or replace function public.create_competition_event_settlement_correction'))

test('a date adjustment always clones its effective scheme and never updates the series configuration', () => {
  assert.match(adjustment, /cloned_scheme := public\.clone_points_scheme\(p_club_id, source_scheme\.id, candidate_name\)/)
  assert.match(adjustment, /set[\s\S]*points_scheme_id = cloned_scheme\.id/)
  assert.match(adjustment, /'source_points_scheme_id', original_scheme_id/)
  assert.doesNotMatch(adjustment, /update public\.competition_series_(?:rules|event_divisions)/)
})

test('every table and function dependency is defined by the accumulated local schema', () => {
  for (const object of [
    'competition_event_settlements',
    'competition_event_settlement_awards',
    'competition_point_transactions',
    'points_schemes',
    'points_scheme_rules',
    'clone_points_scheme',
    'update_points_scheme_rule',
    'calculate_competition_event_settlement',
    'begin_competition_settlement_command',
    'finish_competition_settlement_command',
    'reverse_competition_point_transaction',
    'competition_pair_ranking_projection',
  ]) assert.match(schemaSources, new RegExp(`(?:table|function|view)[^\\n]*${object}`))
})

test('adjustment is restricted to editable pre-publish states and recalculates the preview', () => {
  assert.match(adjustment, /settlement\.status not in \('DRAFT', 'CALCULATED'\)/)
  assert.match(adjustment, /delete from public\.competition_event_settlement_awards/)
  assert.match(adjustment, /public\.calculate_competition_event_settlement/)
  assert.match(adjustment, /'ADJUST_POINTS'/)
  assert.doesNotMatch(adjustment, /delete from public\.competition_point_transactions/)
})

test('published correction is versioned, idempotent and compensates ledger transactions', () => {
  assert.match(correction, /source\.status not in \('REJECTED', 'PUBLISHED'\)/)
  assert.match(correction, /'CORRECTION'/)
  assert.match(correction, /corrected_from_id = source\.id/)
  assert.match(correction, /'version', corrected\.version/)
  assert.match(correction, /public\.reverse_competition_point_transaction/)
  assert.match(correction, /status = 'SUPERSEDED', superseded_by_id = corrected\.id/)
  assert.match(correction, /finish_competition_settlement_command/)
  assert.doesNotMatch(correction, /delete from public\.competition_point_transactions/)
})

test('publish transitions expose the exact returned revision to the browser workflow', () => {
  assert.match(handler, /revision:Number\(result\.revision\?\?preflight\.revision\)/)
  assert.match(handler, /return NextResponse\.json\(\{ok:true,result,state\}\)/)
  assert.match(settlementPanel, /request<TransitionResponse>/)
  assert.match(settlementPanel, /\)\)\.state/)
  assert.match(settlementPanel, /if \(error\.status === 412 && error\.code === 'PRECONDITION_FAILED'\) \{\s*await load\(false\)/)
  assert.match(settlementPanel, /title: 'Vista previa actualizada'/)
})

test('publication compares against the preview being shown and replaces that baseline after refresh', () => {
  assert.match(settlementPanel, /const previewBaseline = useRef<WorkflowState \| null>\(null\)/)
  assert.match(settlementPanel, /previewBaseline\.current = latestDetail \? settlementState\(latestDetail\) : null\s*setDetail\(latestDetail\)/)
  assert.match(settlementPanel, /const baseline = previewBaseline\.current/)
  assert.match(settlementPanel, /get: async \(\) => baseline/)
  assert.doesNotMatch(settlementPanel, /settlementState\(await getDetail\(detail\.settlement\.id\)\)/)
  assert.match(settlementPanel, /code: body\.code/)
})

test('preview identifies scheme and snapshot and keeps adjustment secondary to publish', () => {
  assert.match(settlementPanel, /Esquema usado/)
  assert.match(settlementPanel, /Snapshot de \{sourceName\}/)
  assert.match(settlementPanel, /<SlidersHorizontal size=\{15\} \/>Ajustar puntos<\/button>/)
  assert.match(settlementPanel, /'Publicar puntos'/)
  assert.match(settlementPanel, /La tabla original del circuito no fue modificada/)
  assert.match(settlementPanel, /Editar tabla del circuito para próximas fechas/)
})

test('post-publish UI only offers a confirmed correction instead of destructive editing', () => {
  assert.match(settlementPanel, /detail\.settlement\.status === 'PUBLISHED'/)
  assert.match(settlementPanel, /La versión publicada no se edita/)
  assert.match(settlementPanel, /Confirmar corrección/)
  assert.doesNotMatch(settlementPanel, /status === 'PUBLISHED'[\s\S]{0,500}saveAdjustment/)
})

test('homologation correction preserves history and manual supersede stays diagnostic', () => {
  assert.match(homologationPanel, /'Corregir resultados'/)
  assert.match(homologationPanel, /homologación aprobada conserva su historial/i)
  assert.match(homologationPanel, /Diagnóstico: reemplazar homologación/)
  assert.match(homologationPanel, /Motivo obligatorio/)
  assert.match(homologationPanel, /!reason\.trim\(\)/)
})

test('transactional QA covers the complete production-readiness matrix and always rolls back', () => {
  assert.match(qa, /^begin;/)
  assert.match(qa, /rollback;\s*$/)
  for (const evidence of [
    'El esquema OPEN original fue modificado',
    'El ajuste alteró la regla o snapshot de la fecha',
    'La vista previa no fue recalculada',
    'Stale revision aceptada',
    'PUBLISH/replay inválido',
    'Reversals no compensan exactamente una vez cada original',
    'Replay de corrección no fue idempotente',
    'Owner cross-club pudo ajustar',
    'PLAYER pudo ajustar puntos',
    'Pair projection corregida suma incorrectamente',
    'La operación fallida dejó cambios parciales',
  ]) assert.match(qa, new RegExp(evidence))
})
