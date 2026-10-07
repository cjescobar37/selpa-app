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
export type FinanceRpcError = { code?: string; message?: string; details?: string | null; hint?: string | null }

/** Host only: never include URL credentials, query strings or environment keys. */
export function financeProjectHost() {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname || 'UNCONFIGURED' }
  catch { return 'UNCONFIGURED' }
}

function schemaDiagnostic(value?: string | null) {
  if (!value) return null
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\b(authorization|cookie|token|secret|api[_-]?key)["']?\s*[:=]\s*["']?[^\r\n;,]+/gi, '$1=[REDACTED]')
    .slice(0, 1500)
}

export function logFinanceRpcFailure(error: FinanceRpcError | null, operation: string) {
  // Only schema-resolution errors have diagnostic text: SQL/business errors may contain row data.
  console.error('[club-finance]', { operation, projectHost: financeProjectHost(), code: error?.code ?? 'UNKNOWN',
    ...(error?.code === 'PGRST202' ? {
      message: schemaDiagnostic(error.message), details: schemaDiagnostic(error.details), hint: schemaDiagnostic(error.hint),
    } : {}),
  })
}

export function financeFailure(error: FinanceRpcError | null, operation = 'finance') {
  logFinanceRpcFailure(error, operation)
  return NextResponse.json({ error: error?.code === '40001'
    ? 'El caso cambió. Actualizá el detalle antes de continuar.'
    : error?.code === '42501' ? 'No tenés permiso para consultar las finanzas de este club.'
    : 'No pudimos cargar las finanzas. Reintentá en unos segundos.',
    ...(error?.code === 'PGRST202' ? {} : { code: error?.code ?? 'UNKNOWN' }) },
  { status: error?.code === '42501' ? 403 : error?.code === '40001' ? 409 : error?.code === 'PGRST202' ? 503 : 400 })
}
export function financeRangeParams(params: URLSearchParams) {
  const from = params.get('from') ?? ''; const to = params.get('to') ?? ''
  return validFinanceRange(from, to) ? { p_from: from, p_to: to } : null
}
