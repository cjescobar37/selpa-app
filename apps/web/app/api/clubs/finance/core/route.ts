import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireClubCapability } from '@/lib/clubMembershipServer'
import { hasClubCapability } from '@/lib/clubPermissions'
import { paymentMovementLabels } from '@/lib/paymentProviderReadsF1E'
import { financeFailure, logFinanceRpcFailure } from '@/lib/clubFinanceF1FServer'
import {
  financePage, validFinanceAmount,
  type FinanceFilter, type FinanceMovement, type FinanceObligation,
} from '@/lib/clubFinanceF1C'

const pageSize = 20
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const methods = new Set(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'])
const filters = new Set<FinanceFilter>(['ALL', 'PENDING', 'PARTIAL', 'PAID'])

function userClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = req.headers.get('authorization') ?? ''
  if (!url || !anonKey || !authorization.startsWith('Bearer ')) return null
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
}

function businessError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message ?? '')
  const known: Record<string, string> = {
    CLUB_FINANCE_OVER_ALLOCATION: 'El importe supera el saldo pendiente.',
    CLUB_FINANCE_PAYMENT_ALREADY_REVERSED: 'Este cobro ya fue revertido.',
    CLUB_FINANCE_OBLIGATION_NOT_PAYABLE: 'Este cargo ya no admite cobros.',
    CLUB_FINANCE_OBLIGATION_NOT_FOUND: 'No encontramos el cargo.',
    CLUB_FINANCE_PAYMENT_NOT_FOUND: 'No encontramos el cobro.',
    CLUB_FINANCE_REASON_REQUIRED: 'Ingresá un motivo de al menos tres caracteres.',
    CLUB_FINANCE_IDEMPOTENCY_CONFLICT: 'Este intento ya se usó para otro cobro.',
    CLUB_FINANCE_FORBIDDEN: 'No tenés permiso para esta operación.',
  }
  const key = Object.keys(known).find((candidate) => message.includes(candidate))
  const retryable = error?.code === '40001'
  return NextResponse.json({
    error: key ? known[key] : retryable
      ? 'El cobro se estaba actualizando. Intentá nuevamente.'
      : 'No pudimos completar la operación financiera.',
    code: key ?? error?.code ?? 'FINANCE_ERROR',
  }, { status: error?.code === '42501' ? 403 : retryable ? 409 : 400 })
}

function parseCursor(params: URLSearchParams) {
  const at = params.get('beforeAt')
  const id = params.get('beforeId')
  if (!at && !id) return { at: null, id: null, valid: true }
  return { at, id, valid: Boolean(at && id && !Number.isNaN(Date.parse(at)) && uuidPattern.test(id)) }
}

