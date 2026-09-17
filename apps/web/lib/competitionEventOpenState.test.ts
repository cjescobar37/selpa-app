import assert from 'node:assert/strict'
import test from 'node:test'
const { deriveCompetitionEventOperationalState } = await import(new URL('./competitionTournamentState.ts', import.meta.url).href)
const { isActionableCompetitionEventIssue } = await import(new URL('./competitionEventIssues.ts', import.meta.url).href)
const { resolveCompetitionTimezone } = await import(new URL('./competitionTimezone.ts', import.meta.url).href)
test('linked OPEN wins over Competition DRAFT without pretending the snapshot is frozen', () => {
  assert.equal(deriveCompetitionEventOperationalState({status:'DRAFT',tournament_status:'OPEN'}).key,'OPEN')
  assert.equal(isActionableCompetitionEventIssue('NOT_PUBLIC',{tournament_status:'OPEN'}),false)
})
test('registration deadline closes registrations, not a fictitious running tournament', () => {
  assert.equal(deriveCompetitionEventOperationalState({status:'DRAFT',tournament_status:'OPEN',tournament_registration_deadline:'2026-11-01T12:00:00Z'},new Date('2026-11-02')).key,'SCHEDULED')
  assert.equal(deriveCompetitionEventOperationalState({status:'DRAFT',tournament_status:'RUNNING'}).key,'IN_PROGRESS')
})
test('planned count is information; real timezone blocker remains actionable', () => {
  assert.equal(isActionableCompetitionEventIssue('PLANNED_EVENTS_COUNT_DIFFERS'),false)
  assert.equal(isActionableCompetitionEventIssue('TIMEZONE_MISSING'),true)
})
test('configured club timezone takes precedence; absent config uses explicit device default', () => {
  assert.equal(resolveCompetitionTimezone({clubTimezone:'Europe/Madrid',deviceTimezone:'America/Argentina/Buenos_Aires'}),'Europe/Madrid')
  assert.equal(resolveCompetitionTimezone({deviceTimezone:'America/Montevideo'}),'America/Montevideo')
  assert.equal(resolveCompetitionTimezone({clubTimezone:'invalid'}),null)
})
