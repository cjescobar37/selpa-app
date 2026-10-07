import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { PLAYER_STAFF_MESSAGE } from '@/lib/accountRolePolicy'

async function authorized(request: NextRequest, clubId: string) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return false
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return !error && Boolean(data.user && await userHasClubCapability(data.user.id, clubId, 'roles:manage'))
}
// Compatibility endpoint: administrative accounts cannot be promoted from players.
export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get('clubId') ?? ''
  if (!await authorized(request, clubId)) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  return NextResponse.json({ candidates: [], message: PLAYER_STAFF_MESSAGE })
}
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (!await authorized(request, String(body.clubId ?? ''))) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  return NextResponse.json({ error: PLAYER_STAFF_MESSAGE }, { status: 409 })
}
