import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

    const [{ count: notificationsCount, error: nErr }, { count: messagesCount, error: mErr }] =
      await Promise.all([
        supabaseAdmin
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false),
        supabaseAdmin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_user_id', user.id)
          .eq('read', false),
      ])

    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 })
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

    return NextResponse.json({
      notifications: notificationsCount ?? 0,
      messages: messagesCount ?? 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}