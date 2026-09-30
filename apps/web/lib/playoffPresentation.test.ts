import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { findAmbiguousCourtNames, formatPlayoffSchedule, resolveTeamDisplayName, type MobilePlayoffMatch } from '../app/(app)/club/torneos/_components/playoffPresentation'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const mobilePlayoff = source('../app/(app)/club/torneos/_components/MobilePlayoff.tsx')
const mobilePlayoffCss = source('../app/(app)/club/torneos/_components/MobilePlayoff.module.css')
const tournamentPage = source('../app/(app)/club/torneos/[id]/page.tsx')

const match = (overrides: Partial<MobilePlayoffMatch> = {}): MobilePlayoffMatch => ({
  id: 'match-1', group_id: null, phase: 'QUARTER', status: 'PENDING',
  team1_id: 'team-1', team2_id: 'team-2', winner_team_id: null,
  score: null, round: 1, match_order: 1, ...overrides,
})

test('result modal resolves the match names for its heading and score rows', () => {
  assert.ok(tournamentPage.includes("resolveTeamDisplayName(resultMatch, 'team1', teamNameLookup)} vs {resolveTeamDisplayName(resultMatch, 'team2', teamNameLookup)"))
  assert.ok(tournamentPage.includes("const team1Name = resolveTeamDisplayName(match, 'team1', teamNameLookup)"))
  assert.ok(tournamentPage.includes("const team2Name = resolveTeamDisplayName(match, 'team2', teamNameLookup)"))

  const current = match({ team1_name: 'César Ambrossio / Cristian Escobar' })
  const names = new Map([['team-2', 'Bruno Acosta / Julián Cabrera']])
  assert.equal(resolveTeamDisplayName(current, 'team1', names), 'César Ambrossio / Cristian Escobar')
  assert.equal(resolveTeamDisplayName(current, 'team2', names), 'Bruno Acosta / Julián Cabrera')
})

test('Equipo 1 and Equipo 2 are only fallback names when both sources are empty', () => {
  const noNames = match({ team1_name: '  ', team2_name: null })
  assert.equal(resolveTeamDisplayName(noNames, 'team1', new Map()), 'Equipo 1')
  assert.equal(resolveTeamDisplayName(noNames, 'team2', new Map()), 'Equipo 2')
  assert.equal(resolveTeamDisplayName(noNames, 'team1', new Map([['team-1', 'Pareja A']])), 'Pareja A')
})

test('same court name in different court IDs and complexes displays its complex', () => {
  const courts = [
    { court_id: 'blp-1', court_name: 'Cancha 1', court_complex_name: 'Complejo BLP' },
    { court_id: 'cristal-1', court_name: 'Cancha 1', court_complex_name: 'Cristal Padel Club' },
  ]
  const ambiguous = findAmbiguousCourtNames(courts)
  assert.equal(ambiguous.has('cancha 1'), true)
  assert.equal(formatPlayoffSchedule(match({
    scheduled_at: '2026-10-04T19:00:00.000Z', court_id: 'blp-1', court_name: 'Cancha 1', court_complex_name: 'Complejo BLP',
  }), ambiguous).court, 'Complejo BLP · Cancha 1')
})

test('unique court names do not add their complex', () => {
  const courts = [
    { court_id: 'cristal-1', court_name: 'Cancha 1', court_complex_name: 'Cristal Padel Club' },
    { court_id: 'cristal-2', court_name: 'Cancha 2', court_complex_name: 'Cristal Padel Club' },
  ]
  assert.equal(findAmbiguousCourtNames(courts).size, 0)
  assert.equal(formatPlayoffSchedule(match({ court_id: 'cristal-2', court_name: 'Cancha 2', court_complex_name: 'Cristal Padel Club' }), findAmbiguousCourtNames(courts)).court, 'Cancha 2')
})

test('one shared formatter produces the requested date, time and location lines', () => {
  assert.deepEqual(formatPlayoffSchedule(match({
    scheduled_at: '2026-10-04T19:00:00.000Z', court_name: 'Cancha 2',
  })), { date: 'Día 4/10', time: '16:00 hs', court: 'Cancha 2' })
  assert.match(mobilePlayoff, /const nextWhen = formatPlayoffSchedule\(props\.nextMatch \?\? undefined, ambiguousCourtNames\)/)
  assert.match(mobilePlayoff, /<span>\{when\.date\} · \{when\.time\}<\/span>/)
})

test('schedule information and all labeled actions share one horizontal row', () => {
  const rowStart = mobilePlayoff.indexOf('<div className={styles.scheduleActionRow}>')
  const rowEnd = mobilePlayoff.indexOf('{teams(slot, compact, false, overview)}', rowStart)
  const scheduleRow = mobilePlayoff.slice(rowStart, rowEnd)
  assert.ok(rowStart >= 0 && rowEnd > rowStart)
  assert.ok(scheduleRow.indexOf('className={styles.scheduleInfo}') < scheduleRow.indexOf('className={styles.cardActions}'))
  assert.ok(scheduleRow.includes('<span>{when.date} · {when.time}</span>'))
  assert.ok(scheduleRow.includes('className={styles.scheduleLocation}'))
  assert.ok(mobilePlayoff.includes("<span>Cambiar</span>"))
  assert.ok(mobilePlayoff.includes("'Reprogramar'"))
  assert.ok(mobilePlayoff.includes("'Cargar'"))
  assert.match(mobilePlayoffCss, /\.scheduleActionRow \{[^}]*display:grid;[^}]*grid-template-columns:minmax\(112px,1fr\) auto/)
  assert.match(mobilePlayoffCss, /@media \(max-width: 350px\) \{[\s\S]*?grid-template-columns:minmax\(100px,1fr\) auto/)
  assert.match(mobilePlayoffCss, /\.scheduleLocation \{ overflow:hidden; text-overflow:ellipsis;/)
  assert.doesNotMatch(mobilePlayoffCss, /\.cardActions[^}]*display:\s*none/)
  assert.ok(tournamentPage.includes('courtContext={allScheduledMatches}'))
  assert.match(tournamentPage, /court_complex_name\?: string \| null/)
})
