import { NextRequest, NextResponse } from 'next/server'
import { notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PaymentRequestContext = {
  params: Promise<{ tournamentId: string }>
}

const allowedMethods = new Set(['MERCADO_PAGO', 'BANK_TRANSFER', 'CASH_ON_SITE_REQUEST'])

function isMissingSchemaObjectError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache')
}

function missingPaymentInfraResponse() {
  return NextResponse.json(
    {
      error: 'No se pudo registrar el pago porque falta activar la infraestructura tournament_payments.',
      code: 'PAYMENT_INFRASTRUCTURE_MISSING',
    },
    { status: 503 }
  )
}

async function trySyncRegistrationPayment(registrationId: string, status: string, method: string) {
  const { error } = await supabaseAdmin
    .from('tournament_registrations')
    .update({ payment_status: status, payment_method: method })
    .eq('id', registrationId)

  if (error && !isMissingSchemaObjectError(error)) {
    console.warn('[payment-request] registration payment sync failed', error.message)
  }
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

async function getTokenUser(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function POST(req: NextRequest, context: PaymentRequestContext) {
  const { tournamentId } = await context.params
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Iniciá sesión para solicitar el pago.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const method = String(body?.method ?? '').trim().toUpperCase()
  const notes = String(body?.notes ?? '').trim() || null

  if (!allowedMethods.has(method)) {
    return NextResponse.json({ error: 'Método de pago inválido.' }, { status: 400 })
  }

  if (method !== 'CASH_ON_SITE_REQUEST') {
    return NextResponse.json({ error: 'Este método de pago todavía no está disponible.' }, { status: 409 })
  }

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,price_per_player')
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 })
  if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 })

  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('tournament_teams')
    .select('id,player1_user_id,player2_user_id')
    .eq('tournament_id', tournamentId)
    .eq('club_id', tournament.club_id)
    .or(`player1_user_id.eq.${user.id},player2_user_id.eq.${user.id}`)

  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })

  const teamIds = (teams ?? []).map((team) => String(team.id))
  if (!teamIds.length) {
    return NextResponse.json({ error: 'No encontramos tu equipo inscripto en este torneo.' }, { status: 404 })
  }

  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from('tournament_registrations')
    .select('id,team_id,status')
    .eq('tournament_id', tournamentId)
    .eq('club_id', tournament.club_id)
    .in('team_id', teamIds)

  if (registrationsError) return NextResponse.json({ error: registrationsError.message }, { status: 500 })

  const registration = (registrations ?? []).find((row) => String(row.status ?? '').toUpperCase() !== 'CANCELLED')
  if (!registration) {
    return NextResponse.json({ error: 'No encontramos una inscripción activa para solicitar pago.' }, { status: 404 })
  }

  const amount = Number(tournament.price_per_player ?? 0) * 2

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('tournament_payments')
    .select('id,tournament_id,club_id,team_id,registration_id,user_id,amount,currency,method,status,requested_at,approved_at,paid_at')
    .eq('tournament_id', tournamentId)
    .or(`registration_id.eq.${registration.id},team_id.eq.${registration.team_id}`)
    .neq('status', 'CANCELLED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError && isMissingSchemaObjectError(existingError)) return missingPaymentInfraResponse()

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  if (existing) {
    await trySyncRegistrationPayment(registration.id, existing.status, existing.method)

    return NextResponse.json({ ok: true, payment: existing })
  }

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('tournament_payments')
    .insert({
      tournament_id: tournamentId,
      club_id: tournament.club_id,
      team_id: registration.team_id,
      registration_id: registration.id,
      user_id: user.id,
      amount,
      currency: 'ARS',
      method,
      status: 'PENDING',
      notes,
    })
    .select('id,tournament_id,club_id,team_id,registration_id,user_id,amount,currency,method,status,requested_at,approved_at,paid_at')
    .single()

  if (paymentError && isMissingSchemaObjectError(paymentError)) return missingPaymentInfraResponse()

  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 })

  await trySyncRegistrationPayment(registration.id, 'PENDING', method)

  await notifyClubAdmins(tournament.club_id, {
    tournamentId,
    actorId: user.id,
    type: 'payment_requested',
    title: 'Pago en club solicitado',
    body: 'Una pareja solicitó pagar la inscripción en el club.',
    href: `/club/torneos/${tournamentId}`,
    metadata: {
      payment_id: payment.id,
      registration_id: registration.id,
      team_id: registration.team_id,
      method,
    },
  })

  return NextResponse.json({ ok: true, payment })
}
