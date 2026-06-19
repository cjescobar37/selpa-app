import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { createOperationalNotification } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ClubPaymentContext = {
  params: Promise<{ clubId: string; paymentId: string }>
}

const allowedStatuses = new Set(['APPROVED', 'REJECTED', 'CANCELLED'])

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

async function isPlatformAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data?.user_id)
}

export async function PATCH(req: NextRequest, context: ClubPaymentContext) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { clubId, paymentId } = await context.params
  const canManage = (await isClubAdmin(user.id, clubId)) || (await isPlatformAdmin(user.id))
  if (!canManage) return NextResponse.json({ error: 'No autorizado para gestionar pagos.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const status = String(body?.status ?? '').trim().toUpperCase()
  const notes = String(body?.notes ?? '').trim() || undefined

  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Estado inválido. Usá APPROVED, REJECTED o CANCELLED.' }, { status: 400 })
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from('tournament_payments')
    .select('id,club_id,tournament_id,team_id,registration_id,status,method')
    .eq('id', paymentId)
    .eq('club_id', clubId)
    .maybeSingle()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'Pago no encontrado para este club.' }, { status: 404 })
  if (String(current.status ?? '').toUpperCase() !== 'PENDING') {
    return NextResponse.json({ error: 'Este pago ya fue resuelto.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: now,
  }

  if (notes !== undefined) updatePayload.notes = notes
  if (status === 'APPROVED') {
    updatePayload.approved_at = now
    updatePayload.approved_by = user.id
  }

  const { data: payment, error: updateError } = await supabaseAdmin
    .from('tournament_payments')
    .update(updatePayload)
    .eq('id', paymentId)
    .eq('club_id', clubId)
    .select('id,tournament_id,club_id,team_id,registration_id,user_id,amount,currency,method,status,requested_at,approved_at,paid_at,approved_by,notes')
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (current.registration_id) {
    const registrationUpdate: Record<string, unknown> = { payment_status: status }
    if (status === 'APPROVED') registrationUpdate.status = 'CONFIRMED'
    await supabaseAdmin
      .from('tournament_registrations')
      .update(registrationUpdate)
      .eq('id', current.registration_id)
  }

  if (current.team_id) {
    const { data: team } = await supabaseAdmin
      .from('tournament_teams')
      .select('player1_user_id,player2_user_id')
      .eq('id', current.team_id)
      .maybeSingle()

    const recipients = Array.from(new Set([team?.player1_user_id, team?.player2_user_id].filter(Boolean).map(String)))
    await Promise.all(recipients.map((recipientId) => createOperationalNotification({
      userId: recipientId,
      clubId,
      tournamentId: current.tournament_id,
      actorId: user.id,
      type: status === 'APPROVED' ? 'payment_approved' : status === 'REJECTED' ? 'payment_rejected' : 'payment_cancelled',
      title: status === 'APPROVED' ? 'Pago aprobado' : status === 'REJECTED' ? 'Pago rechazado' : 'Pago cancelado',
      body: status === 'APPROVED'
        ? 'El club aprobó el pago de tu inscripción.'
        : status === 'REJECTED'
          ? 'El club rechazó el pago de tu inscripción. Revisá el torneo para elegir otro método.'
          : 'El club canceló la solicitud de pago.',
      href: `/torneos/${current.tournament_id}`,
      metadata: {
        payment_id: current.id,
        registration_id: current.registration_id,
        team_id: current.team_id,
        method: current.method,
      },
    })))
  }

  return NextResponse.json({ ok: true, payment })
}
