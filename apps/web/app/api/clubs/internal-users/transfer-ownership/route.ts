import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return error ? null : data.user
}

export async function POST(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const clubId = String(body?.clubId ?? '').trim()
  const membershipId = String(body?.membershipId ?? '').trim()
  if (!clubId || !membershipId) return NextResponse.json({ error: 'Faltan clubId o membershipId.' }, { status: 400 })
  if (!(await userHasClubCapability(user.id, clubId, 'ownership:transfer'))) {
    return NextResponse.json({ error: 'Solo el OWNER actual puede transferir la propiedad.' }, { status: 403 })
  }
  const { data, error } = await supabaseAdmin.rpc('transfer_club_ownership_atomic', {
    p_club_id: clubId,
    p_new_owner_membership_id: membershipId,
    p_actor_user_id: user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ ok: true, transfer: data })
}
