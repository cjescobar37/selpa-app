import { NextRequest, NextResponse } from 'next/server'
import {
  createActivePartnership,
  getAuthContext,
  getErrorMessage,
  type PartnerInviteRow,
} from '@/lib/playerPartnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; id: string }> }
) {
  try {
    const { clubId, id } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth) {
      return NextResponse.json({ error: 'No autorizado para aceptar esta invitación.' }, { status: 403 })
    }

    const { data: inviteData, error: inviteError } = await supabaseAdmin
      .from('player_partner_invites')
      .select('*')
      .eq('club_id', clubId)
      .eq('id', id)
      .maybeSingle()

    if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })
    if (!inviteData) return NextResponse.json({ error: 'Invitación no encontrada.' }, { status: 404 })

    const invite = inviteData as PartnerInviteRow
    if (invite.status !== 'PENDING') {
      return NextResponse.json({ error: 'La invitación ya no está pendiente.' }, { status: 400 })
    }

    if (!auth.isAdmin && invite.receiver_club_player_id !== auth.currentClubPlayer?.id) {
      return NextResponse.json({ error: 'Esta invitación pertenece a otro jugador.' }, { status: 403 })
    }

    let partnership
    try {
      partnership = await createActivePartnership({
        clubId,
        playerAId: invite.sender_club_player_id,
        playerBId: invite.receiver_club_player_id,
        createdBy: auth.userId,
        acceptedInviteId: invite.id,
      })
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'No se pudo crear la pareja activa.')
      const status = message.includes('pareja activa') ? 409 : 400
      return NextResponse.json({ error: message }, { status })
    }

    const { data: updatedInvite, error: updateError } = await supabaseAdmin
      .from('player_partner_invites')
      .update({
        status: 'ACCEPTED',
        responded_at: new Date().toISOString(),
      })
      .eq('club_id', clubId)
      .eq('id', invite.id)
      .eq('status', 'PENDING')
      .select('*')
      .single()

    if (updateError) {
      await supabaseAdmin
        .from('player_active_partnerships')
        .update({
          status: 'ENDED',
          ended_at: new Date().toISOString(),
        })
        .eq('club_id', clubId)
        .eq('id', partnership.id)
        .eq('status', 'ACTIVE')

      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      invite: updatedInvite as PartnerInviteRow,
      partnership,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error aceptando invitación de pareja.') }, { status: 500 })
  }
}
