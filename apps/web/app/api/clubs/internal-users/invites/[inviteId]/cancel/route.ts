import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isClubOwner } from '@/lib/clubMembershipServer'

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
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('club_user_invites')
    .select('id,club_id,status')
    .eq('id', inviteId)
    .maybeSingle()

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  if (!invite) {
    return NextResponse.json({ error: 'Invitación no encontrada.' }, { status: 404 })
  }

  const isOwner = await isClubOwner(user.id, invite.club_id)
  if (!isOwner) {
    return NextResponse.json({ error: 'Solo el OWNER puede cancelar invitaciones.' }, { status: 403 })
  }

  if (invite.status !== 'PENDING') {
    return NextResponse.json({ error: 'Solo podés cancelar invitaciones pendientes.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('club_user_invites')
    .update({
      status: 'CANCELLED',
      resolved_by: user.id,
      resolved_at: now,
      updated_at: now,
    })
    .eq('id', inviteId)
    .eq('status', 'PENDING')
    .select('id,club_id,email,role,status,resolved_by,resolved_at,updated_at')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, invite: updated })
}
