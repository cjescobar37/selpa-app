import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { STAFF_PLAYER_MESSAGE, PLAYER_STAFF_MESSAGE } from './accountRolePolicy'
import { STAFF_ROLES, isClubStaffRole } from './clubMembershipRules'

/** Authoritative account-wide lookup. No JWT metadata, active-club shortcut or silent read fallback. */
export async function nonPlayerAccountIds(userIds: Array<string | null | undefined>) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  const blocked = new Set<string>()
  for (let offset = 0; offset < ids.length; offset += 150) {
    const batch = ids.slice(offset, offset + 150)
    const results = await Promise.all([
      supabaseAdmin.from('club_memberships').select('user_id').in('user_id', batch).in('role', [...STAFF_ROLES]).neq('status', 'REJECTED'),
      supabaseAdmin.from('platform_admins').select('user_id').in('user_id', batch),
      supabaseAdmin.from('clubs').select('owner_user_id').in('owner_user_id', batch),
    ])
    if (results.some(result => result.error)) throw new Error('ACCOUNT_ROLE_READ_FAILED')
    for (const row of results[0].data ?? []) blocked.add(row.user_id)
    for (const row of results[1].data ?? []) blocked.add(row.user_id)
    for (const row of results[2].data ?? []) if (row.owner_user_id) blocked.add(row.owner_user_id)
  }
  return blocked
}
export async function playerAccountDenial(userId: string) {
  try {
    if ((await nonPlayerAccountIds([userId])).has(userId)) return NextResponse.json({ error: STAFF_PLAYER_MESSAGE }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'No pudimos verificar el rol de la cuenta. Reintentá.' }, { status: 503 })
  }
}

/** Presentation only: keep canonical points/positions and immutable history untouched. */
export async function playerRankingPresentation<I extends { player_id?: string | null }, P extends { player1_user_id?: string | null; player2_user_id?: string | null }>(individual: I[], pairs: P[]) {
  const blocked = await nonPlayerAccountIds([
    ...individual.map(row => row.player_id),
    ...pairs.flatMap(row => [row.player1_user_id, row.player2_user_id]),
  ])
  return {
    individual: individual.filter(row => !row.player_id || !blocked.has(row.player_id)),
    pairs: pairs.filter(row => !blocked.has(row.player1_user_id ?? '') && !blocked.has(row.player2_user_id ?? '')),
  }
}
export async function playerRequestDenial(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  return playerAccountDenial(data.user.id)
}
export async function roleAssignmentDenial(userId: string, targetRole: string) {
  if (targetRole === 'PLAYER') return playerAccountDenial(userId)
  if (!isClubStaffRole(targetRole)) return null
  try {
    const [memberships, players] = await Promise.all([
      supabaseAdmin.from('club_memberships').select('id').eq('user_id', userId).eq('role', 'PLAYER').neq('status', 'REJECTED').limit(1),
      supabaseAdmin.from('club_players').select('id').eq('user_id', userId).limit(1),
    ])
    if (memberships.error || players.error) throw new Error('READ')
    if (memberships.data?.length || players.data?.length) return NextResponse.json({ error: PLAYER_STAFF_MESSAGE }, { status: 409 })
    return null
  } catch { return NextResponse.json({ error: 'No pudimos verificar el rol de la cuenta. Reintentá.' }, { status: 503 }) }
}
