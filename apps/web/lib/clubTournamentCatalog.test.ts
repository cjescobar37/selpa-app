import test from 'node:test'
import assert from 'node:assert/strict'
import { clubDeadlineIsSoon, clubTournamentDate, clubTournamentIsActive, clubTournamentSearch } from './clubTournamentCatalog'

test('running and paused tournaments remain operational after their start, historical events do not', () => {
  for (const status of ['RUNNING', 'ACTIVE', 'LIVE', 'IN_PROGRESS', 'PAUSED']) assert.equal(clubTournamentIsActive({ status, start_date: '2025-01-01' }, '2026-11-02'), true)
  for (const status of ['CANCELLED', 'FINISHED', 'ARCHIVED']) assert.equal(clubTournamentIsActive({ status, start_date: '2027-01-01' }, '2026-11-02'), false)
})

test('club search finds accented tournament names with unaccented input', () => {
  assert.ok(clubTournamentSearch('Copa Pádel Córdoba').includes(clubTournamentSearch('padel cordoba')))
})

test('date-only tournament dates stay on the first day and month in Argentina', () => {
  const date = clubTournamentDate('2026-11-01')
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date), '2026-11-01')
  assert.equal(Number.isNaN(clubTournamentDate('invalid').getTime()), true)
})

test('urgency includes only upcoming deadlines within 48 hours, never expired or undated events', () => {
  const now = Date.parse('2026-11-02T12:00:00-03:00')
  assert.equal(clubDeadlineIsSoon('2026-11-02', now), true)
  assert.equal(clubDeadlineIsSoon('2026-11-01', now), false)
  assert.equal(clubDeadlineIsSoon('2026-12-01', now), false)
  assert.equal(clubDeadlineIsSoon('invalid', now), false)
})
