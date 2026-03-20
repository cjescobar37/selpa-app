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

  if (paErr) return { error: NextResponse.json({ error: paErr.message }, { status: 500 }), user: null }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}
