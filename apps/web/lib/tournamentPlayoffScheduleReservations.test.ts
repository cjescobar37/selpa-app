import assert from 'node:assert/strict'
import test from 'node:test'
import { readMatchScheduleAssignments } from './tournamentSchedule'
import {
  buildPlayoffScheduleReservationKey,
  getPlayoffScheduleReservation,
  promotePlayoffScheduleReservationInRules,
  readPlayoffScheduleReservations,
  setMatchScheduleAssignmentInRules,
  upsertPlayoffScheduleReservationInRules,
  type PlayoffSchedulePhase,
  type PlayoffScheduleReservation,
} from './tournamentPlayoffScheduleReservations'

function reservation(phase: PlayoffSchedulePhase, matchOrder: number, scheduledAt: string, courtName: string): PlayoffScheduleReservation {
  return {
    category: '5',
    phase,
    match_order: matchOrder,
    scheduled_at: new Date(scheduledAt).toISOString(),
    court_name: courtName,
    court_id: `court-${phase.toLowerCase()}-${matchOrder}`,
    court_source: 'OWN_CLUB',
  }
}

for (const scenario of [
  { phase: 'QUARTER' as const, matchOrder: 1, matchId: 'match-c1', code: 'C1', at: '2026-10-09T20:00:00-03:00', court: 'Cancha 2' },
  { phase: 'SEMI' as const, matchOrder: 1, matchId: 'match-s1', code: 'S1', at: '2026-10-10T18:00:00-03:00', court: 'Cancha 1' },
  { phase: 'FINAL' as const, matchOrder: 1, matchId: 'match-f1', code: 'F1', at: '2026-10-11T20:00:00-03:00', court: 'Central' },
]) {
  test(`${scenario.code}: reserva -> materialización -> assignment real`, () => {
    const initialReservation = reservation(scenario.phase, scenario.matchOrder, scenario.at, scenario.court)
    let rules: Record<string, unknown> = upsertPlayoffScheduleReservationInRules({}, initialReservation)

    // Primer ganador: el partido dependiente todavía no existe. No se promueve nada.
    assert.deepEqual(
      getPlayoffScheduleReservation(rules, { category: 5, phase: scenario.phase, matchOrder: scenario.matchOrder }),
      initialReservation,
      'la reserva debe seguir siendo source of truth mientras falta el segundo ganador'
    )
    assert.deepEqual(readMatchScheduleAssignments(rules.match_schedule_assignments), {})

    // Segundo ganador: recién ahora existe el match real y se promueve la reserva.
    const promoted = promotePlayoffScheduleReservationInRules({
      rules,
      category: 5,
      phase: scenario.phase,
      matchOrder: scenario.matchOrder,
      matchId: scenario.matchId,
    })
    rules = promoted.rules

    assert.equal(promoted.mode, 'promoted')
    assert.equal(promoted.assignment?.scheduled_at, initialReservation.scheduled_at)
    assert.equal(promoted.assignment?.court_name, initialReservation.court_name)
    assert.equal(
      getPlayoffScheduleReservation(rules, { category: 5, phase: scenario.phase, matchOrder: scenario.matchOrder }),
      null,
      'la reserva debe eliminarse al materializarse el match'
    )
    assert.deepEqual(readMatchScheduleAssignments(rules.match_schedule_assignments)[scenario.matchId], promoted.assignment)

    // Repetición idempotente: el assignment existente gana; nunca revive la reserva.
    const secondRun = promotePlayoffScheduleReservationInRules({
      rules,
      category: 5,
      phase: scenario.phase,
      matchOrder: scenario.matchOrder,
      matchId: scenario.matchId,
    })
    assert.equal(secondRun.mode, 'existing_assignment')
    assert.deepEqual(secondRun.assignment, promoted.assignment)
    assert.equal(
      getPlayoffScheduleReservation(secondRun.rules, { category: 5, phase: scenario.phase, matchOrder: scenario.matchOrder }),
      null
    )

    // Edición posterior: solo cambia match_schedule_assignments.
    const editedAssignment = {
      ...promoted.assignment!,
      scheduled_at: new Date('2026-10-12T21:30:00-03:00').toISOString(),
      court_name: 'Cancha editada',
      court_id: 'court-edited',
    }
    rules = setMatchScheduleAssignmentInRules({
      rules: secondRun.rules,
      assignment: editedAssignment,
      playoffIdentity: { category: 5, phase: scenario.phase, matchOrder: scenario.matchOrder },
    })
    assert.deepEqual(readMatchScheduleAssignments(rules.match_schedule_assignments)[scenario.matchId], editedAssignment)
    assert.equal(
      getPlayoffScheduleReservation(rules, { category: 5, phase: scenario.phase, matchOrder: scenario.matchOrder }),
      null
    )
  })
}

