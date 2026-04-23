import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMembership } from '@/lib/clubMembershipRules'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

export async function POST(req: NextRequest, context: { params: Promise<{ inviteId: string }> }) {
  const user = await getTokenUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const userEmail = normalizeEmail(user.email)
  if (!userEmail) {
    return NextResponse.json({ error: 'Tu cuenta no tiene un email válido.' }, { status: 400 })
  }

  const { inviteId } = await context.params
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('club_user_invites')
    .select('id,club_id,email,role,status,invited_by,target_user_id')
    .eq('id', inviteId)
    .maybeSingle()

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  if (!invite) {
    return NextResponse.json({ error: 'Invitación no encontrada.' }, { status: 404 })
  }

  if (invite.status !== 'PENDING') {
    return NextResponse.json({ error: 'La invitación ya fue resuelta.' }, { status: 409 })
  }

  if (normalizeEmail(invite.email) !== userEmail) {
    return NextResponse.json({ error: 'La invitación no corresponde al usuario autenticado.' }, { status: 403 })
  }

  if (invite.target_user_id && invite.target_user_id !== user.id) {
    return NextResponse.json({ error: 'La invitación pertenece a otro usuario.' }, { status: 403 })
  }

  const { data: existingMembership, error: membershipError } = await supabaseAdmin
    .from('club_memberships')
    .select('id,club_id,user_id,status,approved_at')
    .eq('club_id', invite.club_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 })
  }

  if (existingMembership && isApprovedMembership(existingMembership)) {
    return NextResponse.json({ error: 'Ya tenés una membership aprobada en este club.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { error: upsertError } = await supabaseAdmin
    .from('club_memberships')
    .upsert(
      {
        club_id: invite.club_id,
        user_id: user.id,
        role: invite.role,
        status: 'APPROVED',
        approved_at: now,
        approved_by: invite.invited_by,
        rejection_reason: null,
      },
      { onConflict: 'club_id,user_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  const { data: updatedInvite, error: updateInviteError } = await supabaseAdmin
    .from('club_user_invites')
    .update({
      status: 'ACCEPTED',
      resolved_by: user.id,
      resolved_at: now,
      target_user_id: user.id,
      updated_at: now,
    })
    .eq('id', inviteId)
    .eq('status', 'PENDING')
    .select('id,club_id,email,role,status,resolved_by,resolved_at,target_user_id,updated_at')
    .maybeSingle()

  if (updateInviteError) {
    return NextResponse.json({ error: updateInviteError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, invite: updatedInvite })
}
