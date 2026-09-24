import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readMatchScheduleAssignments } from './tournamentSchedule'
import { readPlayoffScheduleReservations } from './tournamentPlayoffScheduleReservations'

const page = readFileSync(new URL('../app/(app)/club/torneos/[id]/page.tsx', import.meta.url), 'utf8')
const manager = readFileSync(new URL('../app/(app)/club/torneos/_components/TournamentScheduleManager.tsx', import.meta.url), 'utf8')
const scheduleRoute = readFileSync(new URL('../app/api/clubs/[clubId]/tournaments/[tournamentId]/matches/[id]/schedule/route.ts', import.meta.url), 'utf8')
const playoffRoute = readFileSync(new URL('../app/api/clubs/[clubId]/tournaments/[tournamentId]/playoff/schedule/route.ts', import.meta.url), 'utf8')
const mobilePlayoff = readFileSync(new URL('../app/(app)/club/torneos/_components/MobilePlayoff.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/(app)/club/torneos/_components/TournamentScheduleManager.module.css', import.meta.url), 'utf8')

test('reprogramación individual sólo cambia schedule y conserva origen MANUAL', () => {
  assert.match(scheduleRoute, /update\(\{ scheduled_at: scheduledAt \}\)/)
  assert.doesNotMatch(scheduleRoute, /update\(\{[^}]*team1_id/)
  assert.match(scheduleRoute, /schedule_origin: 'MANUAL'/)
})

test('sólo bloquea ocupación de cancha y deja otras situaciones como warning confirmable', () => {
  assert.match(scheduleRoute, /SCHEDULE_SLOT_OCCUPIED/)
  assert.match(scheduleRoute, /Esa cancha ya está asignada a otro partido/)
  assert.match(scheduleRoute, /Una de las parejas ya juega otro partido/)
  assert.match(scheduleRoute, /SCHEDULE_WARNING/)
  assert.match(scheduleRoute, /scheduleWarnings\.push/)
  assert.match(scheduleRoute, /confirm_short_rest/)
  assert.match(scheduleRoute, /Solo se puede programar un partido pendiente y sin resultado/)
  assert.match(scheduleRoute, /schedule_origin: 'MANUAL'/)
})

test('centro global reúne partidos, reservas, filtros y edición compacta', () => {
  assert.match(page, /TournamentScheduleManager/)
  assert.match(manager, /Todos/)
  assert.match(manager, /Grupos/)
  assert.match(manager, /Playoff/)
  assert.match(manager, /Sin programar/)
  assert.match(manager, /data\.reservations/)
  assert.match(manager, /datetime-local/)
  assert.match(manager, /props\.onSwap/)
  assert.match(css, /@media\(max-width:560px\)/)
  assert.match(css, /@media\(max-width:560px\)[\s\S]*\.panel\{width:100%\}/)
  assert.doesNotMatch(css, /min-width:\s*[4-9][0-9]{2}px/)
})

test('autocompletar tiene preview, conserva existentes y es una sola acción API', () => {
  assert.match(page, /preview: true/)
  assert.match(page, /horarios existentes se conservarán/)
  assert.match(playoffRoute, /willSchedule: missing\.length/)
  assert.match(playoffRoute, /if \(real\) \{/)
  assert.match(playoffRoute, /schedule_origin: 'AUTO'/)
  assert.match(playoffRoute, /body\?\.preview === true/)
  assert.match(playoffRoute, /missing\.length === 0 && groupAssignments\.length === 0/)
  assert.match(playoffRoute, /assignments: readMatchScheduleAssignments/)
  assert.match(playoffRoute, /reservations: readPlayoffScheduleReservations/)
  assert.match(page, /applyScheduleAssignments\(json\.assignments/)
  assert.match(page, /Completar calendario/)
  assert.match(page, /ensureAutoTournamentSchedule/)
  assert.match(page, /Calendario ajustado automáticamente/)
  assert.match(page, /autoScheduleEnsureRef/)
})

test('mobile separa programación individual de intercambio y actualiza estado local', () => {
  assert.match(mobilePlayoff, /onScheduleChanged/)
  assert.match(mobilePlayoff, /CalendarClock/)
  assert.match(mobilePlayoff, /'Reprogramar' : 'Programar'/)
  assert.match(mobilePlayoff, /onSchedule\(slot\.match!\)/)
  assert.match(mobilePlayoff, />Cambiar<\/span>/)
  assert.match(mobilePlayoff, /'Reprogramar' : 'Programar'/)
  assert.match(mobilePlayoff, /Confirmar programación/)
  assert.doesNotMatch(mobilePlayoff, /window\.confirm/)
})

test('metadata AUTO/MANUAL se normaliza sin romper datos legacy', () => {
  const manual = readMatchScheduleAssignments({ m1: { scheduled_at: '2026-10-04T13:00:00.000Z', court_name: 'Cancha 1', court_source: 'OWN_CLUB', schedule_origin: 'MANUAL' } })
  const legacy = readMatchScheduleAssignments({ m2: { scheduled_at: '2026-10-04T14:30:00.000Z', court_name: 'Cancha 2', court_source: 'OWN_CLUB' } })
  assert.equal(manual.m1.schedule_origin, 'MANUAL')
  assert.equal(legacy.m2.schedule_origin, undefined)
  const reservations = readPlayoffScheduleReservations({ 'category:5:SEMI:1': { category: '5', phase: 'SEMI', match_order: 1, scheduled_at: '2026-10-04T17:30:00.000Z', court_name: 'Cancha 1', court_source: 'OWN_CLUB', schedule_origin: 'AUTO' } })
  assert.equal(reservations['category:5:SEMI:1'].schedule_origin, 'AUTO')
})
