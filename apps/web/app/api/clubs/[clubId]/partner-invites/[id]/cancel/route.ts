import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/playerPartnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeErrorResponse } from '@/lib/writeFlowServer'

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await context.params
    const auth = await getAuthContext(req, clubId)
    if (!auth) return NextResponse.json({ error: 'No tenés permiso para resolver esta invitación.' }, { status: 403 })
    const { data, error } = await supabaseAdmin.rpc('resolve_partner_invite_pass3', {
      p_club_id: clubId, p_invite_id: id, p_actor_id: auth.userId, p_action: 'cancel',
    })
    if (error) return writeErrorResponse('partner-invite.cancel', error)
    return NextResponse.json(data)
  } catch { return writeErrorResponse('partner-invite.cancel', { code: 'UNEXPECTED' }) }
}
