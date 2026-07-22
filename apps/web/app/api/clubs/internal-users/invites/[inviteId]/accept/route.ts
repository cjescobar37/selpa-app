import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { clubInviteErrorResponse } from '@/lib/clubTeamInviteErrors'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function POST(req: NextRequest, context: { params: Promise<{ inviteId: string }> }) {
  const user = await getTokenUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const { inviteId } = await context.params
  const { data, error } = await supabaseAdmin.rpc('accept_club_team_invite_atomic', {
    p_invite_id: inviteId,
    p_user_id: user.id,
  })
  if (error) return clubInviteErrorResponse(error)
  return NextResponse.json({ ok: true, result: data })
}
