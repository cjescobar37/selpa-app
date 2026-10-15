import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { formatHomeNewsDate, formatHomeAgendaDeadline } = await import(new URL('./publicHomeDatePresentation.ts', import.meta.url).href) as typeof import('./publicHomeDatePresentation')

test('SSR and clients in UTC, Buenos Aires and Tokyo show the same business dates', () => {
  const original = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/Argentina/Buenos_Aires', 'Asia/Tokyo']) {
      process.env.TZ = zone
      assert.equal(formatHomeAgendaDeadline('2026-10-15T19:57:00+00:00'), 'El 15/10/2026 a las 16:57')
      assert.equal(formatHomeNewsDate('2026-04-16T01:30:00Z'), '15 de abr de 2026')
      assert.equal(formatHomeNewsDate('2026-04-16T16:00:00Z'), '16 de abr de 2026')
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
})

test('equal timestamp instants retain their meaning across offsets and midnight', () => {
  assert.equal(formatHomeAgendaDeadline('2026-10-15T16:57:00-03:00'), formatHomeAgendaDeadline('2026-10-15T19:57:00Z'))
  assert.equal(formatHomeAgendaDeadline('2026-10-16T01:30:00Z'), 'El 15/10/2026 a las 22:30')
  assert.equal(formatHomeAgendaDeadline('2026-10-16T03:00:00Z'), 'El 16/10/2026 a las 00:00')
})

test('calendar days do not shift or acquire the parsing anchor hour', () => {
  assert.equal(formatHomeNewsDate('2026-04-16'), '16 de abr de 2026')
  assert.equal(formatHomeAgendaDeadline('2026-10-17'), '17 de oct')
  assert.doesNotMatch(formatHomeAgendaDeadline('2026-10-17'), /12:00|a las/)
})

test('legacy offsetless datetime keeps existing Argentine wall-time semantics', () => {
  assert.equal(formatHomeAgendaDeadline('2026-10-15T16:57'), 'El 15/10/2026 a las 16:57')
  assert.equal(formatHomeAgendaDeadline('2026-10-15T16:57:00.123'), 'El 15/10/2026 a las 16:57')
  assert.equal(formatHomeAgendaDeadline('2026-10-15 16:57:00'), 'El 15/10/2026 a las 16:57')
  assert.equal(formatHomeNewsDate('2026-04-16T01:30:00'), '16 de abr de 2026')
})

test('missing/invalid data has deterministic existing fallback labels', () => {
  for (const value of [undefined, null, '', 'invalid', '2026-02-30', '04/16/2026', 'April 16 2026']) {
    assert.equal(formatHomeNewsDate(value), 'Fecha a confirmar')
    assert.equal(formatHomeAgendaDeadline(value), 'A definir')
  }
})

test('both first-render sites use deterministic helpers without hiding hydration', () => {
  const home = readFileSync(new URL('../components/public/PublicHomeExperience.tsx', import.meta.url), 'utf8')
  const card = readFileSync(new URL('../components/public/TournamentPublicCard.tsx', import.meta.url), 'utf8')
  assert.match(home, /formatHomeNewsDate as formatDate/)
  assert.match(card, /formatHomeAgendaDeadline as formatAgendaDeadline/)
  assert.doesNotMatch(home + card, /suppressHydrationWarning|ssr:\s*false/)
})
