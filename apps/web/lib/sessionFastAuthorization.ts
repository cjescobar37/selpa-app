import { isApprovedMembership, isClubStaffRole, type ClubRole, type MembershipStatus } from './clubMembershipRules'

export type SessionMembership = {
  club_id: string
  role: ClubRole
  status: MembershipStatus
  approved_at: string | null
}

export type FastAuthorization = {
  activeClubId: string
  isApprovedMember: true
  clubRole: ClubRole
  membershipStatus: 'APPROVED'
  membershipApprovedAt: string
  role: 'club' | 'platform' | 'player'
}

export function resolveFastAuthorization(input: {
  configuredActiveClubId: string | null
  memberships: SessionMembership[]
  isPlatformAdmin: boolean
}): FastAuthorization | null {
  const approvedMemberships = input.memberships.filter(isApprovedMembership)
  const approvedAdministrativeMemberships = approvedMemberships.filter((membership) => isClubStaffRole(membership.role))
  const configuredMembership = input.configuredActiveClubId
    ? approvedMemberships.find((membership) => membership.club_id === input.configuredActiveClubId) ?? null
    : null
  const soleAdministrativeMembership = approvedAdministrativeMemberships.length === 1
    ? approvedAdministrativeMemberships[0]
    : null

  // Preserve the existing preference: a sole administrative club wins over a
  // configured player-only club. Otherwise a valid configured club is exact.
  const selectedMembership = soleAdministrativeMembership ?? configuredMembership
  if (!selectedMembership?.approved_at) return null

  return {
    activeClubId: selectedMembership.club_id,
    isApprovedMember: true,
    clubRole: selectedMembership.role,
    membershipStatus: 'APPROVED',
    membershipApprovedAt: selectedMembership.approved_at,
    role: input.isPlatformAdmin
      ? 'platform'
      : isClubStaffRole(selectedMembership.role) ? 'club' : 'player',
  }
}
