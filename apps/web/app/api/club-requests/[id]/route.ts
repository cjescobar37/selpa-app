import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeErrorResponse } from '@/lib/writeFlowServer'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
    if (!req.headers.get('authorization')?.startsWith('Bearer ') || !token) return NextResponse.json({ error: 'Volvé a iniciar sesión.' }, { status: 401 })
    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !auth.user) return NextResponse.json({ error: 'Volvé a iniciar sesión.' }, { status: 401 })
    const { data: admin, error: adminError } = await supabaseAdmin.from('platform_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle()
    if (adminError) return writeErrorResponse('club-request.authorize', adminError)
    if (!admin) return NextResponse.json({ error: 'No tenés permiso para resolver altas.' }, { status: 403 })
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id) || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json({ error: 'Acción inválida.', kind: 'VALIDATION' }, { status: 400 })
    }
    const reason = typeof body.rejectionReason === 'string' ? body.rejectionReason.trim() : ''
    if (body.action === 'reject' && !reason) return NextResponse.json({ error: 'Indicá el motivo del rechazo.', kind: 'VALIDATION' }, { status: 400 })
    // The actor comes exclusively from verified Auth, never from the request body.
    const { data, error } = await supabaseAdmin.rpc('resolve_club_request_pass3', {
      p_request_id: id, p_actor_id: auth.user.id, p_action: body.action, p_reason: reason || null,
    })
    if (error) return writeErrorResponse('club-request.resolve', error)
    return NextResponse.json(data)
  } catch {
    return writeErrorResponse('club-request.resolve', { code: 'UNEXPECTED' })
  }
}
