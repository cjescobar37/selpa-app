export type ClubRole = 'OWNER' | 'ADMIN' | 'OPERADOR' | 'PLANILLERO' | 'PLAYER'
export type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED'

export type MembershipApprovalState = {
  status?: string | null
  approved_at?: string | null
}

export const STAFF_ROLES = ['OWNER', 'ADMIN', 'OPERADOR', 'PLANILLERO'] as const satisfies readonly ClubRole[]
export const INVITABLE_STAFF_ROLES = ['ADMIN', 'OPERADOR', 'PLANILLERO'] as const satisfies readonly ClubRole[]
export const CLUB_STAFF_ROLES: readonly ClubRole[] = STAFF_ROLES
export const INTERNAL_CLUB_ROLES: readonly ClubRole[] = STAFF_ROLES
export const MANAGEABLE_INTERNAL_ROLES: ClubRole[] = ['ADMIN', 'OPERADOR', 'PLANILLERO', 'PLAYER']

export function isApprovedMembership(membership: MembershipApprovalState | null | undefined) {
  return membership?.status === 'APPROVED' && Boolean(membership.approved_at)
}

/** @deprecated Do not use role grouping for authorization; require a ClubCapability. */
export function isClubStaffRole(role: string | null | undefined) {
  return STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])
}

export function isInternalClubRole(role: string | null | undefined) {
  return STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])
}

export function isInvitableStaffRole(role: string | null | undefined) {
  return INVITABLE_STAFF_ROLES.includes(role as (typeof INVITABLE_STAFF_ROLES)[number])
}

export function isManageableInternalRole(role: string | null | undefined) {
  return MANAGEABLE_INTERNAL_ROLES.includes(role as ClubRole)
}
