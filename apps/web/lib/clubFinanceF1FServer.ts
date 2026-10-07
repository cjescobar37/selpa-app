import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireClubCapability } from '@/lib/clubMembershipServer'
import { hasClubCapability } from '@/lib/clubPermissions'
import { validFinanceRange } from './clubFinanceF1F'

export const financeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function financeAccess(req: NextRequest, clubId: string, write = false) {
  if (!financeUuid.test(clubId)) return { error: NextResponse.json({ error: 'Club inválido.' }, { status: 400 }), client: null, canManage: false }
  const auth = await requireClubCapability(req, clubId, write ? 'finance:manage' : 'finance:view')
  if (auth.error) return { error: auth.error, client: null, canManage: false }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { error: NextResponse.json({ error: 'Finanzas no disponible.' }, { status: 503 }), client: null, canManage: false }
  return { error: null, canManage: hasClubCapability(auth.membership?.role, 'finance:manage'), client: createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
  }) }
}
export function financeFailure(error: { code?: string } | null) {
  return NextResponse.json({ error: error?.code === '40001'
    ? 'El caso cambió. Actualizá el detalle antes de continuar.' : 'No pudimos completar la operación financiera.' },
  { status: error?.code === '42501' ? 403 : error?.code === '40001' ? 409 : 400 })
}
export function financeRangeParams(params: URLSearchParams) {
  const from = params.get('from') ?? ''; const to = params.get('to') ?? ''
  return validFinanceRange(from, to) ? { p_from: from, p_to: to } : null
}
