import assert from 'node:assert/strict'
import test from 'node:test'
import type * as FlowModule from './competitionPostTournamentFlow'

const { approveCompetitionResults, prepareCompetitionPointsPreview, publishCompetitionPoints } = await import(new URL('./competitionPostTournamentFlow.ts', import.meta.url).href) as typeof FlowModule

test('review approval performs extract, submit and approve with a fresh revision each time', async () => {
  const calls: string[] = []
  let state: FlowModule.WorkflowState = { id: 'h1', revision: 1, status: 'DRAFT', blockers: [], allowedActions: { submit: false }, sourceResultsRevision: null }
  const result = await approveCompetitionResults({
    get: async () => state,
    extract: async current => { calls.push(`extract:${current.revision}`); state = { ...state, revision: 2, sourceResultsRevision: 'hash', allowedActions: { submit: true } } },
    submit: async current => { calls.push(`submit:${current.revision}`); state = { ...state, revision: 3, status: 'SUBMITTED', allowedActions: { approve: true } } },
    approve: async current => { calls.push(`approve:${current.revision}`); state = { ...state, revision: 4, status: 'APPROVED', allowedActions: {} } },
  })
  assert.deepEqual(calls, ['extract:1', 'submit:2', 'approve:3'])
  assert.equal(result.status, 'APPROVED')
})

test('approval never advances while preflight has blockers', async () => {
  let submitted = false
  await assert.rejects(() => approveCompetitionResults({
    get: async () => ({ id: 'h1', revision: 2, status: 'DRAFT', blockers: [{ code: 'ENTRY_MISSING' }], allowedActions: { submit: false }, sourceResultsRevision: 'hash' }),
    extract: async () => undefined,
    submit: async () => { submitted = true },
    approve: async () => undefined,
  }), /Corregí los problemas/)
  assert.equal(submitted, false)
})

test('approved results prepare a calculated preview without publishing', async () => {
  const calls: string[] = []
  let state: FlowModule.WorkflowState | null = null
  const result = await prepareCompetitionPointsPreview({
    get: async () => state,
    create: async () => { calls.push('create'); state = { id: 's1', revision: 1, status: 'DRAFT', blockers: [], allowedActions: { calculate: true } } },
    calculate: async current => { calls.push(`calculate:${current.revision}`); state = { ...current, revision: 2, status: 'CALCULATED', allowedActions: { submit: true } } },
  })
  assert.deepEqual(calls, ['create', 'calculate:1'])
  assert.equal(result.status, 'CALCULATED')
})

test('publish points hides submit and approve while preserving their guarded transitions', async () => {
  const calls: string[] = []
  let state: FlowModule.WorkflowState = { id: 's1', revision: 2, status: 'CALCULATED', blockers: [], allowedActions: { submit: true } }
  const result = await publishCompetitionPoints({
    get: async () => state,
    submit: async current => { calls.push(`submit:${current.revision}`); return state = { ...state, revision: 3, status: 'SUBMITTED', allowedActions: { approve: true } } },
    approve: async current => { calls.push(`approve:${current.revision}`); return state = { ...state, revision: 4, status: 'APPROVED', allowedActions: { publish: true } } },
    publish: async current => { calls.push(`publish:${current.revision}`); return state = { ...state, revision: 5, status: 'PUBLISHED', allowedActions: {} } },
  })
  assert.deepEqual(calls, ['submit:2', 'approve:3', 'publish:4'])
  assert.equal(result.status, 'PUBLISHED')
})

test('a rejected settlement never reports publication success', async () => {
  await assert.rejects(() => publishCompetitionPoints({
    get: async () => ({ id: 's1', revision: 5, status: 'REJECTED', blockers: [], allowedActions: {} }),
    submit: async current => current,
    approve: async current => current,
    publish: async current => current,
  }), /no pudieron quedar publicados/)
})

