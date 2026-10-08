import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { playerAccountDenial } from '@/lib/accountRoleServer'
import { writeErrorResponse } from '@/lib/writeFlowServer'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const bearer = req.headers.get('authorization') ?? ''
    const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : String(body.accessToken ?? '')
    const clubId = String(body.clubId ?? '')
    if (!token) return NextResponse.json({ error: 'Volvé a iniciar sesión.' }, { status: 401 })
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(clubId)) return NextResponse.json({ error: 'Seleccioná un club válido.' }, { status: 400 })
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data.user) return NextResponse.json({ error: 'Volvé a iniciar sesión.' }, { status: 401 })
    const denial = await playerAccountDenial(data.user.id)
    if (denial) return denial
    const result = await supabaseAdmin.rpc('request_player_membership_pass3', { p_club_id: clubId, p_user_id: data.user.id })
    if (result.error) return writeErrorResponse('membership.request', result.error)
    return NextResponse.json(result.data)
  } catch { return writeErrorResponse('membership.request', { code: 'UNEXPECTED' }) }
}
