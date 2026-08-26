import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireClubCapability } from '@/lib/clubMembershipServer'
import { hasClubCapability } from '@/lib/clubPermissions'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function tokenFrom(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

function userClient(req: NextRequest) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenFrom(req)}` } },
  })
}

function financeError(error: { message?: string; code?: string } | null) {
  const message = String(error?.message ?? '')
  const known: Record<string, string> = {
    FINANCE_FORBIDDEN: 'No tenés permisos para realizar esta operación.',
    FINANCE_PERIOD_CLOSED: 'El período está cerrado. Reabrilo o registrá un ajuste posterior.',
    RECEIVABLE_NOT_PAYABLE: 'Ese cobro ya no admite pagos.',
    INVALID_PAYMENT_AMOUNT: 'El importe supera el saldo pendiente.',
    RECEIVABLE_NOT_FOUND: 'No encontramos el cobro solicitado.',
    TRANSACTION_ALREADY_VOIDED: 'El movimiento ya estaba anulado.',
    TRANSACTION_NOT_FOUND: 'No encontramos el movimiento.',
    OWNER_REQUIRED: 'Solo el OWNER puede reabrir un cierre.',
    CLOSURE_NOT_FOUND_OR_OPEN: 'El cierre no existe o ya fue reabierto.',
    FINANCE_CROSS_CLUB_REFERENCE: 'La referencia seleccionada no pertenece al club activo.',
  }
  const key = Object.keys(known).find((candidate) => message.includes(candidate))
  return NextResponse.json(
    { error: key ? known[key] : 'No pudimos completar la operación financiera.', code: key ?? error?.code ?? 'FINANCE_ERROR' },
    { status: error?.code === '42501' ? 403 : 400 },
  )
}

function periodBounds(searchParams: URLSearchParams) {
  const now = new Date()
  const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const fallbackEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return {
    start: searchParams.get('start') || fallbackStart,
    end: searchParams.get('end') || fallbackEnd,
  }
}

export async function GET(req: NextRequest) {
  const clubId = String(req.nextUrl.searchParams.get('clubId') ?? '').trim()
  const auth = await requireClubCapability(req, clubId, 'finance:view')
  if (auth.error) return auth.error
  const { start, end } = periodBounds(req.nextUrl.searchParams)
  const startIso = `${start}T00:00:00.000Z`
  const endIso = `${end}T23:59:59.999Z`

  const [transactions, receivables, payments, expenses, closures, tournaments] = await Promise.all([
    supabaseAdmin.from('club_financial_transactions')
      .select('id,club_id,transaction_type,concept,category,amount,currency_code,payment_method,status,occurred_at,responsible_user_id,tournament_id,reference_type,reference_id,notes,created_at')
      .eq('club_id', clubId).gte('occurred_at', startIso).lte('occurred_at', endIso)
      .order('occurred_at', { ascending: false }).limit(500),
    supabaseAdmin.from('club_receivables')
      .select('id,club_id,debtor_user_id,debtor_name,contact,concept,tournament_id,team_id,registration_id,category,total_amount,paid_amount,waived_amount,currency_code,due_date,status,notes,created_at,updated_at')
      .eq('club_id', clubId).order('created_at', { ascending: false }).limit(500),
    supabaseAdmin.from('club_receivable_payments')
      .select('id,receivable_id,transaction_id,amount,currency_code,payment_method,paid_at,notes,created_by,created_at')
      .eq('club_id', clubId).order('paid_at', { ascending: false }).limit(500),
    supabaseAdmin.from('club_expenses')
      .select('id,transaction_id,supplier,receipt_path,status,created_at,updated_at')
      .eq('club_id', clubId).order('created_at', { ascending: false }).limit(500),
    supabaseAdmin.from('club_financial_closures')
      .select('id,period_start,period_end,status,currency_code,income_total,expense_total,adjustment_total,receivable_pending_total,result_total,transaction_count,notes,closed_by,closed_at,reopened_by,reopened_at,reopen_reason')
      .eq('club_id', clubId).order('period_start', { ascending: false }).limit(60),
    supabaseAdmin.from('tournaments').select('id,name,start_date').eq('club_id', clubId).order('start_date', { ascending: false }).limit(100),
  ])

  const failed = [transactions, receivables, payments, expenses, closures].find((result) => result.error)
  if (failed?.error) {
    const missing = failed.error.code === '42P01' || failed.error.code === 'PGRST205'
    return NextResponse.json(
      {
        error: missing
          ? 'El módulo Finanzas todavía no está disponible para este club.'
          : 'No pudimos cargar las finanzas.',
        code: missing ? 'CLUB_FINANCE_SCHEMA_MISSING' : 'CLUB_FINANCE_LOAD_FAILED',
      },
      { status: missing ? 409 : 500 },
    )
  }

  const userIds = Array.from(new Set([
    ...(transactions.data ?? []).map((row) => row.responsible_user_id),
    ...(receivables.data ?? []).map((row) => row.debtor_user_id),
    ...(payments.data ?? []).map((row) => row.created_by),
  ].filter((value): value is string => Boolean(value))))
  const profiles = userIds.length
    ? await supabaseAdmin.from('profiles').select('user_id,display_name,first_name,last_name,avatar_url').in('user_id', userIds)
    : { data: [], error: null }

  return NextResponse.json({
    period: { start, end },
    canManage: hasClubCapability(auth.membership?.role, 'finance:manage'),
    canReopen: auth.membership?.role === 'OWNER',
    transactions: transactions.data ?? [],
    receivables: receivables.data ?? [],
    payments: payments.data ?? [],
    expenses: expenses.data ?? [],
    closures: closures.data ?? [],
    tournaments: tournaments.data ?? [],
    profiles: profiles.data ?? [],
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clubId = String(body?.clubId ?? '').trim()
  const auth = await requireClubCapability(req, clubId, 'finance:manage')
  if (auth.error) return auth.error
  const client = userClient(req)
  const action = String(body?.action ?? '')

  let rpcName = ''
  let params: Record<string, unknown> = {}
  if (action === 'transaction.create') {
    rpcName = 'create_club_financial_transaction'
    params = {
      p_club_id: clubId, p_transaction_type: body.type, p_concept: body.concept,
      p_category: body.category, p_amount: body.amount, p_payment_method: body.paymentMethod,
      p_occurred_at: body.occurredAt || new Date().toISOString(), p_notes: body.notes || null,
      p_tournament_id: body.tournamentId || null,
    }
  } else if (action === 'expense.create') {
    rpcName = 'create_club_expense'
    params = {
      p_club_id: clubId, p_concept: body.concept, p_category: body.category,
      p_amount: body.amount, p_payment_method: body.paymentMethod,
      p_occurred_at: body.occurredAt || new Date().toISOString(), p_supplier: body.supplier || null,
      p_notes: body.notes || null, p_tournament_id: body.tournamentId || null,
    }
  } else if (action === 'receivable.create') {
    rpcName = 'create_club_receivable'
    params = {
      p_club_id: clubId, p_debtor_name: body.debtorName, p_concept: body.concept,
      p_total_amount: body.totalAmount, p_due_date: body.dueDate || null,
      p_contact: body.contact || null, p_category: body.category || null,
      p_debtor_user_id: body.debtorUserId || null, p_tournament_id: body.tournamentId || null,
      p_team_id: body.teamId || null, p_registration_id: body.registrationId || null,
      p_notes: body.notes || null,
    }
  } else if (action === 'receivable.pay') {
    rpcName = 'record_club_receivable_payment'
    params = {
      p_club_id: clubId, p_receivable_id: body.receivableId, p_amount: body.amount,
      p_payment_method: body.paymentMethod, p_paid_at: body.paidAt || new Date().toISOString(),
      p_notes: body.notes || null,
    }
  } else if (action === 'transaction.void') {
    rpcName = 'void_club_financial_transaction'
    params = { p_club_id: clubId, p_transaction_id: body.transactionId, p_reason: body.reason }
  } else if (action === 'period.close') {
    rpcName = 'close_club_financial_period'
    params = { p_club_id: clubId, p_period_start: body.periodStart, p_period_end: body.periodEnd, p_notes: body.notes || null }
  } else if (action === 'period.reopen') {
    rpcName = 'reopen_club_financial_period'
    params = { p_club_id: clubId, p_closure_id: body.closureId, p_reason: body.reason }
  } else {
    return NextResponse.json({ error: 'Acción financiera inválida.' }, { status: 400 })
  }

  const { data, error } = await client.rpc(rpcName, params)
  if (error) return financeError(error)
  return NextResponse.json({ ok: true, id: data ?? null })
}
