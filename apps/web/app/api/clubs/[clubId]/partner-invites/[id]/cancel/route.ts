import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, getErrorMessage, type PartnerInviteRow } from '@/lib/playerPartnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; id: string }> }
) {
  try {
    const { clubId, id } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth) return NextResponse.json({ error: 'No autorizado para cancelar esta invitación.' }, { status: 403 })

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('player_partner_invites')
      .select('id,sender_club_player_id,status')
      .eq('club_id', clubId)
      .eq('id', id)
      .maybeSingle()

    if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })
    if (!invite) return NextResponse.json({ error: 'Invitación no encontrada.' }, { status: 404 })
    if (invite.status !== 'PENDING') return NextResponse.json({ error: 'La invitación ya no está pendiente.' }, { status: 400 })

    const isSender = auth.currentClubPlayer?.id === invite.sender_club_player_id
    if (!auth.isAdmin && !isSender) {
      return NextResponse.json({ error: 'Solo el emisor o un admin pueden cancelar la invitación.' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('player_partner_invites')
      .update({
        status: 'CANCELLED',
        responded_at: new Date().toISOString(),
      })
      .eq('club_id', clubId)
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invite: data as PartnerInviteRow })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error cancelando invitación de pareja.') }, { status: 500 })
  }
}