export async function GET(req: NextRequest) {
  const clubId = String(req.nextUrl.searchParams.get('clubId') ?? '')
  const auth = await requireClubCapability(req, clubId, 'finance:view')
  if (auth.error) return auth.error
  const client = userClient(req)
  if (!client) return NextResponse.json({ error: 'Falta configuración financiera.' }, { status: 500 })
  const view = req.nextUrl.searchParams.get('view') ?? 'dashboard'
  const filter = (req.nextUrl.searchParams.get('filter') ?? 'ALL').toUpperCase() as FinanceFilter
  const cursor = parseCursor(req.nextUrl.searchParams)
  if (!['dashboard', 'obligations', 'movements'].includes(view)
      || !filters.has(filter) || !cursor.valid) {
    return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 400 })
  }

  const obligationParams = {
    p_club_id: clubId, p_filter: filter, p_limit: pageSize + 1,
    p_before_created_at: view === 'obligations' ? cursor.at : null,
    p_before_id: view === 'obligations' ? cursor.id : null,
  }
  const movementParams = {
    p_club_id: clubId, p_limit: pageSize + 1,
    p_before_paid_at: view === 'movements' ? cursor.at : null,
    p_before_id: view === 'movements' ? cursor.id : null,
  }
  if (view === 'obligations') {
    const result = await client.rpc('list_club_finance_obligations_f1c', obligationParams)
    if (result.error) return financeFailure(result.error, 'core:list_club_finance_obligations_f1c')
    const rows = ((result.data ?? []) as Array<{ item: FinanceObligation }>).map((row) => row.item)
    return NextResponse.json({ obligations: financePage(rows, pageSize, 'created_at') })
  }
  if (view === 'movements') {
    const result = await client.rpc('list_club_finance_movements_f1c', movementParams)
    if (result.error) return financeFailure(result.error, 'core:list_club_finance_movements_f1c')
    const rows = ((result.data ?? []) as Array<{ item: FinanceMovement }>).map((row) => row.item)
    return NextResponse.json({ movements: financePage(await paymentMovementLabels(client, clubId, rows), pageSize, 'paid_at') })
  }
  const [overview, obligations, movements] = await Promise.all([
    client.rpc('get_club_finance_overview_f1c', { p_club_id: clubId }),
    client.rpc('list_club_finance_obligations_f1c', obligationParams),
    client.rpc('list_club_finance_movements_f1c', movementParams),
  ])
  const results = [
    ['get_club_finance_overview_f1c', overview], ['list_club_finance_obligations_f1c', obligations],
    ['list_club_finance_movements_f1c', movements],
  ] as const
  const failed = results.find(([, result]) => result.error)
  for (const [operation, result] of results) {
    if (result.error && result !== failed?.[1]) logFinanceRpcFailure(result.error, `core:${operation}`)
  }
  if (failed) return financeFailure(failed[1].error, `core:${failed[0]}`)
  return NextResponse.json({
    canManage: hasClubCapability(auth.membership?.role, 'finance:manage'),
    overview: overview.data,
    obligations: financePage(
      ((obligations.data ?? []) as Array<{ item: FinanceObligation }>).map((row) => row.item), pageSize, 'created_at',
    ),
    movements: financePage(
      await paymentMovementLabels(client, clubId, ((movements.data ?? []) as Array<{ item: FinanceMovement }>).map((row) => row.item)), pageSize, 'paid_at',
    ),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clubId = String(body?.clubId ?? '')
  const auth = await requireClubCapability(req, clubId, 'finance:manage')
  if (auth.error) return auth.error
  const client = userClient(req)
  if (!client) return NextResponse.json({ error: 'Falta configuración financiera.' }, { status: 500 })
  const key = String(body?.idempotencyKey ?? '')
  if (key.length < 8 || key.length > 200 || !uuidPattern.test(String(body?.id ?? ''))) {
    return NextResponse.json({ error: 'Datos de cobro inválidos.' }, { status: 400 })
  }
  if (body?.action === 'payment.register') {
    const amount = String(body?.amount ?? '')
    const method = String(body?.method ?? '')
    const paidAt = String(body?.paidAt ?? '')
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0
        || !methods.has(method) || !paidAt || Number.isNaN(Date.parse(paidAt))
        || (body?.currencyCode && body.currencyCode !== 'ARS')) {
      return NextResponse.json({ error: 'Revisá importe, método y fecha.' }, { status: 400 })
    }
    // Balance is checked under the F1A obligation lock; the client check is UX only.
    if (body?.balance !== undefined && !validFinanceAmount(amount, Number(body.balance))) {
      return NextResponse.json({ error: 'El importe supera el saldo pendiente.' }, { status: 400 })
    }
    const params = {
      p_club_id: clubId, p_obligation_id: body.id, p_amount: Number(amount),
      p_currency_code: 'ARS', p_payment_method: method,
      p_idempotency_key: key, p_paid_at: new Date(paidAt).toISOString(),
      p_reference: String(body?.reference ?? '').trim() || null,
      p_notes: String(body?.notes ?? '').trim() || null,
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await client.rpc('register_club_finance_payment', params)
      if (!result.error) return NextResponse.json({ ok: true, result: result.data })
      if (result.error.code !== '40001' || attempt === 1) return businessError(result.error)
    }
  }
  if (body?.action === 'payment.reverse') {
    const reason = String(body?.reason ?? '').trim()
    if (reason.length < 3) {
      return NextResponse.json({ error: 'Ingresá un motivo de al menos tres caracteres.' }, { status: 400 })
    }
    const params = {
      p_club_id: clubId, p_payment_id: body.id, p_reason: reason, p_idempotency_key: key,
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await client.rpc('reverse_club_finance_payment', params)
      if (!result.error) return NextResponse.json({ ok: true, result: result.data })
      if (result.error.code !== '40001' || attempt === 1) return businessError(result.error)
    }
  }
  return NextResponse.json({ error: 'Acción financiera inválida.' }, { status: 400 })
}
