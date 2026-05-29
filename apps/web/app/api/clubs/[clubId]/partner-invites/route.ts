import { NextRequest, NextResponse } from 'next/server'
import {
  assertClubPlayersAvailable,
  findActivePartnershipForAny,
  getAuthContext,
  getErrorMessage,
  hasPendingInviteBetween,
  type PartnerInviteRow,
} from '@/lib/playerPartnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ClubPlayerRow = {
  id: string
  user_id: string
  display_name: string | null
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

function fullName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    fallback ||
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Jugador'
  )
}

async function enrichInvites(invites: PartnerInviteRow[]) {
  const clubPlayerIds = Array.from(new Set(invites.flatMap((invite) => [
    invite.sender_club_player_id,
    invite.receiver_club_player_id,
  ])))

  if (!clubPlayerIds.length) return invites

  const { data: clubPlayersData, error: clubPlayersError } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,display_name')
    .in('id', clubPlayerIds)

  if (clubPlayersError) throw clubPlayersError
  const clubPlayers = (clubPlayersData ?? []) as ClubPlayerRow[]
  const clubPlayersById = new Map(clubPlayers.map((player) => [player.id, player]))
  const userIds = Array.from(new Set(clubPlayers.map((player) => player.user_id)))

  let profilesByUserId = new Map<string, ProfileRow>()
  if (userIds.length) {
    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id,email,first_name,last_name,display_name,avatar_url')
      .in('user_id', userIds)

    if (profilesError) throw profilesError
    profilesByUserId = new Map(((profilesData ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
  }

  const toPlayer = (clubPlayerId: string) => {
    const clubPlayer = clubPlayersById.get(clubPlayerId) ?? null
    const profile = clubPlayer ? profilesByUserId.get(clubPlayer.user_id) ?? null : null
    return clubPlayer
      ? {
          id: clubPlayer.id,
          user_id: clubPlayer.user_id,
          full_name: fullName(profile, clubPlayer.display_name),
          avatar_url: profile?.avatar_url ?? null,
        }
      : null
  }

  return invites.map((invite) => ({
    ...invite,
    sender: toPlayer(invite.sender_club_player_id),
    receiver: toPlayer(invite.receiver_club_player_id),
  }))
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth) return NextResponse.json({ error: 'No autorizado para ver invitaciones de pareja.' }, { status: 403 })

    let query = supabaseAdmin
      .from('player_partner_invites')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })

    if (!auth.isAdmin) {
      const playerId = auth.currentClubPlayer?.id
      if (!playerId) return NextResponse.json({ invites: [] })
      query = query.or(`sender_club_player_id.eq.${playerId},receiver_club_player_id.eq.${playerId}`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const invites = await enrichInvites((data ?? []) as PartnerInviteRow[])
    return NextResponse.json({ invites })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo invitaciones de pareja.') }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth) return NextResponse.json({ error: 'No autorizado para crear invitaciones de pareja.' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const receiverClubPlayerId = String(body?.receiverClubPlayerId ?? '').trim()
    const requestedSenderId = String(body?.senderClubPlayerId ?? '').trim()
    const senderClubPlayerId = auth.isAdmin && requestedSenderId
      ? requestedSenderId
      : auth.currentClubPlayer?.id ?? ''
    const message = typeof body?.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 500)
      : null
    const expiresAt = typeof body?.expiresAt === 'string' && body.expiresAt.trim()
      ? body.expiresAt.trim()
      : null

    if (!senderClubPlayerId || !receiverClubPlayerId) {
      return NextResponse.json({ error: 'Seleccioná los dos jugadores de la invitación.' }, { status: 400 })
    }

    if (senderClubPlayerId === receiverClubPlayerId) {
      return NextResponse.json({ error: 'No podés invitar al mismo jugador.' }, { status: 400 })
    }

    await assertClubPlayersAvailable(clubId, [senderClubPlayerId, receiverClubPlayerId])

    const duplicated = await hasPendingInviteBetween(clubId, senderClubPlayerId, receiverClubPlayerId)
    if (duplicated) {
      return NextResponse.json({ error: 'Ya existe una invitación pendiente entre estos jugadores.' }, { status: 409 })
    }

    const active = await findActivePartnershipForAny(clubId, [senderClubPlayerId, receiverClubPlayerId])
    if (active) {
      return NextResponse.json({ error: 'Alguno de los jugadores ya tiene pareja activa en este club.' }, { status: 409 })
    }

    const { data, error } = await supabaseAdmin
      .from('player_partner_invites')
      .insert({
        club_id: clubId,
        sender_club_player_id: senderClubPlayerId,
        receiver_club_player_id: receiverClubPlayerId,
        status: 'PENDING',
        message,
        expires_at: expiresAt,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invite: data as PartnerInviteRow }, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error creando invitación de pareja.') }, { status: 500 })
  }
}
