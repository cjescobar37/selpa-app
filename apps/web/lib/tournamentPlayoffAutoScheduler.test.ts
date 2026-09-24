import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCompletePlayoffSchedule, type PlayoffAutoScheduleFixedSlot } from './tournamentPlayoffAutoScheduler'

const courts = [1, 2, 3].map((number) => ({ id: `court-${number}`, name: `Cancha ${number}`, source: 'OWN_CLUB' as const }))
const iso = (hour: number, minute = 0) => new Date(2026, 9, 4, hour, minute, 0, 0).toISOString()
const firstRound: PlayoffAutoScheduleFixedSlot[] = [
  { phase: 'EIGHTHS', matchOrder: 1, scheduledAt: iso(10), courtName: 'Cancha 1', courtId: 'court-1' },
  { phase: 'EIGHTHS', matchOrder: 2, scheduledAt: iso(10), courtName: 'Cancha 2', courtId: 'court-2' },
  { phase: 'EIGHTHS', matchOrder: 3, scheduledAt: iso(10), courtName: 'Cancha 3', courtId: 'court-3' },
  { phase: 'EIGHTHS', matchOrder: 4, scheduledAt: iso(11, 30), courtName: 'Cancha 1', courtId: 'court-1' },
  { phase: 'EIGHTHS', matchOrder: 5, scheduledAt: iso(11, 30), courtName: 'Cancha 2', courtId: 'court-2' },
]

function novemberMaster(overrides: Partial<Parameters<typeof buildCompletePlayoffSchedule>[0]> = {}) {
  return buildCompletePlayoffSchedule({
    category: 'master', bracketSize: 16, date: '2026-10-04', startTime: '10:00', endTime: '22:00',
    matchDurationMinutes: 90, courts, firstRoundPairOrders: [1, 3, 5, 6, 7], byePairOrders: [2, 4, 8],
    fixedSlots: firstRound, ...overrides,
  })
}

test('plans five eighths into the expected complete dependency calendar', () => {
  const result = novemberMaster()
  assert.equal(result.blocker, null)
  const time = (phase: string, order: number) => result.reservations.find((slot) => slot.phase === phase && slot.match_order === order)?.scheduled_at
  assert.deepEqual([time('QUARTER', 1), time('QUARTER', 2), time('QUARTER', 3)], [iso(13), iso(13), iso(13)])
  assert.equal(time('QUARTER', 4), iso(14, 30))
  assert.deepEqual([time('SEMI', 1), time('SEMI', 2)], [iso(16), iso(16)])
  assert.equal(time('FINAL', 1), iso(17, 30))
})

test('uses the previous-round finish as barrier without extra rest', () => {
  const result = novemberMaster()
  assert.equal(result.blocker, null)
  const slots = [...firstRound.map((slot) => ({ ...slot, scheduled_at: slot.scheduledAt, court_name: slot.courtName, court_id: slot.courtId })), ...result.reservations]
  const collisions = new Set<string>()
  for (const slot of slots) {
    const key = `${slot.court_id}:${slot.scheduled_at}`
    assert.equal(collisions.has(key), false)
    collisions.add(key)
  }
  const quarters = result.reservations.filter((slot) => slot.phase === 'QUARTER')
  assert.ok(quarters.every((slot) => Date.parse(slot.scheduled_at) >= Date.parse(iso(13))))
  assert.equal(Math.min(...quarters.map((slot) => Date.parse(slot.scheduled_at))), Date.parse(iso(13)))
  const semis = result.reservations.filter((slot) => slot.phase === 'SEMI')
  assert.equal(new Set(semis.map((slot) => slot.scheduled_at)).size, 1)
  assert.equal(semis[0].scheduled_at, iso(16))
  const final = result.reservations.find((slot) => slot.phase === 'FINAL')!
  assert.equal(final.scheduled_at, iso(17, 30))
})

test('last EIGHTHS wave at 11:30 plus 90 minutes starts QUARTER at 13:00', () => {
  const result = novemberMaster()
  const quarters = result.reservations.filter((slot) => slot.phase === 'QUARTER')
  assert.equal(Math.min(...quarters.map((slot) => Date.parse(slot.scheduled_at))), Date.parse(iso(13)))
})

test('distributes each round using the configured court count', () => {
  const result = novemberMaster({ courts: courts.slice(0, 2) })
  const quarterTimes = result.reservations
    .filter((slot) => slot.phase === 'QUARTER')
    .map((slot) => slot.scheduled_at)
  assert.deepEqual(quarterTimes, [iso(13), iso(13), iso(14, 30), iso(14, 30)])
  assert.deepEqual(result.reservations.filter((slot) => slot.phase === 'SEMI').map((slot) => slot.scheduled_at), [iso(16), iso(16)])
  assert.equal(result.reservations.find((slot) => slot.phase === 'FINAL')?.scheduled_at, iso(17, 30))
})

test('keeps a manual future reservation and does not reuse its court/time', () => {
  const manual = { phase: 'QUARTER' as const, matchOrder: 1, scheduledAt: iso(14, 30), courtName: 'Cancha 3', courtId: 'court-3' }
  const result = novemberMaster({ fixedSlots: [...firstRound, manual] })
  assert.equal(result.blocker, null)
  assert.equal(result.reservations.some((slot) => slot.phase === 'QUARTER' && slot.match_order === 1), false)
  assert.equal(result.reservations.some((slot) => slot.court_id === 'court-3' && slot.scheduled_at === iso(14, 30)), false)
})

test('returns a capacity blocker instead of scheduling outside the window', () => {
  const result = novemberMaster({ endTime: '18:00' })
  assert.equal(result.blocker?.code, 'PLAYOFF_SCHEDULE_CAPACITY_INSUFFICIENT')
  assert.ok((result.blocker?.pendingSlots.length ?? 0) > 0)
  assert.ok(result.reservations.every((slot) => Date.parse(slot.scheduled_at) + 90 * 60_000 <= Date.parse(iso(18))))
})

test('BYEs advance readiness without consuming a court reservation', () => {
  const result = novemberMaster()
  assert.equal(result.reservations.length, 7)
  assert.equal(result.reservations.some((slot) => slot.phase === 'EIGHTHS'), false)
})
