export const CLUB_CAPABILITIES = [
  'dashboard:view',
  'club:view', 'club:update', 'club:branding', 'club:profile_manage',
  'memberships:view', 'memberships:manage',
  'roles:view', 'roles:manage', 'ownership:transfer',
  'players:view', 'players:manage', 'players:private_view',
  'ranking:view', 'ranking:manage',
  'tournaments:view', 'tournaments:create', 'tournaments:update', 'tournaments:publish',
  'tournaments:cancel', 'tournaments:delete',
  'registrations:view', 'registrations:manage',
  'groups:generate', 'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
  'finance:view', 'finance:manage', 'payments:view', 'payments:manage',
  'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
  'messages:view', 'messages:reply', 'reports:operational_view', 'audit:view', 'security:manage',
] as const

export type ClubCapability = (typeof CLUB_CAPABILITIES)[number]
export type CanonicalClubRole = 'OWNER' | 'ADMIN' | 'OPERADOR' | 'PLANILLERO' | 'PLAYER'

const OWNER_CAPABILITIES: readonly ClubCapability[] = CLUB_CAPABILITIES

const ADMIN_CAPABILITIES: readonly ClubCapability[] = CLUB_CAPABILITIES.filter(
  (capability) => capability !== 'ownership:transfer',
)

const OPERADOR_CAPABILITIES: readonly ClubCapability[] = [
  'dashboard:view',
  'club:view',
  'memberships:view',
  'memberships:manage',
  'players:view',
  'players:manage',
  'players:private_view',
  'ranking:view',
  'ranking:manage',
  'tournaments:view',
  'tournaments:create',
  'tournaments:update',
  'tournaments:publish',
  'tournaments:cancel',
  'registrations:view',
  'registrations:manage',
  'groups:generate',
  'matches:view',
  'matches:update',
  'matches:schedule',
  'playoff:generate',
  'content:view',
  'news:manage',
  'sponsors:manage',
  'ads:manage',
  'messages:view',
  'messages:reply',
  'reports:operational_view',
]

const PLANILLERO_CAPABILITIES: readonly ClubCapability[] = [
  'dashboard:view',
  'club:view',
  'tournaments:view',
  'matches:view',
  'matches:update',
]

export const CLUB_ROLE_CAPABILITIES = {
  OWNER: OWNER_CAPABILITIES,
  ADMIN: ADMIN_CAPABILITIES,
  OPERADOR: OPERADOR_CAPABILITIES,
  PLANILLERO: PLANILLERO_CAPABILITIES,
  PLAYER: [],
} as const satisfies Record<CanonicalClubRole, readonly ClubCapability[]>

const CAPABILITY_SET = new Set<string>(CLUB_CAPABILITIES)

export function isClubCapability(value: unknown): value is ClubCapability {
  return typeof value === 'string' && CAPABILITY_SET.has(value)
}

export function normalizeCanonicalClubRole(role: string | null | undefined): CanonicalClubRole | null {
  const normalized = role?.trim().toUpperCase()
  if (normalized === 'OWNER' || normalized === 'ADMIN' || normalized === 'OPERADOR' || normalized === 'PLANILLERO' || normalized === 'PLAYER') {
    return normalized
  }
  // Compatibilidad de lectura hasta aplicar la normalización incremental.
  if (normalized === 'OPERATIVO') return 'OPERADOR'
  return null
}

export function getClubCapabilities(role: string | null | undefined): readonly ClubCapability[] {
  const canonicalRole = normalizeCanonicalClubRole(role)
  return canonicalRole ? CLUB_ROLE_CAPABILITIES[canonicalRole] : []
}

export function hasClubCapability(role: string | null | undefined, capability: ClubCapability) {
  return getClubCapabilities(role).includes(capability)
}

// Compatibility exports for existing UI consumers. New authorization code must use canonical capabilities.
export type ClubPermissionRole = CanonicalClubRole | 'OPERATIVO' | 'OPERADOR' | 'PRENSA' | 'TESORERIA'
export type ClubCapabilityGroup = 'tournament' | 'groups' | 'playoff' | 'matches' | 'registrations' | 'users' | 'finance' | 'content' | 'club'

export const CLUB_CAPABILITY_GROUPS = {
  tournament: ['tournaments:create', 'tournaments:update', 'tournaments:delete'],
  groups: ['groups:generate'],
  playoff: ['playoff:generate'],
  matches: ['matches:update', 'matches:schedule'],
  registrations: ['registrations:manage'],
  users: ['memberships:manage', 'roles:manage'],
  finance: ['finance:view', 'finance:manage'],
  content: ['news:manage', 'sponsors:manage', 'ads:manage'],
  club: ['club:update', 'club:branding', 'club:profile_manage'],
} as const satisfies Record<ClubCapabilityGroup, readonly ClubCapability[]>

export const CLUB_PERMISSION_ROLES = ['OWNER', 'ADMIN', 'OPERADOR', 'PLANILLERO', 'PLAYER'] as const
export const CLUB_ROLE_PERMISSIONS = CLUB_ROLE_CAPABILITIES
export const normalizeClubPermissionRole = normalizeCanonicalClubRole
export const getCanonicalClubPermissionRole = normalizeCanonicalClubRole
export const getClubPermissions = getClubCapabilities
export const hasClubPermission = hasClubCapability

export function hasAnyClubPermission(role: string | null | undefined, capabilities: readonly ClubCapability[]) {
  return capabilities.some((capability) => hasClubCapability(role, capability))
}

export function hasAllClubPermissions(role: string | null | undefined, capabilities: readonly ClubCapability[]) {
  return capabilities.every((capability) => hasClubCapability(role, capability))
}

export const canManageTournament = (role: string | null | undefined) => hasAnyClubPermission(role, CLUB_CAPABILITY_GROUPS.tournament)
export const canCreateTournament = (role: string | null | undefined) => hasClubCapability(role, 'tournaments:create')
export const canUpdateTournament = (role: string | null | undefined) => hasClubCapability(role, 'tournaments:update')
export const canDeleteTournament = (role: string | null | undefined) => hasClubCapability(role, 'tournaments:delete')
export const canGenerateGroups = (role: string | null | undefined) => hasClubCapability(role, 'groups:generate')
export const canGeneratePlayoff = (role: string | null | undefined) => hasClubCapability(role, 'playoff:generate')
export const canUpdateMatches = (role: string | null | undefined) => hasClubCapability(role, 'matches:update')
export const canSwapMatchSchedule = (role: string | null | undefined) => hasClubCapability(role, 'matches:schedule')
export const canApproveRegistrations = (role: string | null | undefined) => hasClubCapability(role, 'registrations:manage')
export const canManageRegistrations = canApproveRegistrations
export const canManageUsers = (role: string | null | undefined) => hasClubCapability(role, 'memberships:manage')
export const canManageRoles = (role: string | null | undefined) => hasClubCapability(role, 'roles:manage')
export const canViewFinance = (role: string | null | undefined) => hasClubCapability(role, 'finance:view')
export const canManageFinance = (role: string | null | undefined) => hasClubCapability(role, 'finance:manage')
export const canEditContent = (role: string | null | undefined) => hasAnyClubPermission(role, ['news:manage', 'sponsors:manage', 'ads:manage'])
export const canPublishContent = canEditContent
export const canConfigureClub = (role: string | null | undefined) => hasClubCapability(role, 'club:update')
export const canManageClubBranding = (role: string | null | undefined) => hasClubCapability(role, 'club:branding')
