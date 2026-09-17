import assert from 'node:assert/strict'
import test from 'node:test'
import type * as ClosureModule from './competitionEventClosure'

const { closeCompetitionEvent, CompetitionEventClosureBlocked } = await import(new URL('./competitionEventClosure.ts', import.meta.url).href) as typeof ClosureModule

test('FINISHED tournament closes draft Competition lifecycle and extracts a review', async () => {
  const calls: string[] = []
  let eventStatus = 'DRAFT', divisionStatus = 'DRAFT', eventRevision = 3, seriesStatus = 'SCHEDULED'
  let homologation: ClosureModule.ClosureHomologation | null = null
  const result = await closeCompetitionEvent({
    getEvent: async () => ({ event: { status: eventStatus, revision: eventRevision }, series: { status: seriesStatus, revision: 2 }, divisions: [{ id: 'division-1', status: divisionStatus, is_active: true }], completeness: { blockers: [] }, allowed_actions: { schedule: eventStatus === 'DRAFT', complete: divisionStatus === 'COMPLETED' } }),
    activateSeries: async () => { calls.push('activate-series'); seriesStatus = 'ACTIVE' },
    scheduleEvent: async () => { calls.push('schedule-event'); eventStatus = 'SCHEDULED'; divisionStatus = 'SCHEDULED'; eventRevision++ },
    getDivisionPreflight: async () => ({ ready: true, blockers: [] }),
    completeDivision: async () => { calls.push('complete-division'); divisionStatus = 'COMPLETED'; eventRevision++ },
    completeEvent: async () => { calls.push('complete-event'); eventStatus = 'COMPLETED'; eventRevision++ },
    listHomologations: async () => homologation ? [homologation] : [],
    createHomologation: async () => { calls.push('create-homologation'); homologation = { id: 'homologation-1', revision: 1, status: 'DRAFT', source_results_revision: null }; return homologation },
    getHomologation: async () => ({ homologation: homologation!, participants: homologation?.source_results_revision ? Array(38).fill({}) : [], results: homologation?.source_results_revision ? Array(19).fill({}) : [], blockers: [] }),
    extractHomologation: async () => { calls.push('extract-results'); homologation = { ...homologation!, revision: 2, source_results_revision: 'hash' } },
  })

  assert.deepEqual(calls, ['activate-series', 'schedule-event', 'complete-division', 'complete-event', 'create-homologation', 'extract-results'])
  assert.deepEqual(result, { eventDivisionId: 'division-1', homologationId: 'homologation-1', participants: 38, results: 19 })
})

test('retry skips lifecycle and extraction already completed', async () => {
  const calls: string[] = []
  await closeCompetitionEvent({
    getEvent: async () => ({ event: { status: 'COMPLETED', revision: 8 }, series: { status: 'ACTIVE', revision: 4 }, divisions: [{ id: 'division-1', status: 'COMPLETED', is_active: true }], completeness: {}, allowed_actions: {} }),
    activateSeries: async () => { calls.push('activate') }, scheduleEvent: async () => { calls.push('schedule') }, getDivisionPreflight: async () => ({ ready: true, blockers: [] }), completeDivision: async () => { calls.push('complete-division') }, completeEvent: async () => { calls.push('complete-event') },
    listHomologations: async () => [{ id: 'homologation-1', revision: 2, status: 'DRAFT', source_results_revision: 'hash' }],
    createHomologation: async () => { throw new Error('must not create') },
    getHomologation: async () => ({ homologation: { id: 'homologation-1', revision: 2, status: 'DRAFT', source_results_revision: 'hash' }, participants: [{}], results: [{}], blockers: [] }),
    extractHomologation: async () => { calls.push('extract') },
  })
  assert.deepEqual(calls, [])
})

test('a real completion blocker stops before mutating the division', async () => {
  let completed = false
  await assert.rejects(() => closeCompetitionEvent({
    getEvent: async () => ({ event: { status: 'SCHEDULED', revision: 4 }, series: { status: 'ACTIVE', revision: 2 }, divisions: [{ id: 'division-1', status: 'SCHEDULED', is_active: true }], completeness: {}, allowed_actions: {} }),
    activateSeries: async () => undefined, scheduleEvent: async () => undefined,
    getDivisionPreflight: async () => ({ ready: false, blockers: [{ code: 'MATCHES_INCOMPLETE', message: 'Quedan partidos pendientes.' }] }),
    completeDivision: async () => { completed = true }, completeEvent: async () => undefined, listHomologations: async () => [], createHomologation: async () => ({ id: '', revision: 1, status: 'DRAFT' }), getHomologation: async () => ({ homologation: { id: '', revision: 1, status: 'DRAFT' }, participants: [], results: [], blockers: [] }), extractHomologation: async () => undefined,
  }), (error: unknown) => error instanceof CompetitionEventClosureBlocked && error.message === 'Quedan partidos pendientes.')
  assert.equal(completed, false)
})
