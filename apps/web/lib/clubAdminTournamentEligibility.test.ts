import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const membershipRules = readFileSync(new URL('./clubMembershipRules.ts', import.meta.url), 'utf8')
const publicHome = readFileSync(new URL('../components/public/PublicHomeExperience.tsx', import.meta.url), 'utf8')
const publicDetail = readFileSync(new URL('../app/api/tournaments/[tournamentId]/public-detail/route.ts', import.meta.url), 'utf8')
const publicTournamentPage = readFileSync(new URL('../app/(app)/torneos/[id]/page.tsx', import.meta.url), 'utf8')
const registrationSubmit = readFileSync(new URL('../app/api/tournaments/[tournamentId]/registration/submit/route.ts', import.meta.url), 'utf8')
const manualRegistration = readFileSync(new URL('../app/api/clubs/[clubId]/tournaments/[tournamentId]/registrations/manual/route.ts', import.meta.url), 'utf8')

test('OWNER y ADMIN se reconocen como administradores deportivos incompatibles', () => {
  assert.match(membershipRules, /return role === 'OWNER' \|\| role === 'ADMIN'/)
})

test('la experiencia pública no presenta módulos de jugador al administrador organizador', () => {
  assert.match(publicHome, /hideHero \|\| isClubAdminRole\(session\.clubRole\)/)
  assert.match(publicDetail, /isApprovedMembership\(membership\) && isClubAdminRole\(membership\?\.role\)/)
  assert.match(publicTournamentPage, /!detail\.viewer\.isClubAdmin \? <section id="estado-jugador"/)
  assert.match(publicTournamentPage, /!detail\.viewer\.isClubAdmin \? <section className="tournamentPublicDetail__personalBoard"/)
})

test('el submit bloquea al administrador organizador como titular o compañero', () => {
  assert.match(registrationSubmit, /\.select\('user_id,role,status,approved_at'\)/)
  assert.match(registrationSubmit, /for \(const \[player, label\] of \[\[me,[\s\S]*?\[partner,/)
  assert.match(registrationSubmit, /code: 'CLUB_ADMIN_CANNOT_REGISTER'/)
  assert.match(manualRegistration, /clubAdminUserIds/)
  assert.match(manualRegistration, /includesClubAdmin/)
  assert.match(manualRegistration, /code: 'CLUB_ADMIN_CANNOT_REGISTER'/)
})
