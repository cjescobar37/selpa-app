import assert from 'node:assert/strict'
import test from 'node:test'
import type * as CompetitionEventIssuesModule from './competitionEventIssues'

const { competitionEventIssueCode, competitionEventIssueLabel, isActionableCompetitionEventIssue, uniqueCompetitionEventIssues } = await import(new URL('./competitionEventIssues.ts', import.meta.url).href) as typeof CompetitionEventIssuesModule

test('maps configuration blockers to a concrete operator message', () => {
  assert.equal(competitionEventIssueLabel('TIMEZONE_MISSING'), 'Falta definir la zona horaria.')
  assert.equal(competitionEventIssueLabel({ code: 'SCHEME_INVALID' }), 'Falta elegir un esquema de puntos activo.')
})

test('preserves the API message for an unknown structured issue', () => {
  const issue = { code: 'FUTURE_CONTRACT_CODE', message: 'Falta una configuración nueva.' }
  assert.equal(competitionEventIssueCode(issue), 'FUTURE_CONTRACT_CODE')
  assert.equal(competitionEventIssueLabel(issue), 'Falta una configuración nueva.')
})

test('deduplicates blockers and warnings by issue code', () => {
  const issues = uniqueCompetitionEventIssues([
    'VENUE_MISSING',
    { code: 'VENUE_MISSING', message: 'Mensaje duplicado.' },
    { code: 'NOT_PUBLIC', message: 'La fecha todavía no es pública.' },
  ])

  assert.deepEqual(issues, [
    'VENUE_MISSING',
    { code: 'NOT_PUBLIC', message: 'La fecha todavía no es pública.' },
  ])
})

test('completed lifecycle and snapshot diagnostics stay out of the primary operation experience', () => {
  assert.equal(isActionableCompetitionEventIssue('EVENT_NOT_DRAFT'), false)
  assert.equal(isActionableCompetitionEventIssue({ code: 'DIVISION_NOT_DRAFT' }), false)
  assert.equal(isActionableCompetitionEventIssue({ code: 'SNAPSHOT_UNEXPECTED' }), false)
  assert.equal(isActionableCompetitionEventIssue({ code: 'TIMEZONE_MISSING' }), true)
  assert.equal(isActionableCompetitionEventIssue({ code: 'UNKNOWN_INTERNAL_CODE' }), false)
})
