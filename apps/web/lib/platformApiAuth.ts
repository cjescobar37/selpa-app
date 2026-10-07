import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function assertPlatformAdmin(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }

  const { data: pa, error: paErr } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (paErr) {
    console.error('[platform:auth]', { operation:'VERIFY_ADMIN', code:/^[A-Z0-9_]+$/.test(paErr.code ?? '') ? paErr.code : 'READ_FAILURE' })
    return { error: NextResponse.json({ error: 'No pudimos verificar los permisos. Reintentá.' }, { status: 500 }), user: null }
  }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}
