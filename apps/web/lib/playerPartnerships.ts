import { NextRequest } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type ClubPlayerRow = {
  id: string
  club_id: string
  user_id: string
  display_name: string | null
  approved_at: string | null
}

export type PartnerInviteRow = {
  id: string
  club_id: string
  sender_club_player_id: string
  receiver_club_player_id: string
  status: string
  message: string | null
  expires_at: string | null
  responded_at: string | null
  created_at: string
  updated_at: string
}

export type ActivePartnershipRow = {
  id: string
  club_id: string
  player1_club_player_id: string
  player2_club_player_id: string
  status: string
  created_by: string | null
  accepted_invite_id: string | null
  accepted_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
}

type AuthContext = {
  userId: string
  isAdmin: boolean
  currentClubPlayer: ClubPlayerRow | null
}

export async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function canonicalPair(leftId: string, rightId: string) {
  return [leftId, rightId].sort() as [string, string]
}

export async function getCurrentClubPlayer(userId: string, clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('club_players')
    .select('id,club_id,user_id,display_name,approved_at')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .not('approved_at', 'is', null)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ClubPlayerRow | null
}

export async function getAuthContext(req: NextRequest, clubId: string): Promise<AuthContext | null> {
  const user = await getTokenUser(req)
  if (!user) return null

  const [admin, currentClubPlayer] = await Promise.all([
    isClubAdmin(user.id, clubId),
    getCurrentClubPlayer(user.id, clubId),
  ])

  if (!admin && !currentClubPlayer) return null

  return {
    userId: user.id,
    isAdmin: admin,
    currentClubPlayer,
  }
}

export async function getClubPlayersByIds(clubId: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  if (!uniqueIds.length) return new Map<string, ClubPlayerRow>()

  const { data, error } = await supabaseAdmin
    .from('club_players')
    .select('id,club_id,user_id,display_name,approved_at')
    .eq('club_id', clubId)
    .in('id', uniqueIds)

  if (error) throw error
  return new Map(((data ?? []) as ClubPlayerRow[]).map((row) => [row.id, row]))
}

export async function assertClubPlayersAvailable(clubId: string, playerIds: string[]) {
  const players = await getClubPlayersByIds(clubId, playerIds)
  for (const id of playerIds) {
    const player = players.get(id)
    if (!player) throw new Error('Alguno de los jugadores no pertenece a este club.')
    if (!player.approved_at) throw new Error('Ambos jugadores deben estar aprobados para formar pareja.')
  }
  return players
}

export async function hasPendingInviteBetween(clubId: string, playerAId: string, playerBId: string, excludeInviteId?: string) {
  const { data, error } = await supabaseAdmin
    .from('player_partner_invites')
    .select('id')
    .eq('club_id', clubId)
    .eq('status', 'PENDING')
    .or(
      `and(sender_club_player_id.eq.${playerAId},receiver_club_player_id.eq.${playerBId}),and(sender_club_player_id.eq.${playerBId},receiver_club_player_id.eq.${playerAId})`
    )

  if (error) throw error
  return ((data ?? []) as Array<{ id: string }>).some((row) => row.id !== excludeInviteId)
}

export async function findActivePartnershipForAny(clubId: string, playerIds: string[], excludePartnershipId?: string) {
  if (!playerIds.length) return null

  const clauses = playerIds.flatMap((id) => [
    `player1_club_player_id.eq.${id}`,
    `player2_club_player_id.eq.${id}`,
  ])

  const { data, error } = await supabaseAdmin
    .from('player_active_partnerships')
    .select('id')
    .eq('club_id', clubId)
    .eq('status', 'ACTIVE')
    .or(clauses.join(','))

  if (error) throw error
  return ((data ?? []) as Array<{ id: string }>).find((row) => row.id !== excludePartnershipId) ?? null
}

export async function createActivePartnership(input: {
  clubId: string
  playerAId: string
  playerBId: string
  createdBy: string | null
  acceptedInviteId?: string | null
}) {
  if (input.playerAId === input.playerBId) {
    throw new Error('Seleccioná dos jugadores distintos.')
  }

  await assertClubPlayersAvailable(input.clubId, [input.playerAId, input.playerBId])

  const existing = await findActivePartnershipForAny(input.clubId, [input.playerAId, input.playerBId])
  if (existing) {
    throw new Error('Alguno de los jugadores ya tiene pareja activa en este club.')
  }

  const [player1, player2] = canonicalPair(input.playerAId, input.playerBId)
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('player_active_partnerships')
    .insert({
      club_id: input.clubId,
      player1_club_player_id: player1,
      player2_club_player_id: player2,
      status: 'ACTIVE',
      created_by: input.createdBy,
      accepted_invite_id: input.acceptedInviteId ?? null,
      accepted_at: now,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as ActivePartnershipRow
}
