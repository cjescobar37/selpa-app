import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { logPlatformAction } from '@/lib/platformAudit'
import { createPayment } from '@/lib/platformFinance'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function isMissingFinanceTable(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('public.payments') ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('payments') && msg.includes('does not exist'))
  )
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const status = req.nextUrl.searchParams.get('status')
  const clubId = req.nextUrl.searchParams.get('club_id')
  const tournamentId = req.nextUrl.searchParams.get('tournament_id')
  const userId = req.nextUrl.searchParams.get('user_id')
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? 50), 1), 200)

  let query = supabaseAdmin
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (clubId) query = query.eq('club_id', clubId)
  if (tournamentId) query = query.eq('tournament_id', tournamentId)
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  if (isMissingFinanceTable(error)) {
    return NextResponse.json(
      { code: 'FINANCE_NOT_INITIALIZED', error: 'Finanzas aún no inicializadas.', rows: [] },
      { status: 503 },
    )
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const clubIds = Array.from(new Set(rows.map((row: any) => row.club_id).filter(Boolean)))
  const userIds = Array.from(new Set(rows.map((row: any) => row.user_id).filter(Boolean)))
  const tournamentIds = Array.from(new Set(rows.map((row: any) => row.tournament_id).filter(Boolean)))

  const [clubsRes, profilesRes, tournamentsRes] = await Promise.all([
    clubIds.length ? supabaseAdmin.from('clubs').select('id,name').in('id', clubIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? supabaseAdmin.from('profiles').select('user_id,email,display_name,first_name,last_name').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
    tournamentIds.length ? supabaseAdmin.from('tournaments').select('id,name').in('id', tournamentIds) : Promise.resolve({ data: [], error: null }),
  ])

  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 })
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })
  if (tournamentsRes.error) return NextResponse.json({ error: tournamentsRes.error.message }, { status: 500 })

  const clubs = new Map((clubsRes.data ?? []).map((club: any) => [club.id, club]))
  const profiles = new Map((profilesRes.data ?? []).map((profile: any) => [profile.user_id, profile]))
  const tournaments = new Map((tournamentsRes.data ?? []).map((tournament: any) => [tournament.id, tournament]))

  const enriched = rows.map((row: any) => {
    const profile = profiles.get(row.user_id)
    const userName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.email || 'Usuario'
    return {
      ...row,
      club_name: clubs.get(row.club_id)?.name ?? 'Club',
      user_name: userName,
      user_email: profile?.email ?? null,
      tournament_name: row.tournament_id ? tournaments.get(row.tournament_id)?.name ?? 'Torneo' : null,
    }
  })

  return NextResponse.json({ rows: enriched })
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const amount = Number(body?.amount)
    if (!body?.user_id) return badRequest('Falta user_id.')
    if (!body?.club_id) return badRequest('Falta club_id.')
    if (!Number.isFinite(amount)) return badRequest('amount inválido.')

    const result = await createPayment({
      userId: String(body.user_id),
      clubId: String(body.club_id),
      tournamentId: body.tournament_id ? String(body.tournament_id) : null,
      teamId: body.team_id ? String(body.team_id) : null,
      registrationId: body.registration_id ? String(body.registration_id) : null,
      sourceType: body.source_type,
      status: body.status,
      amount,
      refundedAmount: body.refunded_amount == null ? undefined : Number(body.refunded_amount),
      currency: body.currency,
      provider: body.provider,
      providerPaymentId: body.provider_payment_id,
      providerPreferenceId: body.provider_preference_id,
      providerStatus: body.provider_status,
      providerPayload: body.provider_payload,
      failureReason: body.failure_reason,
      refundReason: body.refund_reason,
      paidAt: body.paid_at,
      failedAt: body.failed_at,
      refundedAt: body.refunded_at,
      actorUserId: auth.user!.id,
    })

    if (result.created) {
      await logPlatformAction({
        actorUserId: auth.user!.id,
        action: 'finance.payment.create',
        entityType: 'payment',
        entityId: result.payment.id,
        entityLabel: result.payment.provider_payment_id || result.payment.id,
        metadata: {
          club_id: result.payment.club_id,
          user_id: result.payment.user_id,
          tournament_id: result.payment.tournament_id,
          registration_id: result.payment.registration_id,
          amount: result.payment.amount,
          currency: result.payment.currency,
          status: result.payment.status,
          source_type: result.payment.source_type,
        },
        req,
      })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude registrar el pago.' }, { status: 500 })
  }
}
