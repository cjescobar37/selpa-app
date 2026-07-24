import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { clubInviteErrorResponse } from '@/lib/clubTeamInviteErrors'
import { isInvitableStaffRole, type ClubRole } from '@/lib/clubMembershipRules'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return error ? null : data.user
}

export async function GET(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const clubId = String(req.nextUrl.searchParams.get('clubId') ?? '').trim()
  const query = String(req.nextUrl.searchParams.get('query') ?? '').trim()
  if (!clubId) return NextResponse.json({ error: 'Falta clubId.' }, { status: 400 })
  if (query.length < 2) return NextResponse.json({ candidates: [] })

  const { data, error } = await supabaseAdmin.rpc('search_club_staff_candidates', {
    p_club_id: clubId,
    p_query: query,
    p_actor_user_id: user.id,
    p_limit: 10,
  })
  if (error) return clubInviteErrorResponse(error)
  return NextResponse.json({ candidates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const clubId = String(body?.clubId ?? '').trim()
  const targetUserId = String(body?.targetUserId ?? '').trim()
  const role = String(body?.role ?? '').trim() as ClubRole
  if (!clubId || !targetUserId || !isInvitableStaffRole(role)) {
    return NextResponse.json({ error: 'Datos de promoción inválidos.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('promote_club_player_to_staff_atomic', {
    p_club_id: clubId,
    p_target_user_id: targetUserId,
    p_role: role,
    p_actor_user_id: user.id,
  })
  if (error) return clubInviteErrorResponse(error)
  return NextResponse.json({ ok: true, promotion: data })
}
