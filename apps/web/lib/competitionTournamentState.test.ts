import assert from 'node:assert/strict'
import test from 'node:test'
import type * as CompetitionStateModule from './competitionTournamentState'

const { deriveCompetitionEventNextAction, deriveCompetitionEventOperationalState, deriveCompetitionEventPipelineState, deriveCompetitionPipelineState, deriveTournamentOperationalStage, selectCompetitionFocusEvent, selectNextCompetitionEvent, sortCompetitionPointsRules } = await import(new URL('./competitionTournamentState.ts', import.meta.url).href) as typeof CompetitionStateModule

test('champion plus RUNNING remains PLAYOFF and requests formal finalization', () => {
  assert.equal(deriveTournamentOperationalStage({ status: 'RUNNING', groupCount: 4, groupMatchesTotal: 12, playoffMatchesCount: 7 }), 'PLAYOFF')
  assert.deepEqual(deriveCompetitionPipelineState({ tournamentStatus: 'RUNNING', sportsComplete: true }), {
    key: 'SPORTS_COMPLETE', title: 'Resultados deportivos completos', message: 'Falta finalizar formalmente el torneo.',
  })
})

test('persisted FINISHED unlocks the Competition follow-up states', () => {
  assert.equal(deriveTournamentOperationalStage({ status: 'FINISHED', groupCount: 0, groupMatchesTotal: 0, playoffMatchesCount: 0 }), 'FINALIZADO')
  assert.equal(deriveCompetitionPipelineState({ tournamentStatus: 'FINISHED', sportsComplete: true })?.key, 'TOURNAMENT_FINISHED')
  assert.equal(deriveCompetitionPipelineState({ tournamentStatus: 'FINISHED', sportsComplete: true, homologationStatus: 'APPROVED' })?.key, 'RESULTS_HOMOLOGATED')
  assert.equal(deriveCompetitionPipelineState({ tournamentStatus: 'FINISHED', sportsComplete: true, homologationStatus: 'APPROVED', settlementStatus: 'PUBLISHED' })?.key, 'SETTLED')
})

test('submitted homologation is not treated as approved', () => {
  assert.equal(deriveCompetitionPipelineState({ tournamentStatus: 'FINISHED', sportsComplete: true, homologationStatus: 'SUBMITTED' })?.key, 'TOURNAMENT_FINISHED')
})

test('event bridge exposes the four post-tournament states', () => {
  const base = { status: 'SCHEDULED', sports_complete: true, circuit_context: { homologation_status: null, settlement_status: null } }
  assert.equal(deriveCompetitionEventPipelineState({ ...base, tournament_status: 'RUNNING' })?.key, 'SPORTS_COMPLETE')
  assert.equal(deriveCompetitionEventPipelineState({ ...base, tournament_status: 'FINISHED' })?.key, 'TOURNAMENT_FINISHED')
  assert.equal(deriveCompetitionEventPipelineState({ ...base, tournament_status: 'FINISHED', circuit_context: { homologation_status: 'APPROVED', settlement_status: 'APPROVED' } })?.key, 'RESULTS_HOMOLOGATED')
  assert.equal(deriveCompetitionEventPipelineState({ ...base, tournament_status: 'FINISHED', circuit_context: { homologation_status: 'APPROVED', settlement_status: 'PUBLISHED' } })?.key, 'SETTLED')
})

test('focus stays on unfinished administration while next date only uses a future event', () => {
  const events = [
    { status: 'SCHEDULED', tournament_status: 'FINISHED', sports_complete: true, tournament_starts_at: '2026-10-01', circuit_context: { homologation_status: null, settlement_status: null } },
    { status: 'SCHEDULED', tournament_status: 'DRAFT', sports_complete: false, tournament_starts_at: '2026-11-10', circuit_context: null },
  ]
  assert.equal(selectCompetitionFocusEvent(events), events[0])
  assert.equal(selectNextCompetitionEvent(events, new Date('2026-10-15T12:00:00-03:00')), events[1])
  assert.equal(selectNextCompetitionEvent([events[0]], new Date('2026-10-15T12:00:00-03:00')), null)
  assert.equal(selectNextCompetitionEvent([{ ...events[1], tournament_starts_at: '2026-10-15' }], new Date('2026-10-15T12:00:00-03:00'))?.tournament_starts_at, '2026-10-15')
})

test('finished tournament exposes the exact prerequisite before homologation', () => {
  const draft = { status: 'DRAFT', tournament_status: 'FINISHED', sports_complete: true, circuit_context: { event_status: 'DRAFT', event_division_status: 'DRAFT', homologation_status: null, settlement_status: null } }
  assert.equal(deriveCompetitionEventOperationalState(draft).label, 'Finalizado')
  assert.equal(deriveCompetitionEventOperationalState(draft).pointsLabel, 'Pendiente homologar')
  assert.deepEqual(deriveCompetitionEventNextAction(draft), { key: 'CLOSE_DATE', label: 'Cerrar fecha' })
  assert.deepEqual(deriveCompetitionEventNextAction({ ...draft, status: 'SCHEDULED', circuit_context: { ...draft.circuit_context, event_status: 'SCHEDULED', event_division_status: 'SCHEDULED' } }), { key: 'CLOSE_DATE', label: 'Cerrar fecha' })
  assert.deepEqual(deriveCompetitionEventNextAction({ ...draft, status: 'COMPLETED', circuit_context: { ...draft.circuit_context, event_status: 'COMPLETED', event_division_status: 'COMPLETED' } }), { key: 'CLOSE_DATE', label: 'Cerrar fecha' })
})

test('homologation and settlement share semantic labels across screens', () => {
  const base = { status: 'COMPLETED', tournament_status: 'FINISHED', sports_complete: true }
  const homologated = { ...base, circuit_context: { event_status: 'COMPLETED', event_division_status: 'COMPLETED', homologation_status: 'APPROVED', settlement_status: null } }
  assert.deepEqual(deriveCompetitionEventOperationalState(homologated), { key: 'HOMOLOGATED', label: 'Homologada', pointsLabel: 'Pendiente publicar puntos', tone: 'warning' })
  assert.deepEqual(deriveCompetitionEventNextAction(homologated), { key: 'PUBLISH_POINTS', label: 'Publicar puntos' })
  const settled = { ...homologated, circuit_context: { ...homologated.circuit_context, settlement_status: 'PUBLISHED' } }
  assert.deepEqual(deriveCompetitionEventOperationalState(settled), { key: 'SETTLED', label: 'Liquidada', pointsLabel: 'Puntos publicados', tone: 'success' })
})

test('points use persisted order and semantic fallback when persisted values tie', () => {
  const unordered = [
    { rule_key: 'PARTICIPATION', points: 50, sort_order: 0 },
    { rule_key: 'CHAMPION', points: 500, sort_order: 0 },
    { rule_key: 'QUARTERFINALIST', points: 100, sort_order: 0 },
    { rule_key: 'RUNNER_UP', points: 400, sort_order: 0 },
    { rule_key: 'SEMIFINALIST', points: 200, sort_order: 0 },
  ]
  assert.deepEqual(sortCompetitionPointsRules(unordered).map((rule) => rule.rule_key), ['CHAMPION', 'RUNNER_UP', 'SEMIFINALIST', 'QUARTERFINALIST', 'PARTICIPATION'])
  assert.deepEqual(sortCompetitionPointsRules([{ rule_key: 'CHAMPION', sort_order: 20 }, { rule_key: 'RUNNER_UP', sort_order: 10 }]).map((rule) => rule.rule_key), ['RUNNER_UP', 'CHAMPION'])
})
