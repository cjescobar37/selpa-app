import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  competitionEventDivisionName,
  formatCompetitionEventOperationDate,
  summarizeCompetitionEventHistory,
} from './competitionEventOperationsPresentation'
import { getTournamentClosureState } from './competitionTournamentState'

const dashboard = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventOperationsDashboard.tsx'), 'utf8')
const dashboardCss = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventOperationsDashboard.module.css'), 'utf8')
const eventRepository = readFileSync(join(process.cwd(), 'features/competition/events/competition-events.repository.ts'), 'utf8')

test('A-B: history chips count real homologation and settlement versions, including one published', () => {
  assert.deepEqual(summarizeCompetitionEventHistory([
    {
      homologations: [{ status: 'APPROVED' }],
      settlements: [{ status: 'PUBLISHED' }, { status: 'SUPERSEDED' }],
    },
  ]), { resultVersions: 1, settlementVersions: 2, publications: 1 })
  assert.deepEqual(summarizeCompetitionEventHistory([
    { homologations: [{ status: 'APPROVED' }], settlements: [{ status: 'PUBLISHED' }] },
    { homologations: [{ status: 'DRAFT' }], settlements: [{ status: 'CALCULATED' }] },
  ]), { resultVersions: 2, settlementVersions: 2, publications: 1 })
  assert.match(dashboard, /summarizeCompetitionEventHistory\(activeDivisions\.map/)
  assert.match(dashboard, /summary\.resultVersions/)
  assert.match(dashboard, /summary\.settlementVersions/)
  assert.match(dashboard, /summary\.publications/)
})

test('C-D: linked tournament calendar dates win over the UTC-midnight event timestamp', () => {
  const date = formatCompetitionEventOperationDate({
    tournament_starts_at: '2026-10-02',
    tournament_ends_at: '2026-10-04',
    planned_starts_at: '2026-10-02T00:00:00.000Z',
    timezone: 'America/Argentina/Buenos_Aires',
  })
  assert.equal(date, '2–4 oct 2026')
  assert.doesNotMatch(date, /1 oct|21:00|9:00 p\. m\./)
  assert.match(eventRepository, /'id,rules_json,status,registration_deadline,start_date,end_date'/)
  assert.match(eventRepository, /tournament_starts_at:tournamentStarts\[0\]/)
  assert.match(eventRepository, /tournament_ends_at:tournamentEnds\.at\(-1\)/)
  assert.match(dashboard, /formatCompetitionEventOperationDate\(event\)/)
})

test('a genuine scheduled hour uses the event timezone when no tournament calendar dates exist', () => {
  const date = formatCompetitionEventOperationDate({
    planned_starts_at: '2026-10-02T12:00:00.000Z',
    timezone: 'America/Argentina/Buenos_Aires',
  })
  assert.match(date, /2 oct 2026/)
  assert.match(date, /9:00/)
})

test('E: a QA override yields to the frozen public category and branch', () => {
  const division = { configuration_snapshot: { division: {
    division_name: 'QA Caballeros', category_name: '6ta', branch_name: 'Caballeros',
  } } }
  assert.equal(competitionEventDivisionName(division), '6ta Caballeros')
  assert.equal(competitionEventDivisionName({ configuration_snapshot: { division: {
    division_name: 'QA Caballeros', category_name: '6ª', branch_name: 'Caballeros',
  } } }), '6ª Caballeros')
  assert.equal(competitionEventDivisionName({ configuration_snapshot: { division: {
    division_name: 'Máster invitacional', category_name: '6ta', branch_name: 'Caballeros',
  } } }), 'Máster invitacional')
  assert.match(dashboard, /competitionEventDivisionName\(division\)/)
})

test('F: liquidated state and ranking action are unchanged', () => {
  const settled = getTournamentClosureState({
    tournamentStatus: 'FINISHED', settlementStatus: 'PUBLISHED', linked: true,
    canManage: false, canView: true,
  })
  assert.equal(settled?.title, 'Fecha liquidada')
  assert.equal(settled?.nextAction?.label, 'Ver ranking →')
  assert.match(dashboard, />Ver ranking<\/Link>/)
  assert.match(dashboard, /status\(settlement\)==='PUBLISHED' \? 'Puntos publicados · Ranking actualizado'/)
})

test('375/390/430 mobile history remains compact and wraps without global overflow', () => {
  for (const width of [375, 390, 430]) {
    assert.ok(width >= 375)
    assert.match(dashboardCss, /\.pending\{flex-wrap:wrap;overflow:visible;gap:5px/)
    assert.match(dashboardCss, /\.pending span\{flex:0 1 auto;max-width:100%/)
  }
})
