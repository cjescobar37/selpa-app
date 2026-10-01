import assert from 'node:assert/strict'
import test from 'node:test'
import { continueTournamentCompetitionClosure } from './continueTournamentCompetitionClosure'

const context = { clubId: 'club', seriesId: 'series', eventId: 'event', eventDivisionId: 'division', tournamentId: 'tournament', token: 'token' }

function mockJourney(initial: { event: string; division: string; homologation?: string; extracted?: boolean; failEventOnce?: boolean; createConflictOnce?: boolean }) {
  let event = initial.event, division = initial.division, revision = 8
  let homologation = initial.homologation ?? ''
  let extracted = Boolean(initial.extracted)
  let failEventOnce = Boolean(initial.failEventOnce)
  let createConflictOnce = Boolean(initial.createConflictOnce)
  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const action = `${method} ${url.split('/').slice(-2).join('/')}`
    calls.push(action)
    const body = (() => {
      if (url.endsWith('/events/event') && method === 'GET') return { event: { status: event, revision }, series: { status: 'ACTIVE' }, divisions: [{ id: 'division', status: division, is_active: true, tournament_status: 'FINISHED', active_tournament_link: { tournament_id: 'tournament' } }], completeness: { blockers: [] }, allowed_actions: { complete: true } }
      if (url.endsWith('/division/complete') && method === 'GET') return { ready: true, blockers: [] }
      if (url.endsWith('/division/complete') && method === 'POST') { division = 'COMPLETED'; revision++; return { ok: true } }
      if (url.endsWith('/event/complete') && method === 'POST') { if (failEventOnce) { failEventOnce = false; return { error: 'La fecha cambió; reintentá.' } } event = 'COMPLETED'; revision++; return { ok: true } }
      if (url.endsWith('/division/homologations') && method === 'GET') return { homologations: homologation ? [{ id: homologation, status: initial.homologation === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT', revision: extracted ? 2 : 1, source_results_revision: extracted ? 'hash' : null }] : [] }
      if (url.endsWith('/division/homologations') && method === 'POST') { homologation = 'draft'; if (createConflictOnce) { createConflictOnce = false; return { error: 'El borrador ya existe.' } } return { homologation: { id: 'draft', status: 'DRAFT', revision: 1 } } }
      if (url.endsWith('/homologations/draft') && method === 'GET' || url.endsWith('/homologations/SUBMITTED') && method === 'GET') return { homologation: { id: homologation, status: initial.homologation === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT', revision: extracted ? 2 : 1, source_results_revision: extracted ? 'hash' : null }, participants: extracted ? [{}] : [], results: extracted ? [{}] : [], blockers: [] }
      if (url.endsWith('/draft/extract') && method === 'POST') { extracted = true; return { ok: true } }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })()
    return new Response(JSON.stringify(body), { status: 'error' in body ? 409 : 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('FINISHED + SCHEDULED closes division and event, creates/extracts draft, then opens homologation', async () => {
  const mock = mockJourney({ event: 'SCHEDULED', division: 'SCHEDULED' })
  try {
    const result = await continueTournamentCompetitionClosure(context)
    assert.equal(result.eventDivisionId, 'division')
    assert.equal(result.href, '/club/competition/series/series/events/event/divisions/division/homologation')
    assert.deepEqual(mock.calls.filter(call => call.startsWith('POST')), [
      'POST division/complete', 'POST event/complete', 'POST division/homologations', 'POST draft/extract',
    ])
  } finally { mock.restore() }
})

test('a completed date only prepares a missing draft', async () => {
  const mock = mockJourney({ event: 'COMPLETED', division: 'COMPLETED' })
  try {
    await continueTournamentCompetitionClosure(context)
    assert.deepEqual(mock.calls.filter(call => call.startsWith('POST')), ['POST division/homologations', 'POST draft/extract'])
  } finally { mock.restore() }
})

test('an existing draft or submitted homologation resumes without another write', async () => {
  for (const status of ['DRAFT', 'SUBMITTED']) {
    const mock = mockJourney({ event: 'COMPLETED', division: 'COMPLETED', homologation: status === 'DRAFT' ? 'draft' : 'SUBMITTED', extracted: true })
    try {
      await continueTournamentCompetitionClosure(context)
      assert.deepEqual(mock.calls.filter(call => call.startsWith('POST')), [])
    } finally { mock.restore() }
  }
})

test('partial closure resumes from event completion without repeating the division transition', async () => {
  const mock = mockJourney({ event: 'SCHEDULED', division: 'COMPLETED' })
  try {
    await continueTournamentCompetitionClosure(context)
    assert.deepEqual(mock.calls.filter(call => call.startsWith('POST')), ['POST event/complete', 'POST division/homologations', 'POST draft/extract'])
  } finally { mock.restore() }
})

test('a failed event transition can be retried without completing the division twice', async () => {
  const mock = mockJourney({ event: 'SCHEDULED', division: 'SCHEDULED', failEventOnce: true })
  try {
    await assert.rejects(() => continueTournamentCompetitionClosure(context), /La fecha cambió/)
    const result = await continueTournamentCompetitionClosure(context)
    assert.equal(result.homologationId, 'draft')
    assert.equal(mock.calls.filter(call => call === 'POST division/complete').length, 1)
    assert.equal(mock.calls.filter(call => call === 'POST event/complete').length, 2)
  } finally { mock.restore() }
})

test('a draft created concurrently is reused instead of creating another active homologation', async () => {
  const mock = mockJourney({ event: 'COMPLETED', division: 'COMPLETED', createConflictOnce: true })
  try {
    const result = await continueTournamentCompetitionClosure(context)
    assert.equal(result.homologationId, 'draft')
    assert.equal(mock.calls.filter(call => call === 'POST division/homologations').length, 1)
    assert.equal(mock.calls.filter(call => call === 'POST draft/extract').length, 1)
  } finally { mock.restore() }
})
