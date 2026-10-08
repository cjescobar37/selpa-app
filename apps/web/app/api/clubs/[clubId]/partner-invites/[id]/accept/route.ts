import { NextRequest, NextResponse } from 'next/server'
import { getPartnershipAuth } from '@/lib/playerPartnerships'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeErrorResponse } from '@/lib/writeFlowServer'

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await context.params
    const authorization = await getPartnershipAuth(req, clubId)
    if (authorization.status !== 'authorized') return NextResponse.json(
      { error: authorization.status === 'unauthenticated' ? 'Volvé a iniciar sesión.' : 'No tenés permiso para resolver esta invitación.' },
      { status: authorization.status === 'unauthenticated' ? 401 : 403 },
    )
    const auth = authorization.context
    const { data, error } = await supabaseAdmin.rpc('resolve_partner_invite_pass3', {
      p_club_id: clubId, p_invite_id: id, p_actor_id: auth.userId, p_action: 'accept',
    })
    if (error) return writeErrorResponse('partner-invite.accept', error)
    return NextResponse.json(data)
  } catch { return writeErrorResponse('partner-invite.accept', { code: 'UNEXPECTED' }) }
}
