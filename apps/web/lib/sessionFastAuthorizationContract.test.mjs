import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const provider = readFileSync(new URL('../components/session/SessionProvider.tsx', import.meta.url), 'utf8')
const roleGate = readFileSync(new URL('../app/(app)/RoleGate.tsx', import.meta.url), 'utf8')
const themeProvider = readFileSync(new URL('../components/ActiveClubThemeProvider.tsx', import.meta.url), 'utf8')
const navbar = readFileSync(new URL('../components/navbar/AppNavbarClient.tsx', import.meta.url), 'utf8')

test('authorization ready ocurre antes de member-clubs y la metadata se hidrata después', () => {
  const authorizationReady = provider.indexOf('onAuthorizationReady({')
  const memberClubs = provider.indexOf("fetch('/api/clubs/member-clubs'")
  assert.ok(authorizationReady > 0)
  assert.ok(memberClubs > authorizationReady)
  assert.match(provider, /setActiveClubState\(r\.activeClub\)/)
  assert.match(provider, /setClubs\(r\.clubs\)/)
})

test('fallo de metadata no revoca activeClubId validado', () => {
  assert.match(provider, /activeClubId: effectiveActiveClubId/)
  assert.doesNotMatch(provider, /activeClubId: activeClub\?\.id \?\? null/)
})

test('setActiveClub conserva validación y actualización de membresía', () => {
  assert.match(provider, /const setActiveClub = useCallback/)
  assert.match(provider, /\.eq\('club_id', clubId\)/)
  assert.match(provider, /membership\?\.status !== 'APPROVED'/)
  assert.match(provider, /setActiveClubId\(clubId\)/)
})

test('logout limpia autorización y metadata', () => {
  for (const reset of ['setUser(null)', 'setActiveClubState(null)', 'setActiveClubId(null)', 'setClubs([])', 'setIsApprovedMember(false)', 'setClubRole(null)']) {
    assert.ok(provider.includes(reset), `falta ${reset}`)
  }
})

test('un nuevo login reconstruye el contexto', () => {
  assert.match(provider, /event === 'SIGNED_IN' \|\| event === 'USER_UPDATED'/)
  assert.match(provider, /void refresh\(\{ silent: true \}\)/)
})

test('consumers críticos toleran activeClub temporalmente null', () => {
  assert.match(roleGate, /session\.activeClubId/)
  assert.doesNotMatch(roleGate, /session\.activeClub[.?!]/)
  assert.match(themeProvider, /activeClub\?\.themeKey \?\? null/)
  assert.match(navbar, /activeClub \?\? clubs\?\.\[0\] \?\? null/)
})