test('si existe match real + assignment, una reserva stale se limpia sin reaplicarse', () => {
  const stale = reservation('QUARTER', 1, '2026-10-09T20:00:00-03:00', 'Cancha vieja')
  const realAssignment = {
    match_id: 'match-c1',
    scheduled_at: new Date('2026-10-09T21:00:00-03:00').toISOString(),
    court_name: 'Central',
    court_id: 'central',
    court_source: 'OWN_CLUB' as const,
  }
  const key = buildPlayoffScheduleReservationKey({ category: 5, phase: 'QUARTER', matchOrder: 1 })
  const rules = {
    playoff_schedule_reservations: { [key]: stale },
    match_schedule_assignments: { [realAssignment.match_id]: realAssignment },
  }

  const result = promotePlayoffScheduleReservationInRules({
    rules,
    category: 5,
    phase: 'QUARTER',
    matchOrder: 1,
    matchId: realAssignment.match_id,
  })

  assert.equal(result.mode, 'existing_assignment')
  assert.deepEqual(result.assignment, realAssignment)
  assert.equal(readPlayoffScheduleReservations((result.rules as Record<string, unknown>).playoff_schedule_reservations)[key], undefined)
})

test('regeneración explícita puede limpiar reservas sin tocar otras reglas', async () => {
  const { clearPlayoffScheduleReservationsFromRules } = await import('./tournamentPlayoffScheduleReservations')
  const rules = {
    schedule_config: { mode: 'MANUAL' },
    playoff_plan: { source: 'general_engine', bracket_size: 16 },
    playoff_schedule_reservations: {
      stale: reservation('QUARTER', 1, '2026-10-09T20:00:00-03:00', 'Cancha vieja'),
    },
    unrelated_rule: { keep: true },
  }
  const cleaned = clearPlayoffScheduleReservationsFromRules(rules)
  assert.equal(cleaned.playoff_schedule_reservations, undefined)
  assert.deepEqual(cleaned.schedule_config, rules.schedule_config)
  assert.deepEqual(cleaned.playoff_plan, rules.playoff_plan)
  assert.deepEqual(cleaned.unrelated_rule, rules.unrelated_rule)
})

test('valida cantidad de slots futuros según bracket persistido', async () => {
  const { getExpectedPlayoffMatchCountFromRules } = await import('./tournamentPlayoffScheduleReservations')
  const rules = { playoff_plan: { source: 'general_engine', bracket_size: 16 } }
  assert.equal(getExpectedPlayoffMatchCountFromRules(rules, 'EIGHTHS'), 8)
  assert.equal(getExpectedPlayoffMatchCountFromRules(rules, 'QUARTER'), 4)
  assert.equal(getExpectedPlayoffMatchCountFromRules(rules, 'SEMI'), 2)
  assert.equal(getExpectedPlayoffMatchCountFromRules(rules, 'FINAL'), 1)
  assert.equal(getExpectedPlayoffMatchCountFromRules(rules, 'ROUND_OF_16'), null)
})
