export type ClubRole = 'OWNER' | 'ADMIN' | 'OPERADOR' | 'PLANILLERO' | 'PLAYER'
export type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED'

export type MembershipApprovalState = {
  status?: string | null
  approved_at?: string | null
}

export const CLUB_STAFF_ROLES: ClubRole[] = ['OWNER', 'ADMIN', 'OPERADOR', 'PLANILLERO']
export const INTERNAL_CLUB_ROLES: ClubRole[] = ['OWNER', 'ADMIN', 'OPERADOR', 'PLANILLERO']
export const MANAGEABLE_INTERNAL_ROLES: ClubRole[] = ['ADMIN', 'OPERADOR', 'PLANILLERO', 'PLAYER']

export function isApprovedMembership(membership: MembershipApprovalState | null | undefined) {
  return membership?.status === 'APPROVED' && Boolean(membership.approved_at)
}

/** @deprecated Do not use role grouping for authorization; require a ClubCapability. */
export function isClubStaffRole(role: string | null | undefined) {
  return CLUB_STAFF_ROLES.includes(role as ClubRole)
}

export function isInternalClubRole(role: string | null | undefined) {
  return INTERNAL_CLUB_ROLES.includes(role as ClubRole)
}

export function isManageableInternalRole(role: string | null | undefined) {
  return MANAGEABLE_INTERNAL_ROLES.includes(role as ClubRole)
}
