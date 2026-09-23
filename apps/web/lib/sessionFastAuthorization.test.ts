import assert from 'node:assert/strict'
import test from 'node:test'
import { hasClubCapability } from './clubPermissions'
import { resolveFastAuthorization, type SessionMembership } from './sessionFastAuthorization'

const approvedAt = '2026-09-22T10:00:00.000Z'
const membership = (club_id: string, role: SessionMembership['role'], status: SessionMembership['status'] = 'APPROVED'): SessionMembership => ({
  club_id,
  role,
  status,
  approved_at: status === 'APPROVED' ? approvedAt : null,
})

test('active_club_id válido habilita autorización anticipada', () => {
  const result = resolveFastAuthorization({ configuredActiveClubId: 'club-b', memberships: [membership('club-a', 'PLAYER'), membership('club-b', 'ADMIN')], isPlatformAdmin: false })
  assert.equal(result?.activeClubId, 'club-b')
  assert.equal(result?.clubRole, 'ADMIN')
  assert.equal(result?.role, 'club')
})

test('una única membresía administrativa habilita autorización anticipada', () => {
  const result = resolveFastAuthorization({ configuredActiveClubId: null, memberships: [membership('club-a', 'ADMIN'), membership('club-b', 'PLAYER')], isPlatformAdmin: false })
  assert.equal(result?.activeClubId, 'club-a')
  assert.equal(result?.isApprovedMember, true)
})

test('varios clubes administrativos sin selección válida mantienen el camino anterior', () => {
  const result = resolveFastAuthorization({ configuredActiveClubId: null, memberships: [membership('club-a', 'ADMIN'), membership('club-b', 'OPERADOR')], isPlatformAdmin: false })
  assert.equal(result, null)
})

test('membresías pendientes o rechazadas nunca autorizan', () => {
  assert.equal(resolveFastAuthorization({ configuredActiveClubId: 'club-a', memberships: [membership('club-a', 'ADMIN', 'PENDING')], isPlatformAdmin: false }), null)
  assert.equal(resolveFastAuthorization({ configuredActiveClubId: 'club-a', memberships: [membership('club-a', 'ADMIN', 'REJECTED')], isPlatformAdmin: false }), null)
})

test('rol y capabilities permanecen derivados del rol canónico', () => {
  const result = resolveFastAuthorization({ configuredActiveClubId: 'club-a', memberships: [membership('club-a', 'PLANILLERO')], isPlatformAdmin: false })
  assert.equal(result?.clubRole, 'PLANILLERO')
  assert.equal(hasClubCapability(result?.clubRole, 'matches:update'), true)
  assert.equal(hasClubCapability(result?.clubRole, 'finance:view'), false)
})

test('platform admin conserva prioridad de rol', () => {
  const result = resolveFastAuthorization({ configuredActiveClubId: 'club-a', memberships: [membership('club-a', 'ADMIN')], isPlatformAdmin: true })
  assert.equal(result?.role, 'platform')
  assert.equal(result?.clubRole, 'ADMIN')
})
