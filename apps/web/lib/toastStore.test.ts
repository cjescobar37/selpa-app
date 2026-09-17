import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type * as Module from './toastStore'
const { createToastStore, humanizeToastMessage, toastDurations, visibleToasts } = await import(new URL('./toastStore.ts', import.meta.url).href) as typeof Module

test('global stack retains errors and queues without replacing feedback', () => {
  const store = createToastStore()
  store.success('Guardado'); const error = store.error('No pudimos guardar'); store.info('Actualizado'); store.warning('Revisá'); store.success('Otro guardado')
  assert.equal(store.getSnapshot().length, 5)
  assert.equal(visibleToasts(store.getSnapshot()).length, 3)
  assert.equal(visibleToasts(store.getSnapshot())[0].id, error)
})
test('manual close notifies subscribers and invokes callback once', () => {
  const store = createToastStore(); let updates = 0; let closes = 0
  const unsubscribe = store.subscribe(() => updates++)
  const id = store.error('Error', { onDismiss: () => closes++ })
  store.dismiss(id); store.dismiss(id); unsubscribe()
  assert.equal(closes, 1); assert.equal(store.getSnapshot().length, 0); assert.ok(updates >= 2)
})
test('durations preserve important errors and use product defaults', () => {
  assert.deepEqual(toastDurations, { success: 4500, info: 5000, warning: 7000, error: null })
  const store = createToastStore(); store.error('Error'); store.success('Listo')
  assert.equal(store.getSnapshot()[0].duration, null); assert.equal(store.getSnapshot()[1].duration, 4500)
})
test('compatibility bridge deduplicates effects but distinct actions stack', () => {
  const store = createToastStore(); const options = { dedupeKey: 'component', title: 'Listo' }
  store.success('Guardado', options); store.success('Guardado', options); store.success('Guardado')
  assert.equal(store.getSnapshot().length, 2)
  store.error('Guardado', options)
  assert.equal(store.getSnapshot().length, 3)
})
test('technical backend messages never reach action feedback', () => {
  assert.equal(humanizeToastMessage('23514 TOURNAMENT_REGISTRATION_CLOSED'), 'Las inscripciones ya están cerradas.')
  for (const text of ['PGRST202 RPC failed', '{"code":"23514"}', '23514 constraint', 'SNAPSHOT_UNEXPECTED_ERROR']) assert.equal(humanizeToastMessage(text), 'No pudimos completar la acción. Volvé a intentar.')
  assert.equal(humanizeToastMessage('Se guardaron 25000 puntos.'), 'Se guardaron 25000 puntos.')
})
test('seed removes its inline result banner while persistent context stays inline', () => {
  const tournament = readFileSync(new URL('../app/(app)/club/torneos/[id]/page.tsx', import.meta.url), 'utf8')
  assert.ok(!tournament.includes('club-actionMessage'))
  assert.ok(tournament.includes("title: 'Seed generado correctamente'"))
  assert.ok(tournament.includes('parejas quedaron ordenadas.'))
  assert.ok(tournament.includes('TournamentMilestoneNotice'))
  const editor = readFileSync(new URL('../app/(app)/club/competition/SeriesEventsAdmin.tsx', import.meta.url), 'utf8')
  assert.ok(editor.includes('completenessIssues.map'))
  assert.ok(editor.includes("text: 'Elegí una zona horaria válida.'"))
  const settlement = readFileSync(new URL('../app/(app)/club/competition/EventSettlementPanel.tsx', import.meta.url), 'utf8')
  assert.ok(settlement.includes('pointsValidation ? <p role="alert">'))
})
