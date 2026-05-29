import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, getErrorMessage, type ActivePartnershipRow } from '@/lib/playerPartnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; id: string }> }
) {
  try {
    const { clubId, id } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth) return NextResponse.json({ error: 'No autorizado para finalizar esta pareja.' }, { status: 403 })

    const { data: partnership, error: partnershipError } = await supabaseAdmin
      .from('player_active_partnerships')
      .select('id,player1_club_player_id,player2_club_player_id,status')
      .eq('club_id', clubId)
      .eq('id', id)
      .maybeSingle()

    if (partnershipError) return NextResponse.json({ error: partnershipError.message }, { status: 500 })
    if (!partnership) return NextResponse.json({ error: 'Pareja activa no encontrada.' }, { status: 404 })
    if (partnership.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Esta pareja ya no está activa.' }, { status: 400 })
    }

    const currentPlayerId = auth.currentClubPlayer?.id
    const participates = currentPlayerId === partnership.player1_club_player_id || currentPlayerId === partnership.player2_club_player_id
    if (!auth.isAdmin && !participates) {
      return NextResponse.json({ error: 'Solo un integrante o admin pueden finalizar esta pareja.' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('player_active_partnerships')
      .update({
        status: 'ENDED',
        ended_at: new Date().toISOString(),
      })
      .eq('club_id', clubId)
      .eq('id', id)
      .eq('status', 'ACTIVE')
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ partnership: data as ActivePartnershipRow })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error finalizando pareja activa.') }, { status: 500 })
  }
}
