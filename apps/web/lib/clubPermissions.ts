export const CLUB_CAPABILITIES = [
  'tournament:create',
  'tournament:update',
  'tournament:delete',
  'groups:generate',
  'playoff:generate',
  'matches:update',
  'matches:swap_schedule',
  'registrations:approve',
  'registrations:manage',
  'users:manage',
  'roles:manage',
  'finance:view',
  'finance:manage',
  'content:publish',
  'content:edit',
  'club:configure',
  'club:branding',
] as const

export type ClubCapability = (typeof CLUB_CAPABILITIES)[number]

export type ClubCapabilityGroup =
  | 'tournament'
  | 'groups'
  | 'playoff'
  | 'matches'
  | 'registrations'
  | 'users'
  | 'finance'
  | 'content'
  | 'club'

export type ClubPermissionRole =
  | 'OWNER'
  | 'ADMIN'
  | 'OPERADOR'
  | 'PLANILLERO'
  | 'PRENSA'
  | 'TESORERIA'
  | 'PLAYER'
  | 'OPERATIVO'

export const CLUB_PERMISSION_ROLES = [
  'OWNER',
  'ADMIN',
  'OPERADOR',
  'PLANILLERO',
  'PRENSA',
  'TESORERIA',
  'PLAYER',
  'OPERATIVO',
] as const satisfies readonly ClubPermissionRole[]

export const CLUB_CAPABILITY_GROUPS = {
  tournament: ['tournament:create', 'tournament:update', 'tournament:delete'],
  groups: ['groups:generate'],
  playoff: ['playoff:generate'],
  matches: ['matches:update', 'matches:swap_schedule'],
  registrations: ['registrations:approve', 'registrations:manage'],
  users: ['users:manage', 'roles:manage'],
  finance: ['finance:view', 'finance:manage'],
  content: ['content:publish', 'content:edit'],
  club: ['club:configure', 'club:branding'],
} as const satisfies Record<ClubCapabilityGroup, readonly ClubCapability[]>

const ROLE_SET = new Set<string>(CLUB_PERMISSION_ROLES)

function uniqueCapabilities(capabilities: readonly ClubCapability[]) {
  return Array.from(new Set(capabilities))
}

function combineCapabilityGroups(groups: readonly ClubCapabilityGroup[]) {
  return uniqueCapabilities(groups.flatMap((group) => CLUB_CAPABILITY_GROUPS[group]))
}

const OWNER_PERMISSIONS = CLUB_CAPABILITIES

const ADMIN_PERMISSIONS = uniqueCapabilities([
  ...combineCapabilityGroups([
    'tournament',
    'groups',
    'playoff',
    'matches',
    'registrations',
    'finance',
    'content',
    'club',
  ]),
  'users:manage',
])

const PLANILLERO_PERMISSIONS = combineCapabilityGroups(['groups', 'playoff', 'matches', 'registrations'])

const OPERADOR_PERMISSIONS = uniqueCapabilities([
  ...CLUB_CAPABILITY_GROUPS.matches,
  'registrations:approve',
])

const TESORERIA_PERMISSIONS = uniqueCapabilities([
  ...CLUB_CAPABILITY_GROUPS.finance,
  'registrations:approve',
])

const PRENSA_PERMISSIONS = CLUB_CAPABILITY_GROUPS.content

export const CLUB_ROLE_PERMISSIONS = {
  OWNER: OWNER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  OPERADOR: OPERADOR_PERMISSIONS,
  PLANILLERO: PLANILLERO_PERMISSIONS,
  PRENSA: PRENSA_PERMISSIONS,
  TESORERIA: TESORERIA_PERMISSIONS,
  PLAYER: [],
  OPERATIVO: OPERADOR_PERMISSIONS,
} as const satisfies Record<ClubPermissionRole, readonly ClubCapability[]>

export function normalizeClubPermissionRole(role: string | null | undefined): ClubPermissionRole | null {
  if (!role) return null
  const normalized = role.trim().toUpperCase()
  return ROLE_SET.has(normalized) ? (normalized as ClubPermissionRole) : null
}

export function getCanonicalClubPermissionRole(role: string | null | undefined) {
  const normalized = normalizeClubPermissionRole(role)
  return normalized === 'OPERATIVO' ? 'OPERADOR' : normalized
}

export function getClubPermissions(role: string | null | undefined) {
  const normalized = normalizeClubPermissionRole(role)
  return normalized ? [...CLUB_ROLE_PERMISSIONS[normalized]] : []
}

export function hasClubPermission(
  role: string | null | undefined,
  capability: ClubCapability,
) {
  const normalized = normalizeClubPermissionRole(role)
  if (!normalized) return false
  return getClubPermissions(normalized).includes(capability)
}

export function hasAnyClubPermission(
  role: string | null | undefined,
  capabilities: readonly ClubCapability[],
) {
  return capabilities.some((capability) => hasClubPermission(role, capability))
}

export function hasAllClubPermissions(
  role: string | null | undefined,
  capabilities: readonly ClubCapability[],
) {
  return capabilities.every((capability) => hasClubPermission(role, capability))
}

export function canManageTournament(role: string | null | undefined) {
  return hasAnyClubPermission(role, CLUB_CAPABILITY_GROUPS.tournament)
}

export function canCreateTournament(role: string | null | undefined) {
  return hasClubPermission(role, 'tournament:create')
}

export function canUpdateTournament(role: string | null | undefined) {
  return hasClubPermission(role, 'tournament:update')
}

export function canDeleteTournament(role: string | null | undefined) {
  return hasClubPermission(role, 'tournament:delete')
}

export function canGenerateGroups(role: string | null | undefined) {
  return hasClubPermission(role, 'groups:generate')
}

export function canGeneratePlayoff(role: string | null | undefined) {
  return hasClubPermission(role, 'playoff:generate')
}

export function canUpdateMatches(role: string | null | undefined) {
  return hasClubPermission(role, 'matches:update')
}

export function canSwapMatchSchedule(role: string | null | undefined) {
  return hasClubPermission(role, 'matches:swap_schedule')
}

export function canApproveRegistrations(role: string | null | undefined) {
  return hasClubPermission(role, 'registrations:approve')
}

export function canManageRegistrations(role: string | null | undefined) {
  return hasClubPermission(role, 'registrations:manage')
}

export function canManageUsers(role: string | null | undefined) {
  return hasClubPermission(role, 'users:manage')
}

export function canManageRoles(role: string | null | undefined) {
  return hasClubPermission(role, 'roles:manage')
}

export function canViewFinance(role: string | null | undefined) {
  return hasClubPermission(role, 'finance:view')
}

export function canManageFinance(role: string | null | undefined) {
  return hasClubPermission(role, 'finance:manage')
}

export function canEditContent(role: string | null | undefined) {
  return hasClubPermission(role, 'content:edit')
}

export function canPublishContent(role: string | null | undefined) {
  return hasClubPermission(role, 'content:publish')
}

export function canConfigureClub(role: string | null | undefined) {
  return hasClubPermission(role, 'club:configure')
}

export function canManageClubBranding(role: string | null | undefined) {
  return hasClubPermission(role, 'club:branding')
}
