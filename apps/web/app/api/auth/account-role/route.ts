import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { nonPlayerAccountIds } from '@/lib/accountRoleServer'

// Server-verified account identity, independent of active club and JWT metadata.
export async function GET(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  try {
    return NextResponse.json({ administrative: (await nonPlayerAccountIds([data.user.id])).has(data.user.id) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'No pudimos verificar el rol de la cuenta.' }, { status: 503 })
  }
}
