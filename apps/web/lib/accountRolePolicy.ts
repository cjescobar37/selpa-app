import { isClubStaffRole } from './clubMembershipRules'

type RoleSession = { role: string; clubRole?: string | null; isPlatformAdmin?: boolean }
export const STAFF_PLAYER_MESSAGE = 'Esta cuenta es administrativa. Para competir usá otra cuenta con otro email y rol PLAYER.'
export const PLAYER_STAFF_MESSAGE = 'Esta cuenta pertenece a un jugador. Para administrar el club usá una cuenta administrativa diferente.'

export function isClubStaffSession(session: RoleSession) {
  return session.role === 'club' || isClubStaffRole(session.clubRole)
}
export function isPlayerSession(session: RoleSession) {
  return session.role === 'player' && !session.isPlatformAdmin && !isClubStaffSession(session)
}
export function administrativeHome(session: RoleSession) {
  return session.isPlatformAdmin || session.role === 'platform' ? '/platform' : '/club'
}
export function isPrivatePlayerPath(pathname: string) {
  if (/^\/torneos\/[^/]+\/inscripcion(?:\/|$)/.test(pathname)) return true
  return pathname === '/player' || pathname.startsWith('/player/') || ['/perfil', '/actividad', '/pareja', '/mis-torneos', '/mi-ranking'].some(path => pathname === path || pathname.startsWith(path + '/'))
}
export function hasStaffAccountMembership(rows: Array<{ role?: string | null; status?: string | null }>) {
  return rows.some(row => isClubStaffRole(row.role) && row.status !== 'REJECTED')
}