test('publish starts from a fresh CALCULATED rev2 and never reuses a stale revision', async () => {
  const calls: string[] = []
  const fresh: FlowModule.WorkflowState = { id: 's1', revision: 2, status: 'CALCULATED', blockers: [], allowedActions: { submit: true } }
  await publishCompetitionPoints({
    get: async () => { calls.push('get:2'); return fresh },
    submit: async current => { calls.push(`submit:${current.revision}`); return { ...current, revision: 3, status: 'SUBMITTED', allowedActions: { approve: true } } },
    approve: async current => { calls.push(`approve:${current.revision}`); return { ...current, revision: 4, status: 'APPROVED', allowedActions: { publish: true } } },
    publish: async current => { calls.push(`publish:${current.revision}`); return { ...current, revision: 5, status: 'PUBLISHED', allowedActions: {} } },
  })
  assert.deepEqual(calls, ['get:2', 'submit:2', 'approve:3', 'publish:4'])
})

test('a stale submit stops the chain before approval or publication', async () => {
  const calls: string[] = []
  await assert.rejects(() => publishCompetitionPoints({
    get: async () => ({ id: 's1', revision: 2, status: 'CALCULATED', blockers: [], allowedActions: { submit: true } }),
    submit: async current => { calls.push(`submit:${current.revision}`); throw Object.assign(new Error('PRECONDITION_FAILED'), { status: 412 }) },
    approve: async current => { calls.push(`approve:${current.revision}`); return current },
    publish: async current => { calls.push(`publish:${current.revision}`); return current },
  }), /PRECONDITION_FAILED/)
  assert.deepEqual(calls, ['submit:2'])
})

test('the visible preview baseline reaches submit with its current revision', async () => {
  const calls: string[] = []
  const baseline: FlowModule.WorkflowState = { id: 's1', revision: 2, status: 'CALCULATED', blockers: [], allowedActions: { submit: true } }
  await publishCompetitionPoints({
    get: async () => baseline,
    submit: async current => { calls.push(`submit:${current.revision}`); return { ...current, revision: 3, status: 'SUBMITTED', allowedActions: { approve: true } } },
    approve: async current => ({ ...current, revision: 4, status: 'APPROVED', allowedActions: { publish: true } }),
    publish: async current => ({ ...current, revision: 5, status: 'PUBLISHED', allowedActions: {} }),
  })
  assert.equal(calls[0], 'submit:2')
})

test('after a stale preview is refreshed, the second attempt submits the fresh revision', async () => {
  const calls: string[] = []
  let visible: FlowModule.WorkflowState = { id: 's1', revision: 2, status: 'CALCULATED', blockers: [], allowedActions: { submit: true } }
  let server: FlowModule.WorkflowState = { ...visible, revision: 3 }
  const run = () => publishCompetitionPoints({
    get: async () => visible,
    submit: async current => {
      calls.push(`submit:${current.revision}`)
      if (current.revision !== server.revision) throw Object.assign(new Error('PRECONDITION_FAILED'), { status: 412 })
      return server = { ...server, revision: 4, status: 'SUBMITTED', allowedActions: { approve: true } }
    },
    approve: async current => server = { ...current, revision: 5, status: 'APPROVED', allowedActions: { publish: true } },
    publish: async current => server = { ...current, revision: 6, status: 'PUBLISHED', allowedActions: {} },
  })

  await assert.rejects(run, /PRECONDITION_FAILED/)
  visible = { id: 's1', revision: 3, status: 'CALCULATED', blockers: [], allowedActions: { submit: true } }
  await run()
  assert.deepEqual(calls, ['submit:2', 'submit:3'])
})

test('a real external change after refresh is rejected again', async () => {
  const calls: string[] = []
  const visible: FlowModule.WorkflowState = { id: 's1', revision: 3, status: 'CALCULATED', blockers: [], allowedActions: { submit: true } }
  const server = { ...visible, revision: 4 }

  await assert.rejects(() => publishCompetitionPoints({
    get: async () => visible,
    submit: async current => {
      calls.push(`submit:${current.revision}`)
      if (current.revision !== server.revision) throw Object.assign(new Error('PRECONDITION_FAILED'), { status: 412 })
      return current
    },
    approve: async current => current,
    publish: async current => current,
  }), /PRECONDITION_FAILED/)
  assert.deepEqual(calls, ['submit:3'])
})
