import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    if (!accessToken) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('club_memberships')
      .select('club_id, role, status, approved_at')
      .eq('user_id', authData.user.id)

    if (membershipsError) {
      return NextResponse.json({ error: membershipsError.message }, { status: 500 })
    }

    const rows = memberships ?? []
    const clubIds = Array.from(new Set(rows.map((membership) => membership.club_id).filter(Boolean)))
    const clubsMap = new Map<string, { id: string; name: string; city: string | null; logo_url: string | null }>()

    if (clubIds.length > 0) {
      const { data: clubs, error: clubsError } = await supabaseAdmin
        .from('clubs')
        .select('id, name, city, logo_url')
        .in('id', clubIds)

      if (clubsError) {
        return NextResponse.json({ error: clubsError.message }, { status: 500 })
      }

      for (const club of clubs ?? []) clubsMap.set(club.id, club)
    }

    const { data: playerRows, error: playersError } = clubIds.length
      ? await supabaseAdmin
          .from('club_players')
          .select('id, club_id')
          .eq('user_id', authData.user.id)
          .in('club_id', clubIds)
      : { data: [], error: null }

    if (playersError) {
      return NextResponse.json({ error: playersError.message }, { status: 500 })
    }

    const playerByClub = new Map((playerRows ?? []).map((player) => [player.club_id, player.id]))

    return NextResponse.json({
      memberships: rows.map((membership) => ({
        ...membership,
        player_id: playerByClub.get(membership.club_id) ?? null,
        club: clubsMap.get(membership.club_id) ?? null,
      })),
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No pudimos leer tus solicitudes.' },
      { status: 500 }
    )
  }
}
