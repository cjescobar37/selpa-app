import { NextRequest, NextResponse } from 'next/server'
import {
  createActivePartnership,
  getAuthContext,
  getErrorMessage,
  type ActivePartnershipRow,
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

async function enrichPartnerships(partnerships: ActivePartnershipRow[]) {
  const clubPlayerIds = Array.from(new Set(partnerships.flatMap((partnership) => [
    partnership.player1_club_player_id,
    partnership.player2_club_player_id,
  ])))

  if (!clubPlayerIds.length) return partnerships

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

  return partnerships.map((partnership) => ({
    ...partnership,
    player1: toPlayer(partnership.player1_club_player_id),
    player2: toPlayer(partnership.player2_club_player_id),
  }))
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth) return NextResponse.json({ error: 'No autorizado para ver parejas activas.' }, { status: 403 })

    let query = supabaseAdmin
      .from('player_active_partnerships')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })

    if (!auth.isAdmin) {
      const playerId = auth.currentClubPlayer?.id
      if (!playerId) return NextResponse.json({ partnerships: [] })
      query = query.or(`player1_club_player_id.eq.${playerId},player2_club_player_id.eq.${playerId}`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const partnerships = await enrichPartnerships((data ?? []) as ActivePartnershipRow[])
    return NextResponse.json({ partnerships })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo parejas activas.') }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth?.isAdmin) {
      return NextResponse.json({ error: 'Solo un admin puede asignar una pareja activa manualmente.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const player1ClubPlayerId = String(body?.player1ClubPlayerId ?? '').trim()
    const player2ClubPlayerId = String(body?.player2ClubPlayerId ?? '').trim()

    if (!player1ClubPlayerId || !player2ClubPlayerId) {
      return NextResponse.json({ error: 'Seleccioná dos jugadores para formar pareja activa.' }, { status: 400 })
    }

    const partnership = await createActivePartnership({
      clubId,
      playerAId: player1ClubPlayerId,
      playerBId: player2ClubPlayerId,
      createdBy: auth.userId,
      acceptedInviteId: null,
    })

    return NextResponse.json({ partnership }, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error creando pareja activa.') }, { status: 500 })
  }
}
